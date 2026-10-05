import { useSyncExternalStore } from 'react'
import base from 'virtual:base-datos'
import { limpiarProyecto } from '../hooks/useProyecto.js'
import { guardarCaptura3d } from './captura3d.js'
import { aBase64, deBase64, derivarBits, descifrar, huellaUsuario, importarLlave, normalizarUsuario } from './cifrado.js'

// Sesión del usuario. La base de datos (datos/*.csv) llega cifrada dentro de la app; entrar es
// descifrarla con el usuario y la clave. Sin una clave válida no hay catálogo ni propuestas que mostrar.
//   estado: 'cargando' (recuperando una sesión abierta) | 'fuera' | 'dentro'
//   perfil: { usuario, nombre, rol, autor } · catalogo: equipos · propuestas: las de la base
//   ultimo: { año: mayor número de propuesta usado en la base } · configuracion: datos/configuracion.csv
const CLAVE = 'sds.sesion' // sessionStorage: la sesión dura lo que la pestaña
const CLAVE_ULTIMO = 'sds.sesion.usuario' // quién usó este navegador la última vez
const FUERA = { estado: 'fuera', perfil: null, catalogo: [], propuestas: [], ultimo: {}, configuracion: {} }

let sesion = { ...FUERA, estado: 'cargando' }
const oyentes = new Set()

function fijar(nueva) {
  sesion = nueva
  oyentes.forEach((oyente) => oyente())
}

export function suscribirSesion(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}
export const leerSesion = () => sesion
export const useSesion = () => useSyncExternalStore(suscribirSesion, leerSesion)

// Abre el sobre del usuario con los bits derivados de su clave y, con la llave que trae, el catálogo.
async function abrir(huella, bits) {
  const sobre = await descifrar(await importarLlave(bits), base.usuarios[huella])
  const comun = await descifrar(await importarLlave(deBase64(sobre.llave)), base.comun)
  return { estado: 'dentro', perfil: sobre.perfil, catalogo: comun.catalogo, propuestas: comun.propuestas, ultimo: comun.ultimo, configuracion: comun.configuracion ?? {} }
}

function recordar(valor) {
  try {
    if (valor) sessionStorage.setItem(CLAVE, JSON.stringify(valor))
    else sessionStorage.removeItem(CLAVE)
  } catch {
    // Sin almacenamiento de sesión solo se pierde el seguir dentro al recargar la página.
  }
}

// Devuelve true si entró. El mensaje de error es el mismo para usuario o clave incorrectos.
export async function iniciarSesion(usuario, clave) {
  const huella = await huellaUsuario(usuario)
  const sobre = base.usuarios[huella]
  try {
    // Con un usuario que no existe se hace el mismo trabajo, para no delatar cuáles existen.
    const bits = await derivarBits(clave, deBase64(sobre?.sal ?? 'AAAAAAAAAAAAAAAAAAAAAA=='), base.iteraciones)
    if (!sobre) return false
    const nueva = await abrir(huella, bits)
    // Si antes trabajó otra persona en este navegador, su proyecto en pantalla no se hereda.
    try {
      const anterior = localStorage.getItem(CLAVE_ULTIMO)
      if (anterior && anterior !== normalizarUsuario(usuario)) {
        limpiarProyecto()
        guardarCaptura3d(null)
      }
      localStorage.setItem(CLAVE_ULTIMO, normalizarUsuario(usuario))
    } catch {
      // Sin almacenamiento no hay proyecto guardado que proteger.
    }
    recordar({ huella, bits: aBase64(bits) })
    fijar(nueva)
    return true
  } catch {
    return false
  }
}

// Refleja en la sesión abierta un cambio ya escrito en la base (edición de una ficha de equipo).
export function cambiarCatalogo(cambio) {
  fijar({ ...sesion, catalogo: cambio(sesion.catalogo) })
}

export function cerrarSesion() {
  recordar(null)
  fijar(FUERA)
}

// Al cargar la página: si la pestaña ya tenía una sesión y la clave sigue siendo válida, se retoma.
;(async () => {
  try {
    const { huella, bits } = JSON.parse(sessionStorage.getItem(CLAVE))
    fijar(await abrir(huella, deBase64(bits)))
  } catch {
    recordar(null)
    fijar(FUERA)
  }
})()
