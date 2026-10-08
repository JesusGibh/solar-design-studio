import { DIAS_POR_MES } from './consumo.js'
import { esCompatible, getRed, validarInterconexion } from './electrico.js'

// Motor de dimensionamiento FV. Funciones puras: reciben catálogo y datos del proyecto ya numéricos.
// Estados de cada verificación: 'ok' | 'warn' | 'danger' | 'pendiente' (faltan datos).

export const DEFECTOS = { hsp: 4.2, pr: 0.8, tempMin: 10, cobertura: 100 }
export const RATIO_DC_AC = { min: 1.1, max: 1.3 }
export const FRACCION_TECHO_UTIL = 0.85 // se descuenta 15 % para pasillos y retiros
const DIAS_ANIO = 365
const COEF_VOC_ASUMIDO = -0.28 // %/°C, cuando la ficha del panel no lo trae
const TEMP_CELDA_CALIENTE = 70 // °C, para el Vmp mínimo del string
const MAX_INVERSORES_AUTO = 6 // inversores de string o híbridos iguales en paralelo
const MAX_MICROINVERSORES_AUTO = 400
const POTENCIA_MICROINVERSOR_KW = 3 // por debajo de esto se trata como microinversor (muchas unidades)
const STRINGS_POR_MPPT = 2 // supuesto para estimar cuántos strings admite el inversor

export const areaPanelM2 = (panel) => (panel?.largo_mm && panel?.ancho_mm ? (panel.largo_mm * panel.ancho_mm) / 1e6 : null)
export const generacionAnual = (kwp, hsp, pr) => kwp * hsp * pr * DIAS_ANIO

// Reparto de la irradiación a lo largo del año: factor de cada mes sobre la HSP media anual.
// 'panama' sigue la estación seca (ene–abr) y lluviosa del país; 'uniforme' no aplica estacionalidad.
export const PERFILES_SOLARES = {
  panama: { nombre: 'Panamá (estación seca y lluviosa)', factores: [1.128, 1.217, 1.227, 1.143, 0.956, 0.922, 0.92, 0.92, 0.929, 0.892, 0.84, 0.92] },
  uniforme: { nombre: 'Uniforme todo el año', factores: Array(12).fill(1) },
}
export const PERFIL_POR_DEFECTO = 'panama'

// Generación de cada mes. Los factores se normalizan para que el total anual sea exactamente
// kWp × HSP × PR × 365, sea cual sea el perfil.
export function generacionPorMes(kwp, hsp, pr, perfil = PERFIL_POR_DEFECTO) {
  const { factores } = PERFILES_SOLARES[perfil] ?? PERFILES_SOLARES[PERFIL_POR_DEFECTO]
  const peso = factores.reduce((suma, factor, i) => suma + factor * DIAS_POR_MES[i], 0)
  return factores.map((factor, i) => (generacionAnual(kwp, hsp, pr) * factor * DIAS_POR_MES[i]) / peso)
}
// P_dc (kWp) = consumo anual × cobertura / (365 × HSP × PR)
export const potenciaDcRequerida = (anualKwh, coberturaPct, hsp, pr) => (anualKwh * (coberturaPct / 100)) / (DIAS_ANIO * hsp * pr)

export const marcasDe = (equipos) => [...new Set(equipos.map((equipo) => equipo.marca))].sort((a, b) => a.localeCompare(b))

// Deja los equipos de la marca pedida ('' = cualquiera). Los registros leídos por OCR pueden traer
// dígitos mal reconocidos, así que solo entran si la marca elegida no tiene otros.
function candidatos(equipos, marca) {
  const deMarca = marca ? equipos.filter((equipo) => equipo.marca === marca) : equipos
  const verificados = deMarca.filter((equipo) => !equipo.ocr)
  return verificados.length || !marca ? verificados : deMarca
}

