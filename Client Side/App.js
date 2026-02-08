/*************************************************
 * app.js
 * Crypto Trading Simulator Controller
 *************************************************/

const API_BASE = "http://localhost:3000";

/* ========== DOM ELEMENTS ========== */

// Status + live price
const connectionStatus = document.getElementById("connection-status");
const livePriceEl = document.getElementById("live-price");

// Portfolio values
const cashBalanceEl = document.getElementById("cash-balance");
const coinBalanceEl = document.getElementById("coin-balance");
const profitLossEl = document.getElementById("profit-loss");

// Tables
const ordersTable = document.getElementById("orders-table");
const tradesTable = document.getElementById("trades-table");

// Trade statistics
const statTradesEl = document.getElementById("stat-trades");
const statWinrateEl = document.getElementById("stat-winrate");
const statTotalPnlEl = document.getElementById("stat-totalpnl");
const statBestEl = document.getElementById("stat-best");
const statWorstEl = document.getElementById("stat-worst");

// Form inputs
const formErrorEl = document.getElementById("form-error");
const orderForm = document.getElementById("order-form");
const orderModeInput = document.getElementById("order-mode");
const orderTypeInput = document.getElementById("order-type");
const orderPriceInput = document.getElementById("order-price");
const orderAmountInput = document.getElementById("order-amount");
const priceRow = document.getElementById("price-row");

// Chart controls
const timeframeSelect = document.getElementById("timeframe-select");
const smaToggle = document.getElementById("sma-toggle");
const emaToggle = document.getElementById("ema-toggle");  
const rsiToggle = document.getElementById("rsi-toggle");
const chartCanvas = document.getElementById("price-chart");
const timeframeButtons = document.querySelectorAll(".tf-btn");

// Connection state UI
const offlineBanner = document.getElementById("offline-banner");
let serverOnline = true;

// Reset buttons
const resetPortfolioBtn = document.getElementById("reset-portfolio");
const resetOrdersBtn = document.getElementById("reset-orders");
const resetHistoryBtn = document.getElementById("reset-history");

// Help panel
const helpToggleBtn = document.getElementById("help-toggle");
const helpPanel = document.getElementById("help-panel");

/* ========== STATE ========== */

let candleMinutes = 5;        // Selected timeframe
let currentPrice = 0;        // Latest price
let currentCandle = null;    // Active candle
let openOrders = [];         // Pending orders
let tradeHistory = [];       // Completed trades
let openPosition = null;     // Current position
let showSMA = false;         // SMA visibility
let ws = null;               // WebSocket connection
let reconnectTimer = null;   // Reconnect timeout

// Portfolio balances
let portfolio = {
  cash: 10000,
  coin: 0
};

/* ========== LOCAL STORAGE ========== */

// Save app state to browser storage
function saveState() {
  localStorage.setItem("portfolio", JSON.stringify(portfolio));
  localStorage.setItem("openOrders", JSON.stringify(openOrders));
  localStorage.setItem("tradeHistory", JSON.stringify(tradeHistory));
}


// Load saved state from browser storage
function loadState() {
  portfolio = JSON.parse(localStorage.getItem("portfolio")) || portfolio;
  openOrders = JSON.parse(localStorage.getItem("openOrders")) || [];
  tradeHistory = JSON.parse(localStorage.getItem("tradeHistory")) || [];
}

/* ========== CHART SETUP ========== */
/* ⚠️ UNCHANGED — DO NOT TOUCH */

const chartData = {
  labels: [],
  datasets: [
    {
      label: "BTC Close",
      data: [],
      borderColor: "#ffffff",
      borderWidth: 2,
      pointRadius: 0,
      stepped: true
    },
    {
      label: "SMA (10)",
      data: [],
      borderColor: "#ffaa00",
      borderWidth: 1,
      pointRadius: 0,
      hidden: true
    },
    {
      label: "EMA (10)",
      data: [],
      borderColor: "#00ffaa",
      borderWidth: 1,
      pointRadius: 0,
      hidden: true
    },
    {
    label: "RSI (14)",
    data: [],
    borderColor: "#ff66cc",
    borderWidth: 1,
    pointRadius: 0,
    hidden: true,
    yAxisID: "rsi"
  },
  

    {
      label: "Trades",
      data: [],
      showLine: false,
      pointRadius: 6,
      backgroundColor: ctx =>
        ctx.raw?.type === "buy" ? "#00ff88" : "#ff4444"
    }
  ]
};

