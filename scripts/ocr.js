// OCR para fichas escaneadas (PDF sin capa de texto). Renderiza cada página con pdf.js y la pasa por
// Tesseract; las palabras reconocidas se devuelven con su posición, en el mismo formato que
// leerPaginas(), para que el extractor las trate igual que a un PDF con texto.
import { createCanvas } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import { agruparLineas } from '../src/lib/fichas/pdfText.js'

const ESCALA = 2.5 // ~180 dpi: suficiente para la letra pequeña de las tablas

export async function crearOcr(carpetaCache) {
  // eng+spa cubre las fichas en inglés, español y portugués; los datos se descargan una sola vez.
  const worker = await createWorker(['eng', 'spa'], 1, { cachePath: carpetaCache })
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })

  return {
    async leerPaginas(pdfjs, data, maxPaginas) {
      const tarea = pdfjs.getDocument({ data, verbosity: 0, useSystemFonts: true })
      const doc = await tarea.promise
      const paginas = []
      try {
        for (let numero = 1; numero <= Math.min(doc.numPages, maxPaginas); numero++) {
          const page = await doc.getPage(numero)
          const viewport = page.getViewport({ scale: ESCALA })
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
          const { data: ocr } = await worker.recognize(canvas.toBuffer('image/png'), {}, { blocks: true })

          const items = []
          for (const bloque of ocr.blocks ?? []) {
            for (const parrafo of bloque.paragraphs) {
              for (const linea of parrafo.lines) {
                // Todas las palabras de un renglón comparten altura y centro: agrupa mejor que palabra a palabra.
                const alto = (linea.bbox.y1 - linea.bbox.y0) / ESCALA
                const y = (linea.bbox.y0 + linea.bbox.y1) / 2 / ESCALA
                for (const palabra of linea.words) {
                  if (palabra.confidence < 30 || !palabra.text.trim()) continue
                  items.push({ texto: palabra.text, x0: palabra.bbox.x0 / ESCALA, x1: palabra.bbox.x1 / ESCALA, y, alto })
                }
              }
            }
          }
          paginas.push({ numero, lineas: agruparLineas(items) })
          page.cleanup()
        }
        return { paginas, paginasTotales: doc.numPages }
      } finally {
        await tarea.destroy()
      }
    },
    cerrar: () => worker.terminate(),
  }
}
