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
      },
      animation: {
        "shake-tube": "shakeTube 180ms linear infinite",
        "pulse-rail": "pulseRail 700ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
