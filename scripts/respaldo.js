// Respalda la base de datos (carpeta datos/, que no se sube a GitHub) en las carpetas sincronizadas
// con la nube que haya en esta computadora: OneDrive y Google Drive. Cada respaldo es una copia
// completa con fecha; se conservan los 30 más recientes.
//
// Uso:  npm run respaldo        (también se ejecuta solo antes de cada `npm run publicar`)
//       SDS_RESPALDO=D:\Copias npm run respaldo     para usar otra carpeta
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOMBRE = 'Respaldos Solar Design Studio'
const CONSERVAR = 30

function destinos() {
  if (process.env.SDS_RESPALDO) return [process.env.SDS_RESPALDO]
  return [process.env.OneDrive, 'G:\\Mi unidad', 'G:\\My Drive'].filter((carpeta) => carpeta && existsSync(carpeta))
}

// Devuelve las carpetas donde quedó la copia. Lanza un error si no hay base o no hay dónde copiarla.
export function respaldar() {
  const origen = path.join(raiz, 'datos')
  if (!existsSync(origen)) throw new Error('No existe la carpeta datos/: no hay nada que respaldar.')
  const carpetas = destinos()
  if (!carpetas.length) throw new Error('No se encontró OneDrive ni Google Drive. Indica una carpeta con la variable SDS_RESPALDO.')
  const sello = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '')
  return carpetas.map((carpeta) => {
    const base = path.join(carpeta, NOMBRE)
    const copia = path.join(base, `datos_${sello}`)
    mkdirSync(base, { recursive: true })
    cpSync(origen, copia, { recursive: true })
    const anteriores = readdirSync(base).filter((nombre) => nombre.startsWith('datos_')).sort()
    for (const vieja of anteriores.slice(0, -CONSERVAR)) rmSync(path.join(base, vieja), { recursive: true, force: true })
    return copia
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  respaldar().forEach((copia) => console.log(`Respaldo guardado en ${copia}`))
}
