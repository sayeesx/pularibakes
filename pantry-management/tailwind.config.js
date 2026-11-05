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
          primary: '#5C1313',
          maroon: '#5C1313',
          'maroon-hover': '#4A0E0E',
          wine: '#6E1818',
          gold: '#EAA655',
          'gold-hover': '#DC9742',
          wheat: '#F5BA74',
          dark: '#161314',
          surface: '#201A1B',
        },
        // Pulari Brand Colors matching the new uploaded logo
        epso: {
          red: '#5C1313', // Pulari Signature Maroon
          'red-hover': '#4A0E0E',
          'red-light': '#FDF4F4',
          amber: '#F5BA74', // Pulari Wheat
          'amber-hover': '#EAA655',
          orange: '#EAA655', // Pulari Honey Gold
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
        forest: {
          50: '#FDF4F4',
          100: '#FBE8E8',
          200: '#F7D1D1',
          300: '#EFA6A6',
          400: '#DF7070',
          500: '#5C1313',
          600: '#4A0E0E',
          700: '#5C1313',
          800: '#4A0E0E',
          900: '#380909',
          950: '#141212',
        },
        accent: {
          light: '#FDE68A',
          DEFAULT: '#EAA655',
          dark: '#DC9742',
        },
        canvas: {
          DEFAULT: '#F8F9FA', // Light canvas
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
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        numbers: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
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
