require("dotenv").config();

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const AUTH_DIR = path.join(__dirname, process.env.AUTH_DIR || "auth");
const LEADERBOARD_FILE = path.join(__dirname, "leaderboard.json");

let sock = null;
let starting = null;
let connected = false;
let currentUser = null;
let pendingPairNumber = null;
let pendingPairPromise = null;

function getBotStatus() {
  return { online: Boolean(connected && sock?.user), user: currentUser || undefined };
}

function normalizeNumber(number) {
  return String(number || "").replace(/[^\d]/g, "");
}

async function startBot() {
  if (starting) return starting;

  starting = (async () => {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      // Let Baileys choose its installed default if the version lookup fails.
    }

    sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      logger: pino({ level: process.env.LOG_LEVEL || "silent" }),
      printQRInTerminal: false,
      browser: ["BrightWorks", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "open") {
        connected = true;
        currentUser = sock?.user?.id || null;
        console.log("BrightWorks connected to WhatsApp.");
      }
      if (connection === "close") {
        connected = false;
        currentUser = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log("WhatsApp connection closed; reconnecting...");
          sock = null;
          starting = null;
          setTimeout(() => startBot().catch((err) => console.error("Reconnect failed:", err.message)), 3000);
        } else {
          console.error("WhatsApp session logged out. Remove the auth folder only if you intend to pair again.");
          sock = null;
          starting = null;
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try {
          await handleMessage(message);
        } catch (error) {
          console.error("Message handler error:", error.message);
        }
      }
    });

    sock.ev.on("group-participants.update", async (event) => {
      // Optional welcome message. Set WELCOME_MESSAGE in .env to enable it.
      if (!process.env.WELCOME_MESSAGE || !sock) return;
      if (event.action !== "add") return;
      for (const participant of event.participants || []) {
        try {
          await sock.sendMessage(event.id, {
            text: process.env.WELCOME_MESSAGE.replace("{user}", `@${participant.split("@")[0]}`),
            mentions: [participant]
          });
        } catch (error) {
          console.error("Welcome message failed:", error.message);
        }
      }
    });

    return sock;
  })();

  try {
    return await starting;
  } catch (error) {
    starting = null;
    throw error;
  }
}

async function getPairingCode(number) {
  const phone = normalizeNumber(number);
  if (!/^\d{10,15}$/.test(phone)) {
    const err = new Error("Invalid number");
    err.publicMessage = "Enter a valid phone number with country code.";
    throw err;
  }

  if (getBotStatus().online) {
    const err = new Error("Already linked");
    err.publicMessage = "The bot is already connected to WhatsApp.";
    throw err;
  }

  if (pendingPairPromise) {
    const err = new Error("Pairing request already in progress");
    err.publicMessage = "A pairing request is already processing. Wait a moment and try again.";
    throw err;
  }

  pendingPairNumber = phone;
  pendingPairPromise = (async () => {
    await startBot();
    // Allow socket setup to finish before requesting a pairing code.
    if (!sock || typeof sock.requestPairingCode !== "function") {
      throw new Error("WhatsApp socket is not ready");
    }
    const code = await sock.requestPairingCode(phone);
    return String(code).replace(/[^A-Z0-9]/gi, "").match(/.{1,4}/g)?.join("-") || String(code);
  })();

  try {
    return await pendingPairPromise;
  } catch (error) {
    const wrapped = new Error(error.message);
    wrapped.publicMessage = "WhatsApp could not generate a code. Make sure the number is eligible for WhatsApp and try again shortly.";
    throw wrapped;
  } finally {
    pendingPairNumber = null;
    pendingPairPromise = null;
  }
}

function readLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
}

async function handleMessage(message) {
  if (!message?.message || message.key?.fromMe) return;
  const jid = message.key.remoteJid;
  if (!jid || jid === "status@broadcast") return;

  const text = extractText(message.message).trim();
  if (!text.startsWith(".")) return;

  const [command, ...args] = text.slice(1).split(/\s+/);
  const name = (command || "").toLowerCase();
  const reply = async (body, options = {}) => sock.sendMessage(jid, { text: body, ...options }, { quoted: message });

  if (name === "help" || name === "menu") {
    return reply(
      "╭─ *BRIGHTWORKS BOT* ─╮\n" +
      "`.ping` — Check bot response\n" +
      "`.alive` — Show online status\n" +
      "`.rank` — Show saved leaderboard\n" +
      "`.setrank @mention rank` — Save a rank (group admins should manage this)\n" +
      "╰────────────────╯"
    );
  }

  if (name === "ping") return reply("Pong! ⚡ BrightWorks is responding.");
  if (name === "alive") return reply("BrightWorks is online. 🤖");

  if (name === "rank") {
    const data = readLeaderboard();
    const entries = Object.entries(data).sort((a, b) => String(b[1]).localeCompare(String(a[1])));
    if (!entries.length) return reply("The leaderboard is empty. Use `.setrank @mention rank` to add an entry.");
    return reply("🏆 *BRIGHTWORKS LEADERBOARD*\n" +
      entries.slice(0, 10).map(([user, rank], i) => `${i + 1}. ${user}: ${rank}`).join("\n"));
  }

  if (name === "setrank") {
    if (!jid.endsWith("@g.us")) return reply("Use this command inside a group.");
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const target = mentioned[0];
    const rank = args.filter((part) => !part.startsWith("@")).join(" ").trim();
    if (!target || !rank) return reply("Usage: `.setrank @mention Gold III`");
    const data = readLeaderboard();
    data[target.split("@")[0]] = rank.slice(0, 40);
    saveLeaderboard(data);
    return reply(`Saved rank for @${target.split("@")[0]}: ${rank}`, { mentions: [target] });
  }
}

function extractText(content) {
  return content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    "";
}

startBot().catch((error) => {
  console.error("Could not start BrightWorks bot:", error.message);
  process.exitCode = 1;
});

module.exports = { getPairingCode, getBotStatus };
