// Cifrado de la base de datos que viaja dentro de la app. Lo usan el generador (Node) y el navegador,
// por eso solo depende de Web Crypto. La clave de cada usuario se estira con PBKDF2 y con el
// resultado se abre su sobre (AES-GCM); sin la clave correcta el contenido no se puede leer.
export const ITERACIONES = 600000

const subtle = globalThis.crypto.subtle
const codificador = new TextEncoder()
const decodificador = new TextDecoder()

export function aBase64(bytes) {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

export const deBase64 = (texto) => Uint8Array.from(atob(texto), (caracter) => caracter.charCodeAt(0))

export const normalizarUsuario = (usuario) => String(usuario ?? '').trim().toLowerCase()

// Los sobres se guardan bajo esta huella y no bajo el nombre, para no publicar la lista de usuarios.
export async function huellaUsuario(usuario) {
  const resumen = new Uint8Array(await subtle.digest('SHA-256', codificador.encode(`sds:${normalizarUsuario(usuario)}`)))
  return Array.from(resumen.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function derivarBits(clave, sal, iteraciones = ITERACIONES) {
  const material = await subtle.importKey('raw', codificador.encode(String(clave).trim()), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, material, 256))
}

export const importarLlave = (bytes) => subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])

export async function cifrar(llave, objeto) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const datos = await subtle.encrypt({ name: 'AES-GCM', iv }, llave, codificador.encode(JSON.stringify(objeto)))
  return { iv: aBase64(iv), datos: aBase64(new Uint8Array(datos)) }
}

// Lanza un error si la llave no es la correcta o el contenido fue alterado.
export async function descifrar(llave, { iv, datos }) {
  return JSON.parse(decodificador.decode(await subtle.decrypt({ name: 'AES-GCM', iv: deBase64(iv) }, llave, deBase64(datos))))
}
