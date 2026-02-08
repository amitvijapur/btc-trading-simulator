## Name: Amit Vijapur
## Project: Programming Black Coursework

# 🚀 Mits Crypto Trading Simulator

A full-stack web application that simulates cryptocurrency trading using live Bitcoin market data.  
Built using Node.js, Express, vanilla JavaScript and Chart.js.

This project demonstrates REST API design, client-side interaction, live WebSocket data handling, automated testing and documentation.

---

## Features

### Client Side
- Live Bitcoin price streamed from Binance WebSocket API
- Interactive price chart using Chart.js
- Technical indicators:
  - Simple Moving Average (SMA 10)
  - Exponential Moving Average (EMA 10)
  - Relative Strength Index (RSI 14)
- Toggle indicators on/off
- Timeframe switching (1 minute / 5 minute candles)
- Simulated trading:
  - Market orders
  - Limit orders
  - Portfolio tracking
  - Profit & Loss calculation
- Trade statistics dashboard
- Local storage persistence
- Graceful WebSocket reconnect handling

---

### Server Side
- REST API built using Express
- In-memory data storage for coins and orders
- Proxy endpoint for Binance candle history
- Input validation and error handling
- Fully tested using Jest + Supertest

---

### API Endpoints

Base URL:
http://localhost:3000

---

#### Coins
- `GET /coins`
- `GET /coins/:id`

#### Orders
- `GET /orders`
- `GET /orders/:id`
- `POST /orders`

#### Market History
- `GET /history?interval=1m|5m`

Full API documentation is available in:

/client/api-docs.html

---

## Installations & SetUp
(All on Terminal)

installation: npm install

Server: node server.js

Server runs on : http://localhost:3000

(On browser):
http://localhost:3000/clientside/index.html

---

## Automated Testing

Tests are written using **Jest** and **Supertest**.

Run tests:

```bash
npm test


## 🚀 Future Improvement Plans
- Add more cryptocurrencies
- Save data to a database
- Add user authentication
- Improve mobile responsiveness

