// Carga el logo de una marca como data URL con sus dimensiones, que es lo que necesita el PDF.
// Devuelve null si el archivo no existe (p. ej. una marca sin logo todavía): el PDF usa entonces el nombre.
export async function cargarLogo(url) {
  try {
    const respuesta = await fetch(url)
    // El servidor de desarrollo responde con la página de la app cuando el archivo no existe.
    if (!respuesta.ok || !respuesta.headers.get('content-type')?.startsWith('image/')) return null
    const blob = await respuesta.blob()
    const [dataUrl, imagen] = await Promise.all([
      new Promise((resolver, rechazar) => {
        const lector = new FileReader()
        lector.onload = () => resolver(lector.result)
        lector.onerror = rechazar
        lector.readAsDataURL(blob)
      }),
      createImageBitmap(blob),
    ])
    return { dataUrl, ancho: imagen.width, alto: imagen.height }
  } catch {
    return null
  }
}
