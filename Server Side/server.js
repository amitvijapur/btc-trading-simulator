/*************************************************
 * server.js
 * Node.js REST API for Crypto Trading Simulator
 *************************************************/


const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

/* ========== MIDDLEWARE ========== */

// Allow requests from browser (CORS)
app.use(cors());
// Parse incoming JSON requests
app.use(express.json());
// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "Client Side")));


/* ========== IN-MEMORY DATA ========== */

// Available coins
let coins = [
  { id: "btc", symbol: "BTC", name: "Bitcoin" },
  { id: "eth", symbol: "ETH", name: "Ethereum" }
];

// Stores all created orders (temporary memory)
let orders = [];

/* ========== SHUTDOWN HANDLER ========== */
let shuttingDown = false;

// Middleware to handle requests during shutdown
app.use((req, res, next) => {
  if (shuttingDown) {
    return res.status(503).send(`
      <html>
        <head>
          <title>Server Offline</title>
          <style>
            body {
              background:#0e0e0e;
              color:white;
              font-family:system-ui;
              display:flex;
              align-items:center;
              justify-content:center;
              height:100vh;
              text-align:center;
            }
          </style>
        </head>
        <body>
          <div>
            <h1>🚧 Server Shutting Down</h1>
            <p>Please refresh in a few moments.</p>
          </div>
        </body>
      </html>
    `);
  }
  next();
});



/* ========== ROOT ROUTE ========== */

// Serve main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "Client Side", "index.html"));
});


/* ========== COIN ROUTES ========== */

/**
 * GET /coins
 * Returns list of all coins
 */
app.get("/coins", (req, res) => {
  res.status(200).json(coins);
});

/**
 * GET /coins/:id
 * Returns a single coin including related orders
 */
app.get("/coins/:id", (req, res) => {
  const coin = coins.find(c => c.id === req.params.id);

  // If coin not found, return 404
  if (!coin) {
    return res.status(404).json({ error: "Coin not found" });
  }

  // Find related orders
  const relatedOrders = orders.filter(o => o.coinId === coin.id);

  res.status(200).json({
    ...coin,
    orders: relatedOrders
  });
});

/**
 * POST /coins
 * Create a new coin
 * Body: { id, symbol, name }
 */
app.post("/coins", (req, res) => {
  const { id, symbol, name } = req.body;

  // Validate input
  if (!id || !symbol || !name) {
    return res.status(400).json({ error: "Missing coin fields" });
  }

  // Check for duplicate coin
  const exists = coins.some(c => c.id === id);
  if (exists) {
    return res.status(400).json({ error: "Coin already exists" });
  }

  // Create and store new coin
  const newCoin = { id, symbol, name };
  coins.push(newCoin);

  res.status(201).json(newCoin);
});

/* ========== ORDER ROUTES ========== */

/**
 * GET /orders
 * Returns all orders
 */
app.get("/orders", (req, res) => {
  res.status(200).json(orders);
});

/**
 * GET /orders/:id
 * Returns a single order including related coin
 */
app.get("/orders/:id", (req, res) => {
  const order = orders.find(o => o.id === req.params.id);

  // If order not found, return 404
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  // Find related coin
  const coin = coins.find(c => c.id === order.coinId);

  res.status(200).json({
    ...order,
    coin
  });
});

/**
 * POST /orders
 * Create a new order
 * Body: { coinId, type, price, amount }
 */
app.post("/orders", (req, res) => {
  const { coinId, type, price, amount } = req.body;

  // Validate input
  if (!coinId || !type || !price || !amount) {
    return res.status(400).json({ error: "Invalid order data" });
  }

  // Check if coin exists
  const coinExists = coins.some(c => c.id === coinId);
  if (!coinExists) {
    return res.status(400).json({ error: "Invalid coinId" });
  }

  // Create and store new order
  const order = {
    id: Date.now().toString(),
    coinId,
    type,
    price: Number(price),
    amount: Number(amount),
    status: "open",
    createdAt: new Date().toISOString()
  };

  // Store order in memory
  orders.push(order);
  res.status(201).json(order);
});

/* ========== HISTORY PROXY (Binance) ========== */
/* Supports 1m and 5m intervals from frontend */

// Fetch historical candle data from Binance API
app.get("/history", async (req, res) => {
  try {
    const interval = req.query.interval || "5m";

    // Validate interval
    const allowed = ["1m", "5m"];
    const safeInterval = allowed.includes(interval) ? interval : "5m";

    // Set limit based on interval
    const limit = safeInterval === "1m" ? 240 : 48;

    // Construct Binance API URL
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${safeInterval}&limit=${limit}`;

    // Fetch data from Binance
    const response = await fetch(url);
    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error("History fetch failed:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

/* ========== SERVER START ========== */

// Start server if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

/* ========== GRACEFUL SHUTDOWN ========== */

// Handle SIGINT (Ctrl+C) for graceful shutdown
process.on("SIGINT", () => {
  console.log("Gracefully shutting down...");
  shuttingDown = true;

  // Wait before exiting to allow ongoing requests to finish
  setTimeout(() => {
    console.log("Server closed.");
    process.exit(0);
  }, 3000); // 3 seconds grace period
});


module.exports = app;
