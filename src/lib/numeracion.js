// Numeración correlativa de propuestas: PROP-<año>-0001, 0002… El último número se guarda en
// localStorage de este dispositivo y la cuenta vuelve a empezar con cada año.
const CLAVE = 'sds.propuestas.ultimo'

export function siguienteIdPropuesta() {
  const anio = new Date().getFullYear()
  let numero = 0
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE))
    if (guardado?.anio === anio) numero = guardado.numero
  } catch {
    // Sin almacenamiento o dato corrupto: se empieza en 0001.
  }
  numero += 1
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ anio, numero }))
  } catch {
    // Sin almacenamiento el número no persiste, pero la propuesta se puede generar igual.
  }
  return `PROP-${anio}-${String(numero).padStart(4, '0')}`
}
