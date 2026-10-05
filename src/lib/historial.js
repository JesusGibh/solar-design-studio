import { useSyncExternalStore } from 'react'
import { nube, nubeActiva } from './nube.js'

// Historial de propuestas guardadas. Cada registro lleva un resumen para la lista y el proyecto
// completo (`datos`) para poder reabrirlo. Vive en este navegador y, con la hoja de Google Sheets
// conectada, también en su pestaña "Propuestas", que pasa a ser la copia compartida.
const CLAVE = 'sds.historial.v1'
const oyentes = new Set()

let lista = []
try {
  lista = JSON.parse(localStorage.getItem(CLAVE)) ?? []
} catch {
  // Sin almacenamiento o dato corrupto: se empieza con el historial vacío.
}

function fijar(nueva) {
  // Las más recientes primero.
  lista = [...nueva].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista))
  } catch {
    // Cuota llena: el historial sigue en memoria durante la sesión.
  }
  oyentes.forEach((oyente) => oyente())
}

const suscribir = (oyente) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}
export const useHistorial = () => useSyncExternalStore(suscribir, () => lista)

// Resumen + proyecto completo de la propuesta actual.
export function registroDe({ proyecto, sistema, proyeccion, marca, autor }) {
  return {
    id: proyecto.propuesta.id,
    fecha: new Date().toISOString(),
    cliente: proyecto.propuesta.cliente,
    direccion: proyecto.propuesta.direccion,
    marca: marca.nombre,
    autor: autor.firma ?? autor.nombre,
    kwp: sistema?.evaluacion.kwp ?? '',
    paneles: sistema?.numPaneles ?? '',
    inversor: sistema?.inversor ? `${sistema.cantidad} × ${sistema.inversor.marca} ${sistema.inversor.modelo}` : '',
    inversion: proyeccion ? Math.round(proyeccion.costoTotal) : '',
    ahorro_anual: proyeccion ? Math.round(proyeccion.ahorroAnual) : '',
    retorno_anios: proyeccion?.payback != null ? Number(proyeccion.payback.toFixed(1)) : '',
    datos: proyecto,
  }
}

// Guarda (o actualiza, si el id ya existe) en este navegador y, si hay conexión, en la hoja.
// Devuelve { enNube } o { enNube: false, error } si la hoja falló: el guardado local ya quedó hecho.
export async function guardarPropuesta(registro) {
  fijar([registro, ...lista.filter((propuesta) => propuesta.id !== registro.id)])
  if (!nubeActiva()) return { enNube: false }
  try {
    await nube.guardar(registro)
    return { enNube: true }
  } catch (error) {
    return { enNube: false, error: error.message }
  }
}

export async function eliminarPropuesta(id) {
  fijar(lista.filter((propuesta) => propuesta.id !== id))
  if (nubeActiva()) await nube.eliminar(id)
}

// Trae las propuestas de la hoja. Lo de la hoja manda; lo que solo existe aquí se conserva.
export async function sincronizarHistorial() {
  const remotas = (await nube.listar()).filter((propuesta) => propuesta.id && propuesta.datos)
  const ids = new Set(remotas.map((propuesta) => propuesta.id))
  fijar([...remotas, ...lista.filter((propuesta) => !ids.has(propuesta.id))])
  return remotas.length
}
