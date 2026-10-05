export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const DIAS_POR_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Convierte lo escrito en un campo numérico; devuelve null si está vacío o no es un número positivo.
export function aNumero(valor) {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return valor !== '' && Number.isFinite(n) && n > 0 ? n : null
}

// Resumen del consumo del proyecto, igual para los tres modos de captura:
//   'mensual' (kWh/mes) · 'anual' (kWh/año) · 'detallado' (12 meses con kWh y factura)
// tarifa en $/kWh: la escrita por el usuario o, en modo detallado con facturas, la calculada.
// `mensual` trae los 12 consumos (el promedio rellena los meses sin dato) para las gráficas.
export function resumenConsumo(consumo) {
  const tarifaEscrita = aNumero(consumo.tarifa)

  if (consumo.modo !== 'detallado') {
    const anual = consumo.modo === 'anual' ? aNumero(consumo.anualKwh) : null
    const promedioKwh = anual ? anual / 12 : consumo.modo === 'anual' ? null : aNumero(consumo.promedioKwh)
    const anualKwh = promedioKwh && promedioKwh * 12
    return {
      promedioKwh,
      anualKwh,
      tarifa: tarifaEscrita,
      tarifaCalculada: false,
      costoAnual: anualKwh && tarifaEscrita ? anualKwh * tarifaEscrita : null,
      mesesConDatos: promedioKwh ? 12 : 0,
      mensual: promedioKwh ? MESES.map(() => promedioKwh) : null,
    }
  }

  const meses = consumo.meses.map((mes) => ({ kwh: aNumero(mes.kwh), costo: aNumero(mes.costo) }))
  const conKwh = meses.filter((mes) => mes.kwh)
  const conAmbos = conKwh.filter((mes) => mes.costo)
  const sumar = (lista, campo) => lista.reduce((total, mes) => total + mes[campo], 0)
  const promedioKwh = conKwh.length ? sumar(conKwh, 'kwh') / conKwh.length : null
  // La tarifa calculada solo usa los meses con consumo y factura; con meses faltantes el año se proyecta desde el promedio.
  const calculada = conAmbos.length ? sumar(conAmbos, 'costo') / sumar(conAmbos, 'kwh') : null
  const tarifa = calculada ?? tarifaEscrita
  const mensual = promedioKwh ? meses.map((mes) => mes.kwh ?? promedioKwh) : null
  const anualKwh = mensual && mensual.reduce((total, kwh) => total + kwh, 0)
  return {
    promedioKwh,
    anualKwh,
    tarifa,
    tarifaCalculada: calculada != null,
    costoAnual: anualKwh && tarifa ? anualKwh * tarifa : null,
    mesesConDatos: conKwh.length,
    mensual,
  }
}
