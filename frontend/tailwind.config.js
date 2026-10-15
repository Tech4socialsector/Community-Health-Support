import frappeUIPreset from 'frappe-ui/tailwind'

export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/src/components/**/*.{vue,js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Brand colours, sampled from the app logo (public/logo-full.png):
      // navy-900 is the cross outline, forest-700 the green hills. The
      // other steps are lighter/darker shades of those two for tints,
      // hovers and dark mode. Named separately from frappe-ui's own
      // blue/green so the brand never shifts if that palette changes.
      colors: {
        navy: {
          50: '#eef2f9',
          100: '#d9e1f0',
          200: '#b3c2e0',
          300: '#7f97c6',
          400: '#4d6ca6',
          500: '#2e4b85',
          600: '#1f3769',
          700: '#152a54',
          800: '#0c1e40',
          900: '#031530',
        },
        forest: {
          50: '#eef6f0',
          100: '#d6eadb',
          200: '#aed4b8',
          300: '#7fb990',
          400: '#529a68',
          500: '#367d4d',
          600: '#2b6a3f',
          700: '#245535',
          800: '#1d4429',
          900: '#15321f',
        },
      },
    },
  },
}
