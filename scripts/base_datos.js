// Base de datos del proyecto: archivos CSV en la carpeta datos/, que se abren y editan con Excel.
//
//   datos/usuarios.csv      quién entra a la plataforma, con qué clave y con qué rol
//   datos/paneles.csv, inversores.csv, baterias.csv, rsd.csv     catálogo de equipos
//   datos/configuracion.csv   ajustes (url_hoja: Apps Script de la hoja compartida, ver google-apps-script/)
//   datos/propuestas.csv    una fila por propuesta (el diseño completo va en datos/propuestas/<id>.json)
//   datos/recibidas/        archivos exportados por otros usuarios desde la app, pendientes de integrar
//
// La carpeta no se sube a GitHub (.gitignore). La app nunca la publica en claro: al compilar se
// incrusta cifrada y solo se abre con el usuario y la clave de datos/usuarios.csv.
//
// Uso:  npm run datos               crea lo que falte, integra lo recibido y muestra un resumen
//       npm run datos -- --fichas   además añade los equipos nuevos extraídos con `npm run fichas`
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes, randomInt } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTHORS } from '../src/config/authors.js'
import { CATEGORIES, COLUMNAS_META } from '../src/config/equipos.js'
import { ROLES } from '../src/config/roles.js'
import { ITERACIONES, aBase64, cifrar, deBase64, derivarBits, huellaUsuario, importarLlave, normalizarUsuario } from '../src/lib/cifrado.js'
import { escribirCsv, leerCsv } from '../src/lib/csv.js'
import { slug } from '../src/lib/fichas/registros.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CARPETA = path.join(raiz, 'datos')
const en = (...partes) => path.join(CARPETA, ...partes)

const COLUMNAS_USUARIOS = ['usuario', 'nombre', 'rol', 'clave', 'autor', 'activo']
const COLUMNAS_PROPUESTAS = ['id', 'fecha', 'usuario', 'cliente', 'direccion', 'marca', 'autor', 'kwp', 'paneles', 'inversor', 'inversion', 'ahorro_anual', 'retorno_anios']
export const columnasDe = (categoria) => ['id', ...categoria.fields.map((campo) => campo.key), ...COLUMNAS_META]
const COLUMNAS_CONFIG = ['clave', 'valor']
const ID_PROPUESTA = /^PROP-(\d{4})-(\d+)$/

// Excel guarda "CSV" a secas en la codificación de Windows; "CSV UTF-8" en UTF-8. Se aceptan ambas.
function leerTexto(archivo) {
  const bytes = readFileSync(archivo)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function escribir(archivo, contenido) {
  try {
    writeFileSync(archivo, contenido)
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') throw new Error(`No se pudo escribir ${path.basename(archivo)}: ciérralo en Excel y vuelve a intentar.`)
    throw error
  }
}

const leerTabla = (archivo) => (existsSync(archivo) ? leerCsv(leerTexto(archivo)) : [])
const leerJson = (archivo, defecto) => {
  try {
    return JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    return defecto
  }
}

// Clave inicial fácil de dictar y sin caracteres que Excel reinterprete: "sol-k7m3-x9qd".
function claveAleatoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789'
  const grupo = () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join('')
  return `sol-${grupo()}-${grupo()}`
}

