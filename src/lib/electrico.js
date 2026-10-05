import { aNumero } from './consumo.js'

// Tensiones de servicio. `voltaje` es línea-línea; `tipoRed` es el valor de `tipo_red` del catálogo
// de inversores con el que es compatible.
export const REDES = [
  { id: 'mono_120_240', label: 'Monofásico 120/240V', fases: 1, voltaje: 240, tipoRed: 'Monofasico 120/240V' },
  { id: 'tri_120_208', label: 'Trifásico 120/208V', fases: 3, voltaje: 208, tipoRed: 'Trifasico 208V' },
  { id: 'tri_277_480', label: 'Trifásico 277/480V', fases: 3, voltaje: 480, tipoRed: 'Trifasico 480V' },
  { id: 'tri_380_400', label: 'Trifásico 380/400V', fases: 3, voltaje: 400, tipoRed: 'Trifasico 380/400V' },
]

export const getRed = (id) => REDES.find((red) => red.id === id) ?? REDES[0]

const factor = (red) => (red.fases === 3 ? Math.sqrt(3) * red.voltaje : red.voltaje)

// Corriente de línea (A) de una potencia en kW a la tensión de servicio, con factor de potencia 1.
export const corrienteAC = (kw, red) => (kw * 1000) / factor(red)
export const potenciaKva = (amperios, red) => (amperios * factor(red)) / 1000

// `tipo_red` llega como texto "A; B" desde el catálogo JSON o como arreglo desde un CSV importado.
export function tiposDeRed(inversor) {
  const valor = inversor.tipo_red
  if (!valor) return []
  return Array.isArray(valor) ? valor : String(valor).split(/\s*;\s*/)
}

export const esCompatible = (inversor, red) => tiposDeRed(inversor).includes(red.tipoRed)

const FACTOR_CONTINUO = 1.25 // la salida del inversor se trata como carga continua (125 %)

// Validaciones de interconexión. Cada resultado trae `estado`: 'ok' | 'warn' | 'danger' | 'pendiente'.
//   regla120: interruptor principal + 125 % de la corriente solar ≤ 120 % de la barra (NEC 705.12, lado carga)
//   acometida: 125 % de la corriente solar no puede superar el interruptor principal
//   transformador: potencia AC del sistema frente a los kVA del transformador
export function validarInterconexion({ red: datosRed, potenciaKw }) {
  const red = getRed(datosRed.tension)
  const interruptor = aNumero(datosRed.interruptorA)
  const barra = aNumero(datosRed.barraA) ?? interruptor
  const transformador = aNumero(datosRed.transformadorKva)
  const corrienteSolar = potenciaKw ? corrienteAC(potenciaKw, red) : null
  const retroalimentacion = corrienteSolar && corrienteSolar * FACTOR_CONTINUO

  const pendiente = { estado: 'pendiente' }
  const regla120 =
    interruptor && retroalimentacion
      ? (() => {
          const permitido = barra * 1.2 - interruptor
          return {
            estado: retroalimentacion <= permitido ? 'ok' : 'danger',
            barra,
            permitido,
            retroalimentacion,
            // Potencia AC máxima que cabe en la barra por el lado de carga.
            potenciaMaxKw: Math.max(0, potenciaKva(permitido / FACTOR_CONTINUO, red)),
          }
        })()
      : pendiente

  const acometida =
    interruptor && retroalimentacion
      ? { estado: retroalimentacion <= interruptor ? 'ok' : 'danger', interruptor, retroalimentacion }
      : pendiente

  const uso = transformador && potenciaKw ? potenciaKw / transformador : null
  const transformadorCheck = uso == null ? pendiente : { estado: uso > 1 ? 'danger' : uso > 0.8 ? 'warn' : 'ok', uso, transformador }

  return {
    red,
    corrienteSolar,
    capacidadAcometidaKva: interruptor ? potenciaKva(interruptor, red) : null,
    regla120,
    acometida,
    transformador: transformadorCheck,
  }
}
