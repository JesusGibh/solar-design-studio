import { useSyncExternalStore } from 'react'
import { archivo, archivoActivo } from './archivo.js'
import { nube, nubeActiva } from './nube.js'
import { comprimir, guardarRender, leerRender } from './renders.js'
import { leerSesion, suscribirSesion } from './sesion.js'

// Historial de propuestas guardadas. Cada registro lleva un resumen para la lista, el usuario que la
// creó y el proyecto completo (`datos`) para poder reabrirlo.
// Con la hoja de Google Sheets conectada, ella es la fuente de verdad: la lista se sincroniza al
// entrar y al abrir Historial, y lo guardado sin conexión (pendiente: true) se sube en la siguiente
// sincronización. Sin hoja, la fuente es la base de datos (datos/propuestas.csv): en local se lee y
// se escribe directamente; en el sitio publicado llega la copia incluida al publicar.
// origen: 'nube' (viene de la hoja) | 'base' (viene de datos/) | sin origen (solo en este navegador).
// La vista previa del render 3D viaja aparte (ver renders.js): en datos.render_3d_preview dentro de
// datos/propuestas/<id>.json y, para la hoja, como imagen en Drive.
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

// El render pesa demasiado para localStorage: se pasa a IndexedDB y el registro queda liviano.
function aligerar(propuesta) {
  const render = propuesta.datos?.render_3d_preview
  if (!render) return propuesta
  guardarRender(propuesta.id, render)
  const { render_3d_preview: _render, ...datos } = propuesta.datos
  return { ...propuesta, datos }
}

// Mezcla lo que hay en la base con lo de este navegador. De cada propuesta queda la versión más
// reciente; las que vinieron de la base y ya no están en ella (se borró su fila) desaparecen.
function fusionar(deLaBase) {
  const base = deLaBase.filter((propuesta) => !eliminadas.includes(propuesta.id)).map((propuesta) => ({ ...aligerar(propuesta), origen: 'base' }))
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
  // Con la hoja conectada manda ella; si no hay conexión se sigue con lo que ya hay en este navegador.
  if (nubeActiva()) await sincronizarHistorial().catch(() => {})
  else await cargarDeLaBase().catch(() => fusionar(leerSesion().propuestas))
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
// de datos si se trabaja en local y a Google Sheets si está conectada. `captura` es la captura 3D
// vigente ({ imagen, paneles }) o null: se guarda comprimida como vista previa de la propuesta.
// Devuelve { enBase, enNube, error }: `error` describe lo que falló fuera del navegador.
export async function guardarPropuesta(registro, captura = null) {
  if (esAjena(buscarPropuesta(registro.id))) return { enBase: false, enNube: false, error: 'Esta propuesta es de otro usuario: cópiala como nueva para modificarla.', ajena: true }
  const pdf = buscarPropuesta(registro.id)?.pdf
  const propia = { ...registro, usuario: leerSesion().perfil?.usuario ?? '', ...(pdf && { pdf }) }
  const errores = []
  let enBase = false
  let enNube = false
  let render = null
  try {
    if (captura?.imagen) render = { imagen: await comprimir(captura.imagen), paneles: captura.paneles }
  } catch {
    // Sin vista previa: la propuesta se guarda igual.
  }
  await guardarRender(propia.id, render)
  if (archivoActivo) {
    try {
      await archivo.guardar(render ? { ...propia, datos: { ...propia.datos, render_3d_preview: render } } : propia)
      enBase = true
    } catch (error) {
      errores.push(error.message)
    }
  }
  if (nubeActiva()) {
    try {
      await nube.guardar(propia)
      enNube = true
    } catch (error) {
      errores.push(error.message === 'Failed to fetch' ? 'sin conexión con la hoja; se subirá sola al volver la conexión' : `Google Sheets: ${error.message}`)
    }
    // La imagen va aparte: no cabe en una celda de la hoja.
    if (enNube && render) await nube.guardarRender(propia.id, render).catch((error) => errores.push(`Render 3D en Drive: ${/desconocida/i.test(error.message) ? 'actualiza el script de la hoja' : error.message}`))
  }
  // Si la hoja está conectada y no respondió, queda pendiente y se sube en la próxima sincronización.
  const estado = enNube ? { origen: 'nube' } : nubeActiva() ? { pendiente: true } : enBase ? { origen: 'base' } : {}
  fijar([{ ...propia, ...estado }, ...lista.filter((propuesta) => propuesta.id !== propia.id)])
  return { enBase, enNube, error: errores.join(' ') || undefined }
}

// Vista previa del render 3D de una propuesta guardada, o null: primero la de este navegador y,
// si no está, la de la hoja compartida.
export async function renderDePropuesta(id) {
  const local = await leerRender(id)
  if (local || !nubeActiva()) return local
  try {
    const remoto = await nube.leerRender(id)
    if (remoto) await guardarRender(id, remoto)
    return remoto
  } catch {
    return null
  }
}

// Sube el PDF de una propuesta a la carpeta de Drive de la hoja y anota su enlace en el historial.
// Devuelve { url, carpeta }, o null si no hay hoja conectada.
export async function subirPdfPropuesta(id, nombre, base64) {
  if (!nubeActiva()) return null
  const resultado = await nube.subirPdf(id, nombre, base64)
  fijar(lista.map((propuesta) => (propuesta.id === id ? { ...propuesta, pdf: resultado.url } : propuesta)))
  return resultado
}

export async function eliminarPropuesta(id) {
  if (archivoActivo) await archivo.eliminar(id)
  else {
    eliminadas = [...new Set([...eliminadas, id])]
    guardarLocal(CLAVE_ELIMINADAS, eliminadas)
  }
  fijar(lista.filter((propuesta) => propuesta.id !== id))
  await guardarRender(id, null)
  if (nubeActiva()) await nube.eliminar(id)
}

// Sincroniza con la hoja de Google Sheets, que es la fuente de verdad: la lista queda como la hoja.
// Antes se suben las propuestas propias guardadas sin conexión. Si la hoja no responde lanza un
// error y la lista de este navegador no se toca. Devuelve cuántas propuestas hay en la hoja.
let sincronizando = null
export function sincronizarHistorial() {
  sincronizando ??= (async () => {
    for (const pendiente of lista.filter((propuesta) => propuesta.pendiente && !esAjena(propuesta))) {
      const { pendiente: _pendiente, origen: _origen, ...registro } = pendiente
      await nube.guardar(registro)
      const render = await leerRender(registro.id)
      if (render) await nube.guardarRender(registro.id, render).catch(() => {})
    }
    const remotas = (await nube.listar()).filter((propuesta) => propuesta.id && propuesta.datos)
    fijar(remotas.map((propuesta) => ({ ...propuesta, origen: 'nube' })))
    return remotas.length
  })().finally(() => {
    sincronizando = null
  })
  return sincronizando
}

// Mayor número de propuesta de un año que se conoce en este navegador.
export function ultimoNumeroConocido(anio) {
  const numeros = lista.map((propuesta) => String(propuesta.id).match(/^PROP-(\d{4})-(\d+)$/)).filter((partes) => partes && Number(partes[1]) === anio)
  return Math.max(0, leerSesion().ultimo?.[anio] ?? 0, ...numeros.map((partes) => Number(partes[2])))
}
