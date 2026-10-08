# Solar Design Studio

Aplicación web para dimensionamiento solar fotovoltaico comercial y residencial: catálogo de equipos
desde fichas técnicas reales, diseño sobre mapa satelital, visor 3D tipo Aurora Solar y propuestas
ejecutivas en PDF. Hecha para Solar 5 Estrellas (Panamá). Toda la interfaz, el código y los commits
van en español.

- Sitio publicado: https://jesusgibh.github.io/solar-design-studio/ (GitHub Pages, rama `gh-pages`)
- Repositorio (público): https://github.com/JesusGibh/solar-design-studio
- Es una SPA estática sin servidor propio. Todavía no es PWA instalable (no hay manifest ni service worker).

## Stack

- React 19 + Vite 8 + Tailwind CSS v4 (tokens en `@theme`, interfaz oscura), iconos `lucide-react`, ESM.
- Three.js para el visor 3D; Leaflet para el mapa (teselas híbridas de Google por defecto, Esri como
  alternativa). No se usa Mapbox.
- jsPDF para el PDF vectorial de la propuesta; `pdfjs-dist` y `tesseract.js` para leer fichas y facturas.
- Estado en `localStorage` con `useSyncExternalStore` (`src/lib/store.js`, `src/hooks/useProyecto.js`).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local. Solo aquí la app puede escribir en `datos/`. |
| `npm run build` | Compila a `dist/`. |
| `npm run fichas` | Extrae las fichas PDF de `fichas_tecnicas/` a `src/data/catalogo_equipos.json` y `.csv`. |
| `npm run datos` | Crea lo que falte en `datos/`, integra `datos/recibidas/` y muestra un resumen. Con `-- --fichas` añade los equipos nuevos extraídos. |
| `npm run clasificar` | Lee las fichas PDF y propone tipo de sistema, batería admitida y tecnología del panel. Con `-- --aplicar` rellena los campos vacíos de `datos/`. |
| `npm run respaldo` | Copia `datos/` con fecha a OneDrive y Google Drive (conserva 30). |
| `npm run publicar` | Respalda, compila con la ruta base del repositorio y sube a `gh-pages`. |

Entorno: Windows 11 con PowerShell. Node está en `C:\Program Files\nodejs` y puede no estar en el PATH
de la sesión. Git no tiene identidad global: los commits se hacen con `-c user.name=... -c user.email=...`
y el mensaje en un archivo (`-F`).

## Base de datos y fichas técnicas

- Los equipos provienen solo de fichas técnicas reales. No se añaden equipos de ejemplo ni inventados.
- Flujo: `fichas_tecnicas/*.pdf` → `npm run fichas` → `src/data/catalogo_equipos.json` →
  `npm run datos -- --fichas` → `datos/*.csv`. La app lee `datos/`, no el JSON.
- `datos/` es la base de datos (CSV con `;`, editables en Excel) y **no se versiona** porque el repositorio es público:
  - `usuarios.csv`: usuario (correo), nombre, rol, clave, autor, activo.
  - `paneles.csv`, `inversores.csv`, `baterias.csv`, `rsd.csv`: catálogo; la columna `activo` desactiva una ficha.
  - `propuestas.csv` + `propuestas/<id>.json`: resumen y diseño completo de cada propuesta.
  - `configuracion.csv`: `url_hoja`, la URL del Apps Script de la hoja compartida.
- Al compilar, `vite.config.js` incrusta la base cifrada (módulo `virtual:base-datos`, PBKDF2 + AES-GCM,
  `src/lib/cifrado.js`). Iniciar sesión es descifrarla (`src/lib/sesion.js`).
- Nunca subir a GitHub ni escribir en el código: claves, la URL del Apps Script ni datos de clientes.
- Esquema de campos por categoría: `src/config/equipos.js` (fuente única de pestañas, columnas y CSV).
- Procedencia de los datos: lo que no sale de la ficha se anota en la columna `datos_web` (campos) y
  `fuente_web` (URL), y la tabla de Equipos lo marca con un icono. Al completar datos desde internet
  solo se rellenan campos vacíos y siempre se registra la fuente.
- Reglas fijadas por el usuario: las series Growatt SPE y SPF son `OFF_GRID`. En un sistema aislado no
  hay transformador, interruptor principal ni factura: el costo del kWh es un estimado del lugar.

## Reglas eléctricas y de dimensionamiento

- Inversores filtrados de forma estricta por tensión de red (`src/lib/electrico.js`): monofásico
  120/240 V, trifásico 120/208 V, trifásico 277/480 V y trifásico 380/400 V.
- Validaciones: interruptor principal (125 % de la corriente AC) y transformador (aviso sobre 80 %).
  No existe regla de barra (busbar): se eliminó a pedido y no debe volver.
