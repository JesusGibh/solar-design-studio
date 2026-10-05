import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { recurso } from './rutas.js'
import { Banknote, BatteryCharging, CalendarClock, Cpu, Gauge, Leaf, PanelTop, PiggyBank, Ruler, ShieldCheck, Sun, TrendingUp, Zap } from 'lucide-react'

// Recursos que el PDF necesita además de los datos: la tipografía Lato (TTF en base64) y los iconos
// rasterizados en el color de la marca. Se preparan aquí, en el navegador, y se le pasan al generador.

// nombre -> componente de icono. Los nombres son los que usa lib/propuestaPdf.js.
export const ICONOS_PDF = {
  modulos: PanelTop,
  potencia: Zap,
  inversor: Cpu,
  generacion: Sun,
  area: Ruler,
  cobertura: Gauge,
  inversion: Banknote,
  ahorro: PiggyBank,
  retorno: CalendarClock,
  rentabilidad: TrendingUp,
  ambiente: Leaf,
  bateria: BatteryCharging,
  garantia: ShieldCheck,
}

// SVG de un icono con el trazo en el color pedido (sirve igual en el navegador y en Node).
export const svgDeIcono = (Icono, color) => renderToStaticMarkup(createElement(Icono, { color, size: 96, strokeWidth: 1.75 }))

async function aBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

function rasterizar(svg, lado = 192) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image()
    imagen.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = lado
      canvas.getContext('2d').drawImage(imagen, 0, 0, lado, lado)
      resolver(canvas.toDataURL('image/png'))
    }
    imagen.onerror = rechazar
    imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

// Devuelve { fuentes: { regular, bold } | null, iconos: { nombre: dataUrl } }. Si la tipografía no
// se puede descargar, el PDF cae a la fuente estándar en lugar de fallar.
export async function cargarRecursosPdf(marca) {
  const [fuentes, iconos] = await Promise.all([
    Promise.all([aBase64(recurso('/assets/fonts/Lato-Regular.ttf')), aBase64(recurso('/assets/fonts/Lato-Bold.ttf'))])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch(() => null),
    Promise.all(Object.entries(ICONOS_PDF).map(async ([nombre, Icono]) => [nombre, await rasterizar(svgDeIcono(Icono, marca.primario)).catch(() => null)])).then(
      Object.fromEntries,
    ),
  ])
  return { fuentes, iconos }
}
