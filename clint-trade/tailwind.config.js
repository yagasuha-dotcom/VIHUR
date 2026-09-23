/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#080B14',
        deep: '#0C1120',
        panel: '#111829',
        edge: '#1E2740',
        mute: '#7C88A6',
        soft: '#A9B3CC',
        snow: '#E7ECF8',
        brand: '#7C8CFF',
        brand2: '#4FD8F0',
        up: '#2ED3A0',
        down: '#FF5C74',
        warn: '#F4B740',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
        ticker: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        flashUp: { '0%': { backgroundColor: 'rgba(46,211,160,.28)' }, '100%': { backgroundColor: 'transparent' } },
        flashDown: { '0%': { backgroundColor: 'rgba(255,92,116,.28)' }, '100%': { backgroundColor: 'transparent' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-3px)' }, '75%': { transform: 'translateX(3px)' } },
      },
      animation: {
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
        flashUp: 'flashUp .7s ease-out',
        flashDown: 'flashDown .7s ease-out',
        slideIn: 'slideIn .25s ease-out',
        shake: 'shake .25s ease-in-out 2',
      },
    },
  },
  plugins: [],
};
