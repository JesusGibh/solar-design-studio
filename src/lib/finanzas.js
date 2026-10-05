// Motor financiero de la propuesta. Funciones puras; los montos van en la misma moneda que la tarifa.

export const DEFECTOS_FINANZAS = {
  inflacion: 3, // % anual de aumento del costo de la energía
  degradacion: 0.5, // % anual de pérdida de producción del módulo
  descuento: 8, // % anual: tasa con la que se trae a valor presente el flujo (VAN)
  factorCo2: 0.5, // kg de CO₂ por kWh de red desplazado (depende del país: ajustar)
  anios: 25,
}

const valorActual = (flujos, tasa) => flujos.reduce((suma, flujo, anio) => suma + flujo / (1 + tasa) ** anio, 0)

// Tasa interna de retorno por bisección: la tasa que deja el VAN en cero. null si no hay cambio de signo.
function tasaInterna(flujos) {
  let [baja, alta] = [-0.9, 10]
  if (valorActual(flujos, baja) * valorActual(flujos, alta) > 0) return null
  for (let i = 0; i < 80; i++) {
    const media = (baja + alta) / 2
    if (valorActual(flujos, media) > 0) baja = media
    else alta = media
  }
  return (baja + alta) / 2
}

// Proyección a `anios` años. Devuelve null si faltan potencia, generación, tarifa o precio.
//   flujo[n] = { anio, generacionKwh, ahorro, acumulado } con el año 0 = inversión
//   payback: años hasta que el acumulado cruza cero (interpolado dentro del año); null si no se recupera
//   tir (%), van (a la tasa `descuento`), lcoe ($/kWh producido en toda la vida útil)
//   facturaActual / facturaConSistema: gasto anual en energía antes y después (año 1), si se da el consumo
export function proyectar({
  kwp,
  generacionAnualKwh,
  consumoAnualKwh = null,
  tarifa,
  precioWp,
  costoAdicional = 0,
  inflacion,
  degradacion,
  descuento = DEFECTOS_FINANZAS.descuento,
  factorCo2,
  anios = DEFECTOS_FINANZAS.anios,
}) {
  if (!kwp || !generacionAnualKwh || !tarifa || !precioWp) return null

  const costoSistema = kwp * 1000 * precioWp
  const costoTotal = costoSistema + costoAdicional
  const flujo = [{ anio: 0, generacionKwh: 0, ahorro: 0, acumulado: -costoTotal }]
  let acumulado = -costoTotal
  let generacionTotal = 0
  let payback = null

  for (let anio = 1; anio <= anios; anio++) {
    const generacionKwh = generacionAnualKwh * (1 - degradacion / 100) ** (anio - 1)
    // Solo tiene valor económico la energía que sustituye consumo: lo generado por encima del
    // consumo anual del sitio no se cuenta como ahorro (el crédito no supera lo que se consume).
    const valorada = consumoAnualKwh ? Math.min(generacionKwh, consumoAnualKwh) : generacionKwh
    const ahorro = valorada * tarifa * (1 + inflacion / 100) ** (anio - 1)
    if (payback == null && acumulado < 0 && acumulado + ahorro >= 0) payback = anio - 1 + -acumulado / ahorro
    acumulado += ahorro
    generacionTotal += generacionKwh
    flujo.push({ anio, generacionKwh, ahorro, acumulado })
  }

  const flujos = [-costoTotal, ...flujo.slice(1).map((punto) => punto.ahorro)]
  const tir = tasaInterna(flujos)
  const facturaActual = consumoAnualKwh ? consumoAnualKwh * tarifa : null
  return {
    costoSistema,
    costoAdicional,
    costoTotal,
    ahorroAnual: flujo[1].ahorro,
    paybackSimple: costoTotal / flujo[1].ahorro,
    payback,
    ahorroTotal: acumulado + costoTotal,
    gananciaNeta: acumulado,
    roi: (acumulado / costoTotal) * 100,
    tir: tir == null ? null : tir * 100,
    van: valorActual(flujos, descuento / 100),
    lcoe: costoTotal / generacionTotal,
    generacionTotal,
    co2Toneladas: (generacionTotal * factorCo2) / 1000,
    co2Anual: (generacionAnualKwh * factorCo2) / 1000,
    facturaActual,
    // La factura no baja de cero aunque el sistema genere más de lo que se consume.
    facturaConSistema: facturaActual == null ? null : Math.max(0, facturaActual - flujo[1].ahorro),
    flujo,
  }
}
