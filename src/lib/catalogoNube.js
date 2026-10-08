import { CATEGORIES, COLUMNAS_META } from '../config/equipos.js'
import { slug } from './fichas/registros.js'
import { nube, nubeActiva } from './nube.js'
import { cambiarCatalogo, leerSesion, suscribirSesion } from './sesion.js'

// Catálogo de equipos en la hoja compartida de Google Sheets (pestañas Paneles, Inversores, Baterias
// y RSD). Con la hoja conectada, ella es el repositorio maestro: al entrar se lee de ahí, y cada
// ficha editada se envía de inmediato. Sin conexión se usa la última copia leída y, si no hay,
// el catálogo incluido en la app al publicar.
const CLAVE = 'sds.catalogo.nube'

// Columnas de cada pestaña: id y categoría, los campos de la app y las marcas OCR / activo.
export const COLUMNAS_HOJA = Object.fromEntries(CATEGORIES.map(({ id, fields }) => [id, ['id', 'categoria', ...fields.map((field) => field.key), ...COLUMNAS_META]]))

const esNo = (valor) => valor === false || /^(no|false|0)$/i.test(String(valor))

// Filas leídas de la hoja -> registros del catálogo, agrupados por categoría.
export function aCatalogo(remoto) {
  return Object.fromEntries(
    CATEGORIES.map(({ id, categoria }) => [
      id,
      (remoto[id] ?? [])
        .filter((equipo) => equipo.marca && equipo.modelo)
        .map(({ ocr, activo, datos_web: deLaWeb, ...equipo }) => ({
          ...equipo,
          id: equipo.id || slug(`${equipo.marca} ${equipo.modelo}`),
          categoria,
          ...(ocr !== undefined && !esNo(ocr) && { ocr: true }),
          ...(activo !== undefined && esNo(activo) && { activo: false }),
          ...(deLaWeb && { datos_web: String(deLaWeb).split(/[|;]/).map((parte) => parte.trim()).filter(Boolean) }),
        })),
    ]),
  )
}

// Sustituye en la sesión las categorías que la hoja trae con equipos; una pestaña vacía no borra nada.
function aplicar(porCategoria) {
  const reemplazadas = new Set(CATEGORIES.filter(({ id }) => porCategoria[id]?.length).map(({ categoria }) => categoria))
  if (!reemplazadas.size) return
  cambiarCatalogo((lista) => [...lista.filter((equipo) => !reemplazadas.has(equipo.categoria)), ...CATEGORIES.flatMap(({ id }) => porCategoria[id] ?? [])])
}

// Lee el catálogo de la hoja y lo deja como catálogo de la sesión. Devuelve los equipos por categoría.
export async function traerCatalogo() {
  const porCategoria = aCatalogo(await nube.leerCatalogo())
  aplicar(porCategoria)
  try {
    localStorage.setItem(CLAVE, JSON.stringify(porCategoria))
  } catch {
    // Sin espacio para la copia sin conexión: solo se pierde el respaldo local.
  }
  return porCategoria
}

let usuarioCargado = null
async function alCambiarSesion() {
  const usuario = leerSesion().perfil?.usuario ?? null
  if (usuario === usuarioCargado) return
  usuarioCargado = usuario
  if (!usuario || !nubeActiva()) return
  try {
    await traerCatalogo()
  } catch {
    // Sin conexión (o la hoja no responde): última copia leída, si existe.
    try {
      aplicar(JSON.parse(localStorage.getItem(CLAVE)) ?? {})
    } catch {
      // Sin copia: queda el catálogo incluido en la app.
    }
  }
}
suscribirSesion(alCambiarSesion)
alCambiarSesion()
