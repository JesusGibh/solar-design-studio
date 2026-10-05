import { useMemo } from 'react'
import { aNumero, resumenConsumo } from '../lib/consumo.js'
import { DEFECTOS, dimensionarAuto, elegirPanel, evaluarSistema, marcasDe } from '../lib/dimensionamiento.js'
import { esCompatible, getRed } from '../lib/electrico.js'
import { analizarTecho } from '../lib/geometria.js'
import { useEquipos } from './useEquipos.js'
import { useProyecto } from './useProyecto.js'

// Número que admite cero y negativos (temperatura, inclinación); '' o no numérico -> defecto.
const numero = (valor, defecto) => (valor !== '' && Number.isFinite(Number(valor)) ? Number(valor) : defecto)

// Sistema FV del proyecto según el modo activo (automático o personalizado). Cualquier módulo puede
// usarlo para obtener panel, inversor, cantidades y la evaluación técnica ya calculada:
//   sistema = { panel, numPaneles, inversor, cantidad, evaluacion } | null
//   techo   = medición y empaquetado del techo trazado para el panel del sistema (o null si no hay trazo)
export function useDimensionamiento() {
  const { proyecto, actualizar } = useProyecto()
  const { catalogo } = useEquipos()
  const { dimensionamiento, red: datosRed, consumo, inversor: seleccion, techo: datosTecho } = proyecto

  const red = getRed(datosRed.tension)
  const esAuto = dimensionamiento.modo === 'auto'
  const resumen = useMemo(() => resumenConsumo(consumo), [consumo])

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

  // El panel se conoce antes que la cantidad, así que el techo se puede llenar primero y su
  // capacidad física entra como límite al dimensionamiento.
  const panel = useMemo(
    () =>
      esAuto
        ? elegirPanel(catalogo.paneles, marcaPanel, dimensionamiento.panelAutoId)
        : (catalogo.paneles.find((equipo) => equipo.id === dimensionamiento.panelId) ?? null),
    [esAuto, catalogo, marcaPanel, dimensionamiento.panelAutoId, dimensionamiento.panelId],
  )

  const techo = useMemo(
    () =>
      analizarTecho({
        vertices: datosTecho.vertices,
        panel,
        orientacion: datosTecho.orientacion,
        inclinacion: Math.min(60, Math.max(0, numero(datosTecho.inclinacion, 0))),
        retranqueo: Math.max(0, numero(datosTecho.retranqueo, 0.5)),
        azimutManual: datosTecho.azimut === '' ? null : numero(datosTecho.azimut, null),
        pasillos: {
          columnas: { cada: Math.floor(aNumero(datosTecho.pasilloCadaPaneles) ?? 0), ancho: (aNumero(datosTecho.pasilloPanelesCm) ?? 0) / 100 },
          filas: { cada: Math.floor(aNumero(datosTecho.pasilloCadaFilas) ?? 0), ancho: (aNumero(datosTecho.pasilloFilasCm) ?? 0) / 100 },
        },
      }),
    // Solo la geometría: mover el mapa o acomodar paneles no debe recalcular (ni redibujar en 3D) el techo.
    [
      datosTecho.vertices,
      datosTecho.orientacion,
      datosTecho.inclinacion,
      datosTecho.retranqueo,
      datosTecho.azimut,
      datosTecho.pasilloCadaPaneles,
      datosTecho.pasilloPanelesCm,
      datosTecho.pasilloCadaFilas,
      datosTecho.pasilloFilasCm,
      panel,
    ],
  )

  const parametros = useMemo(
    () => ({
      anualKwh: resumen.anualKwh,
      cobertura: aNumero(dimensionamiento.cobertura) ?? DEFECTOS.cobertura,
      hsp: aNumero(dimensionamiento.hsp) ?? DEFECTOS.hsp,
      pr: aNumero(dimensionamiento.pr) ?? DEFECTOS.pr,
      perfil: dimensionamiento.perfilSolar,
      tempMin: numero(dimensionamiento.tempMin, DEFECTOS.tempMin),
      // Con techo trazado, su área y su conteo físico sustituyen al área escrita a mano.
      areaTecho: techo ? techo.areaM2 : aNumero(dimensionamiento.areaTecho),
      maxPanelesTecho: techo?.cantidad ?? undefined,
      datosRed,
    }),
    [
      resumen.anualKwh,
      dimensionamiento.cobertura,
      dimensionamiento.hsp,
      dimensionamiento.pr,
      dimensionamiento.perfilSolar,
      dimensionamiento.tempMin,
      dimensionamiento.areaTecho,
      techo,
      datosRed,
    ],
  )

  const auto = useMemo(
    () =>
      dimensionarAuto({
        ...parametros,
        ajustarATecho: dimensionamiento.ajustarATecho,
        paneles: catalogo.paneles,
        inversores: catalogo.inversores,
        marcaPanel,
        marcaInversor,
        panelId: dimensionamiento.panelAutoId,
        inversorId: dimensionamiento.inversorAutoId,
      }),
    [parametros, dimensionamiento.ajustarATecho, dimensionamiento.panelAutoId, dimensionamiento.inversorAutoId, catalogo, marcaPanel, marcaInversor],
  )
  const autoValido = auto && !auto.sinPanel ? auto : null

  const manual = useMemo(() => {
    const inversor = inversoresCompatibles.find((equipo) => equipo.id === seleccion.id) ?? null
    const numPaneles = Math.floor(aNumero(dimensionamiento.numPaneles) ?? 0)
    const cantidad = Math.max(1, Math.floor(aNumero(seleccion.cantidad) ?? 1))
    return { panel, numPaneles, inversor, cantidad, evaluacion: evaluarSistema({ ...parametros, panel, numPaneles, inversor, cantidad }) }
  }, [panel, inversoresCompatibles, dimensionamiento.numPaneles, seleccion, parametros])

  // Al pasar a personalizado se parte del resultado automático, si aún no hay nada elegido.
  const cambiarModo = (modo) => {
    actualizar('dimensionamiento', { modo })
    if (modo === 'manual' && autoValido && !dimensionamiento.panelId) {
      actualizar('dimensionamiento', { panelId: autoValido.panel.id, numPaneles: String(autoValido.numPaneles) })
      if (autoValido.inversor) actualizar('inversor', { id: autoValido.inversor.id, cantidad: String(autoValido.cantidad) })
    }
  }

  const sistema = esAuto ? autoValido : manual
  // Cuántos paneles sobran respecto a lo que cabe en el techo (0 si caben o no hay límite conocido).
  const maximoTecho = sistema?.evaluacion.techo.maxPaneles ?? null
  const excesoTecho = sistema && maximoTecho != null ? Math.max(0, (esAuto ? autoValido.numRequeridos : sistema.numPaneles) - maximoTecho) : 0

  // "Ajustar al máximo del techo": en automático activa el recorte; en personalizado fija la cantidad.
  const ajustarAlTecho = () => {
    if (maximoTecho == null) return
    actualizar('dimensionamiento', esAuto ? { ajustarATecho: true } : { numPaneles: String(maximoTecho) })
  }

  // Posiciones del techo que llevan panel. Por defecto las primeras N del empaquetado; si el usuario
  // acomodó paneles a mano en la vista 3D (y la cuadrícula no ha cambiado), manda su selección.
  const firmaTecho = techo?.cantidad ? `${panel?.id}|${techo.cantidad}|${techo.rectangulos[0][0].map((n) => n.toFixed(6))}|${techo.rectangulos.at(-1)[2].map((n) => n.toFixed(6))}` : null
  const acomodoValido = Boolean(firmaTecho) && datosTecho.acomodo?.firma === firmaTecho
  // Sin sistema dimensionado todavía (falta el consumo), el techo se muestra lleno: así los paneles
  // aparecen en cuanto se traza y se ve cuántos caben.
  const numSistema = sistema ? sistema.numPaneles : (techo?.cantidad ?? 0)
  const ocupados = useMemo(() => {
    if (!techo?.cantidad) return []
    if (acomodoValido) return datosTecho.acomodo.indices.filter((indice) => indice < techo.cantidad)
    return Array.from({ length: Math.min(numSistema, techo.cantidad) }, (_, indice) => indice)
  }, [techo, acomodoValido, datosTecho.acomodo, numSistema])

  // Alterna un panel en una posición; la primera vez parte del relleno automático que se estaba viendo.
  const alternarPanel = (indice) => {
    const indices = ocupados.includes(indice) ? ocupados.filter((actual) => actual !== indice) : [...ocupados, indice].sort((a, b) => a - b)
    actualizar('techo', { acomodo: { firma: firmaTecho, indices } })
  }
  const rellenoAutomatico = () => actualizar('techo', { acomodo: null })
  // Lleva al sistema la cantidad de paneles colocados a mano (pasa a configuración personalizada).
  const usarColocados = () => {
    if (!panel) return
    if (sistema?.inversor) actualizar('inversor', { id: sistema.inversor.id, cantidad: String(sistema.cantidad) })
    actualizar('dimensionamiento', { modo: 'manual', panelId: panel.id, numPaneles: String(ocupados.length) })
  }

  return {
    esAuto,
    cambiarModo,
    parametros,
    resumen,
    red,
    auto,
    sistema,
    techo,
    ocupados,
    acomodoManual: acomodoValido,
    alternarPanel,
    rellenoAutomatico,
    usarColocados,
    maximoTecho,
    excesoTecho,
    ajustarAlTecho,
    paneles: catalogo.paneles,
    baterias: catalogo.baterias,
    inversoresCompatibles,
    marcasPanel,
    marcasInversor,
    proyecto,
    actualizar,
  }
}
