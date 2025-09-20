import WebSocket from "ws";
import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BINANCE_WS = "wss://fstream.binance.com/ws/asterusdt@forceOrder";

async function sendDiscordEmbed(order, side, notional) {
  const color = order.S === "BUY" ? 0x2ecc71 : 0xe74c3c; // green for long, red for short

  const embed = {
    title: `${side} 💥`,
    color,
    fields: [
      { name: "Symbol", value: `\`${order.s}\``, inline: true },
      { name: "Price", value: `\`${parseFloat(order.p).toLocaleString()}\``, inline: true },
      { name: "Quantity", value: `\`${parseFloat(order.q).toLocaleString()}\``, inline: true },
      { name: "Notional (USDT)", value: `\`${notional.toLocaleString()}\``, inline: true },
      { name: "Time", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    ],
    footer: { text: "Binance Futures Liquidation Bot" }
  };

  return fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  });
}

function connectBinance() {
  const ws = new WebSocket(BINANCE_WS);

  ws.on("open", () => {
    console.log("✅ Connected to Binance WebSocket");
  });

  ws.on("message", async (data) => {
    const msg = JSON.parse(data.toString());
    if (!msg.o) return;

    const order = msg.o;
    const side = order.S === "BUY" ? "🟢 Long Liquidation" : "🔴 Short Liquidation";
    const price = parseFloat(order.p);
    const qty = parseFloat(order.q);
    const notional = price * qty; // USDT value

    console.log(`[${side}] ${order.s} | Price: ${price} | Qty: ${qty} | Value: ${notional}`);

    const resp = await sendDiscordEmbed(order, side, notional);
    if (!resp.ok) {
      console.error("❌ Discord error:", await resp.text());
    }
  });

  ws.on("close", () => {
    console.log("⚠️ WebSocket closed. Reconnecting in 5s...");
    setTimeout(connectBinance, 5000);
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
    ws.close();
  });
}

connectBinance();
