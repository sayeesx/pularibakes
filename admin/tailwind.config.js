/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pulari: {
          maroon: '#5C1313',
          'maroon-hover': '#4A0E0E',
          wine: '#6E1818',
          gold: '#EAA655',
          'gold-hover': '#DC9742',
          wheat: '#F5BA74',
          dark: '#161314',
          surface: '#201A1B',
        },
        // Mapped to Pulari Bakes brand identity for seamless backward compatibility
        epso: {
          red: '#5C1313',
          'red-hover': '#4A0E0E',
          'red-light': '#FDF4F4',
          amber: '#F5BA74',
          'amber-hover': '#EAA655',
          orange: '#EAA655',
          'orange-hover': '#DC9742',
        },
        brand: {
          50: '#FDF4F4',
          100: '#FBE8E8',
          200: '#F7D1D1',
          300: '#EFA6A6',
          400: '#DF7070',
          500: '#9B2C2C',
          600: '#7B1F1F',
          700: '#5C1313', // Pulari Signature Maroon
          800: '#4A0E0E',
          900: '#380909',
          DEFAULT: '#5C1313',
        },
        accent: {
          light: '#FDE68A',
          DEFAULT: '#EAA655',
          dark: '#DC9742',
        },
        canvas: {
          DEFAULT: '#F8F9FA',
          muted: '#F1F2F4',
          card: '#FFFFFF',
          dark: '#141212',
          'card-dark': '#1C1819',
          'surface-dark': '#241E1F',
        },
        charcoal: {
          DEFAULT: '#141212',
          muted: '#6B7280',
          subtle: '#9CA3AF',
          border: '#E5E7EB',
          'border-dark': '#2E2829',
          'text-dark': '#FFFFFF',
          'muted-dark': '#A39E9B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Inter', 'ui-monospace', 'monospace'],
        numbers: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        malayalam: ['"Anek Malayalam"', '"Manjari"', '"Noto Sans Malayalam"', 'sans-serif'],
      },
      boxShadow: {
        'apple-card': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        'apple-card-dark': '0 4px 20px rgba(0, 0, 0, 0.4)',
        'apple-modal': '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-snap': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
