import type { Config } from "tailwindcss";

// Shikho design system v1.0 (March 2026).
// Single source of truth for hex values, type, spacing, radii, shadows.
// Update here first — components consume tokens, never raw hex.
//
// Palette rules:
//   - 600 = the "true" brand hue. Use it as the primary accent.
//   - 700 = body/text indigo. Headings, primary links.
//   - 500 = hover/medium emphasis.
//   - 50-200 = backgrounds + subtle fills (cards, chips, banners).
//   - 800-900 = high-density text on pale tints, or pressed states.
//
// Class naming preserves the legacy `brand-shikho-*` aliases so existing
// component code keeps compiling. Ship the palette shift purely via hex
// remap; rename tokens in a later pass if we want to normalize.

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        // Poppins for UI + English, Hind Siliguri for Bangla.
        // System fallbacks keep first-paint sensible before Google Fonts loads.
        sans: [
          "Poppins",
          "Hind Siliguri",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "Poppins",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        bangla: ["Hind Siliguri", "Poppins", "system-ui", "sans-serif"],
      },
      colors: {
        // ─── Shikho core scales (50-900) ───
        // Indigo — trust, authority. Body text, primary CTAs, headlines.
        shikho: {
          indigo: {
            50:  "#EEF0FA",
            100: "#DCE0F3",
            200: "#B8C0E7",
            300: "#8D99D6",
            400: "#6072C2",
            500: "#3F4FA2",
            600: "#304090", // core brand indigo
            700: "#243172",
            800: "#1A2558",
            900: "#111A3F",
          },
          // Magenta — energy, momentum. Highlight peaks, celebration, wing-of-bird.
          magenta: {
            50:  "#FCEAF3",
            100: "#F7D0E3",
            200: "#EEA1C6",
            300: "#E373AA",
            400: "#D14C93",
            500: "#C02080", // core
            600: "#A11A6D",
            700: "#7E1556",
            800: "#5D0F3F",
            900: "#3F0A2A",
          },
          // Sunrise — optimism, warmth. Head-of-bird, success warmth, promo accent.
          sunrise: {
            50:  "#FFF5DB",
            100: "#FFE9B2",
            200: "#FFD775",
            300: "#F2BE40",
            400: "#E8AC20",
            500: "#E0A010", // core
            600: "#B7820A",
            700: "#8C6407",
            800: "#634705",
            900: "#3F2D03",
          },
          // Coral — urgency, affection. Beak-of-bird, warning/critical semantics.
          coral: {
            50:  "#FEECEE",
            100: "#FDD2D8",
            200: "#F9A6B1",
            300: "#F27687",
            400: "#E84A65",
            500: "#E03050", // core
            600: "#B92140",
            700: "#8E1833",
            800: "#651125",
            900: "#410B18",
          },
        },
        // ─── Ink (neutrals) ───
        // Canvas is the workspace background; paper is card surface.
        ink: {
          paper:  "#FFFFFF",
          canvas: "#F4F5FA",
          100: "#E6E8F0",
          200: "#C8CCD9",
          300: "#9098AE",
          400: "#6E7389",
          500: "#4A506A",
          600: "#333A50",
          700: "#20253B",
          800: "#121526",
          900: "#0A0C18",
        },
        // ─── Legacy brand tokens (kept for compat, remapped to Shikho) ───
        // Component code still imports these names; only the hex moves.
        brand: {
          // Semantic brand tones
          cyan:    "#4A66C4", // indigo-400-ish → keeps "cool chart" role
          green:   "#10b981", // emerald preserved for success semantics
          amber:   "#E0A010", // sunrise-500
          red:     "#E03050", // coral-500
          pink:    "#C02080", // magenta-500
          purple:  "#8C3FA8", // magenta-leaning purple (no pure violet in Shikho)
          blue:    "#3F4FA2", // shikho-indigo-500
          teal:    "#1A8E78", // desaturated teal that sits next to indigo without fighting it
          // Shikho logo palette (legacy aliases → canonical Shikho scale)
          "shikho-indigo": "#304090", // indigo-600 core
          "shikho-blue":   "#3F4FA2", // indigo-500 (hover/medium)
          "shikho-pink":   "#C02080", // magenta-500 core
          "shikho-orange": "#E0A010", // sunrise-500 core
          "shikho-coral":  "#E03050", // coral-500 core (NEW)
          // Surface helpers
          canvas:          "#F4F5FA",
          paper:           "#FFFFFF",
        },
      },
      // ─── Radii (Shikho tokens: xs=4, sm=8, md=12, lg=16, xl=20, 2xl=28) ───
      // Sharp corners banned on interactive surfaces. Default rounded is md+.
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "28px",
      },
      // ─── Shadows (ambient → indigo lift on primary CTAs) ───
      boxShadow: {
        xs: "0 1px 2px rgba(16,22,54,0.04)",
        sm: "0 2px 4px rgba(16,22,54,0.06), 0 1px 2px rgba(16,22,54,0.04)",
        md: "0 6px 14px rgba(16,22,54,0.08), 0 2px 4px rgba(16,22,54,0.05)",
        lg: "0 12px 28px rgba(16,22,54,0.10), 0 4px 8px rgba(16,22,54,0.06)",
        xl: "0 24px 48px rgba(16,22,54,0.12), 0 8px 16px rgba(16,22,54,0.08)",
        "indigo-lift":
          "0 10px 24px rgba(48,64,144,0.28), 0 2px 6px rgba(48,64,144,0.18)",
        "magenta-lift":
          "0 10px 24px rgba(192,32,128,0.25), 0 2px 6px rgba(192,32,128,0.15)",
      },
      // ─── Motion tokens ───
      // fast = micro-interaction, base = default, slow = celebration.
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
        slow: "420ms",
      },
      transitionTimingFunction: {
        "shikho-out": "cubic-bezier(.16,1,.3,1)",
        "shikho-inout": "cubic-bezier(.45,.05,.55,.95)",
        "shikho-spring": "cubic-bezier(.34,1.56,.64,1)",
      },
      // ─── Background gradients exposed as utilities ───
      backgroundImage: {
        "shikho-hero":
          "linear-gradient(135deg, #304090 0%, #3F4FA2 45%, #C02080 100%)",
        "shikho-warm":
          "linear-gradient(135deg, #E0A010 0%, #E03050 100%)",
        "shikho-aurora":
          "radial-gradient(60% 80% at 30% 20%, rgba(192,32,128,0.18), transparent 70%), radial-gradient(60% 80% at 80% 90%, rgba(224,160,16,0.18), transparent 70%), linear-gradient(180deg, #F4F5FA 0%, #EEF0FA 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
