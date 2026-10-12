(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const form = $("#pairForm");
  const phoneInput = $("#phoneNumber");
  const keyInput = $("#portalKey");
  const pairButton = $("#pairButton");
  const messageBox = $("#messageBox");
  const codeSection = $("#codeSection");
  const codeDisplay = $("#pairingCode");
  const statusPill = $("#statusPill");
  const statusText = $("#statusText");
  const settingsPanel = $("#settingsPanel");
  const backendInput = $("#backendUrl");

  if (
    !form || !phoneInput || !keyInput || !pairButton ||
    !messageBox || !codeSection || !codeDisplay ||
    !statusPill || !statusText || !settingsPanel ||
    !backendInput
  ) {
    console.error(
      "BrightWorks: Required HTML elements are missing. Check index.html IDs."
    );
    return;
  }

  // Backend URL must be configured in Settings.
  // Do not put your portal key in this file.
  let backendBase = "";
  let currentCode = "";
  let statusTimer;

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  function apiUrl(path) {
    return backendBase.replace(/\/+$/, "") + path;
  }

  function setStatus(state, label) {
    statusPill.classList.remove("offline", "checking");

    if (state !== "online") {
      statusPill.classList.add(state);
    }

    statusText.textContent = label;
  }

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.classList.remove("hidden", "success");

    if (type === "success") {
      messageBox.classList.add("success");
    }
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.classList.add("hidden");
    messageBox.classList.remove("success");
  }

  function formatCode(value) {
    const raw = String(value ?? "").trim();

    return /^\d{8}$/.test(raw)
      ? `${raw.slice(0, 4)} ${raw.slice(4)}`
      : raw;
  }

  async function readResponse(response) {
    const text = await response.text();

    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 250) };
    }
  }

  function httpError(status, server
