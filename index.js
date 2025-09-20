import WebSocket from "ws";
import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BINANCE_WS = "wss://fstream.binance.com/ws/asterusdt@forceOrder";

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
        value: "**Futures**",
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

  return fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      embeds: [embed],
      username: "Liquidation Tracker",
      avatar_url: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png"
    })
  });
}

function connectBinance() {
  const ws = new WebSocket(BINANCE_WS);
  
  ws.on("open", () => {
    console.log("🚀 Connected to Binance WebSocket - Monitoring liquidations...");
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
      
      const resp = await sendModernDiscordEmbed(order, notional);
      
      if (!resp.ok) {
        const errorText = await resp.text();
        console.error("❌ Discord webhook failed:", errorText);
      } else {
        console.log("✅ Liquidation alert sent to Discord");
      }
      
    } catch (error) {
      console.error("❌ Error processing message:", error);
    }
  });
  
  ws.on("close", (code, reason) => {
    console.log(`⚠️  WebSocket closed (${code}: ${reason}). Reconnecting in 5s...`);
    setTimeout(connectBinance, 5000);
  });
  
  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err.message);
    ws.close();
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down liquidation tracker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});

console.log("🔥 Starting Crypto Liquidation Tracker...");
connectBinance();
