import type { Config } from "tailwindcss";

const config: Config = {
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
                alloy: "#C46210", // Orange
                pearl: "#efddc2", // Pearl Sand
                azure: "#0080FF", // Azure Blue
            },
            fontFamily: {
                oleo: ['Oleo Script', 'cursive'],
            },
            boxShadow: {
                soft: "0 4px 6px rgba(0, 0, 0, 0.1)",
                heavy: "0 8px 16px rgba(0, 0, 0, 0.3)",
            },
            gradientColorStops: {
                'sand-blue-start': '#efddc2',
                'sand-blue-end': '#0080FF',
                'orange-yellow-start': '#C46210',
                'orange-yellow-end': '#f4a261',
            },
            animation: {
                'pulse-sand': 'pulse-sand 3s ease-in-out infinite',
            },
            keyframes: {
                'pulse-sand': {
                    '0%, 100%': { boxShadow: '0 0 10px #efddc2' },
                    '50%': { boxShadow: '0 0 20px #f4a261' },
                },
            },
        },
    },
    plugins: [], // ✅ Now correctly placed
};

export default config;

