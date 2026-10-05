// Utilidades de registros del catálogo, separadas del extractor para que la app no cargue
// el motor de PDF solo por usarlas.

export const slug = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// "MIN 7000TL-X2" y "MIN7000TL-X2" son el mismo equipo.
const claveDe = (registro) => registro.id.replace(/-/g, '')

// Une registros repetidos (la misma ficha en varios PDFs) conservando el más completo.
export function unirRegistros(registros) {
  const porId = new Map()
  for (const registro of registros) {
    const previo = porId.get(claveDe(registro))
    if (!previo || Object.keys(registro).length > Object.keys(previo).length) porId.set(claveDe(registro), registro)
  }
  return [...porId.values()]
}

// Añade registros nuevos a una lista; si el equipo ya existía, el nuevo lo reemplaza.
export function agregarRegistros(existentes, nuevos) {
  const porId = new Map(existentes.map((registro) => [claveDe(registro), registro]))
  for (const registro of nuevos) porId.set(claveDe(registro), registro)
  return [...porId.values()]
}
