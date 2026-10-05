// Extracción de una ficha técnica dentro del navegador. pdf.js y el extractor se cargan bajo
// demanda para que no pesen en el arranque de la app.
export async function extraerDePdf(archivo) {
  const [pdfjs, worker, { extraerFicha }, { leerPaginas }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('./extract.js'),
    import('./pdfText.js'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const datos = new Uint8Array(await archivo.arrayBuffer())
  return extraerFicha(archivo.name, await leerPaginas(pdfjs, datos))
}
