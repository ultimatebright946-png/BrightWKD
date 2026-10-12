require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { getPairingCode, getBotStatus } = require("./bot");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PORTAL_KEY = process.env.PORTAL_KEY;

if (!PORTAL_KEY || PORTAL_KEY === "replace_with_a_long_random_secret") {
  console.error("Set a strong PORTAL_KEY in .env before starting the server.");
  process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser tools and same-origin requests with no Origin header.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  }
}));
app.use(express.json({ limit: "10kb" }));

app.use("/api/pair", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.get("/api/status", (_req, res) => {
  res.json(getBotStatus());
});

app.post("/api/pair", async (req, res) => {
  const suppliedKey = req.get("X-Portal-Key");
  if (!suppliedKey || suppliedKey !== PORTAL_KEY) {
    return res.status(401).json({ error: "Invalid portal key." });
  }

  const number = String(req.body?.number || "").replace(/[^\d]/g, "");
  if (!/^\d{10,15}$/.test(number)) {
    return res.status(400).json({
      error: "Enter a valid phone number with country code, using digits only."
    });
  }

  try {
    const code = await getPairingCode(number);
    return res.json({ code });
  } catch (error) {
    console.error("Pairing request failed:", error.message);
    return res.status(503).json({
      error: error.publicMessage || "Could not create a pairing code. Check that the bot is online and try again."
    });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, _req, res, _next) => {
  if (error.message === "Origin not allowed by CORS") {
    return res.status(403).json({ error: "This website origin is not allowed." });
  }
  console.error("Server error:", error.message);
  return res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`BrightWorks backend listening on port ${PORT}`);
});
