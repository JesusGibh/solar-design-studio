import { useSyncExternalStore } from 'react'
import { archivo, archivoActivo } from './archivo.js'
import { nube, nubeActiva } from './nube.js'
import { leerSesion, suscribirSesion } from './sesion.js'

// Historial de propuestas guardadas. Cada registro lleva un resumen para la lista, el usuario que la
// creó y el proyecto completo (`datos`) para poder reabrirlo.
// La fuente es la base de datos (datos/propuestas.csv): trabajando en local se lee y se escribe en
// ella directamente; en el sitio publicado llega la copia incluida al publicar y lo nuevo se guarda
// en este navegador hasta exportarlo. Los registros que vienen de la base llevan origen: 'base'.
const CLAVE = 'sds.historial.v1'
const CLAVE_ELIMINADAS = 'sds.historial.eliminadas'
const oyentes = new Set()

function leerGuardado(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? []
  } catch {
    return [] // sin almacenamiento o dato corrupto
  }
}

let lista = leerGuardado(CLAVE)
// Propuestas de la base borradas aquí: en el sitio publicado no se pueden quitar del archivo, así que
// se recuerdan para no volver a mostrarlas.
let eliminadas = leerGuardado(CLAVE_ELIMINADAS)

function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Cuota llena: el historial sigue en memoria durante la sesión.
  }
}

function fijar(nueva) {
  // Las más recientes primero.
  lista = [...nueva].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
  guardarLocal(CLAVE, lista)
  oyentes.forEach((oyente) => oyente())
}

const suscribir = (oyente) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

// Todos los usuarios ven las propuestas de todos.
export const useHistorial = () => useSyncExternalStore(suscribir, () => lista)

// Una propuesta solo la edita quien la creó; los demás pueden verla y copiarla como nueva.
// Las guardadas antes de existir los usuarios no tienen dueño y se pueden editar.
export const esAjena = (propuesta) => Boolean(propuesta?.usuario) && propuesta.usuario !== leerSesion().perfil?.usuario
export const buscarPropuesta = (id) => lista.find((propuesta) => propuesta.id === id)

// Mezcla lo que hay en la base con lo de este navegador. De cada propuesta queda la versión más
// reciente; las que vinieron de la base y ya no están en ella (se borró su fila) desaparecen.
function fusionar(deLaBase) {
  const base = deLaBase.filter((propuesta) => !eliminadas.includes(propuesta.id)).map((propuesta) => ({ ...propuesta, origen: 'base' }))
  const porId = new Map(base.map((propuesta) => [propuesta.id, propuesta]))
  for (const local of lista) {
    const remota = porId.get(local.id)
    if (remota ? String(local.fecha) > String(remota.fecha) : local.origen !== 'base') porId.set(local.id, local)
  }
  fijar([...porId.values()])
}

// Trae las propuestas de la base de datos. Devuelve cuántas hay en ella.
export async function cargarDeLaBase() {
  const { propuestas } = leerSesion()
  const deLaBase = archivoActivo ? await archivo.listar() : propuestas
  fusionar(deLaBase)
  return deLaBase.length
}

// Al entrar un usuario se carga lo que le corresponde de la base.
let usuarioCargado = null
const alCambiarSesion = async () => {
  const usuario = leerSesion().perfil?.usuario ?? null
  if (usuario === usuarioCargado) return // la sesión cambió por otra cosa (p. ej. se editó una ficha)
  usuarioCargado = usuario
  if (!usuario) return
  await cargarDeLaBase().catch(() => fusionar(leerSesion().propuestas))
  // Con la hoja compartida conectada, lo que hayan guardado los demás llega al entrar.
  if (nubeActiva()) sincronizarHistorial().catch(() => {})
}
suscribirSesion(alCambiarSesion)
alCambiarSesion()

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

// Guarda (o actualiza, si el número ya existe). Siempre queda en este navegador; además va a la base
// de datos si se trabaja en local y a Google Sheets si está conectada.
// Devuelve { enBase, enNube, error }: `error` describe lo que falló fuera del navegador.
export async function guardarPropuesta(registro) {
  if (esAjena(buscarPropuesta(registro.id))) return { enBase: false, enNube: false, error: 'Esta propuesta es de otro usuario: cópiala como nueva para modificarla.', ajena: true }
  const propia = { ...registro, usuario: leerSesion().perfil?.usuario ?? '' }
  const errores = []
  let enBase = false
  let enNube = false
  if (archivoActivo) {
    try {
      await archivo.guardar(propia)
      enBase = true
    } catch (error) {
      errores.push(error.message)
    }
  }
  fijar([enBase ? { ...propia, origen: 'base' } : propia, ...lista.filter((propuesta) => propuesta.id !== propia.id)])
  if (nubeActiva()) {
    try {
      await nube.guardar(propia)
      enNube = true
    } catch (error) {
      errores.push(`Google Sheets: ${error.message}`)
    }
  }
  return { enBase, enNube, error: errores.join(' ') || undefined }
}

export async function eliminarPropuesta(id) {
  if (archivoActivo) await archivo.eliminar(id)
  else {
    eliminadas = [...new Set([...eliminadas, id])]
    guardarLocal(CLAVE_ELIMINADAS, eliminadas)
  }
  fijar(lista.filter((propuesta) => propuesta.id !== id))
  if (nubeActiva()) await nube.eliminar(id)
}

// Trae las propuestas de la hoja de Google Sheets. Lo de la hoja manda; lo que solo existe aquí se conserva.
export async function sincronizarHistorial() {
  const remotas = (await nube.listar()).filter((propuesta) => propuesta.id && propuesta.datos)
  const ids = new Set(remotas.map((propuesta) => propuesta.id))
  fijar([...remotas, ...lista.filter((propuesta) => !ids.has(propuesta.id))])
  return remotas.length
}

// Mayor número de propuesta de un año que se conoce en este navegador.
export function ultimoNumeroConocido(anio) {
  const numeros = lista.map((propuesta) => String(propuesta.id).match(/^PROP-(\d{4})-(\d+)$/)).filter((partes) => partes && Number(partes[1]) === anio)
  return Math.max(0, leerSesion().ultimo?.[anio] ?? 0, ...numeros.map((partes) => Number(partes[2])))
}
