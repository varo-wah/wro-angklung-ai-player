"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "available" | "unavailable";

export function LocalServicesStatus() {
  const [services, setServices] = useState<{ website: Status; whisper: Status; ollama: Status; modelMissing: boolean }>({
    website: "checking", whisper: "checking", ollama: "checking", modelMissing: false,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    async function check(path: string) {
      try {
        const response = await fetch(path, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        return { reached: typeof data.available === "boolean", available: response.ok && data.available === true, modelMissing: data.available === true && data.modelAvailable === false };
      } catch {
        return { reached: false, available: false, modelMissing: false };
      }
    }
    void Promise.all([check("/api/speech/status"), check("/api/ai/status")]).then(([whisper, ollama]) => {
      clearTimeout(timeout);
      if (!disposed) setServices({
        website: whisper.reached || ollama.reached ? "available" : "unavailable",
        whisper: whisper.available ? "available" : "unavailable",
        ollama: ollama.available ? "available" : "unavailable",
        modelMissing: ollama.modelMissing,
      });
    });
    return () => { disposed = true; controller.abort(); clearTimeout(timeout); };
  }, [revision]);

  return <details className="mx-auto my-3 max-w-lg px-4 text-xs text-slate-400">
    <summary className="cursor-pointer">Development · Local services</summary>
    <div className="mt-2" role="status">
      <p>Website server: {services.website}</p>
      <p>Whisper: {services.whisper}</p>
      <p>Ollama: {services.ollama}{services.modelMissing ? " (configured model missing)" : ""}</p>
    </div>
    <button className="quiet-button" type="button" onClick={() => setRevision(value => value + 1)}>Refresh services</button>
    <p>This device runs independently. Phone ↔ Mac synchronization is not implemented.</p>
  </details>;
}
