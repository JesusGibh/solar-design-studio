/**
 * Solar Design Studio · puente con Google Sheets
 *
 * Este script convierte una hoja de cálculo en la base de datos de la app:
 *   - Pestaña "Propuestas": una fila por propuesta guardada (con todos sus datos para reabrirla).
 *   - Pestañas "Paneles", "Inversores", "Baterias" y "RSD": el catálogo de equipos.
 *   - Numeración correlativa PROP-AAAA-NNNN, compartida entre todos los dispositivos.
 *
 * Instalación (una sola vez):
 *   1. Crea una hoja de cálculo nueva en Google Sheets.
 *   2. Menú Extensiones > Apps Script. Borra lo que haya y pega este archivo completo. Guarda.
 *   3. Botón Implementar > Nueva implementación > tipo "Aplicación web".
 *        Ejecutar como: "Yo"  ·  Quién tiene acceso: "Cualquier usuario"
 *      Autoriza cuando lo pida y copia la URL que termina en /exec.
 *   4. En la app, sección "Historial", pega esa URL en "Conexión con Google Sheets".
 *
 * Quien tenga la URL puede leer y escribir en la hoja: no la publiques.
 * Si cambias este código, vuelve a Implementar > Administrar implementaciones > Editar > Nueva versión.
 */

const HOJA_PROPUESTAS = 'Propuestas'
const HOJAS_CATALOGO = { paneles: 'Paneles', inversores: 'Inversores', baterias: 'Baterias', rsd: 'RSD' }
// La última columna guarda el proyecto completo en JSON: es lo que permite reabrir la propuesta.
const COLUMNAS = ['id', 'fecha', 'usuario', 'cliente', 'direccion', 'marca', 'autor', 'kwp', 'paneles', 'inversor', 'inversion', 'ahorro_anual', 'retorno_anios', 'datos']

function doGet(e) {
  return responder(function () {
    switch (e.parameter.accion) {
      case 'ping':
        return { ok: true, hoja: SpreadsheetApp.getActiveSpreadsheet().getName() }
      case 'siguiente':
        return { id: reservarId() }
      case 'propuestas':
        return { propuestas: leerFilas(hoja(HOJA_PROPUESTAS, COLUMNAS)).map(aPropuesta) }
      case 'catalogo':
        return { catalogo: leerCatalogo() }
      default:
        throw new Error('Acción desconocida: ' + e.parameter.accion)
    }
  })
}

function doPost(e) {
  return responder(function () {
    const cuerpo = JSON.parse(e.postData.contents)
    switch (cuerpo.accion) {
      case 'guardar':
        guardarPropuesta(cuerpo.propuesta)
        return { ok: true }
      case 'eliminar':
        eliminarPropuesta(cuerpo.id)
        return { ok: true }
      case 'catalogo':
        escribirCatalogo(cuerpo.catalogo, cuerpo.columnas)
        return { ok: true }
      default:
        throw new Error('Acción desconocida: ' + cuerpo.accion)
    }
  })
}

// Ejecuta la acción y devuelve JSON; un fallo vuelve como { error } en lugar de una página de error.
function responder(accion) {
  let resultado
  try {
    resultado = accion()
  } catch (fallo) {
    resultado = { error: String(fallo.message || fallo) }
  }
  return ContentService.createTextOutput(JSON.stringify(resultado)).setMimeType(ContentService.MimeType.JSON)
}

// Devuelve la pestaña, creándola con sus encabezados si no existe.
function hoja(nombre, encabezados) {
  const libro = SpreadsheetApp.getActiveSpreadsheet()
  let pestana = libro.getSheetByName(nombre)
  if (!pestana) {
    pestana = libro.insertSheet(nombre)
    if (encabezados) {
      pestana.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold')
      pestana.setFrozenRows(1)
    }
  }
  return pestana
}

// Filas de una pestaña como objetos { encabezado: valor }, sin las filas vacías.
function leerFilas(pestana) {
  const valores = pestana.getDataRange().getValues()
  if (valores.length < 2) return []
  const encabezados = valores[0].map(String)
  return valores
    .slice(1)
    .filter(function (fila) { return fila.some(function (celda) { return celda !== '' }) })
    .map(function (fila) {
      const objeto = {}
      encabezados.forEach(function (clave, i) { if (clave && fila[i] !== '') objeto[clave] = fila[i] })
      return objeto
    })
}

