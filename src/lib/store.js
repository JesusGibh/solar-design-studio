// Almacén mínimo con persistencia en localStorage, compatible con useSyncExternalStore.
// Permite que varios módulos lean y modifiquen el mismo estado aunque no estén montados a la vez.
export function createStore(key, inicial) {
  let state = leer()
  const listeners = new Set()

  function leer() {
    try {
      const guardado = JSON.parse(localStorage.getItem(key))
      // Se mezcla sección por sección para tolerar campos nuevos en versiones posteriores.
      if (guardado) {
        return Object.fromEntries(Object.entries(inicial).map(([seccion, valor]) => [seccion, { ...valor, ...guardado[seccion] }]))
      }
    } catch {
      // Sin almacenamiento o dato corrupto: se parte del estado inicial.
    }
    return inicial
  }

  return {
    get: () => state,
    set(cambio) {
      state = typeof cambio === 'function' ? cambio(state) : cambio
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        // Almacenamiento lleno o bloqueado: el estado sigue vivo en memoria.
      }
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
