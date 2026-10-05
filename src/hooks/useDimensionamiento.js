import { useMemo } from 'react'
import { aNumero, resumenConsumo } from '../lib/consumo.js'
import { DEFECTOS, dimensionarAuto, evaluarSistema, marcasDe } from '../lib/dimensionamiento.js'
import { esCompatible, getRed } from '../lib/electrico.js'
import { useEquipos } from './useEquipos.js'
import { useProyecto } from './useProyecto.js'

// Sistema FV del proyecto según el modo activo (automático o personalizado). Cualquier módulo puede
// usarlo para obtener panel, inversor, cantidades y la evaluación técnica ya calculada:
//   sistema = { panel, numPaneles, inversor, cantidad, evaluacion } | null
export function useDimensionamiento() {
  const { proyecto, actualizar } = useProyecto()
  const { catalogo } = useEquipos()
  const { dimensionamiento, red: datosRed, consumo, inversor: seleccion } = proyecto

  const red = getRed(datosRed.tension)
  const resumen = useMemo(() => resumenConsumo(consumo), [consumo])
  const tempMin = dimensionamiento.tempMin !== '' && Number.isFinite(Number(dimensionamiento.tempMin)) ? Number(dimensionamiento.tempMin) : DEFECTOS.tempMin
  const parametros = useMemo(
    () => ({
      anualKwh: resumen.anualKwh,
      cobertura: aNumero(dimensionamiento.cobertura) ?? DEFECTOS.cobertura,
      hsp: aNumero(dimensionamiento.hsp) ?? DEFECTOS.hsp,
      pr: aNumero(dimensionamiento.pr) ?? DEFECTOS.pr,
      tempMin,
      areaTecho: aNumero(dimensionamiento.areaTecho),
      datosRed,
    }),
    [resumen.anualKwh, dimensionamiento.cobertura, dimensionamiento.hsp, dimensionamiento.pr, tempMin, dimensionamiento.areaTecho, datosRed],
  )

  const inversoresCompatibles = useMemo(
    () => catalogo.inversores.filter((inversor) => esCompatible(inversor, red)),
    [catalogo, red],
  )

  // Marcas reales del catálogo; las de inversor, solo las que tienen equipos para la red elegida.
  const marcasPanel = useMemo(() => marcasDe(catalogo.paneles), [catalogo])
  const marcasInversor = useMemo(() => marcasDe(inversoresCompatibles), [inversoresCompatibles])
  // Una marca guardada que ya no aplica (otra red, catálogo distinto) equivale a "cualquiera".
  const marcaPanel = marcasPanel.includes(dimensionamiento.marcaPanel) ? dimensionamiento.marcaPanel : ''
  const marcaInversor = marcasInversor.includes(dimensionamiento.marcaInversor) ? dimensionamiento.marcaInversor : ''

  const auto = useMemo(
    () => dimensionarAuto({ ...parametros, paneles: catalogo.paneles, inversores: catalogo.inversores, marcaPanel, marcaInversor }),
    [parametros, catalogo, marcaPanel, marcaInversor],
  )
  const autoValido = auto && !auto.sinPanel ? auto : null

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
    if (modo === 'manual' && autoValido && !dimensionamiento.panelId) {
      actualizar('dimensionamiento', { panelId: autoValido.panel.id, numPaneles: String(autoValido.numPaneles) })
      if (autoValido.inversor) actualizar('inversor', { id: autoValido.inversor.id, cantidad: String(autoValido.cantidad) })
    }
  }

  return {
    esAuto,
    cambiarModo,
    parametros,
    resumen,
    red,
    auto,
    sistema: esAuto ? autoValido : manual,
    paneles: catalogo.paneles,
    inversoresCompatibles,
    marcasPanel,
    marcasInversor,
    proyecto,
    actualizar,
  }
}
