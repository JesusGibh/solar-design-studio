// Escritura directa en la base de datos (datos/propuestas.csv). Solo existe trabajando en local con
// `npm run dev`: lo atiende el servidor de desarrollo (vite.config.js). El sitio publicado es de solo
// lectura, porque una página estática no puede escribir archivos en el proyecto.
export const archivoActivo = import.meta.env.DEV

async function pedir(ruta, cuerpo) {
  const respuesta = await fetch(`/__datos/${ruta}`, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : undefined)
  const datos = await respuesta.json()
  if (!respuesta.ok) throw new Error(datos.error ?? `La base de datos respondió ${respuesta.status}.`)
  return datos
}

export const archivo = {
  listar: async () => (await pedir('propuestas')).propuestas,
  siguienteId: async () => (await pedir('siguiente')).id,
  guardar: (propuesta) => pedir('guardar', { propuesta }),
  eliminar: (id) => pedir('eliminar', { id }),
  guardarEquipo: (categoria, equipo) => pedir('equipo', { categoria, equipo }),
  eliminarEquipo: (categoria, id) => pedir('equipo-eliminar', { categoria, id }),
}