// Initialize Chart.js chart
const priceChart = new Chart(chartCanvas, {
  type: "line",
  data: chartData,
  options: {
    responsive: true,
    animation: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: "#ffffff",

          filter: (legendItem) => {
            const label = legendItem.text;

            // ✅ Always show core datasets
            if (label === "BTC Close" || label === "Trades") {
              return true;
            }

            // ✅ Only show indicators when visible (toggled on)
            return legendItem.hidden === false;
          }
        }
      }
    },
    scales: {
      x: { ticks: { color: "#aaa" } },
      y: { ticks: { color: "#aaa" } },

      rsi: {
        position: "right",
        min: 0,
        max: 100,
        grid: { drawOnChartArea: false },
        ticks: { color: "#ff66cc" }
      }
    }
  }
});

/* ========== UX HELPERS (NEW) ========== */

// Enable / disable trading inputs
function setTradingEnabled(enabled) {
  const elements = orderForm.querySelectorAll("input, select, button");
  elements.forEach(el => {
    el.disabled = !enabled;
  });

  if (!enabled) {
    formErrorEl.textContent = "Live connection required to trade.";
  }
}

// Flash price when updated
function flashPrice() {
  livePriceEl.classList.add("price-flash"); 
  setTimeout(() => {
    livePriceEl.classList.remove("price-flash");
  }, 300);
}

// Show temporary error message
function showTempError(msg, duration = 3000) {
  formErrorEl.textContent = msg;
  setTimeout(() => {
    if (formErrorEl.textContent === msg) {
      formErrorEl.textContent = "";
    }
  }, duration);
}


/* ========== UTILITIES ========== */

// Update connection status text
function setStatus(msg) {
  connectionStatus.textContent = msg;
}

// Align timestamp to candle timeframe
function floorToTimeframe(ts) {
  return Math.floor(ts / (candleMinutes * 60 * 1000)) * (candleMinutes * 60 * 1000);
}

/* ========== UI LOGIC ========== */

// Show limit price input only for limit orders
function updateOrderModeUI() {
  const isLimit = orderModeInput.value === "limit";
  priceRow.style.display = isLimit ? "block" : "none";
}

orderModeInput.addEventListener("change", updateOrderModeUI);

/* ========== TIMEFRAME BUTTONS ========== */
timeframeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const minutes = btn.dataset.minutes;

    // UI active state
    timeframeButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // Trigger existing logic
    changeTimeframe(minutes);
  });
});

// Indicator toggles
smaToggle?.addEventListener("change", e => {
  showSMA = e.target.checked;
  chartData.datasets[1].hidden = !showSMA;
  priceChart.update();
});
emaToggle?.addEventListener("change", e => {
  chartData.datasets[2].hidden = !e.target.checked;
  priceChart.update();
});
rsiToggle?.addEventListener("change", e => {
  chartData.datasets[3].hidden = !e.target.checked; // RSI dataset index
  priceChart.update();
});


/* ========== TOAST NOTIFICATIONS ========== */

const toastEl = document.getElementById("toast");

// Display popup notification
function showToast(message, type = "success") {
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;

  setTimeout(() => {
    toastEl.className = "toast";
  }, 3000);
}


/* ✅ Help panel toggle */
helpToggleBtn?.addEventListener("click", () => {
  helpPanel.classList.toggle("open");
});

/* ========== SMA CALCULATION ==========
   SMA (Simple Moving Average) calculates the average price over a fixed number
   of recent data points. It smooths out price changes to help show the overall
   trend direction.
*/