// Panel óptimo: el de mayor densidad de potencia (W/m²), que es el que más cubre en un techo dado.
// Se prefieren los que traen dimensiones, porque sin ellas no se puede verificar el techo.
// Con `id` se respeta el modelo que eligió el usuario (el motor solo calcula cuántos hacen falta).
export function elegirPanel(paneles, marca = '', id = '') {
  const elegido = id && paneles.find((panel) => panel.id === id)
  if (elegido) return elegido
  const validos = candidatos(paneles, marca).filter((panel) => panel.potencia_wp > 0)
  const conDimensiones = validos.filter(areaPanelM2)
  const densidad = (panel) => (areaPanelM2(panel) ? panel.potencia_wp / areaPanelM2(panel) : (panel.eficiencia ?? 0) * 10)
  const lista = conDimensiones.length ? conDimensiones : validos
  return lista.reduce((mejor, panel) => {
    if (!mejor) return panel
    const diferencia = densidad(panel) - densidad(mejor)
    return diferencia > 0 || (diferencia === 0 && panel.potencia_wp > mejor.potencia_wp) ? panel : mejor
  }, null)
}

export function maxPanelesEnTecho(areaTechoM2, panel) {
  const area = areaPanelM2(panel)
  return areaTechoM2 && area ? Math.floor((areaTechoM2 * FRACCION_TECHO_UTIL) / area) : null
}

// Mejor inversor (y cantidad de unidades) para una potencia DC: de la marca pedida, compatible con la
// red, DC/AC entre 1.10 y 1.30, sin superar el interruptor principal ni el transformador.
// Si ninguno cumple todo, devuelve el más cercano en DC/AC junto con el `motivo`, para mostrar la alerta.
// Con `id` se usa el modelo que eligió el usuario y solo se calcula cuántas unidades hacen falta.
// Con `potenciaMinKw` (sistema aislado con tabla de cargas) manda la potencia que piden las cargas:
// se elige el conjunto más pequeño que la alcanza, sin exigir el rango de DC/AC.
export function elegirInversor({ inversores, datosRed, kwp, marca = '', id = '', potenciaMinKw = 0 }) {
  const red = getRed(datosRed.tension)
  const deMarca = marca ? ` de ${marca}` : ''
  const elegido = id && inversores.find((inversor) => inversor.id === id && esCompatible(inversor, red) && inversor.potencia_ac_nominal_kw > 0)
  const compatibles = elegido
    ? [elegido]
    : candidatos(inversores, marca).filter((inversor) => esCompatible(inversor, red) && inversor.potencia_ac_nominal_kw > 0)
  if (compatibles.length === 0) return { inversor: null, cantidad: 0, motivo: `No hay inversores${deMarca} de este tipo en el catálogo para ${red.label}.` }

  if (potenciaMinKw > 0) {
    const opciones = compatibles
      .map((inversor) => ({ inversor, cantidad: Math.ceil(potenciaMinKw / inversor.potencia_ac_nominal_kw - 1e-9) }))
      .filter((opcion) => opcion.cantidad <= MAX_INVERSORES_AUTO || elegido)
      .sort((p, q) => p.cantidad - q.cantidad || p.inversor.potencia_ac_nominal_kw - q.inversor.potencia_ac_nominal_kw)
    if (opciones.length) return { inversor: opciones[0].inversor, cantidad: opciones[0].cantidad, motivo: null }
    return { inversor: null, cantidad: 0, motivo: `Ningún inversor${deMarca} alcanza los ${potenciaMinKw.toFixed(1)} kW que piden las cargas con ${MAX_INVERSORES_AUTO} unidades o menos.` }
  }

  const centro = (RATIO_DC_AC.min + RATIO_DC_AC.max) / 2
  const enRatio = []
  for (const inversor of compatibles) {
    const unitaria = inversor.potencia_ac_nominal_kw
    const tope = unitaria < POTENCIA_MICROINVERSOR_KW ? MAX_MICROINVERSORES_AUTO : MAX_INVERSORES_AUTO
    // Cantidades que dejan el DC/AC dentro del rango: kwp/(max·P) ≤ n ≤ kwp/(min·P)
    const desde = Math.max(1, Math.ceil(kwp / (RATIO_DC_AC.max * unitaria) - 1e-9))
    const hasta = Math.min(tope, Math.floor(kwp / (RATIO_DC_AC.min * unitaria) + 1e-9))
    for (let cantidad = desde; cantidad <= hasta; cantidad++) {
      const potenciaKw = unitaria * cantidad
      const { acometida, transformador } = validarInterconexion({ red: datosRed, potenciaKw })
      enRatio.push({
        inversor,
        cantidad,
        ratio: kwp / potenciaKw,
        fallaInterruptor: acometida.estado === 'danger',
        fallaTransformador: transformador.estado === 'danger',
      })
    }
  }
  // Menos unidades primero; a igualdad, el DC/AC más cercano a 1.20.
  enRatio.sort((p, q) => p.cantidad - q.cantidad || Math.abs(p.ratio - centro) - Math.abs(q.ratio - centro))

  const optimo = enRatio.find((opcion) => !opcion.fallaInterruptor && !opcion.fallaTransformador)
  if (optimo) return { inversor: optimo.inversor, cantidad: optimo.cantidad, motivo: null }

  if (enRatio.length === 0 && elegido) {
    // El modelo elegido no cae en el rango con ninguna cantidad: se propone la más cercana a 1.20.
    const cantidad = Math.max(1, Math.round(kwp / (centro * elegido.potencia_ac_nominal_kw)))
    const ratio = kwp / (elegido.potencia_ac_nominal_kw * cantidad)
    return {
      inversor: elegido,
      cantidad,
      motivo: `Con ${cantidad} × ${elegido.modelo} el DC/AC queda en ${ratio.toFixed(2)}, fuera del rango ${RATIO_DC_AC.min.toFixed(2)} – ${RATIO_DC_AC.max.toFixed(2)}.`,
    }
  }
  if (enRatio.length === 0) {
    return {
      inversor: null,
      cantidad: 0,
      motivo: `Ningún inversor${deMarca} para ${red.label} deja el DC/AC entre ${RATIO_DC_AC.min.toFixed(2)} y ${RATIO_DC_AC.max.toFixed(2)} con ${kwp.toFixed(2)} kWp.`,
    }
  }
  const limites = [
    enRatio.some((opcion) => opcion.fallaInterruptor) && 'el interruptor principal',
    enRatio.some((opcion) => opcion.fallaTransformador) && 'el transformador',
  ].filter(Boolean)
  return {
    inversor: enRatio[0].inversor,
    cantidad: enRatio[0].cantidad,
    motivo: `Todos los inversores${deMarca} con DC/AC válido exceden ${limites.join(' y ')}. Se muestra el más cercano.`,
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
  Object.assign(resultado, {
    strings,
    porString,
    vocString: Math.ceil(numPaneles / strings) * vocFrio, // string más largo, en frío
    vmpString: vmpCaliente ? porString * vmpCaliente : null, // string más corto, con la celda caliente
    tempCelda: TEMP_CELDA_CALIENTE,
  })
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
      problema: `Requiere ${strings} strings y hay ${inversor.mppt_num * cantidad} MPPT en total: confirma las entradas disponibles.`,
    }
  }
  return { estado: 'ok', ...resultado }
}

