/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef6ff', 100: '#d9eaff', 500: '#2f7df6', 600: '#1f66dc', 700: '#1a52b3' },
        workspace: '#F3F4F6',
      },
      boxShadow: {
        page: '0 1px 3px rgba(15,23,42,.12), 0 8px 24px rgba(15,23,42,.10)',
        float: '0 4px 16px rgba(15,23,42,.16), 0 0 0 1px rgba(15,23,42,.06)',
      },
      fontFamily: {
        sans: ['Inter', '"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