- Dimensionamiento (`src/lib/dimensionamiento.js`): consumo mensual o anual, HSP editable, cobertura %,
  PR, relación DC/AC 1,10–1,30, modo automático o manual con elección de marca y modelo.
- Finanzas (`src/lib/finanzas.js`): precio en $/Wp instalado, flujo de caja a 25 años, payback, ROI,
  TIR, VAN y LCOE. El ahorro se limita al consumo del sitio.
- Arquitectura del sistema (`src/lib/almacenamiento.js`, `src/components/Arquitectura.jsx`): on-grid,
  off-grid o híbrido. On-grid ofrece solo inversores `ON_GRID`; los que admiten batería sirven para
  aislado o híbrido (si la ficha no dice cuál, se ofrecen en ambos). Aislado: batería obligatoria y
  opción de dimensionar con tabla de cargas (inversor ≥ pico simultáneo × 1,25; banco = consumo diario ×
  días de autonomía ÷ DoD). Inversor y batería deben coincidir en LV / HV. Paneles bifaciales: ganancia
  ajustable sobre la generación. La clasificación de un equipo vacía significa «sin clasificar».
- Simulación de 24 h del almacenamiento: curvas de referencia (campana solar y perfil horario de
  consumo), no mediciones. Los ciclos de vida mostrados son el valor típico de LFP, rotulado como tal.
- La factura del cliente (PDF) rellena cliente, dirección, tarifa e historial de consumo (`src/lib/factura/`).

## Módulos

1. **Equipos & Base de Datos** (solo admin): tablas con filtros por marca y capacidad, columnas
   ocultables, y edición, desactivación y eliminación de fichas.
2. **Consumo & Parámetros Eléctricos**.
3. **Diseño de Techo & Arreglo**: trazado del techo sobre el mapa, retranqueo, acomodo de paneles según
   sus dimensiones reales (largo × ancho) y pasillos de inspección. Visor 3D con terreno satelital,
   edificio extruido, cotas en metros y controles de agrupación dentro de la escena; su captura va al PDF.
4. **Propuesta, Gráficas & ROI**: PDF de 7–8 páginas (portada con precio, ficha técnica de equipos y,
   con baterías, simulación de 24 h), vista previa y descarga. Moneda fija `B/.`.
5. **Historial de Propuestas**.

## Usuarios, marcas y propuestas

- Roles en `src/config/roles.js`: `admin` (todo) e `ingeniero` (sin Equipos, sin elegir marca).
- Autores oficiales (`src/config/authors.js`): Ing. Jesús Ariza e Ing. Johnny Velandia. Firma quien
  inició sesión; en «Elaborado por» va solo la forma corta («Ing. Jesús Ariza»).
- Marcas (`src/config/brands.js`): Solar 5 Estrellas y Kilowattia, cada una con su paleta. Logos en
  `public/assets/brands/`; el de Kilowattia aún no existe y se muestra el nombre en texto.
  Los ingenieros solo cotizan como Solar 5 Estrellas.
- Correlativo único `PROP-AAAA-NNNN` (`src/lib/numeracion.js`). Lo reparte la hoja de Google Sheets;
  sin ella, `datos/propuestas.csv` en local o un contador del navegador.
- Todos ven todas las propuestas. Solo quien la creó la edita; los demás la ven o la copian como nueva.
- Hoja compartida (`google-apps-script/Codigo.gs`, `src/lib/nube.js`): es la fuente de verdad de
  propuestas y catálogo cuando está conectada (`src/lib/historial.js`, `src/lib/catalogoNube.js`).
  Guarda también la numeración, los PDF (carpeta de Drive «Propuestas PDF») y la vista previa del
  render 3D («Renders 3D»). Sin conexión se trabaja con la copia del navegador y lo pendiente se
  sube al sincronizar. En local, además, todo se escribe en `datos/` como copia. Si cambia `Codigo.gs`, el dueño debe
  pegarlo y publicar una **nueva versión** de la misma implementación (la URL no cambia).

## Forma de trabajo

- Commit y push solo cuando el usuario lo pide. Publicar el sitio también.
- Los cambios de interfaz se verifican en un navegador real (playwright-core con Edge) antes de darlos por hechos.
- Al probar contra la hoja real, no pedir números (`accion=siguiente`): cada llamada consume un correlativo.

## Pendientes conocidos

- Logo de Kilowattia; fichas de RSD (0 registros); lectura de facturas sin probar con una factura real de Naturgy.
- Las ediciones de fichas van a la hoja; los CSV de `datos/` solo se actualizan trabajando en local.
  Un cambio hecho en Excel no llega a la hoja hasta pulsar «Enviar el catálogo de equipos a la hoja».
