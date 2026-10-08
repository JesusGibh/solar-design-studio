// Arquitectura del sistema (on-grid, off-grid, híbrido) y almacenamiento en baterías.
// Funciones puras: reciben equipos del catálogo y números ya interpretados.

export const ARQUITECTURAS = [
  ['on_grid', 'On-Grid (Interconectado)'],
  ['off_grid', 'Off-Grid (Aislado)'],
  ['hibrido', 'Híbrido'],
]
export const ETIQUETA_ARQUITECTURA = { on_grid: 'ON-GRID', off_grid: 'OFF-GRID', hibrido: 'HÍBRIDO' }
export const MARGEN_SOBRECARGA = 1.25 // el inversor aislado debe dar la potencia pico con 25 % de margen
export const EFICIENCIA_BATERIA = 0.95 // ida o vuelta; ciclo completo ≈ 90 %
const DOD_LFP = 90
const DOD_OTRAS = 80
// Vida típica de una batería LFP al 80–90 % de descarga. Es una referencia general de la química,
// no un dato de la ficha: se muestra siempre rotulada como tal.
export const CICLOS_TIPICOS_LFP = 6000

const esLfp = (bateria) => /lfp|lifepo|litio.?hierro|iron/i.test(bateria?.tipo_quimica ?? '')

// Rango de voltaje de una batería: el de su ficha o, si no está marcado, el que da su voltaje nominal.
export function rangoBateria(bateria) {
  if (bateria?.rango_voltaje) return bateria.rango_voltaje
  const voltios = bateria?.voltaje_nominal_v
  return voltios > 0 && voltios <= 64 ? 'LOW_VOLTAGE' : voltios >= 80 ? 'HIGH_VOLTAGE' : null
}

// Profundidad de descarga (%): la recomendada en la ficha o, por defecto, 90 % en LFP y 80 % en el resto.
export const dodDe = (bateria) => bateria?.dod_recomendado || (esLfp(bateria) ? DOD_LFP : DOD_OTRAS)
export const ciclosDe = (bateria) => (esLfp(bateria) ? CICLOS_TIPICOS_LFP : null)

const admiteBateria = (inversor) => Boolean(inversor.tipo_bateria_soporte) && inversor.tipo_bateria_soporte !== 'NINGUNA'

// ¿Sirve el inversor para la arquitectura? Los que admiten batería sirven para aislado o híbrido;
// si su ficha no deja claro cuál de los dos, se ofrecen en ambos hasta que se clasifiquen en Equipos.
// Los que no tienen ninguna clasificación no se ofrecen en ninguna.
export function sirveParaArquitectura(inversor, arquitectura) {
  if (arquitectura === 'on_grid') return inversor.tipo_sistema === 'ON_GRID'
  const esperado = arquitectura === 'off_grid' ? 'OFF_GRID' : 'HIBRIDO'
  return inversor.tipo_sistema === esperado || (!inversor.tipo_sistema && admiteBateria(inversor))
}

// Compatibilidad de tensión entre inversor y batería: LV con LV y HV con HV.
// Devuelve { estado: 'ok' | 'danger' | 'pendiente', mensaje }.
export function compatibilidadBateria(inversor, bateria) {
  if (!inversor || !bateria) return { estado: 'pendiente' }
  const rango = rangoBateria(bateria)
  const nombre = { LOW_VOLTAGE: 'bajo voltaje (LV)', HIGH_VOLTAGE: 'alto voltaje (HV)' }
  if (inversor.tipo_bateria_soporte === 'NINGUNA') return { estado: 'danger', mensaje: `${inversor.modelo} no admite baterías.` }
  if (!inversor.tipo_bateria_soporte) return { estado: 'pendiente', mensaje: `La ficha de ${inversor.modelo} no indica si trabaja con batería LV o HV: complétalo en Equipos.` }
  if (!rango) return { estado: 'pendiente', mensaje: `La batería ${bateria.modelo} no tiene voltaje nominal: no se puede verificar.` }
  return inversor.tipo_bateria_soporte === rango
    ? { estado: 'ok', mensaje: `Inversor y batería de ${nombre[rango]}.` }
    : { estado: 'danger', mensaje: `Incompatibles: el inversor trabaja con batería de ${nombre[inversor.tipo_bateria_soporte]} y ${bateria.modelo} es de ${nombre[rango]}.` }
}

