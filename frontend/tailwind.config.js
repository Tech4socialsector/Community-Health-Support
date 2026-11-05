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
        // Programme accents for the Home page panels (Cancer, NCD, Mental
        // Health), muted to sit beside forest (MCH) and navy (Palliative).
        // White text passes 4.5:1 on 600 and up.
        rosewood: {
          50: '#fbf0f4',
          100: '#f6dbe5',
          200: '#efc3d3',
          300: '#e099b3',
          600: '#9d2f55',
          700: '#832546',
          900: '#4a1528',
        },
        ochre: {
          50: '#fdf5ea',
          100: '#fae7cc',
          200: '#f1d2a8',
          300: '#e5b277',
          600: '#9a4a06',
          700: '#7f3d05',
          900: '#452103',
        },
        iris: {
          50: '#f4f2fb',
          100: '#e6e2f6',
          200: '#cec6ec',
          300: '#ab9fdc',
          600: '#57479a',
          700: '#47397f',
          900: '#271f47',
        },
      },
    },
  },
}