function aPropuesta(fila) {
  const propuesta = Object.assign({}, fila)
  if (propuesta.fecha instanceof Date) propuesta.fecha = propuesta.fecha.toISOString()
  try {
    propuesta.datos = JSON.parse(fila.datos)
  } catch (fallo) {
    propuesta.datos = null
  }
  return propuesta
}

// Siguiente número del año, sin repetir aunque dos personas lo pidan a la vez.
function reservarId() {
  const candado = LockService.getScriptLock()
  candado.waitLock(15000)
  try {
    const anio = new Date().getFullYear()
    const prefijo = 'PROP-' + anio + '-'
    const propiedades = PropertiesService.getScriptProperties()
    // Se parte del mayor entre el contador guardado y lo que ya hay escrito en la hoja.
    let ultimo = Number(propiedades.getProperty('ultimo_' + anio)) || 0
    leerFilas(hoja(HOJA_PROPUESTAS, COLUMNAS)).forEach(function (fila) {
      const id = String(fila.id || '')
      if (id.indexOf(prefijo) === 0) ultimo = Math.max(ultimo, Number(id.slice(prefijo.length)) || 0)
    })
    const siguiente = ultimo + 1
    propiedades.setProperty('ultimo_' + anio, String(siguiente))
    return prefijo + ('0000' + siguiente).slice(-4)
  } finally {
    candado.releaseLock()
  }
}

// Inserta la propuesta o, si su id ya existe, actualiza esa fila.
function guardarPropuesta(propuesta) {
  if (!propuesta || !propuesta.id) throw new Error('La propuesta no tiene id.')
  const candado = LockService.getScriptLock()
  candado.waitLock(15000)
  try {
    const pestana = hoja(HOJA_PROPUESTAS, COLUMNAS)
    const fila = COLUMNAS.map(function (columna) {
      if (columna === 'datos') return JSON.stringify(propuesta.datos || {})
      return propuesta[columna] === undefined || propuesta[columna] === null ? '' : propuesta[columna]
    })
    const ids = pestana.getRange(1, 1, Math.max(pestana.getLastRow(), 1), 1).getValues().map(function (r) { return String(r[0]) })
    const posicion = ids.indexOf(String(propuesta.id))
    if (posicion > 0) pestana.getRange(posicion + 1, 1, 1, fila.length).setValues([fila])
    else pestana.appendRow(fila)
  } finally {
    candado.releaseLock()
  }
}

function eliminarPropuesta(id) {
  const pestana = hoja(HOJA_PROPUESTAS, COLUMNAS)
  const ids = pestana.getRange(1, 1, Math.max(pestana.getLastRow(), 1), 1).getValues().map(function (r) { return String(r[0]) })
  const posicion = ids.indexOf(String(id))
  if (posicion > 0) pestana.deleteRow(posicion + 1)
}

function leerCatalogo() {
  const catalogo = {}
  Object.keys(HOJAS_CATALOGO).forEach(function (categoria) {
    const pestana = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJAS_CATALOGO[categoria])
    catalogo[categoria] = pestana ? leerFilas(pestana) : []
  })
  return catalogo
}

// Reemplaza cada pestaña del catálogo con lo que envía la app (columnas = orden de los encabezados).
function escribirCatalogo(catalogo, columnas) {
  Object.keys(HOJAS_CATALOGO).forEach(function (categoria) {
    const equipos = catalogo[categoria]
    if (!equipos) return
    const encabezados = columnas[categoria]
    const pestana = hoja(HOJAS_CATALOGO[categoria])
    pestana.clearContents()
    const filas = [encabezados].concat(
      equipos.map(function (equipo) {
        return encabezados.map(function (clave) {
          const valor = equipo[clave]
          return valor === undefined || valor === null ? '' : Array.isArray(valor) ? valor.join('; ') : valor
        })
      }),
    )
    pestana.getRange(1, 1, filas.length, encabezados.length).setValues(filas)
    pestana.getRange(1, 1, 1, encabezados.length).setFontWeight('bold')
    pestana.setFrozenRows(1)
  })
}
