// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* CSS-var colors with alpha support */
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        foregroundMuted: 'rgb(var(--foreground-muted) / <alpha-value>)',
        brass: 'rgb(var(--brass) / <alpha-value>)',
        onyx: 'rgb(var(--onyx) / <alpha-value>)',
        ivory: 'rgb(var(--ivory) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sand: 'rgb(var(--sand) / <alpha-value>)',
        saffron: 'rgb(var(--saffron) / <alpha-value>)',
        copper: 'rgb(var(--copper) / <alpha-value>)',
        lapis: 'rgb(var(--lapis) / <alpha-value>)',
        jade: 'rgb(var(--jade) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',

        /* your fixed hex colors */
        alloy: '#C46210',
        pearl: '#efddc2',
        azure: '#0080FF',
        sandLight: '#EED9A3',
        sunsetOrange: '#D76C5B',
      },

      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
