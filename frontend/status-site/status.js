(function () {
  "use strict";

  const config = window.ANGKLOBOT_STATUS_CONFIG || {};
  const backendOrigin = String(config.backendOrigin || "").replace(/\/$/, "");
  const refreshIntervalMs = Number(config.refreshIntervalMs) || 10000;
  const elements = {
    dot: document.getElementById("status-dot"),
    guest: document.getElementById("open-guest"),
    pair: document.getElementById("open-pair"),
    legacy: document.getElementById("open-legacy"),
    refresh: document.getElementById("refresh-status"),
    title: document.getElementById("status-title"),
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

  function enableGuest(enabled) {
    for (const [element, path] of [[elements.guest, "/studio"], [elements.pair, "/studio/device"], [elements.legacy, "/control"]]) {
      element.href = enabled ? `${backendOrigin}${path}` : "#";
      element.classList.toggle("disabled", !enabled);
      element.setAttribute("aria-disabled", String(!enabled));
    }
  }

  function render(online) {
    elements.dot.className = online ? "online" : "offline";
    elements.title.textContent = online ? "Studio server online" : "Studio server offline · previews available";
    enableGuest(online);
    if (online && location.hash === "#pair") location.replace(elements.pair.href);
  }

  async function checkStatus() {
    if (checking) return;
    if (!configured()) {
      render(false);
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
      render(payload.services?.website?.available === true);
    } catch {
      render(false);
    } finally {
      checking = false;
      elements.refresh.disabled = false;
    }
  }

  elements.refresh.addEventListener("click", checkStatus);
  for (const link of [elements.guest, elements.pair, elements.legacy]) link.addEventListener("click", function (event) {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
  void checkStatus();
  window.setInterval(checkStatus, refreshIntervalMs);
})();
