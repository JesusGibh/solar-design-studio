import { esCompatible, getRed, validarInterconexion } from './electrico.js'

// Motor de dimensionamiento FV. Funciones puras: reciben catálogo y datos del proyecto ya numéricos.
// Estados de cada verificación: 'ok' | 'warn' | 'danger' | 'pendiente' (faltan datos).

export const DEFECTOS = { hsp: 4.2, pr: 0.8, tempMin: 10 }
export const RATIO_DC_AC = { min: 1.1, max: 1.3 }
export const FRACCION_TECHO_UTIL = 0.85 // se descuenta 15 % para pasillos y retiros
const DIAS_MES = 30
const COEF_VOC_ASUMIDO = -0.28 // %/°C, cuando la ficha del panel no lo trae
const TEMP_CELDA_CALIENTE = 70 // °C, para el Vmp mínimo del string
const MAX_INVERSORES_AUTO = 6
const STRINGS_POR_MPPT = 2 // supuesto para estimar cuántos strings admite el inversor

export const areaPanelM2 = (panel) => (panel?.largo_mm && panel?.ancho_mm ? (panel.largo_mm * panel.ancho_mm) / 1e6 : null)
export const generacionMensual = (kwp, hsp, pr) => kwp * hsp * pr * DIAS_MES
export const potenciaDcRequerida = (consumoKwh, hsp, pr) => consumoKwh / (DIAS_MES * hsp * pr)

// Panel óptimo: el de mayor densidad de potencia (W/m²), que es el que más cubre en un techo dado.
// Se prefieren los que traen dimensiones, porque sin ellas no se puede verificar el techo.
export function elegirPanel(paneles) {
  // Los registros leídos por OCR no se eligen solos: pueden traer dígitos mal reconocidos.
  const validos = paneles.filter((panel) => panel.potencia_wp > 0 && !panel.ocr)
  const conDimensiones = validos.filter(areaPanelM2)
  const densidad = (panel) => (areaPanelM2(panel) ? panel.potencia_wp / areaPanelM2(panel) : (panel.eficiencia ?? 0) * 10)
  const candidatos = conDimensiones.length ? conDimensiones : validos
  return candidatos.reduce((mejor, panel) => {
    if (!mejor) return panel
    const diferencia = densidad(panel) - densidad(mejor)
    return diferencia > 0 || (diferencia === 0 && panel.potencia_wp > mejor.potencia_wp) ? panel : mejor
  }, null)
}

export function maxPanelesEnTecho(areaTechoM2, panel) {
  const area = areaPanelM2(panel)
  return areaTechoM2 && area ? Math.floor((areaTechoM2 * FRACCION_TECHO_UTIL) / area) : null
}

