import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: { 900: "#0f172a", 800: "#1e293b", 700: "#334155", 600: "#475569" },
        accent: { cyan: "#06b6d4", green: "#10b981", orange: "#f59e0b", pink: "#ec4899", purple: "#8b5cf6", red: "#ef4444", blue: "#3b82f6", teal: "#14b8a6" },
      },
      fontFamily: { sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
