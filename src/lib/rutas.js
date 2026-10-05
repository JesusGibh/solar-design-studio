// Ruta de un archivo de public/ según dónde esté alojada la app. En local la base es "/", pero en
// GitHub Pages el sitio vive bajo "/solar-design-studio/" y una ruta absoluta apuntaría fuera de él.
export const recurso = (ruta) => `${import.meta.env?.BASE_URL ?? '/'}${ruta.replace(/^\//, '')}`