function calculateSMA(period = 10) {
  const prices = chartData.datasets[0].data;
  const sma = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const avg = slice.reduce((a, b) => a + b, 0) / period;
      sma.push(avg);
    }
  }

  chartData.datasets[1].data = sma;
}

/* ========== EMA CALCULATION ==========
   EMA (Exponential Moving Average) is similar to SMA but gives more weight to
   recent prices. This makes it react faster to price changes and trend shifts.
*/
function calculateEMA(period = 10) {
  const prices = chartData.datasets[0].data;
  const ema = [];

  const multiplier = 2 / (period + 1);

  let previousEMA = prices[0];
  ema.push(previousEMA);

  for (let i = 1; i < prices.length; i++) {
    const currentEMA =
      prices[i] * multiplier + previousEMA * (1 - multiplier);

    ema.push(currentEMA);
    previousEMA = currentEMA;
  }

  chartData.datasets[2].data = ema; // ⚠️ adjust index if needed
}

/* ========== RSI CALCULATION ==========
   RSI (Relative Strength Index) measures how strong recent price movements are.
   It helps identify if an asset is overbought (too high) or oversold (too low)
   using a scale from 0 to 100.
*/
function calculateRSI(period = 14) {
  const prices = chartData.datasets[0].data;
  const rsi = [];

  if (prices.length < period + 1) {
    chartData.datasets[3].data = [];
    return;
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - (100 / (1 + rs));
  }

  chartData.datasets[3].data = rsi;
}


/* ========== TABLE RENDERING ========== */

