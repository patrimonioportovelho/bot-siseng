import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--pri)",
        accent: "var(--acc)",
        appbg: "var(--bg)"
      }
    }
  },
  plugins: []
};

export default config;
