// Motor financiero de la propuesta. Funciones puras; los montos van en la misma moneda que la tarifa.

export const DEFECTOS_FINANZAS = {
  inflacion: 3, // % anual de aumento del costo de la energía
  degradacion: 0.5, // % anual de pérdida de producción del módulo
  factorCo2: 0.5, // kg de CO₂ por kWh de red desplazado (depende del país: ajustar)
  anios: 25,
}

// Proyección a `anios` años. Devuelve null si faltan potencia, generación, tarifa o precio.
//   flujo[n] = { anio, generacionKwh, ahorro, acumulado } con el año 0 = inversión
//   payback: años hasta que el acumulado cruza cero (interpolado dentro del año); null si no se recupera
export function proyectar({ kwp, generacionAnualKwh, tarifa, precioWp, costoAdicional = 0, inflacion, degradacion, factorCo2, anios = DEFECTOS_FINANZAS.anios }) {
  if (!kwp || !generacionAnualKwh || !tarifa || !precioWp) return null

  const costoSistema = kwp * 1000 * precioWp
  const costoTotal = costoSistema + costoAdicional
  const flujo = [{ anio: 0, generacionKwh: 0, ahorro: 0, acumulado: -costoTotal }]
  let acumulado = -costoTotal
  let generacionTotal = 0
  let payback = null

  for (let anio = 1; anio <= anios; anio++) {
    const generacionKwh = generacionAnualKwh * (1 - degradacion / 100) ** (anio - 1)
    const ahorro = generacionKwh * tarifa * (1 + inflacion / 100) ** (anio - 1)
    if (payback == null && acumulado < 0 && acumulado + ahorro >= 0) payback = anio - 1 + -acumulado / ahorro
    acumulado += ahorro
    generacionTotal += generacionKwh
    flujo.push({ anio, generacionKwh, ahorro, acumulado })
  }

  const ahorroTotal = acumulado + costoTotal
  return {
    costoSistema,
    costoTotal,
    ahorroAnual: flujo[1].ahorro,
    paybackSimple: costoTotal / flujo[1].ahorro,
    payback,
    ahorroTotal,
    gananciaNeta: acumulado,
    roi: (acumulado / costoTotal) * 100,
    co2Toneladas: (generacionTotal * factorCo2) / 1000,
    flujo,
  }
}
