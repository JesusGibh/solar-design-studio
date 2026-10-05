export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

// Convierte lo escrito en un campo numérico; devuelve null si está vacío o no es un número positivo.
export function aNumero(valor) {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return valor !== '' && Number.isFinite(n) && n > 0 ? n : null
}

// Resumen del consumo del proyecto, igual para el modo rápido y el detallado.
// tarifa en USD/kWh; los campos sin datos suficientes quedan en null.
export function resumenConsumo(consumo) {
  if (consumo.modo === 'rapido') {
    const promedioKwh = aNumero(consumo.promedioKwh)
    const costoMensual = aNumero(consumo.costoMensual)
    return {
      promedioKwh,
      anualKwh: promedioKwh && promedioKwh * 12,
      costoAnual: costoMensual && costoMensual * 12,
      tarifa: promedioKwh && costoMensual ? costoMensual / promedioKwh : null,
      mesesConDatos: promedioKwh ? 12 : 0,
    }
  }

  const meses = consumo.meses.map((mes) => ({ kwh: aNumero(mes.kwh), costo: aNumero(mes.costo) }))
  const conKwh = meses.filter((mes) => mes.kwh)
  const conAmbos = conKwh.filter((mes) => mes.costo)
  const sumar = (lista, campo) => lista.reduce((total, mes) => total + mes[campo], 0)
  const promedioKwh = conKwh.length ? sumar(conKwh, 'kwh') / conKwh.length : null
  // La tarifa solo usa los meses con consumo y costo; con meses faltantes el año se proyecta desde el promedio.
  const tarifa = conAmbos.length ? sumar(conAmbos, 'costo') / sumar(conAmbos, 'kwh') : null
  return {
    promedioKwh,
    anualKwh: promedioKwh && promedioKwh * 12,
    costoAnual: promedioKwh && tarifa ? promedioKwh * 12 * tarifa : null,
    tarifa,
    mesesConDatos: conKwh.length,
  }
}
