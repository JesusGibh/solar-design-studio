import { useEffect, useState } from 'react'
import { CloudDownload, CloudUpload, Copy, Database, Download, Eye, FileText, FolderOpen, History, Link2, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import Panel from '../components/Panel.jsx'
import { fmt, inputClass, labelClass } from '../components/campos.jsx'
import { CATEGORIES } from '../config/equipos.js'
import { getRol } from '../config/roles.js'
import { useEquipos } from '../hooks/useEquipos.js'
import { reemplazarProyecto } from '../hooks/useProyecto.js'
import { guardarCaptura3d } from '../lib/captura3d.js'
import { COLUMNAS_HOJA, traerCatalogo } from '../lib/catalogoNube.js'
import { archivoActivo } from '../lib/archivo.js'
import { cargarDeLaBase, eliminarPropuesta, esAjena, renderDePropuesta, sincronizarHistorial, useHistorial } from '../lib/historial.js'
import { guardarUrlNube, leerUrlNube, nube, urlNubeDeLaBase } from '../lib/nube.js'
import { useSesion } from '../lib/sesion.js'

const boton =
  'flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50'

export default function HistorialSection({ irA }) {
  const historial = useHistorial()
  const { perfil } = useSesion()
  const rol = getRol(perfil.rol)
  const { completo: catalogo } = useEquipos()
  const [url, setUrl] = useState(leerUrlNube)
  const [conectada, setConectada] = useState(() => Boolean(leerUrlNube()))
  const [ocupado, setOcupado] = useState(null)
  const [aviso, setAviso] = useState(null) // { ok, texto }

  // Ejecuta una acción con la hoja mostrando el progreso y el resultado.
  const con = async (clave, accion) => {
    setOcupado(clave)
    setAviso(null)
    try {
      setAviso({ ok: true, texto: await accion() })
    } catch (error) {
      setAviso({ ok: false, texto: error.message === 'Failed to fetch' ? 'No se pudo conectar con la hoja. Revisa la URL y tu conexión.' : error.message })
    } finally {
      setOcupado(null)
    }
  }

  const conectar = () =>
    con('conectar', async () => {
      guardarUrlNube(url)
      if (!url.trim()) {
        setConectada(false)
        return 'Conexión quitada: las propuestas se guardan solo en este navegador.'
      }
      try {
        const { hoja } = await nube.probar()
        setConectada(true)
        const cantidad = await sincronizarHistorial()
        return `Conectado a «${hoja}». ${cantidad} propuesta(s) en la hoja.`
      } catch (error) {
        guardarUrlNube('')
        setConectada(false)
        throw error
      }
    })

  // Al abrir la sección se refresca contra la hoja compartida; sin conexión se sigue con lo que hay.
  useEffect(() => {
    if (leerUrlNube()) sincronizarHistorial().catch(() => {})
  }, [])

  const cargar = async (propuesta, comoCopia) => {
    // Una copia conserva todo el diseño pero suelta el número: al abrir Propuesta toma el siguiente.
    reemplazarProyecto(comoCopia ? { ...propuesta.datos, propuesta: { ...propuesta.datos.propuesta, id: '' } } : propuesta.datos)
    // El render guardado con la propuesta vuelve con ella; si no tiene, se quita el del diseño anterior.
    guardarCaptura3d(null)
    irA('propuesta')
    const render = await renderDePropuesta(propuesta.id)
    if (render) guardarCaptura3d({ ...render, fecha: propuesta.fecha })
  }

  // Archivo con las propuestas a la vista, para entregarlo a quien administra la base de datos
  // (lo copia en datos/recibidas/ y quedan integradas).
  const exportar = () => {
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([JSON.stringify(historial)], { type: 'application/json' }))
    enlace.download = `propuestas-${perfil.usuario}-${new Date().toISOString().slice(0, 10)}.json`
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  const eliminar = (propuesta) => {
    if (!window.confirm(`¿Eliminar ${propuesta.id}${propuesta.cliente ? ` (${propuesta.cliente})` : ''} del historial? No se puede deshacer.`)) return
    con(`eliminar-${propuesta.id}`, async () => {
      await eliminarPropuesta(propuesta.id)
      return `${propuesta.id} eliminada.`
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Panel title="Propuestas guardadas" icon={History}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">
            {historial.length} propuesta(s) · {archivoActivo ? 'en la base de datos del proyecto' : 'de la base de datos y de este navegador'}
            {conectada && rol.nube ? ' · sincronizadas con Google Sheets' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
          {archivoActivo ? (
            <button type="button" disabled={Boolean(ocupado)} onClick={() => con('base', async () => `${await cargarDeLaBase()} propuesta(s) en la base de datos.`)} className={boton}>
              {ocupado === 'base' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Releer la base de datos
            </button>
          ) : (
            <button type="button" disabled={historial.length === 0} onClick={exportar} className={boton} title="Descarga un archivo con estas propuestas para integrarlas a la base de datos">
              <Download className="size-4" aria-hidden="true" />
              Exportar propuestas
            </button>
          )}
          {conectada && rol.nube && (
            <button
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() => con('sincronizar', async () => `${await sincronizarHistorial()} propuesta(s) traídas de la hoja.`)}
              className={boton}
            >
              {ocupado === 'sincronizar' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Actualizar desde la hoja
            </button>
          )}
          </div>
        </div>

        {historial.length === 0 ? (
          <p className="rounded border border-line bg-base px-3 py-6 text-center text-sm text-ink-dim">
            Aún no hay propuestas guardadas. Usa «Guardar propuesta» en la sección Propuesta; también se guardan al descargar el PDF.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-ink-dim">
                  {['Número', 'Fecha', 'Cliente', 'Sistema', 'Inversión', 'Retorno', 'Elaboró', ''].map((titulo) => (
                    <th key={titulo} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                      {titulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.map((propuesta) => (
                  <tr key={propuesta.id} className="border-b border-line/60 last:border-0 hover:bg-raised">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-accent">{propuesta.id}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{new Date(propuesta.fecha).toLocaleDateString('es')}</td>
                    <td className="max-w-56 truncate px-3 py-2.5">{propuesta.cliente || <span className="text-ink-dim">Sin cliente</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-muted">
                      {propuesta.kwp ? `${fmt(Number(propuesta.kwp), 2)} kWp · ${propuesta.paneles} paneles` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-muted">{propuesta.inversion ? fmt(Number(propuesta.inversion), 0) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-ink-muted">{propuesta.retorno_anios ? `${propuesta.retorno_anios} años` : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-ink-muted">{propuesta.autor}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {propuesta.pdf && (
                          <a href={propuesta.pdf} target="_blank" rel="noreferrer" className={boton} title="Abrir el PDF guardado en Drive">
                            <FileText className="size-4" aria-hidden="true" />
                            PDF
                          </a>
                        )}
                        {esAjena(propuesta) ? (
                          <button type="button" onClick={() => cargar(propuesta, false)} className={boton} title="Ver esta propuesta sin modificarla">
                            <Eye className="size-4" aria-hidden="true" />
                            Ver
                          </button>
                        ) : (
                          <button type="button" onClick={() => cargar(propuesta, false)} className={boton} title="Abrir esta propuesta para editarla">
                            <FolderOpen className="size-4" aria-hidden="true" />
                            Abrir / editar
                          </button>
                        )}
                        <button type="button" onClick={() => cargar(propuesta, true)} className={boton} title="Crear una propuesta nueva a partir de esta">
                          <Copy className="size-4" aria-hidden="true" />
                          Copiar como nueva
                        </button>
                        {(!esAjena(propuesta) || rol.eliminarAjenas) && (
                          <button type="button" onClick={() => eliminar(propuesta)} disabled={Boolean(ocupado)} className={boton} aria-label={`Eliminar ${propuesta.id}`}>
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aviso && !rol.nube && (
          <p role="status" className={`mt-3 rounded border px-3 py-2 text-sm ${aviso.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-danger/40 bg-danger/10 text-danger'}`}>
            {aviso.texto}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-dim">
          Abrir una propuesta reemplaza el proyecto que tengas en pantalla. Las de otros usuarios se pueden ver y copiar como nueva, no modificar. El render 3D capturado se guarda con la propuesta y vuelve al abrirla o copiarla.
          {!archivoActivo && ' Las propuestas nuevas quedan en este navegador: expórtalas para que pasen a la base de datos.'}
        </p>
      </Panel>

      {rol.secciones === null && (
        <Panel title="Base de datos del proyecto" icon={Database}>
          <p className="text-sm text-ink-muted">
            La base de datos son archivos CSV en la carpeta <code className="font-mono text-xs text-ink">datos/</code> del proyecto, que se editan con Excel. No se
            sube a GitHub y en el sitio publicado viaja cifrada: solo se abre con un usuario y una clave.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-muted">
            <li><code className="font-mono text-xs text-ink">usuarios.csv</code>: quién entra, con qué clave y con qué rol (admin o ingeniero).</li>
            <li><code className="font-mono text-xs text-ink">paneles.csv</code>, <code className="font-mono text-xs text-ink">inversores.csv</code>, <code className="font-mono text-xs text-ink">baterias.csv</code>, <code className="font-mono text-xs text-ink">rsd.csv</code>: catálogo de equipos.</li>
            <li><code className="font-mono text-xs text-ink">propuestas.csv</code>: una fila por propuesta guardada.</li>
          </ul>
          <p className="mt-2 text-xs text-ink-dim">
            {archivoActivo
              ? 'Estás trabajando en local: las propuestas que guardes se escriben directamente en la base de datos.'
              : 'Este es el sitio publicado, de solo lectura: muestra la base de datos tal como estaba al publicar.'}{' '}
            Los cambios en usuarios, equipos y propuestas llegan al sitio la próxima vez que ejecutes <code className="font-mono text-ink">npm run publicar</code>. Los
            archivos que exporten otros usuarios se copian en <code className="font-mono text-ink">datos/recibidas/</code>.
          </p>
        </Panel>
      )}

      {rol.nube && (
      <Panel title="Hoja compartida de Google Sheets" icon={Link2}>
        <p className="mb-3 text-sm text-ink-muted">
          Es lo que mantiene <strong className="text-ink">un solo consecutivo</strong> y las propuestas de todos al día en el sitio publicado.{' '}
          {urlNubeDeLaBase()
            ? 'Está configurada en la base de datos y la usan todos los usuarios.'
            : 'Aún no está en la base de datos: después de implementar el script, pega su URL en datos/configuracion.csv (fila url_hoja) y publica; así la usan todos sin configurar nada. Aquí abajo puedes probarla solo en este navegador.'}
        </p>
        <label className="block">
          <span className={labelClass}>URL de la aplicación web del Apps Script (termina en /exec)</span>
          <div className="flex flex-wrap gap-2">
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className={`${inputClass} min-w-64 flex-1`}
            />
            <button type="button" onClick={conectar} disabled={Boolean(ocupado)} className="flex items-center gap-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent-strong disabled:opacity-50">
              {ocupado === 'conectar' && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {url.trim() ? 'Conectar y probar' : 'Quitar conexión'}
            </button>
          </div>
        </label>

        {conectada && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() =>
                con('subir', async () => {
                  await nube.escribirCatalogo(catalogo, COLUMNAS_HOJA)
                  return `Catálogo enviado a la hoja: ${CATEGORIES.map(({ id, label }) => `${catalogo[id].length} ${label.toLowerCase()}`).join(', ')}.`
                })
              }
              className={boton}
            >
              {ocupado === 'subir' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="size-4" aria-hidden="true" />}
              Enviar el catálogo de equipos a la hoja
            </button>
            <button
              type="button"
              disabled={Boolean(ocupado)}
              onClick={() =>
                con('bajar', async () => {
                  const remoto = await traerCatalogo()
                  return `Catálogo traído de la hoja: ${CATEGORIES.map(({ id, label }) => `${remoto[id].length} ${label.toLowerCase()}`).join(', ')}. Las pestañas vacías no cambian nada.`
                })
              }
              className={boton}
            >
              {ocupado === 'bajar' ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CloudDownload className="size-4" aria-hidden="true" />}
              Traer el catálogo desde la hoja
            </button>
          </div>
        )}

        {aviso && (
          <p role="status" className={`mt-3 rounded border px-3 py-2 text-sm ${aviso.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-danger/40 bg-danger/10 text-danger'}`}>
            {aviso.texto}
          </p>
        )}

        <details className="mt-4 text-sm text-ink-muted">
          <summary className="cursor-pointer select-none font-medium text-ink hover:text-accent">Cómo conectar la hoja (una sola vez, unos 5 minutos)</summary>
          <ol className="mt-2 list-inside list-decimal space-y-1.5">
            <li>Crea una hoja de cálculo nueva en Google Sheets.</li>
            <li>
              En el menú, abre <strong>Extensiones → Apps Script</strong>. Borra lo que haya y pega el contenido del archivo{' '}
              <code className="font-mono text-xs text-ink">google-apps-script/Codigo.gs</code> del proyecto. Guarda.
            </li>
            <li>
              Pulsa <strong>Implementar → Nueva implementación</strong>, tipo <strong>Aplicación web</strong>. En «Ejecutar como» elige <strong>Yo</strong> y en
              «Quién tiene acceso», <strong>Cualquier usuario</strong>. Autoriza cuando lo pida.
            </li>
            <li>Copia la URL que termina en <code className="font-mono text-xs text-ink">/exec</code>, pégala arriba y pulsa «Conectar y probar».</li>
            <li>Pulsa «Enviar el catálogo de equipos a la hoja» para llenar las pestañas Paneles, Inversores, Baterias y RSD.</li>
          </ol>
          <p className="mt-2">
            <strong>Para actualizar el script</strong> cuando cambie <code className="font-mono text-xs text-ink">Codigo.gs</code>: pega el código nuevo, guarda y entra en{' '}
            <strong>Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar</strong>. La URL no cambia. Los PDF se guardan en
            la carpeta «Propuestas PDF», junto a la hoja.
          </p>
          <p className="mt-2 text-xs text-ink-dim">
            Desde ese momento cada propuesta guardada se escribe en la pestaña «Propuestas» y la numeración la reparte la hoja. Quien tenga esa URL puede leer y
            escribir en la hoja: no la compartas. La URL se guarda solo en este navegador; en otro dispositivo hay que pegarla de nuevo.
          </p>
        </details>
      </Panel>
      )}
    </div>
  )
}
