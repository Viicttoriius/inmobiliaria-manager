import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic',
    babel: {
      plugins: [], // Asegura que no haya plugins conflictivos
    }
  })],
  base: './', // Necesario para que Electron cargue los assets correctamente
  optimizeDeps: {
    include: ['react', 'react-dom']
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  }
})
