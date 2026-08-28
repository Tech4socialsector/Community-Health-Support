import path from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeui from 'frappe-ui/vite'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  plugins: [
    frappeui({
      frontendRoute: '/chw',
    }),
    vue(),
    Components({
      dirs: ['src/components', 'src/pages'],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
