// Marcas con las que se puede emitir una propuesta. Los colores visten el PDF (encabezados, acentos)
// y el logo va en la portada; si el archivo del logo no existe, se usa el nombre como membrete.
// Los logos viven en public/assets/brands/.
// `graficos` son los dos tonos de las series en las gráficas de la propuesta (consumo, generación):
// la misma familia que la marca, pero en pasos comprobados para distinguirse entre sí sobre blanco.
export const BRANDS = {
  'solar-5-estrellas': {
    nombre: 'Solar 5 Estrellas',
    lema: 'Tu energía renovable al alcance de tu mano',
    primario: '#0F5B38',
    secundario: '#F59E0B',
    graficos: ['#1A8748', '#D98200'],
    logoUrl: '/assets/brands/solar-5-estrellas-logo.png',
  },
  kilowattia: {
    nombre: 'Kilowattia',
    lema: '',
    primario: '#1E3A8A',
    secundario: '#06B6D4',
    graficos: ['#2B59C3', '#0FA3B8'],
    logoUrl: '/assets/brands/kilowattia-logo.png',
  },
}

export const BRAND_POR_DEFECTO = 'solar-5-estrellas'
export const getBrand = (id) => BRANDS[id] ?? BRANDS[BRAND_POR_DEFECTO]
