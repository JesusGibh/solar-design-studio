// Lectura de texto con posición usando pdf.js. No importa pdf.js directamente: quien llama le pasa
// el módulo (build "legacy" en Node, build normal en el navegador) para compartir este código.

// Devuelve una entrada por página: { numero, lineas: [{ y, celdas: [{ texto, x0, x1 }], texto }] }.
// Las celdas son tramos de texto separados por un hueco horizontal, es decir, columnas de una tabla.
export async function leerPaginas(pdfjs, data) {
  const tarea = pdfjs.getDocument({ data, verbosity: 0, useSystemFonts: true })
  const doc = await tarea.promise
  const paginas = []
  try {
    for (let numero = 1; numero <= doc.numPages; numero++) {
      const page = await doc.getPage(numero)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = []
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue
        // Coordenadas de pantalla (y hacia abajo), ya corregidas por la rotación de la página.
        const [a, b, , , x, y] = pdfjs.Util.transform(viewport.transform, item.transform)
        if (Math.abs(b) > Math.abs(a)) continue // texto vertical: marcas de agua y rótulos laterales
        const alto = Math.hypot(item.transform[2], item.transform[3]) || item.height || 8
        items.push({ texto: item.str, x0: x, x1: x + item.width, y, alto })
      }
      paginas.push({ numero, lineas: agruparLineas(items) })
      page.cleanup()
    }
  } finally {
    await tarea.destroy()
  }
  return paginas
}

// items: [{ texto, x0, x1, y, alto }] en coordenadas de página. También lo usa el OCR del script.
export function agruparLineas(items) {
  items.sort((p, q) => p.y - q.y || p.x0 - q.x0)
  const lineas = []
  for (const item of items) {
    const ultima = lineas[lineas.length - 1]
    if (ultima && Math.abs(item.y - ultima.y) <= Math.max(2, item.alto * 0.35)) ultima.items.push(item)
    else lineas.push({ y: item.y, items: [item] })
  }
  return lineas.map(({ y, items: enLinea }) => {
    enLinea.sort((p, q) => p.x0 - q.x0)
    const celdas = []
    for (const item of enLinea) {
      const ultima = celdas[celdas.length - 1]
      const hueco = ultima ? item.x0 - ultima.x1 : Infinity
      if (ultima && hueco < item.alto * 0.9) {
        ultima.texto += (hueco > item.alto * 0.15 && !ultima.texto.endsWith(' ') ? ' ' : '') + item.texto
        ultima.x1 = Math.max(ultima.x1, item.x1)
      } else {
        celdas.push({ texto: item.texto, x0: item.x0, x1: item.x1 })
      }
    }
    // Los guiones tipográficos (‐ ‑ ‒) se igualan al ASCII para poder reconocer códigos de modelo.
    // Algunas fuentes incrustadas dejan caracteres de control en lugar de espacios.
    for (const celda of celdas) {
      celda.texto = celda.texto
        .replace(/[‐-‒]/g, '-')
        .replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ')
        .trim()
    }
    return { y, celdas, texto: celdas.map((celda) => celda.texto).join(' ') }
  })
}
