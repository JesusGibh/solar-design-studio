import { useState } from 'react'
import { LoaderCircle, LockKeyhole, Sun } from 'lucide-react'
import { inputClass, labelClass } from './campos.jsx'
import { iniciarSesion } from '../lib/sesion.js'

// Puerta de entrada: sin un usuario y una clave de la base de datos no se muestra nada de la app.
export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState(false)

  const entrar = async (event) => {
    event.preventDefault()
    setEntrando(true)
    setError(false)
    const dentro = await iniciarSesion(usuario, clave)
    // Si entró, este componente se desmonta: solo queda algo que actualizar cuando falla.
    if (!dentro) {
      setError(true)
      setEntrando(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-md border border-line bg-panel p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded border border-accent/40 bg-accent/10">
            <Sun className="size-5 text-accent" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[1rem] font-semibold text-ink leading-tight tracking-tight">Solar Design Studio</h1>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-dim">Acceso a la plataforma</p>
          </div>
        </div>

        <label className="mt-6 block">
          <span className={labelClass}>Usuario</span>
          <input
            type="text"
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
            className={`${inputClass} font-sans`}
          />
        </label>
        <label className="mt-3 block">
          <span className={labelClass}>Clave</span>
          <input type="password" value={clave} onChange={(event) => setClave(event.target.value)} autoComplete="current-password" required className={`${inputClass} font-sans`} />
        </label>

        {error && (
          <p role="alert" className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            Usuario o clave incorrectos.
          </p>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-accent px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {entrando ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="size-4" aria-hidden="true" />}
          {entrando ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-ink-dim">Creado por Ing. Jesús Ariza</p>
    </div>
  )
}
