const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");
const {
  createRfq,
  listRfqs,
  getRfqDetails,
  submitBid,
} = require("./auctionService");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

function sendError(res, error) {
  const message = error.message || "Something went wrong";
  const status = message.includes("not found") ? 404 : 400;
  res.status(status).json({ error: message });
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "British Auction RFQ API" });
});

app.post("/api/rfqs", async (req, res) => {
  try {
    const data = await createRfq(req.body);
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/rfqs", async (req, res) => {
  try {
    const data = await listRfqs();
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/rfqs/:id", async (req, res) => {
  try {
    const data = await getRfqDetails(req.params.id);
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/rfqs/:id/bids", async (req, res) => {
  try {
    const data = await submitBid(req.params.id, req.body);
    res.status(201).json(data);
  } catch (error) {
    sendError(res, error);
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`British Auction RFQ backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });
