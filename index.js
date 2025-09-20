import WebSocket from "ws";
import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BINANCE_WS = "wss://fstream.binance.com/ws/asterusdt@forceOrder";

function sendDiscord(message) {
  return fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
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
    const side = order.S === "BUY" ? "Long Liquidation" : "Short Liquidation";
    const price = order.p;
    const qty = order.q;

    const discordMsg = `💥 ${side}\nSymbol: ${order.s}\nPrice: ${price}\nQuantity: ${qty}`;
    console.log(discordMsg);

    const resp = await sendDiscord(discordMsg);
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
