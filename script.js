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

  // Blank means same origin. Backend URL is held only in memory.
  let backendBase = "";
  let currentCode = "";

  $("#year").textContent = new Date().getFullYear();

  function apiUrl(path) {
    const base = backendBase.trim().replace(/\/+$/, "");
    return `${base}${path}`;
  }

  function setStatus(state, label) {
    statusPill.classList.remove("offline", "checking");
    if (state !== "online") statusPill.classList.add(state);
    statusText.textContent = label;
  }

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.classList.remove("hidden", "success");
    if (type === "success") messageBox.classList.add("success");
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.classList.add("hidden");
    messageBox.classList.remove("success");
  }

  function formatCode(value) {
    const raw = String(value ?? "").trim();
    // Only visually group digits; preserve any non-digit code format returned by backend.
    if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)} ${raw.slice(4)}`;
    return raw;
  }

  async function checkStatus() {
    setStatus("checking", "Checking status");
    try {
      const response = await fetch(apiUrl("/api/status"), {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Status endpoint returned HTTP ${response.status}`);
      const data = await response.json();
      if (data && data.online === true) {
        setStatus("online", "Bot connected");
      } else {
        setStatus("offline", "Bot not linked");
      }
    } catch (error) {
      setStatus("offline", "Server unreachable");
    }
  }

  $("#settingsToggle").addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    if (!settingsPanel.classList.contains("hidden")) {
      backendInput.value = backendBase;
      settingsPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  $("#settingsClose").addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
  });

  $("#saveSettings").addEventListener("click", () => {
    const value = backendInput.value.trim();
    if (value) {
      try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid protocol");
        backendBase = url.origin;
      } catch {
        showMessage("Enter a valid backend URL, for example https://your-service.onrender.com");
        return;
      }
    } else {
      backendBase = "";
    }
    settingsPanel.classList.add("hidden");
    clearMessage();
    checkStatus();
    showMessage("Backend address updated for this page session. It has not been saved.", "success");
  });

  $("#toggleKey").addEventListener("click", () => {
    const reveal = keyInput.type === "password";
    keyInput.type = reveal ? "text" : "password";
    $("#toggleKey").textContent = reveal ? "HIDE" : "SHOW";
    $("#toggleKey").setAttribute("aria-label", reveal ? "Hide portal key" : "Show portal key");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();
    codeSection.classList.add("hidden");
    currentCode = "";

    const number = phoneInput.value.replace(/\D/g, "");
    const portalKey = keyInput.value;

    if (number.length < 8 || number.length > 15) {
      showMessage("Enter a valid phone number with country code, using digits only.");
      phoneInput.focus();
      return;
    }
    if (!portalKey.trim()) {
      showMessage("Enter the private portal key configured on your bot server.");
      keyInput.focus();
      return;
    }

    pairButton.disabled = true;
    $(".button-text").textContent = "Requesting pairing code…";

    try {
      const response = await fetch(apiUrl("/api/pair"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Portal-Key": portalKey
        },
        body: JSON.stringify({ number })
      });

      let data = {};
      try { data = await response.json(); } catch { /* handled below */ }

      if (!response.ok) {
        throw new Error(data.error || `Pairing request failed (HTTP ${response.status}).`);
      }
      if (data.error) throw new Error(data.error);
      if (!data.code) throw new Error("The server response did not include a pairing code.");

      currentCode = String(data.code);
      codeDisplay.textContent = formatCode(currentCode);
      codeSection.classList.remove("hidden");
      showMessage("Pairing code received. Complete linking in WhatsApp on your phone.", "success");
      codeSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      checkStatus();
    } catch (error) {
      const message = error instanceof TypeError
        ? "Could not reach the bot server. Check the backend URL, server availability, HTTPS and CORS settings."
        : error.message;
      showMessage(message || "Something went wrong while requesting the pairing code.");
    } finally {
      pairButton.disabled = false;
      $(".button-text").textContent = "Generate pairing code";
    }
  });

  $("#copyCode").addEventListener("click", async () => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      $("#copyCode").textContent = "✓ Copied";
      window.setTimeout(() => { $("#copyCode").textContent = "▣ Copy code"; }, 1800);
    } catch {
      showMessage("Copy was blocked by the browser. Select the code and copy it manually.");
    }
  });

  // Clear the secret when leaving the page. It is never placed in localStorage.
  window.addEventListener("pagehide", () => { keyInput.value = ""; });

  checkStatus();
  window.setInterval(checkStatus, 20000);
})();