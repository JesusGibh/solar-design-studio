import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Presentation, X } from 'lucide-react'
import { cargarPdfjs } from '../lib/fichas/navegador.js'

const ESCALA = 2 // píxeles por punto del PDF: nítido en tablet y pantalla grande

const boton =
  'flex items-center gap-2 rounded border border-line-strong px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50'

// Vista previa de la propuesta: genera el mismo documento que se descarga y dibuja sus páginas en
// pantalla con pdf.js, así lo que se ve es exactamente el PDF. Incluye un modo presentación a
// pantalla completa, una hoja a la vez, para mostrarlo al cliente.
//   generar: async () => ({ doc, sinImagen }) · nombre: nombre del archivo al descargar
export default function VistaPreviaPropuesta({ generar, nombre, onClose }) {
  const raiz = useRef(null)
  const documento = useRef(null)
  const [paginas, setPaginas] = useState([])
  const [estado, setEstado] = useState({ fase: 'cargando' }) // 'cargando' | 'lista' | 'error'
  const [presentando, setPresentando] = useState(false)
  const [actual, setActual] = useState(0)

  useEffect(() => {
    let vigente = true
    ;(async () => {
      try {
        const { doc, sinImagen } = await generar()
        const pdfjs = await cargarPdfjs()
        const tarea = pdfjs.getDocument({ data: new Uint8Array(doc.output('arraybuffer')) })
        const pdf = await tarea.promise
        const imagenes = []
        for (let numero = 1; numero <= pdf.numPages; numero++) {
          const page = await pdf.getPage(numero)
          const viewport = page.getViewport({ scale: ESCALA })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
          imagenes.push(canvas.toDataURL('image/png'))
        }
        await tarea.destroy()
        if (!vigente) return
        documento.current = doc
        setPaginas(imagenes)
        setEstado({ fase: 'lista', sinImagen })
      } catch (error) {
        if (vigente) setEstado({ fase: 'error', mensaje: error.message })
      }
    })()
    return () => {
      vigente = false
    }
    // Se genera una vez al abrir; para ver cambios se cierra y se vuelve a abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const salirDePresentacion = () => {
    setPresentando(false)
    if (document.fullscreenElement) document.exitFullscreen()
  }

  const presentar = () => {
    setActual(0)
    setPresentando(true)
    // La pantalla completa es un extra: si el navegador la niega, el modo presentación sigue funcionando.
    raiz.current.requestFullscreen?.().catch(() => {})
  }

  useEffect(() => {
    const alTeclear = (evento) => {
      if (evento.key === 'Escape') (presentando ? salirDePresentacion : onClose)()
      if (!presentando) return
      if (evento.key === 'ArrowRight' || evento.key === ' ') setActual((i) => Math.min(paginas.length - 1, i + 1))
      if (evento.key === 'ArrowLeft') setActual((i) => Math.max(0, i - 1))
    }
    // Si el usuario sale de pantalla completa con el gesto del sistema, también termina la presentación.
    const alCambiarPantalla = () => !document.fullscreenElement && setPresentando(false)
    window.addEventListener('keydown', alTeclear)
    document.addEventListener('fullscreenchange', alCambiarPantalla)
    return () => {
      window.removeEventListener('keydown', alTeclear)
      document.removeEventListener('fullscreenchange', alCambiarPantalla)
    }
  }, [presentando, paginas.length, onClose])

  const lista = estado.fase === 'lista'

  return (
    <div ref={raiz} role="dialog" aria-modal="true" aria-label="Vista previa de la propuesta" className="fixed inset-0 z-[2000] flex flex-col bg-base">
      {!presentando && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Vista previa de la propuesta</h2>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">{nombre} · idéntica al PDF</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={presentar} disabled={!lista} className={boton}>
              <Presentation className="size-4" aria-hidden="true" />
              Modo presentación
            </button>
            <button
              type="button"
              onClick={() => documento.current.save(nombre)}
              disabled={!lista}
              className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden="true" />
              Descargar PDF Oficial
            </button>
            <button type="button" onClick={onClose} className={boton}>
              <X className="size-4" aria-hidden="true" />
              Cerrar
            </button>
          </div>
        </header>
      )}

      {estado.fase === 'cargando' && (
        <p className="flex flex-1 items-center justify-center gap-2 text-sm text-ink-muted">
          <LoaderCircle className="size-5 animate-spin text-accent" aria-hidden="true" />
          Generando la propuesta…
        </p>
      )}
      {estado.fase === 'error' && (
        <p role="alert" className="m-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          No se pudo generar la propuesta: {estado.mensaje}
        </p>
      )}

      {lista && !presentando && (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {estado.sinImagen && (
            <p className="mx-auto mb-4 max-w-4xl rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              No se pudieron descargar las imágenes del mapa: la portada saldrá sin la vista satelital.
            </p>
          )}
          <div className="mx-auto grid max-w-4xl gap-6">
            {paginas.map((src, i) => (
              <img key={i} src={src} alt={`Hoja ${i + 1} de ${paginas.length}`} className="w-full rounded-sm shadow-2xl shadow-black/60" />
            ))}
          </div>
        </div>
      )}

      {lista && presentando && (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
          <img src={paginas[actual]} alt={`Hoja ${actual + 1} de ${paginas.length}`} className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setActual((i) => Math.max(0, i - 1))}
            disabled={actual === 0}
            aria-label="Hoja anterior"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25 disabled:opacity-20"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setActual((i) => Math.min(paginas.length - 1, i + 1))}
            disabled={actual === paginas.length - 1}
            aria-label="Hoja siguiente"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/25 disabled:opacity-20"
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 px-4 py-1.5 font-mono text-xs text-white">
            Hoja {actual + 1} de {paginas.length}
            <button type="button" onClick={salirDePresentacion} className="underline hover:text-accent">
              Salir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
