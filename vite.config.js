import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Las fichas técnicas (PDF) no son código: vigilarlas solo genera errores EBUSY al copiarlas.
  server: { watch: { ignored: ['**/fichas_tecnicas/**'] } },
})
