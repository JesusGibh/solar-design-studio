// Publica la app en GitHub Pages: compila con la ruta base del repositorio y sube el resultado a la
// rama gh-pages del remoto `origin`. El sitio queda en https://<usuario>.github.io/<repositorio>/
//
// Uso:  npm run publicar
import { execFileSync } from 'node:child_process'
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { respaldar } from './respaldo.js'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = (argumentos, cwd = raiz) => execFileSync('git', argumentos, { cwd, encoding: 'utf8' }).trim()

const remoto = git(['remote', 'get-url', 'origin'])
const repositorio = remoto.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
if (!repositorio) throw new Error(`El remoto origin no es de GitHub: ${remoto}`)
const [, usuario, nombre] = repositorio

// Lo que se publica sale de datos/: antes se deja una copia, por si hay que volver atrás.
try {
  respaldar().forEach((copia) => console.log(`Respaldo de la base de datos: ${copia}`))
} catch (error) {
  console.warn(`Sin respaldo: ${error.message}`)
}

console.log(`Compilando para /${nombre}/ …`)
execFileSync(process.execPath, [path.join(raiz, 'node_modules/vite/bin/vite.js'), 'build', `--base=/${nombre}/`], { cwd: raiz, stdio: 'inherit' })

// La compilación se sube desde una carpeta temporal con su propio historial de un solo commit:
// la rama gh-pages solo guarda la última versión publicada, sin mezclarse con el código fuente.
const temporal = mkdtempSync(path.join(tmpdir(), 'publicar-'))
try {
  cpSync(path.join(raiz, 'dist'), temporal, { recursive: true })
  writeFileSync(path.join(temporal, '.nojekyll'), '') // que GitHub sirva los archivos tal cual
  const version = git(['rev-parse', '--short', 'HEAD'])
  git(['init', '-q', '-b', 'gh-pages'], temporal)
  git(['add', '-A'], temporal)
  git(['-c', 'user.name=Publicación', '-c', 'user.email=publicacion@users.noreply.github.com', 'commit', '-q', '-m', `Publica ${version}`], temporal)
  console.log('Subiendo a la rama gh-pages…')
  git(['push', '-f', remoto, 'gh-pages'], temporal)
} finally {
  rmSync(temporal, { recursive: true, force: true })
}
console.log(`\nPublicado: https://${usuario.toLowerCase()}.github.io/${nombre}/`)
