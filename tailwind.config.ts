import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './app/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './pages/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                background: 'var(--background)',
                foreground: 'var(--foreground)',
                alloy: '#C46210',         // Orange
                pearl: '#efddc2',         // Pearl Sand
                azure: '#0080FF',         // Azure Blue
                sand: '#EED9A3',
                sunsetOrange: '#D76C5B',
            },
            fontFamily: {
                oleo: ['Oleo Script', 'cursive'],
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
                    '0%': { opacity: '0', transform: 'translateY(20px)' } as Record<string, string>,
                    '100%': { opacity: '1', transform: 'translateY(0)' } as Record<string, string>,
                },
                pulseSand: {
                    '0%, 100%': { boxShadow: '0 0 10px #efddc2' } as Record<string, string>,
                    '50%': { boxShadow: '0 0 20px #f4a261' } as Record<string, string>,
                },
                dunesShift: {
                    '0%, 100%': { backgroundPosition: 'center bottom' } as Record<string, string>,
                    '50%': { backgroundPosition: 'center top' } as Record<string, string>,
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' } as Record<string, string>,
                    '50%': { transform: 'translateY(-10px)' } as Record<string, string>,
                },
                floatSlow: {
                    '0%, 100%': { transform: 'translateY(0)' } as Record<string, string>,
                    '50%': { transform: 'translateY(-5px)' } as Record<string, string>,
                },
                floatSlower: {
                    '0%, 100%': { transform: 'translateY(0)' } as Record<string, string>,
                    '50%': { transform: 'translateY(-2px)' } as Record<string, string>,
                },
                fadeInSlow: {
                    '0%': { opacity: '0' } as Record<string, string>,
                    '100%': { opacity: '1' } as Record<string, string>,
                },
            },
        },
    },
    plugins: [],
};

export default config;

