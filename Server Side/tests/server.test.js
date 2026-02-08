const request = require("supertest");
const app = require("../server");

describe("API Tests", () => {

  /* ---------- COINS ---------- */

  test("GET /coins returns list of coins", async () => {
    const res = await request(app).get("/coins");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("GET /coins/btc returns a coin with related orders", async () => {
    const res = await request(app).get("/coins/btc");

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe("btc");
    expect(res.body).toHaveProperty("orders");
  });

  test("GET /coins/invalid returns 404", async () => {
    const res = await request(app).get("/coins/invalid");

    expect(res.statusCode).toBe(404);
  });

  /* ---------- ORDERS ---------- */

  test("GET /orders returns array", async () => {
    const res = await request(app).get("/orders");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("POST /orders creates a valid order", async () => {
    const newOrder = {
      coinId: "btc",
      type: "buy",
      price: 100,
      amount: 1
    };

    const res = await request(app)
      .post("/orders")
      .send(newOrder)
      .set("Content-Type", "application/json");

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.coinId).toBe("btc");
  });

  test("POST /orders rejects invalid data", async () => {
    const res = await request(app)
      .post("/orders")
      .send({})
      .set("Content-Type", "application/json");

    expect(res.statusCode).toBe(400);
  });

  test("GET /orders/:id returns a single order", async () => {
    // Create an order first
    const create = await request(app)
      .post("/orders")
      .send({
        coinId: "btc",
        type: "buy",
        price: 200,
        amount: 1
      })
      .set("Content-Type", "application/json");

    const orderId = create.body.id;

    const res = await request(app).get(`/orders/${orderId}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body).toHaveProperty("coin");
  });

  test("GET /orders/invalid returns 404", async () => {
    const res = await request(app).get("/orders/invalid");

    expect(res.statusCode).toBe(404);
  });

});
