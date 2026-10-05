import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATEGORIES } from '../config/equipos.js'
import { archivo, archivoActivo } from '../lib/archivo.js'
import { agregarRegistros } from '../lib/fichas/registros.js'
import { cambiarCatalogo, useSesion } from '../lib/sesion.js'
import { fetchEquipos } from '../lib/sheets.js'

const STORAGE_KEY = 'sds.equipos.v2'

const VACIO = { reemplazos: {}, agregados: [], fuentes: {}, ediciones: {}, eliminados: {} }

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (stored) return { ...VACIO, ...stored }
  } catch {
    // Sin almacenamiento disponible o dato corrupto: se usa el catálogo base.
  }
  return VACIO
}

const categoriaDe = (categoryId) => CATEGORIES.find((category) => category.id === categoryId).categoria

// Catálogo de equipos. En localStorage solo se guardan los cambios del usuario sobre el catálogo base
// (así una nueva versión de la base de datos se ve de inmediato y lo cargado sigue disponible offline):
//   reemplazos: categorías cargadas desde Google Sheets · agregados: registros extraídos de PDFs subidos
//   fuentes: enlace y fecha de la última carga de cada categoría
//   ediciones / eliminados: fichas editadas o borradas en el sitio publicado, donde no se puede escribir
//   en la base (trabajando en local esos cambios van directo a datos/*.csv)
// Devuelve `catalogo` (las fichas activas, para dimensionar) y `completo` (también las desactivadas).
export function useEquipos() {
  const [state, setState] = useState(readStored)
  // Catálogo base: los equipos de la base de datos (datos/*.csv), disponibles al iniciar sesión.
  const { catalogo: equipos } = useSesion()
  const BASE = useMemo(
    () => Object.fromEntries(CATEGORIES.map(({ id, categoria }) => [id, equipos.filter((registro) => registro.categoria === categoria)])),
    [equipos],
  )

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Almacenamiento lleno o bloqueado: el catálogo sigue funcionando en memoria.
    }
  }, [state])

  const completo = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map(({ id, categoria }) => [
          id,
          agregarRegistros(
            state.reemplazos[id] ?? BASE[id],
            state.agregados.filter((registro) => registro.categoria === categoria),
          )
            .filter((registro) => !(registro.id in state.eliminados))
            .map((registro) => state.ediciones[registro.id] ?? registro),
        ]),
      ),
    [state, BASE],
  )

  const catalogo = useMemo(
    () => Object.fromEntries(Object.entries(completo).map(([id, registros]) => [id, registros.filter((registro) => registro.activo !== false)])),
    [completo],
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

  // Guarda los cambios de una ficha (también activarla o desactivarla, con `activo`).
  // Devuelve true si quedó en la base de datos, false si solo en este navegador.
  const guardarEquipo = useCallback(async (categoryId, equipo) => {
    if (archivoActivo) {
      await archivo.guardarEquipo(categoryId, equipo)
      cambiarCatalogo((lista) => (lista.some((otro) => otro.id === equipo.id) ? lista.map((otro) => (otro.id === equipo.id ? equipo : otro)) : [...lista, equipo]))
    }
    const cambiar = (lista) => lista?.map((otro) => (otro.id === equipo.id ? equipo : otro))
    setState((prev) => ({
      ...prev,
      // Si la ficha venía de un PDF subido o de una hoja cargada en este navegador, se corrige ahí también.
      reemplazos: prev.reemplazos[categoryId] ? { ...prev.reemplazos, [categoryId]: cambiar(prev.reemplazos[categoryId]) } : prev.reemplazos,
      agregados: cambiar(prev.agregados),
      ediciones: archivoActivo ? prev.ediciones : { ...prev.ediciones, [equipo.id]: equipo },
    }))
    return archivoActivo
  }, [])

  const eliminarEquipo = useCallback(async (categoryId, id) => {
    if (archivoActivo) {
      await archivo.eliminarEquipo(categoryId, id)
      cambiarCatalogo((lista) => lista.filter((otro) => otro.id !== id))
    }
    const quitar = (lista) => lista?.filter((otro) => otro.id !== id)
    setState((prev) => {
      const { [id]: _edicion, ...ediciones } = prev.ediciones
      return {
        ...prev,
        reemplazos: prev.reemplazos[categoryId] ? { ...prev.reemplazos, [categoryId]: quitar(prev.reemplazos[categoryId]) } : prev.reemplazos,
        agregados: quitar(prev.agregados),
        ediciones,
        eliminados: archivoActivo ? prev.eliminados : { ...prev.eliminados, [id]: categoriaDe(categoryId) },
      }
    })
    return archivoActivo
  }, [])

  // Descarta todo lo cambiado en este navegador para una categoría y vuelve a la base de datos.
  const restaurar = useCallback((categoryId) => {
    const categoria = categoriaDe(categoryId)
    setState((prev) => {
      const { [categoryId]: _reemplazo, ...reemplazos } = prev.reemplazos
      const { [categoryId]: _fuente, ...fuentes } = prev.fuentes
      return {
        reemplazos,
        fuentes,
        agregados: prev.agregados.filter((registro) => registro.categoria !== categoria),
        ediciones: Object.fromEntries(Object.entries(prev.ediciones).filter(([, registro]) => registro.categoria !== categoria)),
        eliminados: Object.fromEntries(Object.entries(prev.eliminados).filter(([, deCategoria]) => deCategoria !== categoria)),
      }
    })
  }, [])

  const modificadas = useMemo(
    () =>
      new Set(
        CATEGORIES.filter(
          ({ id, categoria }) =>
            state.reemplazos[id] ||
            state.agregados.some((registro) => registro.categoria === categoria) ||
            Object.values(state.ediciones).some((registro) => registro.categoria === categoria) ||
            Object.values(state.eliminados).includes(categoria),
        ).map(({ id }) => id),
      ),
    [state],
  )

  return { catalogo, completo, fuentes: state.fuentes, modificadas, cargarDesdeSheet, reemplazarCatalogo, agregar, guardarEquipo, eliminarEquipo, restaurar }
}
