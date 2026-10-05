import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { CARPETA, cifrarBase, eliminarEquipoDeBase, eliminarPropuestaDeBase, guardarEquipoEnBase, guardarPropuestaEnBase, importarRecibidas, leerPropuestas, siguienteIdEnBase } from './scripts/base_datos.js'

// Base de datos en CSV (carpeta datos/, ver scripts/base_datos.js). La app la recibe cifrada a través
// del módulo `virtual:base-datos`. Trabajando en local (npm run dev) además se puede escribir en ella:
// las propuestas guardadas van a datos/propuestas.csv por las rutas /__datos/*.
function baseDatos() {
  const ID = 'virtual:base-datos'
  const RESUELTO = `\0${ID}`
  const LOCALES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

  let escrituraPropia = 0
  const acciones = {
    'GET /propuestas': () => ({ propuestas: leerPropuestas() }),
    'GET /siguiente': () => ({ id: siguienteIdEnBase() }),
    'POST /guardar': ({ propuesta }) => (guardarPropuestaEnBase(propuesta), { ok: true }),
    'POST /eliminar': ({ id }) => (eliminarPropuestaDeBase(id), { ok: true }),
    'POST /equipo': ({ categoria, equipo }) => (guardarEquipoEnBase(categoria, equipo), { ok: true }),
    'POST /equipo-eliminar': ({ categoria, id }) => (eliminarEquipoDeBase(categoria, id), { ok: true }),
  }

  return {
    name: 'base-datos',
    resolveId: (id) => (id === ID ? RESUELTO : null),
    async load(id) {
      if (id !== RESUELTO) return null
      const { base, avisos } = await cifrarBase()
      avisos.forEach((aviso) => this.warn(aviso))
      return `export default ${JSON.stringify(base)}`
    },
    buildStart() {
      importarRecibidas().forEach((mensaje) => this.info(mensaje))
    },
    configureServer(server) {
      const invalidar = () => {
        const modulo = server.moduleGraph.getModuleById(RESUELTO)
        if (modulo) server.moduleGraph.invalidateModule(modulo)
      }
      // Al guardar usuarios o equipos desde Excel, la app se recarga con la base nueva.
      server.watcher.on('change', (archivo) => {
        if (path.resolve(path.dirname(archivo)) !== CARPETA || !archivo.endsWith('.csv') || path.basename(archivo) === 'propuestas.csv') return
        invalidar()
        if (Date.now() - escrituraPropia < 2000) return // lo escribió la propia app: ya lo tiene en pantalla
        server.ws.send({ type: 'full-reload' })
      })

      server.middlewares.use('/__datos', (req, res) => {
        const responder = (estado, cuerpo) => {
          res.statusCode = estado
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(cuerpo))
        }
        const accion = acciones[`${req.method} ${req.url.split('?')[0]}`]
        // Solo esta computadora y solo la propia app: otra página abierta en el navegador no puede escribir.
        const ajeno = req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin))
        if (!LOCALES.has(req.socket.remoteAddress) || ajeno) return responder(403, { error: 'Solo disponible desde esta computadora.' })
        if (!accion) return responder(404, { error: 'Acción desconocida.' })
        let cuerpo = ''
        req.on('data', (trozo) => (cuerpo += trozo))
        req.on('end', () => {
          try {
            if (req.method === 'POST') escrituraPropia = Date.now()
            const resultado = accion(cuerpo ? JSON.parse(cuerpo) : {})
            if (req.method === 'POST') invalidar() // la próxima carga de la app ya incluye el cambio
            responder(200, resultado)
          } catch (error) {
            responder(500, { error: error.message })
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), baseDatos()],
  // Las fichas técnicas (PDF) no son código: vigilarlas solo genera errores EBUSY al copiarlas.
  server: { watch: { ignored: ['**/fichas_tecnicas/**'] } },
})