const num = (valor) => {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Tabla de cargas → consumo diario y potencia pico simultánea.
//   cargas: [{ nombre, potenciaW, cantidad, horas, simultaneidad }]  (simultaneidad 0–1; vacío = 1)
export function resumenCargas(cargas = []) {
  let diarioKwh = 0
  let picoKw = 0
  let instaladaKw = 0
  for (const carga of cargas) {
    const potenciaKw = (num(carga.potenciaW) * (num(carga.cantidad) || (num(carga.potenciaW) ? 1 : 0))) / 1000
    const simultaneidad = carga.simultaneidad === '' || carga.simultaneidad == null ? 1 : Math.min(1, num(carga.simultaneidad))
    diarioKwh += potenciaKw * Math.min(24, num(carga.horas))
    picoKw += potenciaKw * simultaneidad
    instaladaKw += potenciaKw
  }
  return { diarioKwh, picoKw, instaladaKw }
}

// Banco de baterías. Capacidad nominal necesaria (kWh) = consumo diario × días de autonomía / DoD.
export function banco({ bateria, cantidad, diarioKwh, dias = 1, dod }) {
  const profundidad = (dod || dodDe(bateria)) / 100
  const requeridoKwh = diarioKwh ? (diarioKwh * dias) / profundidad : null
  const unitaria = bateria?.capacidad_kwh ?? null
  const recomendada = requeridoKwh && unitaria ? Math.ceil(requeridoKwh / unitaria - 1e-9) : null
  const unidades = cantidad || recomendada || (bateria ? 1 : 0)
  const capacidadKwh = unitaria ? unitaria * unidades : null
  return {
    dod: profundidad * 100,
    requeridoKwh,
    recomendada,
    unidades,
    capacidadKwh,
    utilKwh: capacidadKwh ? capacidadKwh * profundidad : null,
    descargaKw: bateria?.potencia_max_descarga_kw ? bateria.potencia_max_descarga_kw * unidades : null,
    suficiente: requeridoKwh && capacidadKwh ? capacidadKwh >= requeridoKwh - 1e-9 : null,
  }
}

// Reparto del consumo a lo largo del día (peso de cada hora, 00 a 23). Son curvas típicas de
// referencia, no mediciones del cliente.
export const PERFILES_CARGA = {
  residencial: { nombre: 'Residencial (picos de mañana y noche)', pesos: [2, 2, 2, 2, 2, 3, 5, 6, 5, 4, 4, 4, 5, 4, 4, 4, 5, 6, 8, 9, 8, 6, 4, 3] },
  comercial: { nombre: 'Comercial (horario de oficina)', pesos: [1, 1, 1, 1, 1, 1, 2, 4, 7, 8, 8, 8, 7, 8, 8, 8, 7, 5, 3, 2, 2, 1, 1, 1] },
  constante: { nombre: 'Constante las 24 horas', pesos: Array(24).fill(1) },
}

// Generación solar por hora: campana entre las 6:00 y las 18:00.
const PESOS_SOLAR = Array.from({ length: 24 }, (_, hora) => (hora >= 6 && hora < 18 ? Math.sin((Math.PI * (hora + 0.5 - 6)) / 12) ** 2 : 0))

const repartir = (totalKwh, pesos) => {
  const suma = pesos.reduce((a, b) => a + b, 0)
  return pesos.map((peso) => (totalKwh * peso) / suma)
}

// Simulación de un día típico, hora a hora. El excedente solar carga la batería y el faltante la
// descarga, sin bajar del mínimo que deja el DoD ni superar la potencia del banco. Se simulan varios
// días seguidos y se devuelve el último, para que el estado de carga de las 00:00 sea el de régimen.
//   horas: [{ hora, solarKw, cargaKw, soc (0–100), bateriaKw (+ carga / − descarga), sinCubrirKw, excedenteKw }]
export function simular24h({ generacionDiaKwh, consumoDiaKwh, capacidadKwh, dod, potenciaKw, perfil = 'residencial' }) {
  if (!capacidadKwh || !consumoDiaKwh) return null
  const solar = repartir(generacionDiaKwh ?? 0, PESOS_SOLAR)
  const carga = repartir(consumoDiaKwh, (PERFILES_CARGA[perfil] ?? PERFILES_CARGA.residencial).pesos)
  const minimo = capacidadKwh * (1 - dod / 100)
  const tope = potenciaKw || Infinity
  let energia = capacidadKwh
  let horas = []
  for (let dia = 0; dia < 4; dia++) {
    horas = solar.map((solarKw, hora) => {
      const neto = solarKw - carga[hora]
      let bateriaKw = 0
      if (neto > 0) bateriaKw = Math.min(neto, tope, (capacidadKwh - energia) / EFICIENCIA_BATERIA)
      else bateriaKw = -Math.min(-neto, tope, (energia - minimo) * EFICIENCIA_BATERIA)
      energia += bateriaKw > 0 ? bateriaKw * EFICIENCIA_BATERIA : bateriaKw / EFICIENCIA_BATERIA
      return {
        hora,
        solarKw,
        cargaKw: carga[hora],
        bateriaKw,
        soc: (energia / capacidadKwh) * 100,
        sinCubrirKw: Math.max(0, -neto + bateriaKw),
        excedenteKw: Math.max(0, neto - bateriaKw),
      }
    })
  }
  const sinCubrirKwh = horas.reduce((suma, h) => suma + h.sinCubrirKw, 0)
  return {
    horas,
    socMinimo: Math.min(...horas.map((h) => h.soc)),
    sinCubrirKwh,
    excedenteKwh: horas.reduce((suma, h) => suma + h.excedenteKw, 0),
    // Autonomía sin sol ni red: energía útil del banco frente a la demanda media.
    autonomiaHoras: (capacidadKwh * (dod / 100) * EFICIENCIA_BATERIA) / (consumoDiaKwh / 24),
  }
}
