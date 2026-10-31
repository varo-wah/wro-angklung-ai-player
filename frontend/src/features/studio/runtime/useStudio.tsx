"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBrowserPorts } from "./browserAdapters";
import { StudioController } from "./studioController";

const StudioContext = createContext<StudioController | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => new StudioController(createBrowserPorts()));
  const lifecycle = useRef(0);
  useEffect(() => {
    const generation = ++lifecycle.current;
    void runtime.initialize();
    return () => {
      // React's development effect replay reuses the controller. Defer final
      // disposal one microtask so that replay can retain a live instance.
      void Promise.resolve().then(() => {
        if (lifecycle.current === generation) runtime.dispose();
      });
    };
  }, [runtime]);
  return <StudioContext.Provider value={runtime}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const runtime = useContext(StudioContext);
  if (!runtime) throw new Error("useStudio must be used inside StudioProvider.");
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  return { snapshot, actions: runtime.actions };
}
