// Documento PDF de la propuesta (A4, 6 hojas) dibujado directamente con jsPDF: texto y gráficas
// vectoriales, sin capturar la pantalla. Recibe la clase jsPDF (se carga bajo demanda en la app)
// y los datos ya calculados; devuelve el documento listo para `save()`.
//
// La marca (config/brands.js) pone el logo y los colores, y todas las gráficas usan su misma familia:
// `graficos[0]` para el consumo, `graficos[1]` para la generación, más sus tintes y un gris neutro.
// `recursos` (lib/recursosPdf.js) trae la tipografía Lato y los iconos ya rasterizados.

const ANCHO = 210
const ALTO = 297
const MARGEN = 16
const UTIL = ANCHO - MARGEN * 2

const TINTA = [24, 30, 40]
const TENUE = [95, 105, 120]
const LINEA = [214, 220, 228]
const FONDO = [243, 245, 248]
const GRIS = [158, 167, 179] // serie neutra: lo que viene de la red, la situación actual
const BLANCO = [255, 255, 255]
const VERDE = [22, 128, 70]
const AMBAR = [176, 108, 0]
const ROJO = [190, 45, 45]
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const ESTADOS = { ok: ['Cumple', VERDE], warn: ['Revisar', AMBAR], danger: ['No cumple', ROJO], pendiente: ['Sin dato', TENUE] }

const TIPOLOGIAS = { on_grid: 'SISTEMA ON-GRID', off_grid: 'SISTEMA OFF-GRID', hibrido: 'SISTEMA HÍBRIDO' }
const SISTEMA_INVERSOR = { ON_GRID: 'On-Grid', OFF_GRID: 'Off-Grid', HIBRIDO: 'Híbrido' }
const RANGO_BATERIA = { NINGUNA: 'No admite', LOW_VOLTAGE: 'Bajo voltaje (LV)', HIGH_VOLTAGE: 'Alto voltaje (HV)' }

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
// Mezcla un color con blanco: t = 0 deja el color, t = 1 deja blanco.
const tinte = (color, t) => color.map((canal) => Math.round(canal + (255 - canal) * t))
// Oscurece un color (para usar un tono claro de marca como texto legible).
const oscuro = (color, t) => color.map((canal) => Math.round(canal * (1 - t)))

// Números al estilo local: 37.686 · 26,00
function num(valor, decimales = 0) {
  if (valor == null || !Number.isFinite(valor)) return '—'
  const [entero, fraccion] = Math.abs(valor).toFixed(decimales).split('.')
  return `${valor < 0 ? '-' : ''}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraccion ? `,${fraccion}` : ''}`
}

// Marcas "redondas" del eje que cubren [min, max] en unos 4 pasos.
function marcas(min, max) {
  const bruto = (max - min || 1) / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto)
  const lista = []
  for (let valor = Math.floor(min / paso) * paso; valor <= Math.ceil(max / paso) * paso + paso / 2; valor += paso) {
    lista.push(Math.abs(valor) < paso / 1e6 ? 0 : valor)
  }
  return lista
}

const compacto = (valor) => {
  const abs = Math.abs(valor)
  return `${valor < 0 ? '-' : ''}${abs >= 1e6 ? `${num(abs / 1e6, 1)}M` : abs >= 1e3 ? `${num(abs / 1e3, abs >= 1e4 ? 0 : 1)}k` : num(abs)}`
}

