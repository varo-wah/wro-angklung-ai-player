(function () {
  "use strict";

  const config = window.ANGKLOBOT_STATUS_CONFIG || {};
  const backendOrigin = String(config.backendOrigin || "").replace(/\/$/, "");
  const refreshIntervalMs = Number(config.refreshIntervalMs) || 10000;
  const elements = {
    dot: document.getElementById("status-dot"),
    guest: document.getElementById("open-guest"),
    lastChecked: document.getElementById("last-checked"),
    message: document.getElementById("status-message"),
    ollama: document.getElementById("ollama-status"),
    refresh: document.getElementById("refresh-status"),
    title: document.getElementById("status-title"),
    website: document.getElementById("website-status"),
    whisper: document.getElementById("whisper-status"),
  };
  let checking = false;

  function configured() {
    try {
      const url = new URL(backendOrigin);
      const secureOrLocal = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
      return secureOrLocal && !url.hostname.endsWith("example.com");
    } catch {
      return false;
    }
  }

  function setService(element, available, unavailableLabel) {
    element.textContent = available ? "Available" : unavailableLabel;
    element.className = available ? "available" : "unavailable";
  }

  function enableGuest(enabled) {
    elements.guest.href = enabled ? `${backendOrigin}/guest` : "#";
    elements.guest.classList.toggle("disabled", !enabled);
    elements.guest.setAttribute("aria-disabled", String(!enabled));
  }

  function render(state, payload) {
    elements.dot.className = `status-dot ${state}`;
    if (state === "online") {
      elements.title.textContent = "Angklobot is online";
      elements.message.textContent = "The website, speech recognition, and local AI are ready.";
    } else if (state === "limited") {
      elements.title.textContent = "Online with issues";
      elements.message.textContent = "The Mac is reachable, but one or more local services need attention.";
    } else if (state === "setup") {
      elements.title.textContent = "Setup required";
      elements.message.textContent = "Add the permanent Cloudflare Tunnel address before publishing this page.";
    } else {
      elements.title.textContent = "Angklobot is offline";
      elements.message.textContent = "The Mac may be asleep, or the website and tunnel may be stopped.";
    }

    const services = payload?.services;
    setService(elements.website, services?.website?.available === true, state === "setup" ? "Not configured" : "Unavailable");
    setService(elements.whisper, services?.whisper?.available === true, state === "setup" ? "Not configured" : "Unavailable");
    const ollamaReady = services?.ollama?.available === true && services?.ollama?.modelAvailable !== false;
    setService(elements.ollama, ollamaReady, services?.ollama?.available === true ? "Model missing" : state === "setup" ? "Not configured" : "Unavailable");
    enableGuest(state === "online" || state === "limited");
    elements.lastChecked.textContent = state === "setup" ? "" : `Last checked ${new Date().toLocaleTimeString()}`;
  }

  async function checkStatus() {
    if (checking) return;
    if (!configured()) {
      render("setup");
      return;
    }

    checking = true;
    elements.refresh.disabled = true;
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6000);
      let response;
      try {
        response = await fetch(`${backendOrigin}/api/system/status`, { cache: "no-store", signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error("Status endpoint unavailable");
      const payload = await response.json();
      render(payload.status === "online" ? "online" : "limited", payload);
    } catch {
      render("offline");
    } finally {
      checking = false;
      elements.refresh.disabled = false;
    }
  }

  elements.refresh.addEventListener("click", checkStatus);
  elements.guest.addEventListener("click", function (event) {
    if (elements.guest.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
  void checkStatus();
  window.setInterval(checkStatus, refreshIntervalMs);
})();
