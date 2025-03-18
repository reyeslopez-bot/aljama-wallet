import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        alloy: "#C426210", // Orange
        pearl: "#efddc2", // Pearl Sand
        azure: "#0080FF", // Azure Blue
      },
      boxShadow: {
        soft: "0 4px 6px rgba(0, 0, 0, 0.1)", // Soft shadow
        heavy: "0 8px 16px rgba(0, 0, 0, 0.3)", // Heavy shadow
    },
    gradientColorStops: {
      'sand-blue-start': '#efddc2',  // Start of sand-blue gradient
      'sand-blue-end': '#0080FF',   // End of sand-blue gradient
      'orange-yellow-start': '#C46210',
      'orange-yellow-end': '#f4a261',      },
    },
  },
  plugins: [],
} satisfies Config;