// Crea la carpeta y los archivos que falten. Lo que ya existe no se toca.
export function asegurarBase() {
  const creados = []
  mkdirSync(en('propuestas'), { recursive: true })
  mkdirSync(en('recibidas'), { recursive: true })

  if (!existsSync(en('usuarios.csv'))) {
    const usuarios = [
      { usuario: 'jariza@solar5estrellas.com', nombre: 'Ing. Jesús Ariza', rol: 'admin', clave: claveAleatoria(), autor: 'jesus-ariza', activo: 'si' },
      { usuario: 'jvelandia@solar5estrellas.com', nombre: 'Ing. Johnny Velandia', rol: 'ingeniero', clave: claveAleatoria(), autor: 'johnny-velandia', activo: 'si' },
    ]
    escribir(en('usuarios.csv'), escribirCsv(COLUMNAS_USUARIOS, usuarios))
    creados.push('usuarios.csv')
  }

  // El catálogo arranca con lo extraído de las fichas técnicas; desde ahí manda el CSV.
  const fichas = leerJson(path.join(raiz, 'src/data/catalogo_equipos.json'), [])
  for (const categoria of CATEGORIES) {
    const archivo = en(`${categoria.id}.csv`)
    if (existsSync(archivo)) continue
    const filas = fichas
      .filter((registro) => registro.categoria === categoria.categoria)
      .map(aFila)
    escribir(archivo, escribirCsv(columnasDe(categoria), filas))
    creados.push(`${categoria.id}.csv`)
  }

  if (!existsSync(en('configuracion.csv'))) {
    escribir(en('configuracion.csv'), escribirCsv(COLUMNAS_CONFIG, [{ clave: 'url_hoja', valor: '' }]))
    creados.push('configuracion.csv')
  }

  if (!existsSync(en('propuestas.csv'))) {
    escribir(en('propuestas.csv'), escribirCsv(COLUMNAS_PROPUESTAS, []))
    creados.push('propuestas.csv')
  }
  return creados
}

const aFila = (registro) =>
  Object.fromEntries(Object.entries(registro).map(([clave, valor]) => [clave, Array.isArray(valor) ? valor.join(' | ') : valor === true ? 'si' : valor === false ? 'no' : valor]))

// Añade al catálogo los equipos de las fichas técnicas (npm run fichas) que aún no están en los CSV.
// Es un paso aparte (npm run datos -- --fichas) para que un equipo borrado a mano no reaparezca solo.
export function agregarFichasNuevas() {
  const fichas = leerJson(path.join(raiz, 'src/data/catalogo_equipos.json'), [])
  let nuevos = 0
  for (const categoria of CATEGORIES) {
    const filas = leerTabla(en(`${categoria.id}.csv`))
    const ids = new Set(filas.map((fila) => fila.id))
    const faltan = fichas.filter((registro) => registro.categoria === categoria.categoria && !ids.has(registro.id)).map(aFila)
    if (!faltan.length) continue
    escribir(en(`${categoria.id}.csv`), escribirCsv(columnasDe(categoria), [...filas, ...faltan]))
    nuevos += faltan.length
  }
  return nuevos
}