// Render open orders table
function renderOrdersTable() {
  ordersTable.innerHTML = "";

  openOrders.forEach(order => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${order.type.toUpperCase()}</td>
      <td>${order.mode}</td>
      <td>$${order.price.toFixed(2)}</td>
      <td>${order.amount}</td>
      <td><button class="cancel-btn">Cancel</button></td>
    `;

    row.querySelector(".cancel-btn").addEventListener("click", () => {
      openOrders = openOrders.filter(o => o.id !== order.id);
      saveState();
      renderOrdersTable();
    });

    ordersTable.appendChild(row);
  });
}

// Render trade history table
function renderTradesTable() {
  tradesTable.innerHTML = "";

  tradeHistory.slice().reverse().forEach(trade => {
    const row = document.createElement("tr");
    const pnlColor = trade.pnl >= 0 ? "lime" : "red";

    row.innerHTML = `
      <td>${trade.openTime}</td>
      <td>${trade.closeTime}</td>
      <td>$${trade.entry.toFixed(2)}</td>
      <td>$${trade.exit.toFixed(2)}</td>
      <td>${trade.amount}</td>
      <td style="color:${pnlColor}">
        ${trade.pnl.toFixed(2)}
      </td>
    `;

    tradesTable.appendChild(row);
  });

  updateStats();
}

/* ========== TRADE STATS ========== */

// Calculate and update statistics
function updateStats() {
  const total = tradeHistory.length;
  const wins = tradeHistory.filter(t => t.pnl > 0).length;
  const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
  const best = tradeHistory.length ? Math.max(...tradeHistory.map(t => t.pnl)) : 0;
  const worst = tradeHistory.length ? Math.min(...tradeHistory.map(t => t.pnl)) : 0;

  statTradesEl.textContent = total;
  statWinrateEl.textContent = total ? `${Math.round((wins / total) * 100)}%` : "0%";
  statTotalPnlEl.textContent = totalPnl.toFixed(2);
  statBestEl.textContent = best.toFixed(2);
  statWorstEl.textContent = worst.toFixed(2);
}

/* ========== LOAD HISTORY ========== */

// Fetch historical candle data from server
async function loadHistory() {
  try {
    const interval = candleMinutes === 1 ? "1m" : "5m";

    const res = await fetch(`${API_BASE}/history?interval=${interval}`);
    const candles = await res.json();

    // Clear chart
    chartData.labels = [];
    chartData.datasets[0].data = [];
    chartData.datasets[1].data = [];
    chartData.datasets[2].data = [];

    candles.forEach(c => {
      const time = new Date(c[0]).toLocaleTimeString();
      const close = Number(c[4]);

      chartData.labels.push(time);
      chartData.datasets[0].data.push(close);
    });

    calculateSMA();
    calculateEMA();
    calculateRSI();

    priceChart.update();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load history");
  }
}


/* ========== TIMEFRAME SWITCH ========== */

async function changeTimeframe(minutes) {
  candleMinutes = Number(minutes);
  currentCandle = null;   // important reset
  await loadHistory();
}



/* ========== PRICE HANDLING ========== */

// Update live price display
function updatePrice(price) {
  currentPrice = price;
  livePriceEl.textContent = price.toFixed(2);

  flashPrice(); // ✅ UX feedback

  renderPortfolio();
  checkLimitOrders();
}

// Update candle data on each tick
function processTrade(price) {
  const now = Date.now();
  const bucket = floorToTimeframe(now);

  // If this is a new candle bucket → create new candle
  if (!currentCandle || currentCandle.time !== bucket) {
    currentCandle = {
      time: bucket,
      close: price
    };

    chartData.labels.push(new Date(bucket).toLocaleTimeString());
    chartData.datasets[0].data.push(price);

    // Keep chart length reasonable
    if (chartData.labels.length > 60) {
      chartData.labels.shift();
      chartData.datasets[0].data.shift();
    }
  } 
  // Same candle → update last price only
  else {
    currentCandle.close = price;
    chartData.datasets[0].data[
      chartData.datasets[0].data.length - 1
    ] = price;
  }

  calculateSMA();
  calculateEMA();
  calculateRSI();

  priceChart.update("none");
}

/* ========== INPUT VALIDATION (NEW) ========== */

// Validate order before submission
function validateOrder(mode, price, amount) {
  if (!amount || amount <= 0) return "Amount must be greater than zero.";
  if (mode === "limit" && (!price || price <= 0)) return "Limit price required.";
  if (orderTypeInput.value === "buy" && portfolio.cash < price * amount)
    return "Insufficient cash.";
  if (orderTypeInput.value === "sell" && portfolio.coin < amount)
    return "Insufficient coin balance.";
  return null;
}

/* ========== SERVER HEALTH CHECK (NEW) ========== */

// Periodically check server connectivity
async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/coins`, { timeout: 3000 });
    if (!res.ok) throw new Error("Server unhealthy");

    if (!serverOnline) {
      console.log("Server reconnected");
      setStatus("Server connected ✅");
      offlineBanner.style.display = "none";
      serverOnline = true;
    }
  } catch (err) {
    if (serverOnline) {
      console.warn("Server disconnected");
      setStatus("Server offline ⚠️");
      offlineBanner.style.display = "block";
      serverOnline = false;
    }
  }
}


/* ========== ORDER ENGINE ========== */

// Handle order submission
orderForm.addEventListener("submit", e => {
  e.preventDefault();

  const mode = orderModeInput.value;
  const type = orderTypeInput.value;
  const amount = Number(orderAmountInput.value);
  const price = mode === "market" ? currentPrice : Number(orderPriceInput.value);

  const error = validateOrder(mode, price, amount);
 if (error) {
  formErrorEl.textContent = error;
  showToast(error, "error");
  return;
}
  // ✅ auto clears --- IGNORE ---
  formErrorEl.textContent = "";

  const order = {
    id: Date.now(),
    mode,
    type,
    price,
    amount
  };

  if (mode === "market") {
    executeOrder(order);
  } else {
    openOrders.push(order);
    saveState();
    renderOrdersTable();
  }

  orderForm.reset();
});

/* ========== EXECUTION WITH PNL ========== */

