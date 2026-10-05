// CSV de la base de datos (carpeta datos/). Se escribe como lo espera Excel en español: separado por
// punto y coma y con marca BOM para que respete los acentos. Al leer se acepta también la coma.

// Texto CSV -> lista de objetos { encabezado: valor }. Las filas vacías se omiten.
export function leerCsv(texto) {
  const src = texto.replace(/^﻿/, '')
  const primera = src.split(/\r?\n/, 1)[0]
  const sep = primera.split(';').length >= primera.split(',').length ? ';' : ','
  const filas = []
  let fila = []
  let celda = ''
  let entreComillas = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (entreComillas) {
      if (ch !== '"') celda += ch
      else if (src[i + 1] === '"') {
        celda += '"'
        i++
      } else entreComillas = false
    } else if (ch === '"') {
      entreComillas = true
    } else if (ch === sep) {
      fila.push(celda)
      celda = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else {
      celda += ch
    }
  }
  if (celda !== '' || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }

  const [encabezados, ...resto] = filas.filter((celdas) => celdas.some((valor) => valor.trim() !== ''))
  if (!encabezados) return []
  const claves = encabezados.map((encabezado) => encabezado.trim())
  return resto.map((celdas) => Object.fromEntries(claves.map((clave, i) => [clave, (celdas[i] ?? '').trim()]).filter(([clave]) => clave)))
}

export function escribirCsv(columnas, filas, sep = ';') {
  const escapar = (valor) => {
    const texto = String(valor ?? '')
    return texto.includes(sep) || /["\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
  }
  return '﻿' + [columnas, ...filas.map((fila) => columnas.map((columna) => fila[columna]))].map((linea) => linea.map(escapar).join(sep)).join('\r\n') + '\r\n'
}