// Mejor inversor (y cantidad de unidades) para una potencia DC: compatible con la red, DC/AC entre
// 1.10 y 1.30, sin violar la barra/interruptor principal ni el transformador.
// Si ninguno cumple todo, devuelve el más cercano en DC/AC junto con el `motivo`, para mostrar la alerta.
export function elegirInversor({ inversores, datosRed, kwp }) {
  const red = getRed(datosRed.tension)
  const compatibles = inversores.filter(
    (inversor) => esCompatible(inversor, red) && inversor.potencia_ac_nominal_kw > 0 && !inversor.ocr,
  )
  if (compatibles.length === 0) return { inversor: null, cantidad: 0, motivo: `No hay inversores en el catálogo para ${red.label}.` }

  const centro = (RATIO_DC_AC.min + RATIO_DC_AC.max) / 2
  const enRatio = []
  for (const inversor of compatibles) {
    for (let cantidad = 1; cantidad <= MAX_INVERSORES_AUTO; cantidad++) {
      const potenciaKw = inversor.potencia_ac_nominal_kw * cantidad
      const ratio = kwp / potenciaKw
      if (ratio < RATIO_DC_AC.min) break // más unidades solo lo bajan
      if (ratio > RATIO_DC_AC.max) continue
      const { regla120, acometida, transformador } = validarInterconexion({ red: datosRed, potenciaKw })
      enRatio.push({
        inversor,
        cantidad,
        ratio,
        fallaInterruptor: regla120.estado === 'danger' || acometida.estado === 'danger',
        fallaTransformador: transformador.estado === 'danger',
      })
    }
  }
  // Menos unidades primero; a igualdad, el DC/AC más cercano a 1.20.
  enRatio.sort((p, q) => p.cantidad - q.cantidad || Math.abs(p.ratio - centro) - Math.abs(q.ratio - centro))

  const optimo = enRatio.find((opcion) => !opcion.fallaInterruptor && !opcion.fallaTransformador)
  if (optimo) return { inversor: optimo.inversor, cantidad: optimo.cantidad, motivo: null }

  if (enRatio.length === 0) {
    return {
      inversor: null,
      cantidad: 0,
      motivo: `Ningún inversor para ${red.label} deja el DC/AC entre ${RATIO_DC_AC.min.toFixed(2)} y ${RATIO_DC_AC.max.toFixed(2)} con ${kwp.toFixed(2)} kWp.`,
    }
  }
  const limites = [
    enRatio.some((opcion) => opcion.fallaInterruptor) && 'el interruptor principal',
    enRatio.some((opcion) => opcion.fallaTransformador) && 'el transformador',
  ].filter(Boolean)
  return {
    inversor: enRatio[0].inversor,
    cantidad: enRatio[0].cantidad,
    motivo: `Todos los inversores con DC/AC válido exceden ${limites.join(' y ')}. Se muestra el más cercano.`,
  }
}

// Voc del panel a temperatura mínima y encaje de los strings en la entrada del inversor.
function evaluarStrings({ panel, numPaneles, inversor, cantidad, tempMin }) {
  if (!panel?.voc) return { estado: 'pendiente' }
  const coef = panel.coef_temp_voc ?? COEF_VOC_ASUMIDO
  const vocFrio = panel.voc * (1 + (coef / 100) * (tempMin - 25))
  const base = { vocFrio, coefAsumido: panel.coef_temp_voc == null }
  if (!inversor) return { estado: 'pendiente', ...base }
  if (!inversor.voc_max) return { estado: 'pendiente', ...base, sinDatoInversor: true }

  const maxPorString = Math.floor(inversor.voc_max / vocFrio)
  const vmpCaliente = panel.vmp ? panel.vmp * (1 + (coef / 100) * (TEMP_CELDA_CALIENTE - 25)) : null
  const minPorString = inversor.v_mppt_min && vmpCaliente ? Math.max(1, Math.ceil(inversor.v_mppt_min / vmpCaliente)) : 1
  const resultado = { ...base, maxPorString, minPorString, vocMax: inversor.voc_max }
  if (maxPorString < 1) return { estado: 'danger', ...resultado, problema: 'El Voc en frío de un solo panel supera la entrada del inversor.' }
  if (minPorString > maxPorString) return { estado: 'danger', ...resultado, problema: 'La ventana MPPT del inversor no admite ningún string de este panel.' }

  const strings = Math.ceil(numPaneles / maxPorString)
  const porString = Math.floor(numPaneles / strings)
  Object.assign(resultado, { strings, porString, vocString: Math.ceil(numPaneles / strings) * vocFrio })
  if (porString < minPorString) {
    return { estado: 'danger', ...resultado, problema: `Se necesitan al menos ${minPorString} paneles por string para alcanzar el voltaje MPPT mínimo.` }
  }
  if (panel.isc && inversor.isc_max_mppt && panel.isc > inversor.isc_max_mppt) {
    return { estado: 'danger', ...resultado, problema: `La Isc del panel (${panel.isc} A) supera la máxima por MPPT (${inversor.isc_max_mppt} A).` }
  }
  if (inversor.mppt_num && strings > inversor.mppt_num * cantidad * STRINGS_POR_MPPT) {
    return {
      estado: 'warn',
      ...resultado,
      problema: `Requiere ${strings} strings y el inversor tiene ${inversor.mppt_num * cantidad} MPPT: confirma las entradas disponibles.`,
    }
  }
  return { estado: 'ok', ...resultado }
}