// Execute buy / sell order
function executeOrder(order) {
  const cost = order.price * order.amount;

  if (order.type === "buy") {
    portfolio.cash -= cost;
    portfolio.coin += order.amount;

    openPosition = {
      openTime: new Date().toLocaleTimeString(),
      entry: order.price,
      amount: order.amount
    };

  } else {
    portfolio.coin -= order.amount;
    portfolio.cash += cost;

    const pnl = (order.price - openPosition.entry) * order.amount;

    tradeHistory.push({
      openTime: openPosition.openTime,
      closeTime: new Date().toLocaleTimeString(),
      entry: openPosition.entry,
      exit: order.price,
      amount: order.amount,
      pnl
    });

    openPosition = null;
    renderTradesTable();
  }

  saveState();
  renderPortfolio();
  setStatus(`Executed ${order.mode} ${order.type}`);
  showToast(
    `${order.type.toUpperCase()} order executed at $${order.price.toFixed(2)}`,
    "success"
  );

}

/* ========== RESET CONTROLS (NEW) ========== */

// Reset portfolio to initial state
resetPortfolioBtn?.addEventListener("click", () => {
  if (!confirm("Reset portfolio to $10,000?")) return;

  portfolio = { cash: 10000, coin: 0 };
  openPosition = null;
  saveState();
  renderPortfolio();
});

resetOrdersBtn?.addEventListener("click", () => {
  if (!confirm("Clear all open orders?")) return;

  openOrders = [];
  saveState();
  renderOrdersTable();
});

resetHistoryBtn?.addEventListener("click", () => {
  if (!confirm("Clear trade history?")) return;

  tradeHistory = [];
  saveState();
  renderTradesTable();
});

/* ========== PORTFOLIO ========== */

// Update portfolio display
function renderPortfolio() {
  const pnl =
    portfolio.cash + portfolio.coin * currentPrice - 10000;

  cashBalanceEl.textContent = portfolio.cash.toFixed(2);
  coinBalanceEl.textContent = portfolio.coin.toFixed(4);
  profitLossEl.textContent = pnl.toFixed(2);

  profitLossEl.classList.remove("pnl-positive", "pnl-negative");
  if (pnl > 0) profitLossEl.classList.add("pnl-positive");
  if (pnl < 0) profitLossEl.classList.add("pnl-negative");
  
}

// Prevent runtime crash if limit logic is not implemented yet
function checkLimitOrders() {
  // Intentionally empty for now
}


/* ========== BINANCE WEBSOCKET ========== */

// Connect to Binance live feed
function connectBinance() {
  setStatus("Connecting to live price feed...");

  ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");

  ws.onopen = () => {
    console.log("WebSocket connected");
    setStatus("Live price connected ✅");
    setTradingEnabled(true);


    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = msg => {
    try {
      const data = JSON.parse(msg.data);
      const price = Number(data.p);
      updatePrice(price);
      processTrade(price);
    } catch (err) {
      console.error("WebSocket parse error:", err);
    }
  };

  ws.onerror = err => {
    console.error("WebSocket error:", err);
    setStatus("Connection error ⚠️");
  };

  ws.onclose = () => {
    console.warn("WebSocket disconnected");
    setStatus("Disconnected — retrying in 3s...");
    setTradingEnabled(false);


    // Auto-reconnect after 3 seconds
    if (serverOnline) {
      reconnectTimer = setTimeout(() => {
        connectBinance();
      }, 3000);
    }
  };
}



/* ========== CLEANUP ON EXIT ========== */
window.addEventListener("beforeunload", () => {
  if (ws) {
    ws.close();
  }
});


/* ========== INIT ========== */

// App startup
async function init() {
  loadState();
  renderPortfolio();
  renderOrdersTable();
  renderTradesTable();
  updateOrderModeUI();
  await loadHistory();
  // Ensure EMA visibility matches checkbox on load
  if (emaToggle) {
    chartData.datasets[2].hidden = !emaToggle.checked;
  }

  connectBinance();
  // Check server health every 5 seconds
  setInterval(checkServerHealth, 5000);

}

init();
