import { cargarPdfjs } from '../fichas/navegador.js'

const MAX_PAGINAS = 3
const ESCALA_OCR = 2.5

// OCR en el navegador con Tesseract (se descarga bajo demanda, junto con los datos de idioma).
async function reconocer(imagenes) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['spa', 'eng'])
  try {
    const textos = []
    for (const imagen of imagenes) textos.push((await worker.recognize(imagen)).data.text)
    return textos.join('\n')
  } finally {
    await worker.terminate()
  }
}

// Devuelve { texto, metodo } de una factura en PDF o imagen. metodo: 'pdf' (texto embebido) | 'ocr'.
export async function leerTextoFactura(archivo) {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
  if (!esPdf) return { texto: await reconocer([archivo]), metodo: 'ocr' }

  const [pdfjs, { leerPaginas }] = await Promise.all([cargarPdfjs(), import('../fichas/pdfText.js')])
  const datos = new Uint8Array(await archivo.arrayBuffer())
  const paginas = (await leerPaginas(pdfjs, datos.slice())).slice(0, MAX_PAGINAS)
  const texto = paginas.map((pagina) => pagina.lineas.map((linea) => linea.texto).join('\n')).join('\n')
  if (texto.replace(/\s/g, '').length >= 80) return { texto, metodo: 'pdf' }

  // PDF escaneado: se dibuja cada página en un lienzo y se reconoce como imagen.
  const tarea = pdfjs.getDocument({ data: datos })
  const doc = await tarea.promise
  try {
    const lienzos = []
    for (let numero = 1; numero <= Math.min(doc.numPages, MAX_PAGINAS); numero++) {
      const page = await doc.getPage(numero)
      const viewport = page.getViewport({ scale: ESCALA_OCR })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
      lienzos.push(canvas)
    }
    return { texto: await reconocer(lienzos), metodo: 'ocr' }
  } finally {
    await tarea.destroy()
  }
}