function evaluarTecho({ panel, numPaneles, areaTecho }) {
  const area = areaPanelM2(panel)
  if (!areaTecho || !area) return { estado: 'pendiente', sinDimensiones: Boolean(areaTecho && panel && !area) }
  const areaUtil = areaTecho * FRACCION_TECHO_UTIL
  const areaNecesaria = numPaneles * area
  return { estado: areaNecesaria <= areaUtil ? 'ok' : 'danger', areaUtil, areaNecesaria, maxPaneles: Math.floor(areaUtil / area) }
}

// Evalúa un sistema concreto (panel × cantidad + inversor × cantidad). Lo usan ambos modos.
export function evaluarSistema({ panel, numPaneles, inversor, cantidad = 1, consumoKwh, hsp, pr, tempMin, areaTecho, datosRed }) {
  const kwp = panel && numPaneles ? (panel.potencia_wp * numPaneles) / 1000 : null
  const generacionKwh = kwp ? generacionMensual(kwp, hsp, pr) : null
  const potenciaAcKw = inversor ? inversor.potencia_ac_nominal_kw * cantidad : null
  const ratioValor = kwp && potenciaAcKw ? kwp / potenciaAcKw : null
  const enRango = ratioValor >= RATIO_DC_AC.min && ratioValor <= RATIO_DC_AC.max
  return {
    kwp,
    generacionKwh,
    cobertura: generacionKwh && consumoKwh ? generacionKwh / consumoKwh : null,
    potenciaAcKw,
    ratio: { estado: ratioValor == null ? 'pendiente' : enRango ? 'ok' : ratioValor > 1.5 || ratioValor < 0.8 ? 'danger' : 'warn', valor: ratioValor },
    strings: evaluarStrings({ panel, numPaneles, inversor, cantidad, tempMin }),
    techo: evaluarTecho({ panel, numPaneles, areaTecho }),
    interconexion: validarInterconexion({ red: datosRed, potenciaKw: potenciaAcKw }),
  }
}

// Modo automático: del consumo mensual al sistema óptimo. Devuelve null si falta el consumo o no hay paneles.
export function dimensionarAuto({ consumoKwh, hsp, pr, tempMin, areaTecho, datosRed, paneles, inversores }) {
  const panel = elegirPanel(paneles)
  if (!consumoKwh || !panel) return null

  const kwpRequerido = potenciaDcRequerida(consumoKwh, hsp, pr)
  const numRequeridos = Math.ceil((kwpRequerido * 1000) / panel.potencia_wp)
  const maximoTecho = maxPanelesEnTecho(areaTecho, panel)
  const limitadoPorTecho = maximoTecho != null && numRequeridos > maximoTecho
  const numPaneles = limitadoPorTecho ? maximoTecho : numRequeridos
  const kwp = (panel.potencia_wp * numPaneles) / 1000

  const eleccion = numPaneles > 0 ? elegirInversor({ inversores, datosRed, kwp }) : { inversor: null, cantidad: 0, motivo: 'El techo no admite ningún panel.' }
  return {
    panel,
    numPaneles,
    numRequeridos,
    kwpRequerido,
    limitadoPorTecho,
    inversor: eleccion.inversor,
    cantidad: eleccion.cantidad,
    avisoInversor: eleccion.motivo,
    evaluacion: evaluarSistema({ panel, numPaneles, inversor: eleccion.inversor, cantidad: eleccion.cantidad, consumoKwh, hsp, pr, tempMin, areaTecho, datosRed }),
  }
}
