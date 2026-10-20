/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#050505", soft: "#0A0A0A" },
        fog: { DEFAULT: "#878787", light: "#A1A1AA" },
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "Geist", "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "1rem",
        panel: "1.25rem",
        phone: "2.25rem",
      },
      boxShadow: {
        glow: "0 0 50px -12px rgba(255,255,255,0.12)",
        "glow-lg": "0 0 80px -16px rgba(255,255,255,0.2)",
        "glow-blue": "0 0 60px -14px rgba(96,165,250,0.25)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.08)",
      },
      backgroundImage: {
        "grid-lines":
          "linear-gradient(to right, rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.045) 1px, transparent 1px)",
        "glow-radial": "radial-gradient(closest-side, rgba(255,255,255,0.16), rgba(147,170,255,0.06) 55%, transparent 100%)",
        "btn-dark": "linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
        "btn-light": "linear-gradient(to bottom, #ffffff, #d4d4d8)",
      },
      backgroundSize: {
        grid: "64px 64px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          to: { backgroundPosition: "-200% 0" },
        },
        "pulse-ring": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,255,255,0.25)" },
          "50%": { boxShadow: "0 0 0 7px rgba(255,255,255,0)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.75" },
          "50%": { opacity: "1" },
        },
        blink: {
          "50%": { opacity: "0.2" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-up-fast": "fade-up 0.28s ease-out both",
        shimmer: "shimmer 2.2s linear infinite",
        "pulse-ring": "pulse-ring 1.6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 6s ease-in-out infinite",
        blink: "blink 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
