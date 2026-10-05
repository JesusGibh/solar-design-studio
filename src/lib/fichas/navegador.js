// pdf.js en el navegador, cargado bajo demanda para que no pese en el arranque de la app.
export async function cargarPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

// Extracción de una ficha técnica dentro del navegador.
export async function extraerDePdf(archivo) {
  const [pdfjs, { extraerFicha }, { leerPaginas }] = await Promise.all([cargarPdfjs(), import('./extract.js'), import('./pdfText.js')])
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return extraerFicha(archivo.name, await leerPaginas(pdfjs, datos))
}
