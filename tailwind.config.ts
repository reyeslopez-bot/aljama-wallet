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
        sand: '#EED9A3',
        sunsetOrange: '#D76C5B',
      },

      backgroundImage: {
        /* lets you do className="bg-mist" */
        mist: 'var(--mist-gradient)',
      },

      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },

      boxShadow: {
        soft: '0 4px 6px rgba(0, 0, 0, 0.1)',
        heavy: '0 8px 16px rgba(0, 0, 0, 0.3)',
      },

      backgroundPosition: {
        center_bottom: 'center bottom',
      },

      animation: {
        'fade-in': 'fadeIn 2s ease-out forwards',
        'pulse-sand': 'pulseSand 3s ease-in-out infinite',
        dunes: 'dunesShift 20s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'floatSlow 10s ease-in-out infinite',
        'float-slower': 'floatSlower 15s ease-in-out infinite',
        'fade-in-slow': 'fadeInSlow 3s ease-out forwards',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSand: {
          '0%, 100%': { boxShadow: '0 0 10px #efddc2' },
          '50%': { boxShadow: '0 0 20px #f4a261' },
        },
        dunesShift: {
          '0%, 100%': { backgroundPosition: 'center bottom' },
          '50%': { backgroundPosition: 'center top' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        floatSlower: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2px)' },
        },
        fadeInSlow: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