// Con el techo trazado en el mapa manda el conteo físico del empaquetado (`maxPanelesTecho`);
// si solo hay un área escrita a mano, se estima con el 85 % útil.
function evaluarTecho({ panel, numPaneles, areaTecho, maxPanelesTecho }) {
  if (maxPanelesTecho != null) {
    return { estado: numPaneles <= maxPanelesTecho ? 'ok' : 'danger', maxPaneles: maxPanelesTecho, porTrazado: true }
  }
  const area = areaPanelM2(panel)
  if (!areaTecho || !area) return { estado: 'pendiente', sinDimensiones: Boolean(areaTecho && panel && !area) }
  const areaUtil = areaTecho * FRACCION_TECHO_UTIL
  const areaNecesaria = numPaneles * area
  return { estado: areaNecesaria <= areaUtil ? 'ok' : 'danger', areaUtil, areaNecesaria, maxPaneles: Math.floor(areaUtil / area) }
}

// Evalúa un sistema concreto (panel × cantidad + inversor × cantidad). Lo usan ambos modos.
// `cobertura` es generación anual / consumo anual (1 = 100 %).
// `factor` multiplica la generación (ganancia de los paneles bifaciales; 1 = sin ganancia).
// `potenciaMinKw` es la potencia que piden las cargas de un sistema aislado: si viene, el inversor se
// juzga por alcanzarla y el DC/AC queda solo como dato.
export function evaluarSistema({ panel, numPaneles, inversor, cantidad = 1, anualKwh, hsp, pr, perfil, tempMin, areaTecho, maxPanelesTecho, datosRed, factor = 1, potenciaMinKw = 0 }) {
  const kwp = panel && numPaneles ? (panel.potencia_wp * numPaneles) / 1000 : null
  const generacionAnualKwh = kwp ? generacionAnual(kwp, hsp, pr) * factor : null
  const potenciaAcKw = inversor ? inversor.potencia_ac_nominal_kw * cantidad : null
  const ratioValor = kwp && potenciaAcKw ? kwp / potenciaAcKw : null
  const enRango = potenciaMinKw > 0 || (ratioValor >= RATIO_DC_AC.min && ratioValor <= RATIO_DC_AC.max)
  return {
    kwp,
    generacionAnualKwh,
    generacionMensualKwh: generacionAnualKwh && generacionAnualKwh / 12,
    generacionPorMes: kwp ? generacionPorMes(kwp, hsp, pr, perfil).map((kwh) => kwh * factor) : null,
    factor,
    potencia: potenciaMinKw > 0 ? { estado: potenciaAcKw == null ? 'pendiente' : potenciaAcKw >= potenciaMinKw - 1e-9 ? 'ok' : 'danger', requeridaKw: potenciaMinKw } : null,
    areaCaptacionM2: areaPanelM2(panel) && numPaneles ? areaPanelM2(panel) * numPaneles : null,
    cobertura: generacionAnualKwh && anualKwh ? generacionAnualKwh / anualKwh : null,
    potenciaAcKw,
    ratio: { estado: ratioValor == null ? 'pendiente' : enRango ? 'ok' : ratioValor > 1.5 || ratioValor < 0.8 ? 'danger' : 'warn', valor: ratioValor },
    strings: evaluarStrings({ panel, numPaneles, inversor, cantidad, tempMin }),
    techo: evaluarTecho({ panel, numPaneles, areaTecho, maxPanelesTecho }),
    interconexion: validarInterconexion({ red: datosRed, potenciaKw: potenciaAcKw }),
  }
}

