import WebSocket from "ws";
import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BINANCE_WS = "wss://fstream.binance.com/ws/asterusdt@forceOrder";
const PORT = process.env.PORT || 3000;

// Validate environment variables
if (!DISCORD_WEBHOOK_URL) {
  console.error("❌ DISCORD_WEBHOOK_URL environment variable is required");
  process.exit(1);
}

// Modern crypto color palette
const COLORS = {
  LONG_LIQUIDATION: 0x00D4AA,    // Mint green
  SHORT_LIQUIDATION: 0xFF6B6B,  // Coral red
  ACCENT: 0x6C5CE7,             // Purple accent
  DARK: 0x2D3436,               // Dark gray
  GOLD: 0xFDCB6E                // Gold for high value
};

// Format large numbers with appropriate suffixes
function formatValue(value) {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
}

// Get emoji based on liquidation size
function getLiquidationEmoji(notional) {
  if (notional >= 1000000) return "🐋"; // Whale
  if (notional >= 100000) return "🦈";  // Shark
  if (notional >= 10000) return "🐟";   // Fish
  return "🦐"; // Shrimp
}

// Get color based on liquidation size
function getLiquidationColor(side, notional) {
  const baseColor = side === "BUY" ? COLORS.LONG_LIQUIDATION : COLORS.SHORT_LIQUIDATION;
  
  // Gold color for massive liquidations
  if (notional >= 500000) return COLORS.GOLD;
  return baseColor;
}

async function sendModernDiscordEmbed(order, notional) {
  try {
    const isLong = order.S === "BUY";
    const side = isLong ? "LONG" : "SHORT";
    const emoji = getLiquidationEmoji(notional);
    const color = getLiquidationColor(order.S, notional);
    
    // Price formatting with better precision
    const price = parseFloat(order.p);
    const quantity = parseFloat(order.q);
    const formattedPrice = price < 1 ? price.toFixed(6) : price.toFixed(4);
    
    // Create dynamic title based on liquidation size
    let title = `${emoji} ${side} LIQUIDATION`;
    if (notional >= 1000000) title += " 🚨 WHALE ALERT";
    else if (notional >= 100000) title += " ⚡ LARGE";
    
    const embed = {
      title,
      description: `**${order.s}** position liquidated on Binance Futures`,
      color,
      fields: [
        {
          name: "💰 Liquidation Value",
          value: `**${formatValue(notional)}**`,
          inline: true
        },
        {
          name: "📊 Entry Price",
          value: `\`$${formattedPrice}\``,
          inline: true
        },
        {
          name: "📦 Quantity",
          value: `\`${quantity.toLocaleString()} ${order.s.replace('USDT', '')}\``,
          inline: true
        },
        {
          name: "⚡ Side",
          value: isLong ? "🟢 **LONG**" : "🔴 **SHORT**",
          inline: true
        },
        {
          name: "🕐 Time",
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true
        },
        {
          name: "📈 Exchange",
          value: "**Binance Futures**",
          inline: true
        }
      ],
      footer: {
        text: "🔥 Crypto Liquidation Tracker 🔥",
        icon_url: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png"
      },
      timestamp: new Date().toISOString(),
      thumbnail: {
        url: isLong ? 
          "https://cdn-icons-png.flaticon.com/512/190/190411.png" : // Green arrow up
          "https://cdn-icons-png.flaticon.com/512/190/190413.png"   // Red arrow down
      }
    };

    // Add special field for whale liquidations
    if (notional >= 1000000) {
      embed.fields.unshift({
        name: "🐋 WHALE STATUS",
        value: "```diff\n+ MASSIVE LIQUIDATION DETECTED\n```",
        inline: false
      });
    }

    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Liquidation-Tracker/1.0"
      },
      body: JSON.stringify({ 
        embeds: [embed],
        username: "Liquidation Tracker",
        avatar_url: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png"
      }),
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord webhook failed: ${response.status} - ${errorText}`);
    }

    return response;
  } catch (error) {
    console.error("❌ Error sending Discord embed:", error.message);
    throw error;
  }
}

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000;

function connectBinance() {
  try {
    ws = new WebSocket(BINANCE_WS);
    
    ws.on("open", () => {
      console.log("🚀 Connected to Binance WebSocket - Monitoring ASTER liquidations...");
      reconnectAttempts = 0; // Reset on successful connection
    });
    
    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg.o) return;
        
        const order = msg.o;
        const side = order.S === "BUY" ? "LONG" : "SHORT";
        const price = parseFloat(order.p);
        const qty = parseFloat(order.q);
        const notional = price * qty;
        
        // Only process liquidations above $1000 to reduce spam
        if (notional < 1000) return;
        
        const emoji = getLiquidationEmoji(notional);
        console.log(`${emoji} [${side} LIQ] ${order.s} | $${price} | ${qty} | ${formatValue(notional)}`);
        
        try {
          await sendModernDiscordEmbed(order, notional);
          console.log("✅ Liquidation alert sent to Discord");
        } catch (error) {
          console.error("❌ Failed to send Discord notification:", error.message);
          // Don't crash the whole app if Discord is down
        }
        
      } catch (error) {
        console.error("❌ Error processing message:", error.message);
      }
    });
    
    ws.on("close", (code, reason) => {
      console.log(`⚠️  WebSocket closed (${code}: ${reason || 'Unknown reason'})`);
      
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connectBinance, delay);
      } else {
        console.error("❌ Max reconnection attempts reached. Exiting...");
        process.exit(1);
      }
    });
    
    ws.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    // Keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds

  } catch (error) {
    console.error("❌ Failed to create WebSocket connection:", error.message);
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
      console.log(`🔄 Retrying connection in ${delay}ms...`);
      setTimeout(connectBinance, delay);
    }
  }
}

// Create a simple HTTP server for health checks (Render.com requirement)
import http from 'http';

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      uptime: process.uptime(),
      websocket: ws ? ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected' : 'not_initialized',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
  console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  
  // Close WebSocket
  if (ws) {
    ws.close();
  }
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('⏰ Force exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

console.log("🔥 Starting Crypto Liquidation Tracker...");
console.log(`🎯 Monitoring: ${BINANCE_WS}`);
console.log(`📬 Discord Webhook: ${DISCORD_WEBHOOK_URL ? 'Configured' : 'NOT SET'}`);

// Start the WebSocket connection
connectBinance();
