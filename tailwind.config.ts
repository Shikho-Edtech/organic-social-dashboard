import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"] },
      colors: {
        brand: {
          cyan: "#06b6d4",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
          pink: "#ec4899",
          purple: "#8b5cf6",
          blue: "#3b82f6",
          teal: "#14b8a6",
        },
      },
    },
  },
  plugins: [],
};
export default config;
