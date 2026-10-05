import { useMemo } from 'react'
import { aNumero, resumenConsumo } from '../lib/consumo.js'
import { DEFECTOS, dimensionarAuto, evaluarSistema } from '../lib/dimensionamiento.js'
import { esCompatible, getRed } from '../lib/electrico.js'
import { useEquipos } from './useEquipos.js'
import { useProyecto } from './useProyecto.js'

// Sistema FV del proyecto según el modo activo (automático u personalizado). Cualquier módulo puede
// usarlo para obtener panel, inversor, cantidades y la evaluación técnica ya calculada:
//   sistema = { panel, numPaneles, inversor, cantidad, evaluacion } | null
export function useDimensionamiento() {
  const { proyecto, actualizar } = useProyecto()
  const { catalogo } = useEquipos()
  const { dimensionamiento, red: datosRed, consumo, inversor: seleccion } = proyecto

  const red = getRed(datosRed.tension)
  const consumoKwh = resumenConsumo(consumo).promedioKwh
  const tempMin = dimensionamiento.tempMin !== '' && Number.isFinite(Number(dimensionamiento.tempMin)) ? Number(dimensionamiento.tempMin) : DEFECTOS.tempMin
  const parametros = useMemo(
    () => ({
      consumoKwh,
      hsp: aNumero(dimensionamiento.hsp) ?? DEFECTOS.hsp,
      pr: aNumero(dimensionamiento.pr) ?? DEFECTOS.pr,
      tempMin,
      areaTecho: aNumero(dimensionamiento.areaTecho),
      datosRed,
    }),
    [consumoKwh, dimensionamiento.hsp, dimensionamiento.pr, tempMin, dimensionamiento.areaTecho, datosRed],
  )

  const inversoresCompatibles = useMemo(
    () => catalogo.inversores.filter((inversor) => esCompatible(inversor, red)),
    [catalogo, red],
  )

  const auto = useMemo(
    () => dimensionarAuto({ ...parametros, paneles: catalogo.paneles, inversores: catalogo.inversores }),
    [parametros, catalogo],
  )

  const manual = useMemo(() => {
    const panel = catalogo.paneles.find((equipo) => equipo.id === dimensionamiento.panelId) ?? null
    const inversor = inversoresCompatibles.find((equipo) => equipo.id === seleccion.id) ?? null
    const numPaneles = Math.floor(aNumero(dimensionamiento.numPaneles) ?? 0)
    const cantidad = Math.max(1, Math.floor(aNumero(seleccion.cantidad) ?? 1))
    return { panel, numPaneles, inversor, cantidad, evaluacion: evaluarSistema({ ...parametros, panel, numPaneles, inversor, cantidad }) }
  }, [catalogo, inversoresCompatibles, dimensionamiento.panelId, dimensionamiento.numPaneles, seleccion, parametros])

  const esAuto = dimensionamiento.modo === 'auto'

  // Al pasar a personalizado se parte del resultado automático, si aún no hay nada elegido.
  const cambiarModo = (modo) => {
    actualizar('dimensionamiento', { modo })
    if (modo === 'manual' && auto && !dimensionamiento.panelId) {
      actualizar('dimensionamiento', { panelId: auto.panel.id, numPaneles: String(auto.numPaneles) })
      if (auto.inversor) actualizar('inversor', { id: auto.inversor.id, cantidad: String(auto.cantidad) })
    }
  }

  return {
    esAuto,
    cambiarModo,
    parametros,
    red,
    auto,
    sistema: esAuto ? auto : manual,
    paneles: catalogo.paneles,
    inversoresCompatibles,
    proyecto,
    actualizar,
  }
}