// datos: { recursos, propuesta: { id, fecha, cliente, direccion, moneda, validezDias }, marca, autor,
//   parametros: { hsp, pr, tempMin, inflacion, degradacion, descuento, factorCo2 }, imagen3d, imagenTecho,
//   sistema, evaluacion, proyeccion, red, techo, bateria, consumo, precioWp,
//   arquitectura: 'on_grid' | 'off_grid' | 'hibrido',
//   almacenamiento: banco de baterías (lib/almacenamiento.js) o null, simulacion: día típico de 24 h o null }
export function construirPropuestaPdf(jsPDF, datos) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const { propuesta, marca, autor, sistema, evaluacion, proyeccion, parametros, consumo } = datos
  const { panel, inversor } = sistema
  const iconos = datos.recursos?.iconos ?? {}
  const PRIMARIO = rgb(marca.primario)
  const SECUNDARIO = rgb(marca.secundario)
  const [SERIE_1, SERIE_2] = marca.graficos.map(rgb)
  const moneda = propuesta.moneda || '$'
  const dinero = (valor, decimales = 0) => (valor == null || !Number.isFinite(valor) ? '—' : `${moneda} ${num(valor, decimales)}`)

  // Tipografía: Lato si se pudo cargar; si no, la estándar (que solo cubre Latin-1).
  let FUENTE = 'helvetica'
  if (datos.recursos?.fuentes) {
    doc.addFileToVFS('Lato-Regular.ttf', datos.recursos.fuentes.regular)
    doc.addFont('Lato-Regular.ttf', 'Lato', 'normal')
    doc.addFileToVFS('Lato-Bold.ttf', datos.recursos.fuentes.bold)
    doc.addFont('Lato-Bold.ttf', 'Lato', 'bold')
    FUENTE = 'Lato'
  }
  const seguro = (contenido) => {
    const cadena = String(contenido ?? '')
    return FUENTE === 'Lato' ? cadena : cadena.replace(/₂/g, '2').replace(/[−–—]/g, '-').replace(/[^\u0000-ÿ]/g, '')
  }

  const texto = (contenido, x, y, opciones = {}) => {
    const { tamano = 10, color = TINTA, negrita = false, align = 'left', ancho, interlineado = 1.25 } = opciones
    doc.setFont(FUENTE, negrita ? 'bold' : 'normal')
    doc.setFontSize(tamano)
    doc.setTextColor(...color)
    const lineas = ancho ? doc.splitTextToSize(seguro(contenido), ancho) : [seguro(contenido)]
    doc.text(lineas, x, y, { align, lineHeightFactor: interlineado })
    return lineas.length
  }
  const anchoDe = (contenido, tamano, negrita = false) => {
    doc.setFont(FUENTE, negrita ? 'bold' : 'normal')
    doc.setFontSize(tamano)
    return doc.getTextWidth(seguro(contenido))
  }
  const caja = (x, y, ancho, alto, color, radio = 0) => {
    doc.setFillColor(...color)
    if (radio) doc.roundedRect(x, y, ancho, alto, radio, radio, 'F')
    else doc.rect(x, y, ancho, alto, 'F')
  }
  const icono = (nombre, x, y, lado) => iconos[nombre] && doc.addImage(iconos[nombre], 'PNG', x, y, lado, lado)

  // Logo de la marca ajustado a una altura; sin archivo de logo, el nombre hace de membrete.
  const membrete = (x, yBase, alto, tamanoTexto) => {
    if (marca.logo) {
      doc.addImage(marca.logo.dataUrl, 'PNG', x, yBase - alto, (alto * marca.logo.ancho) / marca.logo.alto, alto)
    } else {
      texto(marca.nombre.toUpperCase(), x, yBase - alto * 0.28, { tamano: tamanoTexto, color: PRIMARIO, negrita: true })
    }
  }

  const tituloDocumento = `Sistema solar fotovoltaico ${num(evaluacion.kwp, 2)} kWp${propuesta.cliente ? ` — ${propuesta.cliente}` : ''}`
  let pagina = 1
  const pie = () => {
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.2)
    doc.line(MARGEN, ALTO - 15, ANCHO - MARGEN, ALTO - 15)
    texto(`${marca.nombre} · ${propuesta.id} · ${tituloDocumento}`, MARGEN, ALTO - 10, { tamano: 7.5, color: TENUE, ancho: UTIL - 26 })
    texto(`Página ${pagina}`, ANCHO - MARGEN, ALTO - 10, { tamano: 7.5, color: TENUE, align: 'right' })
  }

  // Hoja interior nueva: logo pequeño, número de propuesta y título de sección numerado.
  let seccion = 0
  const nuevaHoja = (titulo) => {
    doc.addPage()
    pagina += 1
    membrete(MARGEN, 19, 13, 12)
    texto(propuesta.id, ANCHO - MARGEN, 12, { tamano: 9, color: PRIMARIO, negrita: true, align: 'right' })
    texto(propuesta.fecha, ANCHO - MARGEN, 16.5, { tamano: 7.5, color: TENUE, align: 'right' })
    caja(0, 22, ANCHO, 0.9, PRIMARIO)
    caja(0, 22.9, ANCHO, 0.5, SECUNDARIO)
    seccion += 1
    texto(`${seccion}.  ${titulo}`, MARGEN, 35, { tamano: 16, negrita: true, color: PRIMARIO })
    pie()
    return 44
  }

  const subtitulo = (contenido, y) => {
    texto(contenido, MARGEN, y, { tamano: 11, negrita: true, color: PRIMARIO })
    caja(MARGEN, y + 1.8, 12, 0.7, SECUNDARIO)
    return y + 8
  }
  const parrafo = (contenido, y, opciones = {}) => {
    const lineas = texto(contenido, MARGEN, y, { tamano: 9.5, color: TENUE, ancho: UTIL, interlineado: 1.4, ...opciones })
    return y + lineas * 4.7 + 2
  }

  // Tabla con encabezado de color y filas alternas. columnas: [{ titulo, ancho, align }];
  // una celda puede ser texto o { texto, color, negrita }. Devuelve la y donde termina.
  const tabla = (columnas, filas, y, { x = MARGEN, tamano = 8.5 } = {}) => {
    const total = columnas.reduce((suma, columna) => suma + columna.ancho, 0)
    caja(x, y, total, 7.5, PRIMARIO)
    let cx = x
    for (const columna of columnas) {
      const centro = columna.align === 'left' ? cx + 2.5 : cx + columna.ancho / 2
      texto(columna.titulo, centro, y + 5, { tamano, negrita: true, color: BLANCO, align: columna.align === 'left' ? 'left' : 'center' })
      cx += columna.ancho
    }
    let cursor = y + 7.5
    filas.forEach((fila, indice) => {
      const celdas = fila.map((celda) => (typeof celda === 'object' && celda !== null ? celda : { texto: celda }))
      doc.setFont(FUENTE, 'normal')
      doc.setFontSize(tamano)
      const lineas = Math.max(...celdas.map((celda, i) => doc.splitTextToSize(seguro(celda.texto), columnas[i].ancho - 5).length))
      const alto = 3 + lineas * 3.9
      if (indice % 2 === 0) caja(x, cursor, total, alto, FONDO)
      cx = x
      celdas.forEach((celda, i) => {
        const columna = columnas[i]
        const izquierda = columna.align === 'left'
        texto(celda.texto, izquierda ? cx + 2.5 : cx + columna.ancho / 2, cursor + 4.6, {
          tamano,
          color: celda.color ?? (i === 0 ? TINTA : TENUE),
          negrita: celda.negrita ?? false,
          align: izquierda ? 'left' : 'center',
          ancho: columna.ancho - 5,
          interlineado: 1.3,
        })
        cx += columna.ancho
      })
      cursor += alto
    })
    doc.setDrawColor(...LINEA)
    doc.setLineWidth(0.2)
    doc.rect(x, y, total, cursor - y)
    return cursor + 6
  }

  // Tarjeta de indicador: icono, cifra grande y etiqueta.
  const indicador = (x, y, ancho, alto, { icono: nombre, valor, unidad, etiqueta, destacado = false }) => {
    caja(x, y, ancho, alto, destacado ? tinte(SECUNDARIO, 0.86) : FONDO, 1.6)
    caja(x, y, ancho, 1, destacado ? SECUNDARIO : PRIMARIO)
    icono(nombre, x + 3.5, y + 4.5, 6.5)
    texto(valor, x + 3.5, y + alto - 9.5, { tamano: 13.5, negrita: true, color: PRIMARIO })
    if (unidad) texto(unidad, x + 3.5 + anchoDe(valor, 13.5, true) + 1.2, y + alto - 9.5, { tamano: 8, color: TENUE })
    texto(etiqueta, x + 3.5, y + alto - 4, { tamano: 7.5, color: TENUE })
  }
  const filaIndicadores = (lista, y, alto = 27) => {
    const ancho = (UTIL - 4 * (lista.length - 1)) / lista.length
    lista.forEach((item, i) => indicador(MARGEN + (ancho + 4) * i, y, ancho, alto, item))
    return y + alto + 5
  }

  // --- Gráficas -----------------------------------------------------------------------------
  const leyenda = (items, x, y) => {
    let cursor = x
    for (const [color, etiqueta] of items) {
      caja(cursor, y - 2.4, 2.8, 2.8, color, 0.5)
      texto(etiqueta, cursor + 4.2, y, { tamano: 7.5, color: TENUE })
      cursor += 9 + anchoDe(etiqueta, 7.5)
    }
  }
  const ejes = (x, y, ancho, alto, ticks, formato, unidad) => {
    const [piso, techo] = [ticks[0], ticks.at(-1)]
    const aY = (valor) => y + alto * (1 - (valor - piso) / (techo - piso))
    doc.setLineWidth(0.15)
    for (const tick of ticks) {
      doc.setDrawColor(...(tick === 0 ? TENUE : LINEA))
      doc.line(x, aY(tick), x + ancho, aY(tick))
      texto(formato(tick), x - 2, aY(tick) + 1, { tamano: 6.8, color: TENUE, align: 'right' })
    }
    if (unidad) texto(unidad, x - 2, y - 3, { tamano: 6.5, color: TENUE, align: 'right' })
    return aY
  }
  // Columna con la punta superior redondeada y la base recta sobre el eje.
  const columna = (x, yArriba, ancho, alto, color) => {
    if (alto <= 0.05) return
    const radio = Math.min(0.9, ancho / 2, alto)
    caja(x, yArriba, ancho, alto, color, radio)
    caja(x, yArriba + radio, ancho, alto - radio, color)
  }
  const poligono = (puntos, color) => {
    doc.setFillColor(...color)
    doc.lines(puntos.slice(1).map((p, i) => [p[0] - puntos[i][0], p[1] - puntos[i][1]]), puntos[0][0], puntos[0][1], [1, 1], 'F', true)
  }
  const polilinea = (puntos, color, grosor = 0.6) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(grosor)
    for (let i = 1; i < puntos.length; i++) doc.line(puntos[i - 1][0], puntos[i - 1][1], puntos[i][0], puntos[i][1])
  }
  const marcador = (x, y, color) => {
    doc.setFillColor(...BLANCO)
    doc.circle(x, y, 1.8, 'F')
    doc.setFillColor(...color)
    doc.circle(x, y, 1.25, 'F')
  }

  // Producción frente a consumo, mes a mes, con el valor de producción sobre cada barra.
  const graficoMensual = (x, y, ancho, alto, consumoMes, generacionMes) => {
    leyenda(
      [
        [SERIE_1, 'Consumo del sitio'],
        [SERIE_2, `Producción solar — ${num(evaluacion.kwp, 2)} kWp`],
      ],
      x,
      y - 5,
    )
    const aY = ejes(x, y, ancho, alto, marcas(0, Math.max(...consumoMes, ...generacionMes) * 1.08), (v) => num(v), 'kWh')
    const banda = ancho / 12
    const barra = Math.min(4.6, (banda - 3) / 2)
    MESES.forEach((mes, i) => {
      const x0 = x + i * banda + (banda - barra * 2 - 0.6) / 2
      columna(x0, aY(consumoMes[i]), barra, aY(0) - aY(consumoMes[i]), SERIE_1)
      columna(x0 + barra + 0.6, aY(generacionMes[i]), barra, aY(0) - aY(generacionMes[i]), SERIE_2)
      texto(num(generacionMes[i]), x0 + barra * 1.5 + 0.6, aY(generacionMes[i]) - 1.2, { tamano: 6.2, negrita: true, color: TINTA, align: 'center' })
      texto(mes, x + i * banda + banda / 2, y + alto + 4.5, { tamano: 7, color: TENUE, align: 'center' })
    })
  }

  // Día típico: campana de generación frente al consumo medio del sitio. Rotula el pico y devuelve
  // el reparto de la energía del día: { directo, excedente, red } en kWh.
  const graficoDia = (x, y, ancho, alto, energiaDia, consumoMedioKw) => {
    const pico = energiaDia / 6 // área de sen² entre las 6 y las 18 h
    const generacion = (hora) => (hora > 6 && hora < 18 ? pico * Math.sin((Math.PI * (hora - 6)) / 12) ** 2 : 0)
    const aY = ejes(x, y, ancho, alto, marcas(0, Math.max(pico, consumoMedioKw) * 1.18), (v) => num(v, v % 1 ? 1 : 0), 'kW')
    const aX = (hora) => x + (ancho * hora) / 24
    const horas = Array.from({ length: 97 }, (_, i) => i / 4)
    const curva = (fn) => horas.map((hora) => [aX(hora), aY(fn(hora))])
    // Franjas de noche, para leer de un vistazo cuándo hay sol.
    caja(x, y, aX(6) - x, alto, tinte(GRIS, 0.88))
    caja(aX(18), y, x + ancho - aX(18), alto, tinte(GRIS, 0.88))
    // Lo que cubre la red (gris), el excedente (tinte de la generación) y lo que cubre el sol.
    caja(x, aY(consumoMedioKw), ancho, aY(0) - aY(consumoMedioKw), tinte(GRIS, 0.45))
    poligono([...curva(generacion), [aX(24), aY(0)], [aX(0), aY(0)]], tinte(SERIE_2, 0.5))
    poligono([...curva((hora) => Math.min(generacion(hora), consumoMedioKw)), [aX(24), aY(0)], [aX(0), aY(0)]], SERIE_1)
    polilinea(curva(generacion), SERIE_2, 0.7)
    doc.setDrawColor(...TINTA)
    doc.setLineWidth(0.4)
    doc.line(x, aY(consumoMedioKw), x + ancho, aY(consumoMedioKw))
    texto(`Consumo medio ${num(consumoMedioKw, 1)} kW`, x + ancho - 1.5, aY(consumoMedioKw) - 1.5, { tamano: 7, negrita: true, align: 'right' })
    marcador(aX(12), aY(pico), SERIE_2)
    texto(`Pico de generación ${num(pico, 1)} kW`, aX(12), aY(pico) - 3, { tamano: 7.5, negrita: true, align: 'center' })
    for (let hora = 0; hora <= 24; hora += 3) texto(`${hora}:00`, aX(hora), y + alto + 4.5, { tamano: 7, color: TENUE, align: hora === 24 ? 'right' : hora === 0 ? 'left' : 'center' })
    leyenda(
      [
        [SERIE_1, 'Consumo cubierto por el sol'],
        [tinte(SERIE_2, 0.5), 'Excedente diurno'],
        [tinte(GRIS, 0.45), 'Consumo cubierto por la red'],
      ],
      x,
      y - 5,
    )
    const directo = horas.slice(1).reduce((suma, hora) => suma + Math.min(generacion(hora), consumoMedioKw) * 0.25, 0)
    return { directo, excedente: energiaDia - directo, red: consumoMedioKw * 24 - directo }
  }

  // Tira de cifras al estilo de un panel de producción: etiqueta pequeña y valor grande, en columnas.
  const cifras = (lista, y) => {
    const ancho = UTIL / lista.length
    caja(MARGEN, y, UTIL, 17, FONDO, 1.6)
    lista.forEach(([etiqueta, valor, unidad], i) => {
      const cx = MARGEN + ancho * i + 4
      if (i) {
        doc.setDrawColor(...LINEA)
        doc.setLineWidth(0.2)
        doc.line(MARGEN + ancho * i, y + 3, MARGEN + ancho * i, y + 14)
      }
      texto(etiqueta, cx, y + 5.5, { tamano: 7, color: TENUE })
      texto(valor, cx, y + 12.5, { tamano: 12.5, negrita: true, color: PRIMARIO })
      if (unidad) texto(unidad, cx + anchoDe(valor, 12.5, true) + 1, y + 12.5, { tamano: 7, color: TENUE })
    })
    return y + 22
  }

  // Factura anual antes y después del sistema.
  const graficoFactura = (x, y, ancho, alto, actual, conSistema) => {
    const aY = ejes(x, y, ancho, alto, marcas(0, actual * 1.12), (v) => compacto(v), moneda)
    const barra = Math.min(22, ancho / 4)
    const barras = [
      ['Situación actual', actual, GRIS],
      ['Con el sistema', conSistema, SERIE_1],
    ]
    barras.forEach(([etiqueta, valor, color], i) => {
      const cx = x + (ancho / 2) * (i + 0.5)
      columna(cx - barra / 2, aY(valor), barra, aY(0) - aY(valor), color)
      texto(dinero(valor), cx, aY(valor) - 1.8, { tamano: 8.5, negrita: true, color: TINTA, align: 'center' })
      texto(etiqueta, cx, y + alto + 4.5, { tamano: 7.5, color: TENUE, align: 'center' })
    })
  }

  // Flujo de caja acumulado, con el punto de equilibrio marcado.
  const graficoFlujo = (x, y, ancho, alto, flujo, payback) => {
    const anios = flujo.length - 1
    const valores = flujo.map((punto) => punto.acumulado)
    const ticks = marcas(Math.min(0, ...valores), Math.max(0, ...valores))
    const aX = (anio) => x + (ancho * anio) / anios
    const puntosDe = (aY) => flujo.map((punto) => [aX(punto.anio), aY(punto.acumulado)])
    // El área va primero para que la rejilla y la línea queden encima.
    const [piso, techo] = [ticks[0], ticks.at(-1)]
    const aYPrevio = (valor) => y + alto * (1 - (valor - piso) / (techo - piso))
    poligono([...puntosDe(aYPrevio), [aX(anios), aYPrevio(0)], [aX(0), aYPrevio(0)]], tinte(SERIE_1, 0.82))
    const aY = ejes(x, y, ancho, alto, ticks, (v) => compacto(v), moneda)
    polilinea(puntosDe(aY), SERIE_1, 0.7)
    for (const punto of flujo.filter((p) => p.anio % 5 === 0)) {
      texto(punto.anio === 0 ? 'Año 0' : `Año ${punto.anio}`, aX(punto.anio), y + alto + 4.5, { tamano: 7, color: TENUE, align: 'center' })
    }
    if (payback != null) {
      doc.setDrawColor(...TENUE)
      doc.setLineWidth(0.2)
      doc.line(aX(payback), y, aX(payback), aY(0))
      marcador(aX(payback), aY(0), SERIE_2)
      texto(`Retorno: ${num(payback, 1)} años`, aX(payback) + 2.5, y + 3.5, { tamano: 8.5, negrita: true })
    }
    const ultimo = flujo.at(-1)
    marcador(aX(anios), aY(ultimo.acumulado), SERIE_1)
    texto(dinero(ultimo.acumulado), aX(anios) - 3, aY(ultimo.acumulado) - 2.5, { tamano: 8.5, negrita: true, align: 'right' })
  }

  // Ahorro de cada año: crece con la tarifa aunque el módulo se degrade.
  const graficoAhorros = (x, y, ancho, alto, flujo) => {
    const anuales = flujo.slice(1)
    const aY = ejes(x, y, ancho, alto, marcas(0, Math.max(...anuales.map((p) => p.ahorro)) * 1.1), (v) => compacto(v), moneda)
    const banda = ancho / anuales.length
    anuales.forEach((punto, i) => {
      columna(x + i * banda + banda * 0.18, aY(punto.ahorro), banda * 0.64, aY(0) - aY(punto.ahorro), punto.anio % 5 === 0 || punto.anio === 1 ? SERIE_2 : tinte(SERIE_2, 0.4))
      if (punto.anio % 5 === 0 || punto.anio === 1) {
        texto(compacto(punto.ahorro), x + i * banda + banda / 2, aY(punto.ahorro) - 1.2, { tamano: 6.2, negrita: true, align: 'center' })
        texto(`${punto.anio}`, x + i * banda + banda / 2, y + alto + 4.5, { tamano: 7, color: TENUE, align: 'center' })
      }
    })
  }

  // ====================================================================== Hoja 1: portada
  membrete(MARGEN, 46, 34, 24)
  texto('PROPUESTA TÉCNICO-COMERCIAL', ANCHO - MARGEN, 22, { tamano: 8, color: TENUE, align: 'right' })
  texto(propuesta.id, ANCHO - MARGEN, 30, { tamano: 15, color: PRIMARIO, negrita: true, align: 'right' })
  texto(propuesta.fecha, ANCHO - MARGEN, 36.5, { tamano: 9.5, color: TENUE, align: 'right' })
  caja(MARGEN, 51, UTIL, 0.9, SECUNDARIO)

  texto('PROPUESTA DE SISTEMA SOLAR FOTOVOLTAICO', MARGEN, 64, { tamano: 20, negrita: true, color: PRIMARIO, ancho: UTIL })
  // Tipología en una etiqueta, seguida de la potencia y los módulos.
  const tipologia = TIPOLOGIAS[datos.arquitectura] ?? TIPOLOGIAS.on_grid
  const anchoEtiqueta = anchoDe(tipologia, 9.5, true) + 7
  caja(MARGEN, 68.6, anchoEtiqueta, 7, PRIMARIO, 1.4)
  texto(tipologia, MARGEN + anchoEtiqueta / 2, 73.4, { tamano: 9.5, negrita: true, color: BLANCO, align: 'center' })
  const tecnologia = { MONOFACIAL: ' monofaciales', BIFACIAL: ' bifaciales' }[panel.tipo_tecnologia] ?? ''
  texto(`${num(evaluacion.kwp, 2)} kWp — ${sistema.numPaneles} módulos${tecnologia} de ${panel.potencia_wp} Wp`, MARGEN + anchoEtiqueta + 4, 73.6, { tamano: 12.5, color: TENUE })
  texto(
    `Producción estimada de ${num(evaluacion.generacionAnualKwh)} kWh al año${evaluacion.cobertura ? ` · cubre el ${num(evaluacion.cobertura * 100)} % del consumo anual` : ''}`,
    MARGEN,
    81.5,
    { tamano: 10.5, color: oscuro(SECUNDARIO, 0.3) },
  )

  // Imagen principal: el render 3D capturado en el visor; sin él, la vista satelital del arreglo.
  const yImagen = 87
  const portada = datos.imagen3d ? { imagen: datos.imagen3d, tipo: /^data:image\/jpe?g/.test(datos.imagen3d) ? 'JPEG' : 'PNG', alto: (UTIL * 940) / 1600 } : datos.imagenTecho ? { imagen: datos.imagenTecho, tipo: 'JPEG', alto: (UTIL * 640) / 1200 } : null
  const altoImagen = portada?.alto ?? 95
  if (portada) {
    doc.addImage(portada.imagen, portada.tipo, MARGEN, yImagen, UTIL, altoImagen)
  } else {
    caja(MARGEN, yImagen, UTIL, altoImagen, FONDO)
    texto('Sin imagen del diseño: traza el techo y captura el render 3D en el módulo de Diseño.', ANCHO / 2, yImagen + altoImagen / 2, { tamano: 9, color: TENUE, align: 'center' })
  }
  doc.setDrawColor(...LINEA)
  doc.setLineWidth(0.3)
  doc.rect(MARGEN, yImagen, UTIL, altoImagen)

  // Inversión a la vista en la primera página: total, precio por vatio y, con baterías, el desglose.
  let y = yImagen + altoImagen + 5
  if (proyeccion) {
    const conAlmacen = proyeccion.costoTotal > proyeccion.costoSistema
    const altoPrecio = 22
    caja(MARGEN, y, UTIL, altoPrecio, tinte(PRIMARIO, 0.92), 2)
    caja(MARGEN, y, 2.2, altoPrecio, PRIMARIO)
    texto('INVERSIÓN TOTAL DEL PROYECTO', MARGEN + 8, y + 7, { tamano: 7.5, color: TENUE })
    texto(dinero(proyeccion.costoTotal), MARGEN + 8, y + 16.5, { tamano: 21, negrita: true, color: PRIMARIO })
    const columnas = [[conAlmacen ? 'PRECIO POR WATT' : 'PRECIO POR WATT INSTALADO', `${moneda} ${num(datos.precioWp, 2)}/Wp`]]
    if (conAlmacen) columnas.push(['SISTEMA FOTOVOLTAICO', dinero(proyeccion.costoSistema)], ['ALMACENAMIENTO', dinero(proyeccion.costoTotal - proyeccion.costoSistema)])
    const x0 = MARGEN + 66
    const anchoColumna = (UTIL - 66) / columnas.length
    columnas.forEach(([etiqueta, valor], i) => {
      const cx = x0 + anchoColumna * i
      doc.setDrawColor(...tinte(PRIMARIO, 0.7))
      doc.setLineWidth(0.25)
      doc.line(cx, y + 4, cx, y + altoPrecio - 4)
      texto(etiqueta, cx + 4, y + 7, { tamano: 6.5, color: TENUE })
      texto(valor, cx + 4, y + 15.5, { tamano: conAlmacen ? 11.5 : 14, negrita: true })
    })
    y += altoPrecio + 4
  } else {
    y += 2
  }

  // Ficha de la propuesta.
  const ficha = [
    ['Cliente', propuesta.cliente || 'Por definir'],
    ['Sitio', propuesta.direccion || 'Por definir'],
    ['Elaborado por', autor.firma ?? autor.nombre],
    ['Validez', `${propuesta.validezDias} días calendario a partir de la fecha de emisión`],
  ]
  const altoFila = 6.6
  ficha.forEach(([clave, valor], i) => {
    if (i % 2 === 0) caja(MARGEN, y, UTIL, altoFila, FONDO)
    texto(clave, MARGEN + 3, y + 4.5, { tamano: 9, negrita: true })
    texto(valor, MARGEN + 46, y + 4.5, { tamano: 9, color: TENUE, ancho: UTIL - 50 })
    y += altoFila
  })
  doc.setDrawColor(...LINEA)
  doc.setLineWidth(0.2)
  doc.rect(MARGEN, y - ficha.length * altoFila, UTIL, ficha.length * altoFila)

  // Franja inferior con el contacto.
  caja(0, ALTO - 20, ANCHO, 20, PRIMARIO)
  caja(0, ALTO - 20, ANCHO, 1, SECUNDARIO)
  texto(marca.lema || marca.nombre, MARGEN, ALTO - 9, { tamano: 9.5, color: BLANCO, negrita: true })
  texto([autor.web, autor.instagram, autor.telefono && `Tel. ${autor.telefono}`].filter(Boolean).join(' · '), ANCHO - MARGEN, ALTO - 9, { tamano: 8.5, color: BLANCO, align: 'right' })

  // ====================================================================== Hoja 2: resumen ejecutivo
  y = nuevaHoja('Resumen ejecutivo')
  y = parrafo(
    `${marca.nombre} presenta${propuesta.cliente ? ` a ${propuesta.cliente}` : ''} una propuesta de sistema solar fotovoltaico de ${num(evaluacion.kwp, 2)} kWp. ` +
      `El sistema está compuesto por ${sistema.numPaneles} módulos ${panel.marca} de ${panel.potencia_wp} Wp` +
      (inversor ? ` y ${sistema.cantidad} inversor${sistema.cantidad > 1 ? 'es' : ''} ${inversor.marca} con ${num(evaluacion.potenciaAcKw, 2)} kW de potencia` : '') +
      `, y produce una energía estimada de ${num(evaluacion.generacionAnualKwh)} kWh al año` +
      (evaluacion.cobertura != null ? `, equivalente al ${num(evaluacion.cobertura * 100)} % del consumo eléctrico actual del inmueble.` : '.'),
    y,
  )
  y = filaIndicadores(
    [
      { icono: 'modulos', valor: `${sistema.numPaneles}`, etiqueta: `módulos de ${panel.potencia_wp} Wp` },
      { icono: 'potencia', valor: num(evaluacion.kwp, 2), unidad: 'kWp', etiqueta: 'potencia instalada', destacado: true },
      { icono: 'inversor', valor: num(evaluacion.potenciaAcKw, 1), unidad: 'kW', etiqueta: 'potencia de inversores' },
    ],
    y + 2,
  )
  y = filaIndicadores(
    [
      { icono: 'generacion', valor: num(evaluacion.generacionAnualKwh), unidad: 'kWh', etiqueta: 'producción anual', destacado: true },
      { icono: 'area', valor: evaluacion.areaCaptacionM2 ? num(evaluacion.areaCaptacionM2, 1) : '—', unidad: 'm²', etiqueta: 'área de captación' },
      { icono: 'cobertura', valor: evaluacion.cobertura != null ? num(evaluacion.cobertura * 100) : '—', unidad: '%', etiqueta: 'cobertura del consumo' },
    ],
    y,
  )

  y = subtitulo('Indicadores financieros', y + 4)
  if (proyeccion) {
    y = filaIndicadores(
      [
        { icono: 'inversion', valor: dinero(proyeccion.costoTotal), etiqueta: 'inversión total' },
        { icono: 'ahorro', valor: dinero(proyeccion.ahorroAnual), etiqueta: 'ahorro del primer año', destacado: true },
        { icono: 'retorno', valor: proyeccion.payback == null ? '> 25' : num(proyeccion.payback, 1), unidad: 'años', etiqueta: 'retorno de la inversión' },
        { icono: 'rentabilidad', valor: proyeccion.tir == null ? '—' : num(proyeccion.tir, 1), unidad: '%', etiqueta: 'TIR a 25 años' },
      ],
      y,
    )
    y = parrafo(
      `Con una inversión de ${dinero(proyeccion.costoTotal)}, el sistema genera un ahorro de ${dinero(proyeccion.ahorroAnual)} en el primer año y recupera la inversión en ` +
        `${proyeccion.payback == null ? 'más de 25' : num(proyeccion.payback, 1)} años. A lo largo de 25 años produce un beneficio acumulado de ${dinero(proyeccion.gananciaNeta)} ` +
        `y evita la emisión de ${num(proyeccion.co2Toneladas)} toneladas de CO₂.`,
      y + 1,
    )
  } else {
    y = parrafo('Faltan el costo de la energía o el precio por vatio instalado para calcular los indicadores financieros.', y)
  }

  // Vista satelital del arreglo, cuando la portada ya lleva el render 3D.
  if (datos.imagen3d && datos.imagenTecho && y < 190) {
    y = subtitulo('Ubicación del arreglo', y + 4)
    const anchoMapa = 104
    const altoMapa = (anchoMapa * 640) / 1200
    doc.addImage(datos.imagenTecho, 'JPEG', MARGEN, y, anchoMapa, altoMapa)
    doc.setDrawColor(...LINEA)
    doc.rect(MARGEN, y, anchoMapa, altoMapa)
    if (datos.techo) {
      const detalles = [
        ['Área del techo', `${num(datos.techo.areaM2, 1)} m²`],
        ['Azimut del arreglo', `${num(datos.techo.azimut)}°`],
        ['Inclinación', `${num(datos.techo.inclinacion)}°`],
        ['Capacidad física', datos.techo.cantidad != null ? `${datos.techo.cantidad} módulos` : '—'],
        ['Módulos colocados', `${sistema.numPaneles}`],
      ]
      detalles.forEach(([clave, valor], i) => {
        const yFila = y + 5 + i * 10.5
        texto(clave.toUpperCase(), MARGEN + anchoMapa + 7, yFila, { tamano: 6.8, color: TENUE })
        texto(valor, MARGEN + anchoMapa + 7, yFila + 5, { tamano: 11, negrita: true, color: PRIMARIO })
      })
    }
  }

  // ====================================================================== Hoja 3: sistema propuesto
  y = nuevaHoja('El sistema solar propuesto')
  y = subtitulo('Componentes principales', y)
  const componentes = [
    [
      { texto: 'Módulos fotovoltaicos', negrita: true },
      `${panel.marca} ${panel.modelo} · ${panel.potencia_wp} Wp` +
        (panel.eficiencia ? ` · eficiencia ${num(panel.eficiencia, 1)} %` : '') +
        (panel.largo_mm ? ` · ${panel.largo_mm} × ${panel.ancho_mm} mm` : '') +
        (panel.peso_kg ? ` · ${num(panel.peso_kg, 1)} kg` : ''),
      `${sistema.numPaneles} und`,
    ],
  ]
  if (inversor) {
    componentes.push([
      { texto: sistema.cantidad > 1 ? 'Inversores' : 'Inversor', negrita: true },
      `${inversor.marca} ${inversor.modelo} · ${num(inversor.potencia_ac_nominal_kw, 2)} kW · ${[].concat(inversor.tipo_red ?? 'red sin dato').join('; ')}` +
        (inversor.mppt_num ? ` · ${inversor.mppt_num} seguidores MPPT` : ''),
      `${sistema.cantidad} und`,
    ])
  }
  if (datos.bateria) {
    const { equipo, cantidad, capacidadKwh, autonomiaHoras } = datos.bateria
    componentes.push([
      { texto: 'Almacenamiento', negrita: true },
      `${equipo.marca} ${equipo.modelo} · ${num(equipo.capacidad_kwh, 2)} kWh por unidad · ${num(capacidadKwh, 1)} kWh en total` +
        (equipo.tipo_quimica ? ` · ${equipo.tipo_quimica}` : '') +
        (autonomiaHoras ? ` · ~${num(autonomiaHoras, 1)} h de autonomía al consumo medio` : ''),
      `${cantidad} und`,
    ])
  }
  y = tabla(
    [
      { titulo: 'Componente', ancho: 44, align: 'left' },
      { titulo: 'Descripción', ancho: 108 },
      { titulo: 'Cantidad', ancho: 26 },
    ],
    componentes,
    y,
  )

  y = subtitulo('Parámetros del sistema', y + 2)
  const { strings, interconexion } = evaluacion
  const parametrosSistema = [
    ['Potencia instalada', `${num(evaluacion.kwp, 2)} kWp`, 'Potencia de inversores', evaluacion.potenciaAcKw ? `${num(evaluacion.potenciaAcKw, 2)} kW` : '—'],
    ['Número de módulos', `${sistema.numPaneles} unidades`, 'Configuración de cadenas', strings.strings ? `${strings.strings} × ~${strings.porString} módulos` : '—'],
    ['Área de captación', evaluacion.areaCaptacionM2 ? `${num(evaluacion.areaCaptacionM2, 1)} m²` : '—', 'Peso de los módulos', panel.peso_kg ? `${num(panel.peso_kg * sistema.numPaneles)} kg` : '—'],
    ['Producción anual estimada', `${num(evaluacion.generacionAnualKwh)} kWh`, 'Producción media mensual', `${num(evaluacion.generacionMensualKwh)} kWh`],
    ['Rendimiento específico', `${num(evaluacion.generacionAnualKwh / evaluacion.kwp)} kWh/kWp·año`, 'Tensión de servicio', datos.red.label],
  ]
  y = tabla(
    [
      { titulo: 'Parámetro', ancho: 50, align: 'left' },
      { titulo: 'Valor', ancho: 39 },
      { titulo: 'Parámetro', ancho: 50, align: 'left' },
      { titulo: 'Valor', ancho: 39 },
    ],
    parametrosSistema.map(([a, b, c, d]) => [a, b, { texto: c, color: TINTA }, d]),
    y,
  )

  y = subtitulo('Verificación eléctrica del diseño', y + 2)
  const estado = (clave) => ({ texto: ESTADOS[clave][0], color: ESTADOS[clave][1], negrita: true })
  const cumple = (condicion) => estado(condicion == null ? 'pendiente' : condicion ? 'ok' : 'danger')
  const verificaciones = []
  if (inversor) {
    verificaciones.push(
      [
        `Tensión de circuito abierto (cadena más larga, a ${num(parametros.tempMin)} °C)`,
        strings.vocString ? `${num(strings.vocString, 1)} V` : '—',
        inversor.voc_max ? `${inversor.voc_max} V máximo` : 'Sin dato',
        cumple(strings.vocString && inversor.voc_max ? strings.vocString <= inversor.voc_max : null),
      ],
      [
        `Tensión de máxima potencia (cadena más corta, celda a ${strings.tempCelda ?? 70} °C)`,
        strings.vmpString ? `${num(strings.vmpString, 1)} V` : '—',
        inversor.v_mppt_min ? `${inversor.v_mppt_min} – ${inversor.v_mppt_max ?? '—'} V` : 'Sin dato',
        cumple(strings.vmpString && inversor.v_mppt_min ? strings.vmpString >= inversor.v_mppt_min && (!inversor.v_mppt_max || strings.vmpString <= inversor.v_mppt_max) : null),
      ],
      [
        'Corriente de cortocircuito del módulo',
        panel.isc ? `${num(panel.isc, 2)} A` : '—',
        inversor.isc_max_mppt ? `${inversor.isc_max_mppt} A por MPPT` : 'Sin dato',
        cumple(panel.isc && inversor.isc_max_mppt ? panel.isc <= inversor.isc_max_mppt : null),
      ],
      ['Relación de potencia DC/AC', evaluacion.ratio.valor ? num(evaluacion.ratio.valor, 2) : '—', '1,10 – 1,30 recomendado', estado(evaluacion.ratio.estado)],
    )
  }
  if (datos.arquitectura !== 'off_grid') verificaciones.push(
    [
      'Corriente de salida continua (125 %)',
      interconexion.acometida.corrienteContinua ? `${num(interconexion.acometida.corrienteContinua, 1)} A` : '—',
      datos.red.interruptorA ? `Interruptor principal de ${datos.red.interruptorA} A` : 'Sin dato',
      estado(interconexion.acometida.estado),
    ],
    [
      'Potencia AC frente al transformador',
      evaluacion.potenciaAcKw ? `${num(evaluacion.potenciaAcKw, 1)} kW` : '—',
      datos.red.transformadorKva ? `${datos.red.transformadorKva} kVA` : 'Sin dato',
      estado(interconexion.transformador.estado),
    ],
  )
  tabla(
    [
      { titulo: 'Verificación', ancho: 78, align: 'left' },
      { titulo: 'Calculado', ancho: 30 },
      { titulo: 'Límite del equipo', ancho: 46 },
      { titulo: 'Estado', ancho: 24 },
    ],
    verificaciones,
    y,
  )

  // ====================================================================== Hoja técnica de equipos y almacenamiento
  y = nuevaHoja(datos.almacenamiento?.bateria ? 'Equipos y almacenamiento' : 'Ficha técnica de los equipos')
  const dato = (valor, unidad = '') => (valor == null || valor === '' ? 'Sin dato en la ficha' : `${typeof valor === 'number' ? num(valor, Number.isInteger(valor) ? 0 : 2) : valor}${unidad}`)
  const hojaTecnica = (titulo, filas, yInicio) =>
    tabla(
      [
        { titulo, ancho: 70, align: 'left' },
        { titulo: 'Valor', ancho: 108 },
      ],
      filas.map(([clave, valor]) => [{ texto: clave, negrita: true }, valor]),
      yInicio,
    )
  y = hojaTecnica(
    `Módulo ${panel.marca} ${panel.modelo}`,
    [
      ['Potencia nominal', dato(panel.potencia_wp, ' Wp')],
      ['Tecnología', { MONOFACIAL: 'Monofacial', BIFACIAL: `Bifacial (ganancia considerada: ${num(((evaluacion.factor ?? 1) - 1) * 100)} %)` }[panel.tipo_tecnologia] ?? 'Sin dato en la ficha'],
      ['Voc / Vmp', `${dato(panel.voc, ' V')} / ${dato(panel.vmp, ' V')}`],
      ['Isc / Imp', `${dato(panel.isc, ' A')} / ${dato(panel.imp, ' A')}`],
      ['Eficiencia', dato(panel.eficiencia, ' %')],
      ['Dimensiones', panel.largo_mm && panel.ancho_mm ? `${panel.largo_mm} × ${panel.ancho_mm} mm` : 'Sin dato en la ficha'],
    ],
    y,
  )
  if (inversor) {
    y = hojaTecnica(
      `Inversor ${inversor.marca} ${inversor.modelo}`,
      [
        ['Tipo de sistema', SISTEMA_INVERSOR[inversor.tipo_sistema] ?? 'Sin clasificar'],
        ['Potencia AC nominal', `${dato(inversor.potencia_ac_nominal_kw, ' kW')} × ${sistema.cantidad} und = ${num(evaluacion.potenciaAcKw, 2)} kW`],
        ['Red', [].concat(inversor.tipo_red ?? 'Sin dato en la ficha').join('; ')],
        ['Ventana MPPT', inversor.v_mppt_min && inversor.v_mppt_max ? `${inversor.v_mppt_min} – ${inversor.v_mppt_max} V` : 'Sin dato en la ficha'],
        ['Voc máximo / MPPT', `${dato(inversor.voc_max, ' V')} / ${dato(inversor.mppt_num)}`],
        ['Batería que admite', RANGO_BATERIA[inversor.tipo_bateria_soporte] ?? 'Sin dato en la ficha'],
      ],
      y + 5,
    )
  }
  const almacen = datos.almacenamiento
  if (almacen?.bateria) {
    const bateria = almacen.bateria
    y = hojaTecnica(
      `Batería ${bateria.marca} ${bateria.modelo}`,
      [
        ['Capacidad', `${dato(bateria.capacidad_kwh, ' kWh')} × ${almacen.unidades} und = ${num(almacen.capacidadKwh, 1)} kWh`],
        ['Voltaje nominal', `${dato(bateria.voltaje_nominal_v, ' V')}${almacen.rango ? ` · ${RANGO_BATERIA[almacen.rango]}` : ''}`],
        ['Química', dato(bateria.tipo_quimica)],
        ['Profundidad de descarga', `${num(almacen.dod)} % · capacidad útil ${num(almacen.utilKwh, 1)} kWh`],
        ['Compatibilidad con el inversor', almacen.compatibilidad.mensaje ?? 'Sin verificar'],
      ],
      y + 5,
    )
  }

  const simulacion = datos.simulacion
  if (simulacion && almacen?.bateria) {
    // Si las tablas ocuparon la hoja, la simulación pasa a una hoja propia.
    y = y > 150 ? nuevaHoja('Simulación de 24 horas del almacenamiento') : subtitulo('Simulación de 24 horas del almacenamiento', y + 8)
    y = cifras(
      [
        ['Autonomía estimada', num(simulacion.autonomiaHoras, 1), 'h'],
        ['Capacidad útil', num(almacen.utilKwh, 1), 'kWh'],
        ['Descarga máxima', almacen.descargaKw ? num(almacen.descargaKw, 1) : '—', almacen.descargaKw ? 'kW' : ''],
        ['Ciclos de vida', almacen.ciclos ? `~${num(almacen.ciclos)}` : '—', almacen.ciclos ? 'típico LFP' : ''],
      ],
      y,
    )
    const { horas } = simulacion
    const x0 = MARGEN + 12
    const anchoGrafico = UTIL - 14
    const aX = (hora) => x0 + (anchoGrafico * hora) / 23
    leyenda(
      [
        [SERIE_2, 'Generación solar'],
        [SERIE_1, 'Consumo de las cargas'],
      ],
      x0,
      y + 2,
    )
    y += 7
    const aKw = ejes(x0, y, anchoGrafico, 38, marcas(0, Math.max(...horas.map((h) => Math.max(h.solarKw, h.cargaKw))) * 1.08), (v) => num(v, v < 10 ? 1 : 0), 'kW')
    polilinea(horas.map((h) => [aX(h.hora), aKw(h.solarKw)]), SERIE_2, 0.7)
    polilinea(horas.map((h) => [aX(h.hora), aKw(h.cargaKw)]), SERIE_1, 0.7)
    y += 38 + 10
    texto('Estado de carga de la batería (SoC)', x0, y - 2.5, { tamano: 7.5, color: TENUE })
    const aSoc = ejes(x0, y, anchoGrafico, 24, [0, 50, 100], (v) => `${v} %`)
    poligono([...horas.map((h) => [aX(h.hora), aSoc(h.soc)]), [aX(23), aSoc(0)], [aX(0), aSoc(0)]], tinte(GRIS, 0.6))
    polilinea(horas.map((h) => [aX(h.hora), aSoc(h.soc)]), TINTA, 0.7)
    doc.setDrawColor(...TENUE)
    doc.setLineWidth(0.15)
    doc.setLineDashPattern([1, 1], 0)
    doc.line(x0, aSoc(100 - almacen.dod), x0 + anchoGrafico, aSoc(100 - almacen.dod))
    doc.setLineDashPattern([], 0)
    texto(`mínimo ${num(100 - almacen.dod)} %`, x0 + anchoGrafico, aSoc(100 - almacen.dod) - 1, { tamano: 6.5, color: TENUE, align: 'right' })
    for (let hora = 0; hora <= 21; hora += 3) texto(`${String(hora).padStart(2, '0')}:00`, aX(hora), y + 24 + 4.5, { tamano: 7, color: TENUE, align: hora === 0 ? 'left' : 'center' })
    y += 24 + 9
    parrafo(
      `Día típico: la generación sigue una campana entre las 6:00 y las 18:00 y el consumo, un perfil horario de referencia. El excedente solar carga la batería y el faltante la descarga, sin bajar del ${num(100 - almacen.dod)} % que fija la profundidad de descarga.` +
        (simulacion.sinCubrirKwh > 0.05 ? ` En este día quedan ${num(simulacion.sinCubrirKwh, 1)} kWh que el sol y la batería no cubren${datos.arquitectura === 'off_grid' ? ': conviene ampliar el arreglo o el banco' : ' y que aporta la red'}.` : ' El sol y la batería cubren todo el consumo del día.') +
        (almacen.ciclos ? ' Los ciclos de vida son la referencia habitual para baterías LFP, no un dato de la ficha.' : ''),
      y,
      { tamano: 8.5 },
    )
  }

  // ====================================================================== Hoja de rendimiento solar
  y = nuevaHoja('Rendimiento solar esperado')
  const generacionMes = evaluacion.generacionPorMes
  const consumoMes = consumo.mensual
  y = cifras(
    [
      ['Producción anual', num(evaluacion.generacionAnualKwh), 'kWh'],
      ['Promedio mensual', num(evaluacion.generacionMensualKwh), 'kWh'],
      ['Compensación', evaluacion.cobertura != null ? num(evaluacion.cobertura * 100) : '—', '%'],
      ['Paneles', `${sistema.numPaneles}`, ''],
      ['Rendimiento', num(evaluacion.generacionAnualKwh / evaluacion.kwp), 'kWh/kWp'],
      ['Performance ratio', num(parametros.pr, 2), ''],
    ],
    y - 2,
  )
  y = subtitulo('Producción mensual frente al consumo', y + 1)
  if (consumoMes && generacionMes) {
    graficoMensual(MARGEN + 12, y + 9, UTIL - 12, 50, consumoMes, generacionMes)
    y += 70
    const trimestre = (lista, t) => lista.slice(t * 3, t * 3 + 3).reduce((suma, valor) => suma + valor, 0)
    const diasTrimestre = (t) => DIAS.slice(t * 3, t * 3 + 3).reduce((suma, valor) => suma + valor, 0)
    y = tabla(
      [{ titulo: 'Concepto', ancho: 58, align: 'left' }, ...['1er trim.', '2do trim.', '3er trim.', '4to trim.', 'Anual'].map((titulo) => ({ titulo, ancho: 24 }))],
      [
        [{ texto: 'Producción solar (kWh)', negrita: true }, ...[0, 1, 2, 3].map((t) => ({ texto: num(trimestre(generacionMes, t)), negrita: true, color: TINTA })), { texto: num(evaluacion.generacionAnualKwh), negrita: true, color: TINTA }],
        ['Consumo del sitio (kWh)', ...[0, 1, 2, 3].map((t) => num(trimestre(consumoMes, t))), num(consumo.anualKwh)],
        ['Producción media diaria (kWh)', ...[0, 1, 2, 3].map((t) => num(trimestre(generacionMes, t) / diasTrimestre(t))), num(evaluacion.generacionAnualKwh / 365)],
      ],
      y,
    )
  } else {
    y = parrafo('Ingresa el consumo del sitio para comparar la producción mes a mes.', y)
  }

  if (consumo.promedioKwh) {
    y = subtitulo('Cómo se comporta el sistema en un día típico', y + 1)
    const energiaDia = evaluacion.generacionAnualKwh / 365
    const reparto = graficoDia(MARGEN + 12, y + 9, UTIL - 12, 44, energiaDia, consumo.promedioKwh / 730)
    y += 62
    y = cifras(
      [
        ['Generación del día', num(energiaDia), 'kWh'],
        ['Consumida directamente', num(reparto.directo), `kWh · ${num((reparto.directo / energiaDia) * 100)} %`],
        ['Excedente diurno', num(reparto.excedente), 'kWh'],
        ['Tomada de la red', num(reparto.red), 'kWh'],
      ],
      y,
    )
    texto(
      'La curva de consumo es el promedio del sitio; el perfil horario real puede diferir. El excedente puede entregarse a la red, almacenarse en baterías o recortarse, según la configuración del sistema.' +
        (proyeccion ? ` Beneficio ambiental: ${num(proyeccion.co2Anual, 1)} t de CO₂ evitadas por año y ${num(proyeccion.co2Toneladas)} t en 25 años.` : ''),
      MARGEN,
      y + 1,
      { tamano: 8, color: TENUE, ancho: UTIL, interlineado: 1.4 },
    )
  }

  // ====================================================================== Hoja 5: análisis financiero
  y = nuevaHoja('Análisis financiero')
  if (proyeccion) {
    y = subtitulo('Inversión e indicadores de rentabilidad', y)
    const yBloque = y
    // Izquierda: la factura antes y después. Derecha: los indicadores.
    texto('Factura eléctrica anual', MARGEN, yBloque + 3, { tamano: 8.5, negrita: true })
    if (proyeccion.facturaActual) graficoFactura(MARGEN + 12, yBloque + 12, 62, 46, proyeccion.facturaActual, proyeccion.facturaConSistema)
    const indicadores = [
      ['Sistema fotovoltaico', dinero(proyeccion.costoSistema)],
      ...(proyeccion.costoAdicional ? [['Almacenamiento y adicionales', dinero(proyeccion.costoAdicional)]] : []),
      [{ texto: 'Inversión total', negrita: true }, { texto: dinero(proyeccion.costoTotal), negrita: true, color: TINTA }],
      ['Costo por vatio instalado', `${moneda} ${num(proyeccion.costoTotal / (evaluacion.kwp * 1000), 3)}/Wp`],
      ['Ahorro del primer año', dinero(proyeccion.ahorroAnual)],
      [{ texto: 'Retorno de la inversión', negrita: true }, { texto: proyeccion.payback == null ? 'Más de 25 años' : `${num(proyeccion.payback, 1)} años`, negrita: true, color: TINTA }],
      ['Tasa interna de retorno (TIR)', proyeccion.tir == null ? '—' : `${num(proyeccion.tir, 1)} %`],
      [`Valor actual neto (${num(parametros.descuento)} %)`, dinero(proyeccion.van)],
      ['Beneficio acumulado a 25 años', dinero(proyeccion.gananciaNeta)],
      ['Costo nivelado de la energía', `${moneda} ${num(proyeccion.lcoe, 3)}/kWh`],
    ]
    const finTabla = tabla(
      [
        { titulo: 'Indicador', ancho: 58, align: 'left' },
        { titulo: 'Valor', ancho: 38 },
      ],
      indicadores,
      yBloque,
      { x: MARGEN + 82 },
    )
    y = Math.max(finTabla, yBloque + 70)

    y = subtitulo('Flujo de caja acumulado a 25 años', y + 1)
    graficoFlujo(MARGEN + 14, y + 4, UTIL - 16, 50, proyeccion.flujo, proyeccion.payback)
    y += 68

    y = subtitulo('Ahorro anual proyectado', y)
    graficoAhorros(MARGEN + 14, y + 4, UTIL - 16, 30, proyeccion.flujo)
    y += 44
    parrafo(
      `El costo nivelado indica lo que cuesta producir cada kilovatio-hora con el sistema propio a lo largo de su vida útil: ${moneda} ${num(proyeccion.lcoe, 3)}/kWh, frente a los ${moneda} ${num(consumo.tarifa, 3)}/kWh ${datos.arquitectura === 'off_grid' ? 'estimados como costo de la energía en el sitio, que no cuenta con servicio de la red' : 'que hoy se pagan a la distribuidora'}.`,
      y,
      { tamano: 8.5 },
    )
  } else {
    parrafo('Faltan el costo de la energía o el precio por vatio instalado para proyectar el análisis financiero.', y)
  }

  // ====================================================================== Hoja 6: condiciones y firma
  y = nuevaHoja('Condiciones y firma')
  y = subtitulo('Supuestos del análisis', y)
  y = tabla(
    [
      { titulo: 'Supuesto', ancho: 70, align: 'left' },
      { titulo: 'Valor', ancho: 38 },
      { titulo: 'Observación', ancho: 70 },
    ],
    [
      ['Horas solar pico (HSP)', `${num(parametros.hsp, 2)} h/día`, 'Promedio anual del sitio'],
      ['Rendimiento global (PR)', num(parametros.pr, 2), 'Pérdidas por temperatura, cableado e inversor'],
      ['Degradación del módulo', `${num(parametros.degradacion, 2)} % anual`, 'Aplicada a la producción de cada año'],
      ['Escalación de la tarifa eléctrica', `${num(parametros.inflacion, 1)} % anual`, 'Aplicada al valor del ahorro'],
      ['Tasa de descuento', `${num(parametros.descuento, 1)} % anual`, 'Para el valor actual neto'],
      ['Factor de emisión de la red', `${num(parametros.factorCo2, 2)} kg CO₂/kWh`, 'Para el beneficio ambiental'],
      ['Valor de la energía generada', `${moneda} ${num(consumo.tarifa, 3)}/kWh`, 'Se acredita a esta tarifa hasta cubrir el consumo anual del sitio'],
    ],
    y,
  )

  y = subtitulo('Verificaciones previas a la ejecución', y + 2)
  y = tabla(
    [
      { titulo: 'Verificación', ancho: 54, align: 'left' },
      { titulo: 'Alcance', ancho: 124 },
    ],
    [
      [{ texto: 'Capacidad de interconexión', negrita: true }, 'Confirmación ante la distribuidora de la potencia máxima instalable sobre el suministro.'],
      [{ texto: 'Tablero principal', negrita: true }, 'Inspección de la barra, la protección principal y la acometida para confirmar que admiten la conexión de los inversores.'],
      [{ texto: 'Verificación estructural', negrita: true }, 'Confirmación por profesional idóneo de que la cubierta soporta el peso de los módulos y la estructura de montaje.'],
      [{ texto: 'Simulación definitiva', negrita: true }, 'Modelo de producción con análisis de sombreado del sitio para cerrar la cifra de producción contractual.'],
    ],
    y,
  )

  // Bloque de contacto y firma del autor.
  y += 6
  caja(MARGEN, y, UTIL, 30, FONDO, 1.6)
  caja(MARGEN, y, 1.3, 30, PRIMARIO)
  doc.setDrawColor(...TENUE)
  doc.setLineWidth(0.25)
  doc.line(MARGEN + 7, y + 13, MARGEN + 80, y + 13)
  texto('FIRMA', MARGEN + 7, y + 6, { tamano: 6.8, color: TENUE })
  texto(autor.nombre, MARGEN + 7, y + 18.5, { tamano: 10.5, negrita: true, ancho: 80 })
  texto([autor.cargo, marca.nombre].filter(Boolean).join(' — '), MARGEN + 7, y + 24.5, { tamano: 8, color: PRIMARIO, negrita: true, ancho: 82 })
  const contacto = [
    ['Correo', autor.email],
    ['Teléfono', autor.telefono],
    ['Web', autor.web],
    ['Instagram', autor.instagram],
  ].filter(([, valor]) => valor) // un perfil puede no tener todos los datos
  contacto.forEach(([etiqueta, valor], i) => {
    texto(etiqueta, MARGEN + 96, y + 8 + i * 5.4, { tamano: 8, color: TENUE })
    texto(valor, MARGEN + 114, y + 8 + i * 5.4, { tamano: 8.5 })
  })
  y += 36
  texto(
    `Validez de la propuesta: ${propuesta.validezDias} días calendario a partir de la fecha de emisión. Los precios de equipos están sujetos a disponibilidad del proveedor. ` +
      'Las estimaciones de producción y ahorro se basan en los supuestos indicados y en el consumo informado del suministro; los resultados reales pueden variar según las condiciones meteorológicas, el perfil de consumo efectivo y el marco regulatorio vigente al momento de la interconexión.',
    MARGEN,
    y,
    { tamano: 7.5, color: TENUE, ancho: UTIL, interlineado: 1.4 },
  )

  return doc
}
