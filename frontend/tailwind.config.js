/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        // Semantic tokens driven by CSS variables — see src/index.css.
        page: "rgb(var(--c-page) / <alpha-value>)",
        card: "rgb(var(--c-card) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        field: "rgb(var(--c-field) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        line2: "rgb(var(--c-line2) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        ink2: "rgb(var(--c-ink2) / <alpha-value>)",
        ink3: "rgb(var(--c-ink3) / <alpha-value>)",
        ink4: "rgb(var(--c-ink4) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        "brand-fg": "rgb(var(--c-brand-fg) / <alpha-value>)",
        info: "rgb(var(--c-info) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        high: "rgb(var(--c-high) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
