import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    ...(mode === 'development' ? [vueDevTools()] : []),
  ],
  server: {
    host: '0.0.0.0',
    hmr: {
      overlay: false // This hides the error overlay ✓
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet', '@vue-leaflet/vue-leaflet'],
          chartjs: ['chart.js', 'chartjs-adapter-date-fns'],
          d3: ['d3-scale', 'd3-scale-chromatic', 'd3-color'],
        }
      }
    }
  }
}))