// Modo automático: del consumo anual y la cobertura objetivo al sistema óptimo.
// Devuelve null si falta el consumo; `sinPanel` si la marca pedida no tiene paneles.
// Si lo requerido no cabe en el techo (`excedeTecho`), solo se recorta al máximo físico cuando
// el usuario lo pide (`ajustarATecho`); mientras tanto se avisa y se conserva lo requerido.
export function dimensionarAuto({
  anualKwh,
  cobertura,
  hsp,
  pr,
  tempMin,
  areaTecho,
  maxPanelesTecho,
  ajustarATecho = false,
  datosRed,
  paneles,
  inversores,
  perfil,
  marcaPanel = '',
  marcaInversor = '',
  panelId = '',
  inversorId = '',
  factor = 1,
  potenciaMinKw = 0,
}) {
  if (!anualKwh) return null
  const panel = elegirPanel(paneles, marcaPanel, panelId)
  if (!panel) return { sinPanel: true }

  const kwpRequerido = potenciaDcRequerida(anualKwh, cobertura, hsp, pr) / factor
  const numRequeridos = Math.ceil((kwpRequerido * 1000) / panel.potencia_wp - 1e-9)
  const maximoTecho = maxPanelesTecho ?? maxPanelesEnTecho(areaTecho, panel)
  const excedeTecho = maximoTecho != null && numRequeridos > maximoTecho
  const limitadoPorTecho = excedeTecho && ajustarATecho
  const numPaneles = limitadoPorTecho ? maximoTecho : numRequeridos
  const kwp = (panel.potencia_wp * numPaneles) / 1000

  const eleccion =
    numPaneles > 0
      ? elegirInversor({ inversores, datosRed, kwp, marca: marcaInversor, id: inversorId, potenciaMinKw })
      : { inversor: null, cantidad: 0, motivo: 'El techo no admite ningún panel.' }
  return {
    panel,
    numPaneles,
    numRequeridos,
    kwpRequerido,
    maximoTecho,
    excedeTecho,
    limitadoPorTecho,
    inversor: eleccion.inversor,
    cantidad: eleccion.cantidad,
    avisoInversor: eleccion.motivo,
    evaluacion: evaluarSistema({
      panel,
      numPaneles,
      inversor: eleccion.inversor,
      cantidad: eleccion.cantidad,
      anualKwh,
      hsp,
      pr,
      perfil,
      tempMin,
      areaTecho,
      maxPanelesTecho,
      datosRed,
      factor,
      potenciaMinKw,
    }),
  }
}
