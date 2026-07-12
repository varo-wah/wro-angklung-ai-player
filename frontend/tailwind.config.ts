import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        shakeTube: {
          "0%, 100%": { transform: "rotate(0deg) translateX(0)" },
          "20%": { transform: "rotate(-4deg) translateX(-3px)" },
          "40%": { transform: "rotate(4deg) translateX(3px)" },
          "60%": { transform: "rotate(-3deg) translateX(-2px)" },
          "80%": { transform: "rotate(3deg) translateX(2px)" },
        },
        pulseRail: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        panelIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        rackPanelIn: {
          "0%": { opacity: "0", transform: "translateY(18px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        rackDockIn: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.94)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        tubeIn: {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.9)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "shake-tube": "shakeTube 180ms linear infinite",
        "pulse-rail": "pulseRail 700ms ease-in-out infinite",
        "panel-in": "panelIn 240ms ease-out both",
        "rack-panel-in": "rackPanelIn 280ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "rack-dock-in": "rackDockIn 220ms ease-out both",
        "tube-in": "tubeIn 280ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
