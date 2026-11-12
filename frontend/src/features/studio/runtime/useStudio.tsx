"use client";

import { useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBrowserPorts } from "./browserAdapters";
import { StudioRobotSession } from "./StudioRobotSession";
import { usePathname } from "next/navigation";
import { StudioController } from "./studioController";

import { StudioContext, type StudioView } from "./studioContext";

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
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [robotMode, setRobotMode] = useState(false);
  const pathname = usePathname();
  useEffect(() => { if (new URLSearchParams(window.location.search).get("output") === "robot") setRobotMode(true); }, [pathname]);
  const view: StudioView = { snapshot, actions: runtime.actions, robotMode: false, outputLabel: "Computer audio",
    connection: null, toggleOutput: () => { runtime.stop(); setRobotMode(!robotMode); } };
  if (robotMode && pathname !== "/studio/conduct") return <StudioRobotSession runtime={runtime} view={view}>{children}</StudioRobotSession>;
  return <StudioContext.Provider value={view}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const runtime = useContext(StudioContext);
  if (!runtime) throw new Error("useStudio must be used inside StudioProvider.");
  return runtime;
}