const numero = (texto) => {
  const n = Number(texto.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function leerCatalogo(avisos) {
  const catalogo = []
  for (const categoria of CATEGORIES) {
    const tipos = Object.fromEntries(categoria.fields.map((campo) => [campo.key, campo.type]))
    const vistos = new Set()
    leerTabla(en(`${categoria.id}.csv`)).forEach((fila, i) => {
      if (!fila.marca || !fila.modelo) return avisos.push(`${categoria.id}.csv, fila ${i + 2}: sin marca o modelo, se omite.`)
      const registro = { id: fila.id || slug(`${fila.marca} ${fila.modelo}`), categoria: categoria.categoria }
      if (vistos.has(registro.id)) return avisos.push(`${categoria.id}.csv, fila ${i + 2}: el id «${registro.id}» está repetido, se omite.`)
      vistos.add(registro.id)
      for (const [clave, texto] of Object.entries(fila)) {
        if (clave === 'id' || clave === 'categoria' || texto === '') continue
        if (clave === 'ocr') {
          if (/^(si|sí|true|1|x)$/i.test(texto)) registro.ocr = true
        } else if (clave === 'datos_web') {
          registro.datos_web = texto.split(/[|;]/).map((parte) => parte.trim()).filter(Boolean)
        } else if (clave === 'activo') {
          // Una ficha desactivada sigue en la base, pero no se ofrece al dimensionar.
          if (/^(no|0|false)$/i.test(texto)) registro.activo = false
        } else if (tipos[clave] === 'number') {
          const valor = numero(texto)
          if (valor == null) avisos.push(`${categoria.id}.csv, fila ${i + 2}: «${texto}» no es un número en la columna ${clave}.`)
          else registro[clave] = valor
        } else if (tipos[clave] === 'list' && texto.includes('|')) {
          registro[clave] = texto.split('|').map((parte) => parte.trim()).filter(Boolean)
        } else {
          registro[clave] = tipos[clave] === 'enum' ? texto.toUpperCase() : texto
        }
      }
      catalogo.push(registro)
    })
  }
  return catalogo
}

function leerUsuarios(avisos) {
  const usuarios = []
  leerTabla(en('usuarios.csv')).forEach((fila, i) => {
    const usuario = normalizarUsuario(fila.usuario)
    const donde = `usuarios.csv, fila ${i + 2}`
    if (!usuario) return
    if (/^(no|0|false)$/i.test(fila.activo ?? '')) return
    if (usuarios.some((otro) => otro.usuario === usuario)) return avisos.push(`${donde}: el usuario «${usuario}» está repetido, se omite.`)
    if (!ROLES[fila.rol]) return avisos.push(`${donde}: el rol «${fila.rol}» no existe (usa ${Object.keys(ROLES).join(' o ')}); «${usuario}» no podrá entrar.`)
    if ((fila.clave ?? '').length < 8) return avisos.push(`${donde}: la clave de «${usuario}» tiene menos de 8 caracteres; no podrá entrar hasta que la cambies.`)
    if (!AUTHORS[fila.autor]) avisos.push(`${donde}: el autor «${fila.autor}» no existe (usa ${Object.keys(AUTHORS).join(' o ')}); firmará con el autor por defecto.`)
    usuarios.push({ usuario, nombre: fila.nombre || usuario, rol: fila.rol, clave: fila.clave, autor: fila.autor })
  })
  if (!usuarios.some((usuario) => ROLES[usuario.rol].secciones === null)) avisos.push('usuarios.csv: no hay ningún usuario administrador activo.')
  return usuarios
}

// Guarda (o actualiza) un equipo del catálogo. `categoriaId` es el nombre del archivo: paneles, inversores…
export function guardarEquipoEnBase(categoriaId, equipo) {
  const categoria = CATEGORIES.find((item) => item.id === categoriaId)
  if (!categoria) throw new Error(`Categoría desconocida: ${categoriaId}`)
  if (!equipo?.marca || !equipo?.modelo) throw new Error('El equipo necesita marca y modelo.')
  const id = equipo.id || slug(`${equipo.marca} ${equipo.modelo}`)
  const filas = leerTabla(en(`${categoriaId}.csv`))
  const fila = aFila({ ...equipo, id })
  const indice = filas.findIndex((otra) => otra.id === id)
  if (indice === -1) filas.push(fila)
  else filas[indice] = fila
  escribir(en(`${categoriaId}.csv`), escribirCsv(columnasDe(categoria), filas))
}

export function eliminarEquipoDeBase(categoriaId, id) {
  const categoria = CATEGORIES.find((item) => item.id === categoriaId)
  if (!categoria) throw new Error(`Categoría desconocida: ${categoriaId}`)
  escribir(en(`${categoriaId}.csv`), escribirCsv(columnasDe(categoria), leerTabla(en(`${categoriaId}.csv`)).filter((fila) => fila.id !== id)))
}

function leerConfiguracion() {
  return Object.fromEntries(leerTabla(en('configuracion.csv')).filter((fila) => fila.clave).map((fila) => [fila.clave, fila.valor ?? '']))
}

// Filas de propuestas.csv con su diseño completo. Borrar una fila en Excel borra la propuesta.
export function leerPropuestas(avisos = []) {
  return leerTabla(en('propuestas.csv')).flatMap((fila) => {
    if (!ID_PROPUESTA.test(fila.id ?? '')) return []
    const datos = leerJson(en('propuestas', `${fila.id}.json`), null)
    if (!datos) {
      avisos.push(`propuestas.csv: falta datos/propuestas/${fila.id}.json; la propuesta no se puede reabrir y se omite.`)
      return []
    }
    return [{ ...fila, datos }]
  })
}

function escribirPropuestas(propuestas) {
  const ordenadas = [...propuestas].sort((a, b) => a.id.localeCompare(b.id))
  escribir(en('propuestas.csv'), escribirCsv(COLUMNAS_PROPUESTAS, ordenadas))
}

// El mayor número usado en un año, contando los reservados que aún no se guardaron.
function ultimoNumero(anio, propuestas = leerTabla(en('propuestas.csv'))) {
  const usados = propuestas.map((propuesta) => (propuesta.id ?? '').match(ID_PROPUESTA)).filter((partes) => partes && Number(partes[1]) === anio)
  const contador = leerJson(en('.contador.json'), {})
  return Math.max(0, contador[anio] ?? 0, ...usados.map((partes) => Number(partes[2])))
}

const formatoId = (anio, n) => `PROP-${anio}-${String(n).padStart(4, '0')}`

export function siguienteIdEnBase() {
  const anio = new Date().getFullYear()
  const siguiente = ultimoNumero(anio) + 1
  escribir(en('.contador.json'), JSON.stringify({ ...leerJson(en('.contador.json'), {}), [anio]: siguiente }))
  return formatoId(anio, siguiente)
}

// Guarda o actualiza una propuesta: la fila resumen en el CSV y el diseño en su archivo JSON.
export function guardarPropuestaEnBase({ datos, ...resumen }) {
  if (!ID_PROPUESTA.test(resumen.id ?? '')) throw new Error(`Número de propuesta no válido: ${resumen.id}`)
  if (!datos) throw new Error('La propuesta no trae el diseño.')
  escribirPropuestas([...leerTabla(en('propuestas.csv')).filter((fila) => fila.id !== resumen.id), resumen])
  escribir(en('propuestas', `${resumen.id}.json`), JSON.stringify(datos))
}

export function eliminarPropuestaDeBase(id) {
  if (!ID_PROPUESTA.test(id ?? '')) throw new Error(`Número de propuesta no válido: ${id}`)
  escribirPropuestas(leerTabla(en('propuestas.csv')).filter((fila) => fila.id !== id))
  rmSync(en('propuestas', `${id}.json`), { force: true })
}

// Integra los archivos que otros usuarios exportaron desde la app publicada (datos/recibidas/*.json).
// Si un número ya lo usó otro usuario, la propuesta recibida toma el siguiente libre y se avisa.
export function importarRecibidas() {
  const mensajes = []
  if (!existsSync(en('recibidas'))) return mensajes
  const archivos = readdirSync(en('recibidas')).filter((nombre) => nombre.toLowerCase().endsWith('.json'))
  for (const nombre of archivos) {
    const recibidas = leerJson(en('recibidas', nombre), null)
    if (!Array.isArray(recibidas)) {
      mensajes.push(`recibidas/${nombre}: no es un archivo exportado desde la app, se deja donde está.`)
      continue
    }
    let integradas = 0
    for (const propuesta of recibidas) {
      const partes = (propuesta?.id ?? '').match(ID_PROPUESTA)
      if (!partes || !propuesta.datos) continue
      const actuales = leerTabla(en('propuestas.csv'))
      const previa = actuales.find((fila) => fila.id === propuesta.id)
      const { origen: _origen, ...registro } = propuesta
      if (previa && previa.usuario !== (propuesta.usuario ?? '')) {
        const anio = Number(partes[1])
        const nuevo = formatoId(anio, ultimoNumero(anio, actuales) + 1)
        mensajes.push(`recibidas/${nombre}: ${propuesta.id} de «${propuesta.usuario}» ya existía a nombre de «${previa.usuario}»; se guardó como ${nuevo}.`)
        registro.id = nuevo
        registro.datos = { ...registro.datos, propuesta: { ...registro.datos.propuesta, id: nuevo } }
      } else if (previa && String(previa.fecha) >= String(propuesta.fecha)) {
        continue // lo que ya está en la base es igual o más reciente
      }
      guardarPropuestaEnBase(registro)
      integradas++
    }
    mkdirSync(en('recibidas', 'procesadas'), { recursive: true })
    renameSync(en('recibidas', nombre), en('recibidas', 'procesadas', nombre))
    mensajes.push(`recibidas/${nombre}: ${integradas} propuesta(s) integradas.`)
  }
  return mensajes
}

export function leerBase() {
  const avisos = []
  return { usuarios: leerUsuarios(avisos), catalogo: leerCatalogo(avisos), propuestas: leerPropuestas(avisos), configuracion: leerConfiguracion(), avisos }
}

// La llave del contenido y la sal de cada usuario se conservan entre compilaciones, para que una
// sesión abierta siga sirviendo después de publicar (mientras no cambie la clave de ese usuario).
function leerLlaves() {
  const llaves = leerJson(en('.llaves.json'), {})
  llaves.contenido ??= aBase64(randomBytes(32))
  llaves.sales ??= {}
  return llaves
}

// Base cifrada que se incrusta en la app: el contenido (equipos, propuestas y ajustes, que todos los
// usuarios ven) bajo una llave común y, por cada usuario, un sobre que solo abre su clave, con su
// perfil y esa llave.
export async function cifrarBase() {
  asegurarBase()
  const { usuarios, catalogo, propuestas, configuracion, avisos } = leerBase()
  const llaves = leerLlaves()
  const contenido = deBase64(llaves.contenido)
  const ultimo = {}
  for (const { id } of propuestas) {
    const [, anio, n] = id.match(ID_PROPUESTA)
    ultimo[anio] = Math.max(ultimo[anio] ?? 0, Number(n))
  }

  const sobres = {}
  for (const { clave, ...perfil } of usuarios) {
    llaves.sales[perfil.usuario] ??= aBase64(randomBytes(16))
    const sal = deBase64(llaves.sales[perfil.usuario])
    const llave = await importarLlave(await derivarBits(clave, sal))
    sobres[await huellaUsuario(perfil.usuario)] = { sal: aBase64(sal), ...(await cifrar(llave, { perfil, llave: llaves.contenido })) }
  }
  escribir(en('.llaves.json'), JSON.stringify(llaves))
  return { base: { version: 1, iteraciones: ITERACIONES, comun: await cifrar(await importarLlave(contenido), { catalogo, configuracion, propuestas, ultimo }), usuarios: sobres }, avisos }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const creados = asegurarBase()
  if (creados.length) console.log(`Archivos creados en datos/: ${creados.join(', ')}`)
  importarRecibidas().forEach((mensaje) => console.log(mensaje))
  if (process.argv.includes('--fichas')) console.log(`Equipos nuevos tomados de las fichas técnicas: ${agregarFichasNuevas()}`)
  const { usuarios, catalogo, propuestas, avisos } = leerBase()
  console.log(`\nBase de datos en ${CARPETA}`)
  console.log(`  Usuarios activos: ${usuarios.map((usuario) => `${usuario.usuario} (${ROLES[usuario.rol].label.toLowerCase()})`).join(', ') || 'ninguno'}`)
  console.log(`  Equipos: ${CATEGORIES.map((categoria) => `${catalogo.filter((equipo) => equipo.categoria === categoria.categoria).length} ${categoria.label.toLowerCase()}`).join(', ')}`)
  console.log(`  Propuestas: ${propuestas.length}`)
  console.log(`  Hoja compartida (numeración única en línea): ${leerConfiguracion().url_hoja ? 'conectada' : 'sin configurar'}`)
  if (avisos.length) console.log(`\nAvisos:\n${avisos.map((aviso) => `  - ${aviso}`).join('\n')}`)
  if (creados.includes('usuarios.csv')) console.log('\nLas claves iniciales están en datos/usuarios.csv: ábrelo con Excel para verlas o cambiarlas.')
}
