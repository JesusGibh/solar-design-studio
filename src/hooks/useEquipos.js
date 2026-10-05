import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORIES } from '../config/equipos.js'
import fichas from '../data/catalogo_equipos.json'
import { agregarRegistros } from '../lib/fichas/registros.js'
import { fetchEquipos } from '../lib/sheets.js'

const STORAGE_KEY = 'sds.equipos.v2'

// Catálogo base: únicamente lo extraído de las fichas técnicas (scripts/procesar_fichas.js).
const BASE = Object.fromEntries(
  CATEGORIES.map(({ id, categoria }) => [id, fichas.filter((registro) => registro.categoria === categoria)]),
)

const VACIO = { reemplazos: {}, agregados: [], fuentes: {} }

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (stored) return { ...VACIO, ...stored }
  } catch {
    // Sin almacenamiento disponible o dato corrupto: se usa el catálogo base.
  }
  return VACIO
}

// Catálogo de equipos. En localStorage solo se guardan los cambios del usuario sobre el catálogo base
// (así una nueva versión de catalogo_equipos.json se ve de inmediato y lo cargado sigue disponible offline):
//   reemplazos: categorías cargadas desde Google Sheets · agregados: registros extraídos de PDFs subidos
//   fuentes: enlace y fecha de la última carga de cada categoría
export function useEquipos() {
  const [state, setState] = useState(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Almacenamiento lleno o bloqueado: el catálogo sigue funcionando en memoria.
    }
  }, [state])

  const catalogo = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map(({ id, categoria }) => [
          id,
          agregarRegistros(
            state.reemplazos[id] ?? BASE[id],
            state.agregados.filter((registro) => registro.categoria === categoria),
          ),
        ]),
      ),
    [state],
  )

  const cargarDesdeSheet = useCallback(async (categoryId, url) => {
    const resultado = await fetchEquipos(categoryId, url)
    setState((prev) => ({
      ...prev,
      reemplazos: { ...prev.reemplazos, [categoryId]: resultado.equipos },
      fuentes: { ...prev.fuentes, [categoryId]: { url, fecha: new Date().toISOString() } },
    }))
    return resultado
  }, [])

  // Sustituye categorías enteras por lo traído de la hoja de propuestas (solo las que traen equipos).
  const reemplazarCatalogo = useCallback((porCategoria, origen) => {
    setState((prev) => {
      const reemplazos = { ...prev.reemplazos }
      const fuentes = { ...prev.fuentes }
      for (const [id, equipos] of Object.entries(porCategoria)) {
        if (!equipos?.length) continue
        reemplazos[id] = equipos
        fuentes[id] = { url: origen, fecha: new Date().toISOString() }
      }
      return { ...prev, reemplazos, fuentes }
    })
  }, [])

  const agregar = useCallback((registros) => {
    setState((prev) => ({ ...prev, agregados: agregarRegistros(prev.agregados, registros) }))
  }, [])

  const restaurar = useCallback((categoryId) => {
    const { categoria } = CATEGORIES.find((category) => category.id === categoryId)
    setState((prev) => {
      const { [categoryId]: _reemplazo, ...reemplazos } = prev.reemplazos
      const { [categoryId]: _fuente, ...fuentes } = prev.fuentes
      return { reemplazos, fuentes, agregados: prev.agregados.filter((registro) => registro.categoria !== categoria) }
    })
  }, [])

  const modificadas = useMemo(
    () => new Set(CATEGORIES.filter(({ id, categoria }) => state.reemplazos[id] || state.agregados.some((registro) => registro.categoria === categoria)).map(({ id }) => id)),
    [state],
  )

  return { catalogo, fuentes: state.fuentes, modificadas, cargarDesdeSheet, reemplazarCatalogo, agregar, restaurar }
}
