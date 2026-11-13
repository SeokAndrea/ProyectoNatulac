import jsPDF from "jspdf"
import urlOla from "@/assets/trazabilidad/encabezado-ola-natulac.png"
import urlSello from "@/assets/trazabilidad/sello-envasado-aseptico.jpg"
import urlCarlito from "@/assets/fuentes/Carlito-Regular.ttf"
import urlCarlitoBold from "@/assets/fuentes/Carlito-Bold.ttf"
import {
  OBSERVACIONES,
  PRESENTACIONES_HOJA,
  codigoSabor,
  fechaHoja,
  numeroTurno,
  textoObservacionCorto,
  type Hoja,
  type Paleta,
  type SaborLeyenda,
  type TipoPaletizado,
} from "@/lib/trazabilidadPaletizado"

/*
 * Formato 1-PR-F-040 Rev.01 «Trazabilidad de paletizado» en PDF, idéntico al
 * de la empresa (docs/formatos/1-PR-F-040/: el Excel, su PDF y el encabezado).
 * Todas las medidas salen del PDF que exporta ese Excel: hoja carta vertical,
 * mismas columnas, filas, grosores de línea y posición de cada texto. La
 * fuente es Carlito (libre, con las mismas medidas que Calibri, la del Excel).
 *
 * Un documento por línea, día y tipo de paletizado (el 1.2 es uno por hoja).
 * Cada presentación es un bloque 1.3 (como la página 2 del Excel); si no cabe,
 * sigue en otra página con el mismo encabezado y leyenda, y «Pág. x/y» cuenta
 * las páginas de ese documento. Las filas que sobran quedan vacías, como en
 * el formato. La leyenda se arma con la información de hoy: los sabores del
 * catálogo y las observaciones 1 a 7 de la app.
 * Se importa recién al exportar (no entra en la carga inicial).
 */

// ------------------------------------------------------------
// Medidas del formato (mm, desde arriba a la izquierda)
// ------------------------------------------------------------
const GRUESA = 0.34
const FINA = 0.17
/** Bordes izquierdos de las líneas verticales de la tabla (1.3.1 … 1.3.9). */
const X_BORDE_IZQ = 6.19
const X_BORDE_DER = 210.27
const X_COLUMNAS = [18.08, 31.72, 45.82, 61.49, 76.13, 87.1, 107.26, 127.79]
const X_DIVISION_FECHA = 96.59
const X_TABLA = X_BORDE_IZQ + GRUESA
const ANCHO_GRUESA = X_BORDE_DER + GRUESA - X_TABLA
const ANCHO_FINA = X_BORDE_DER - X_TABLA
/** Celdas: [desde, hasta] de cada columna, por dentro de las líneas. */
const CELDAS: [number, number][] = [X_BORDE_IZQ + GRUESA, ...X_COLUMNAS.map((x) => x + FINA)].map((desde, i) => [
  desde,
  i < X_COLUMNAS.length ? X_COLUMNAS[i] : X_BORDE_DER,
])

const Y_TABLA = 25.07
const Y_FIN_FECHA = 31.71
const ALTO_PRESENTACION = 6.35
const ALTO_CABECERA = 9.66
const ALTO_FILA = (238.59 - 47.72) / 28
/** Borde inferior de la leyenda en el formato: la tabla termina donde la leyenda lo permita. */
const Y_FIN_LEYENDA = 262.3
const LEYENDA_ARRIBA = 2.75
const LEYENDA_RENGLON = 3.26
const LEYENDA_ABAJO = 1.4
const X_LEYENDA = 6.87
const ANCHO_LEYENDA = 202.8

const TINTA: [number, number, number] = [0, 0, 0]

const CABECERAS: { numero: string; lineas: string[] }[] = [
  { numero: "1.3.1", lineas: ["Nº de", "paleta"] },
  { numero: "1.3.2", lineas: ["Sabor"] },
  { numero: "1.3.3", lineas: ["Lote"] },
  { numero: "1.3.4", lineas: ["Nº Ticket de", "paleta"] },
  { numero: "1.3.5", lineas: ["Nº Cajas"] },
  { numero: "1.3.6", lineas: ["Turno"] },
  { numero: "1.3.7", lineas: ["Conformidad", "(C/NC)"] },
  { numero: "1.3.8", lineas: ["Observación /", "Desviación"] },
  { numero: "1.3.9", lineas: ["Acción de corrección"] },
]

// ------------------------------------------------------------
// Recursos (imágenes y fuente), cargados una sola vez al exportar
// ------------------------------------------------------------
export interface RecursosTrazabilidad {
  ola: Uint8Array
  sello: Uint8Array
  /** TTF en base64 (lo que pide jsPDF). */
  fuente: string
  fuenteNegrita: string
}

let recursos: Promise<RecursosTrazabilidad> | null = null

async function bajar(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`No se pudo leer ${url}`)
  return new Uint8Array(await r.arrayBuffer())
}

function aBase64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function cargarRecursosTrazabilidad(): Promise<RecursosTrazabilidad> {
  recursos ??= Promise.all([bajar(urlOla), bajar(urlSello), bajar(urlCarlito), bajar(urlCarlitoBold)])
    .then(([ola, sello, fuente, negrita]) => ({ ola, sello, fuente: aBase64(fuente), fuenteNegrita: aBase64(negrita) }))
    .catch((e) => {
      recursos = null
      throw e
    })
  return recursos
}

// ------------------------------------------------------------
// Documentos y páginas
// ------------------------------------------------------------
/** Un formato lleno: una línea, un día y un tipo; cada presentación es un bloque 1.3. */
interface Documento {
  lineaNombre: string
  fecha: string
  tipoPaletizado: TipoPaletizado
  bloques: Hoja[]
}

/** Un bloque 1.3 en una página: la presentación y sus filas (null = fila vacía). */
interface BloquePagina {
  hoja: Hoja
  filas: (Paleta | null)[]
}

function armarDocumentos(hojas: Hoja[]): Documento[] {
  const docs = new Map<string, Documento>()
  for (const h of hojas) {
    const clave = `${h.lineaCodigo}|${h.fecha}|${h.tipoPaletizado}`
    let d = docs.get(clave)
    if (!d) {
      d = { lineaNombre: h.lineaNombre, fecha: h.fecha, tipoPaletizado: h.tipoPaletizado, bloques: [] }
      docs.set(clave, d)
    }
    d.bloques.push(h)
  }
  return [...docs.values()]
}

const EPS = 1e-6
const filasQueCaben = (y: number, yFin: number) => Math.floor((yFin - y) / ALTO_FILA + EPS)

/** Reparte los bloques en páginas; la última fila de cada página llega hasta la leyenda. */
function paginar(doc: Documento, yFinTabla: number): BloquePagina[][] {
  const paginas: BloquePagina[][] = []
  let pagina: BloquePagina[] = []
  let y = Y_FIN_FECHA
  const cerrar = () => {
    // Las filas que sobran, vacías en el último bloque (como el formato en blanco).
    const ultimo = pagina[pagina.length - 1]
    if (ultimo) for (let n = filasQueCaben(y, yFinTabla); n > 0; n--) ultimo.filas.push(null)
    paginas.push(pagina)
    pagina = []
    y = Y_FIN_FECHA
  }
  for (const hoja of doc.bloques) {
    let i = 0
    while (i < hoja.paletas.length) {
      // En una página vacía siempre entra al menos una fila (aunque la leyenda sea muy larga).
      const caben = Math.max(filasQueCaben(y + ALTO_PRESENTACION + ALTO_CABECERA, yFinTabla), pagina.length ? 0 : 1)
      // Un bloque nuevo necesita al menos 2 filas en la página; si no, a la siguiente.
      if (pagina.length && caben < Math.min(2, hoja.paletas.length - i)) {
        cerrar()
        continue
      }
      const filas = hoja.paletas.slice(i, i + caben)
      pagina.push({ hoja, filas })
      i += filas.length
      y += ALTO_PRESENTACION + ALTO_CABECERA + filas.length * ALTO_FILA
    }
  }
  if (pagina.length || paginas.length === 0) cerrar()
  return paginas
}

// ------------------------------------------------------------
// Leyenda (texto con negritas y subrayados, partido en renglones)
// ------------------------------------------------------------
interface Trozo {
  t: string
  negrita?: boolean
  subrayado?: boolean
}

function parrafosLeyenda(sabores: SaborLeyenda[]): Trozo[][] {
  const lista = <T,>(items: T[], trozos: (x: T) => Trozo[]): Trozo[] =>
    items.flatMap((x, i) => [...trozos(x), { t: i === items.length - 1 ? "." : ", " }])
  return [
    [{ t: "LEYENDA:", negrita: true }],
    [
      { t: 'Utilizar para la columna 1.3.2 "Sabor" los siguientes códigos:', subrayado: true },
      { t: " " },
      ...lista(sabores, (s) => [{ t: `${s.codigo}:`, negrita: true }, { t: ` ${s.nombre}` }]),
    ],
    [
      { t: 'Utilizar los siguientes términos para dar respuesta la columna 1.3.7 "Conformidad (C/NC)":', subrayado: true },
      { t: " " },
      { t: "C:", negrita: true },
      { t: " Conforme, " },
      { t: "NC:", negrita: true },
      { t: " No conforme, en caso de encontrarse no conforme se debe colocar Observación/Desviación." },
    ],
    [
      {
        t: 'Utilizar para la columna 1.3.8 "Observación/Desviación" los siguientes números, en caso de que la paleta se encuentre No conforme:',
        subrayado: true,
      },
      { t: " " },
      ...lista(OBSERVACIONES, (o) => [{ t: `${o.codigo}:`, negrita: true }, { t: ` ${o.texto}` }]),
    ],
  ]
}

/** Sin la lista del catálogo: los sabores que aparecen en las paletas exportadas. */
function saboresDeLasPaletas(hojas: Hoja[]): SaborLeyenda[] {
  const vistos = new Map<string, string>()
  for (const p of hojas.flatMap((h) => h.paletas)) {
    const codigo = codigoSabor(p)
    if (!vistos.has(codigo)) vistos.set(codigo, p.saborNombre ?? codigo)
  }
  return [...vistos].map(([codigo, nombre]) => ({ codigo, nombre }))
}

// ------------------------------------------------------------
// Dibujo
// ------------------------------------------------------------
class Dibujo {
  readonly doc: jsPDF
  readonly fuente: string

  constructor(r: RecursosTrazabilidad | null, comprimir: boolean) {
    // Comprimido: la fuente va completa dentro del PDF (sin comprimir pesa ~1,2 MB).
    this.doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait", compress: comprimir })
    if (r) {
      this.doc.addFileToVFS("Carlito-Regular.ttf", r.fuente)
      this.doc.addFont("Carlito-Regular.ttf", "Carlito", "normal")
      this.doc.addFileToVFS("Carlito-Bold.ttf", r.fuenteNegrita)
      this.doc.addFont("Carlito-Bold.ttf", "Carlito", "bold")
    }
    this.fuente = r ? "Carlito" : "helvetica"
    this.doc.setTextColor(...TINTA)
    this.doc.setFillColor(...TINTA)
    this.doc.setDrawColor(...TINTA)
  }

  letra(pt: number, negrita = false) {
    this.doc.setFont(this.fuente, negrita ? "bold" : "normal")
    this.doc.setFontSize(pt)
  }

  ancho(texto: string): number {
    return this.doc.getTextWidth(texto)
  }

  texto(t: string, x: number, y: number, pt: number, negrita = false, alinear: "left" | "center" | "right" = "left") {
    this.letra(pt, negrita)
    this.doc.text(t, x, y, { align: alinear })
  }

  /** Línea como rectángulo relleno, igual que en el PDF del formato. */
  linea(x: number, y: number, w: number, h: number) {
    this.doc.rect(x, y, w, h, "F")
  }

  /** Casilla «□» (marcada con una X) con la base en `base`. */
  casilla(x: number, base: number, pt: number, marcada: boolean) {
    const lado = pt * 0.1905
    const y = base - lado * 0.98
    this.doc.setLineWidth(0.15)
    this.doc.rect(x, y, lado, lado, "S")
    if (marcada) {
      const m = lado * 0.18
      this.doc.setLineWidth(0.3)
      this.doc.line(x + m, y + m, x + lado - m, y + lado - m)
      this.doc.line(x + lado - m, y + m, x + m, y + lado - m)
    }
    return lado
  }

  /**
   * Texto que tiene que entrar en una celda: baja la letra hasta 6,5 pt y, si
   * aún no entra, usa dos renglones; lo que siga sin entrar se corta con «…».
   */
  celda(t: string, desde: number, hasta: number, yFila: number, alinear: "center" | "left") {
    if (!t) return
    const margen = 1
    const ancho = hasta - desde - 2 * margen
    const x = alinear === "center" ? (desde + hasta) / 2 : desde + margen
    for (const pt of [9, 8, 7, 6.5]) {
      this.letra(pt)
      if (this.ancho(t) <= ancho) {
        this.doc.text(t, x, yFila + ALTO_FILA / 2 + pt * 0.12, { align: alinear })
        return
      }
    }
    this.letra(6.5)
    let renglones = this.doc.splitTextToSize(t, ancho) as string[]
    if (renglones.length > 2) {
      let segundo = renglones.slice(1).join(" ")
      while (segundo && this.ancho(`${segundo}…`) > ancho) segundo = segundo.slice(0, -1)
      renglones = [renglones[0], `${segundo.trimEnd()}…`]
    }
    const centro = yFila + ALTO_FILA / 2
    this.doc.text(renglones[0], x, centro - 0.55, { align: alinear })
    if (renglones[1]) this.doc.text(renglones[1], x, centro + 1.95, { align: alinear })
  }

  /** Renglones de la leyenda: [x, trozo] por renglón, partidos por palabras. */
  partirLeyenda(parrafos: Trozo[][]): { x: number; trozo: Trozo }[][] {
    const renglones: { x: number; trozo: Trozo }[][] = []
    for (const parrafo of parrafos) {
      let renglon: { x: number; trozo: Trozo }[] = []
      let x = 0
      for (const trozo of parrafo) {
        for (const pieza of trozo.t.split(/(\s+)/).filter(Boolean)) {
          this.letra(7.2, trozo.negrita)
          const w = this.ancho(pieza)
          const esEspacio = /^\s+$/.test(pieza)
          if (!esEspacio && x + w > ANCHO_LEYENDA && renglon.length) {
            // El espacio que quedó al final del renglón no se subraya.
            while (renglon.length && /^\s+$/.test(renglon[renglon.length - 1].trozo.t)) renglon.pop()
            renglones.push(renglon)
            renglon = []
            x = 0
          }
          if (esEspacio && x === 0) continue
          renglon.push({ x, trozo: { ...trozo, t: pieza } })
          x += w
        }
      }
      renglones.push(renglon)
    }
    return renglones
  }
}

/** Alto de la leyenda para tantos renglones (el formato: 7 renglones = 23,71 mm). */
const altoLeyenda = (renglones: number) => LEYENDA_ARRIBA + (renglones - 1) * LEYENDA_RENGLON + LEYENDA_ABAJO

function dibujarPagina(
  d: Dibujo,
  r: RecursosTrazabilidad | null,
  documento: Documento,
  bloques: BloquePagina[],
  pagina: number,
  paginas: number,
  leyenda: { x: number; trozo: Trozo }[][],
) {
  const { doc } = d

  // Encabezado: ola con el logo Natulac, sello «Envasado Aséptico», título, código y página.
  if (r) {
    doc.addImage(r.ola, "PNG", 5.9, 5.08, 165.57, 17.46)
    doc.addImage(r.sello, "JPEG", 191.33, 12.97, 13.64, 10.92)
  }
  d.texto("TRAZABILIDAD DE PALETIZADO", 85.23, 20.28, 10.2, true)
  d.letra(7.152)
  const codigo = "1-PR-F-040 Rev.01"
  const centroCodigo = 185.88 + d.ancho(codigo) / 2
  d.texto(codigo, 185.88, 8.44, 7.152)
  d.texto(`Pág. ${pagina}/${paginas}`, centroCodigo, 11.53, 7.152, false, "center")

  // 1.1 Fecha y 1.2 Tipo de paletizado.
  d.texto("1.1", 7.1, 27.66, 5.616)
  d.texto("Fecha:", 13.49, 29.6, 10.2, true)
  d.letra(10.2, true)
  const xFecha = 13.49 + d.ancho("Fecha:") + 2.5
  d.texto(`${fechaHoja(documento.fecha)}      ${documento.lineaNombre}`, xFecha, 29.6, 10.2)
  d.texto("1.2", 98.3, 28.19, 5.616)
  d.texto("Tipo de Paletizado:", 102.3, 29.68, 10.2)
  d.letra(10.2)
  d.texto("Automático", 132.54, 29.68, 10.2)
  d.casilla(132.54 + d.ancho("Automático "), 29.68, 10.2, documento.tipoPaletizado === "AUTOMATICO")
  d.letra(10.2)
  d.texto("Manual", 173.52, 29.68, 10.2, false, "right")
  d.casilla(173.52 + d.ancho("  "), 29.68, 10.2, documento.tipoPaletizado === "MANUAL")

  // Marco de arriba y de la fila 1.1.
  d.linea(X_TABLA, Y_TABLA, ANCHO_GRUESA, GRUESA)
  d.linea(X_DIVISION_FECHA, Y_TABLA + GRUESA, GRUESA, Y_FIN_FECHA - Y_TABLA - GRUESA)
  d.linea(X_TABLA, Y_FIN_FECHA, ANCHO_GRUESA, GRUESA)

  // Bloques 1.3: presentación, cabecera y filas.
  let y = Y_FIN_FECHA
  for (const b of bloques) {
    d.texto("1.3", 7.2, y + 1.99, 5.616)
    d.texto("Presentación:", 21.18, y + 4.24, 8.16, true)
    // «TBA-1000 cm3 □  TBA-500 cm3 □ …» como en el formato; el espacio entre
    // casillas se ajusta para que las diez entren antes del borde.
    d.letra(8.16)
    const espacio = d.ancho(" ")
    const lado = 8.16 * 0.1905
    const ocupado = PRESENTACIONES_HOJA.reduce((s, c) => s + d.ancho(c) + espacio + lado, 0)
    const xInicio = 37.51 + espacio
    const separacion = Math.min(2 * espacio, (X_BORDE_DER - 1.5 - xInicio - ocupado) / (PRESENTACIONES_HOJA.length - 1))
    let x = xInicio
    for (const c of PRESENTACIONES_HOJA) {
      d.texto(c, x, y + 4.24, 8.16)
      d.letra(8.16)
      x += d.ancho(c) + espacio
      x += d.casilla(x, y + 4.24, 8.16, b.hoja.presentacionHoja === c) + separacion
    }
    if (!b.hoja.presentacionHoja) d.texto(`(${b.hoja.presentacionCodigo})`, X_BORDE_DER - 1, y + 4.24, 7, false, "right")
    const yCabecera = y + ALTO_PRESENTACION
    d.linea(X_TABLA, yCabecera, ANCHO_GRUESA, GRUESA)

    CABECERAS.forEach((c, i) => {
      const [desde, hasta] = CELDAS[i]
      d.texto(c.numero, desde + 0.3, yCabecera + 2.05, 5.616)
      const centro = (desde + hasta) / 2
      if (c.lineas.length === 2) {
        d.texto(c.lineas[0], centro, yCabecera + 4.95, 8.16, true, "center")
        d.texto(c.lineas[1], centro, yCabecera + 8.65, 8.16, true, "center")
      } else {
        d.texto(c.lineas[0], centro, yCabecera + 6.0, 8.16, true, "center")
      }
    })
    const yFilas = yCabecera + ALTO_CABECERA
    d.linea(X_TABLA, yFilas, ANCHO_GRUESA, GRUESA)

    b.filas.forEach((p, i) => {
      const yFila = yFilas + i * ALTO_FILA
      if (i > 0) d.linea(X_TABLA, yFila, ANCHO_FINA, FINA)
      if (!p) return
      const valores = [
        p.numero === null ? "" : String(p.numero),
        codigoSabor(p),
        p.lote ?? "",
        p.ticket ?? "",
        p.cajas === null ? "" : String(p.cajas),
        numeroTurno(p.turnoTipo),
        p.conforme ? "C" : "NC",
        textoObservacionCorto(p),
        p.accionCorreccion ?? "",
      ]
      valores.forEach((v, j) => d.celda(v, CELDAS[j][0], CELDAS[j][1], yFila, j === 8 ? "left" : "center"))
    })
    const yFin = yFilas + b.filas.length * ALTO_FILA
    // Divisiones de las columnas, de la cabecera al final del bloque.
    for (const xc of X_COLUMNAS) d.linea(xc, yCabecera + GRUESA, FINA, yFin - yCabecera - GRUESA)
    d.linea(X_TABLA, yFin, ANCHO_GRUESA, GRUESA)
    y = yFin
  }

  // Leyenda, pegada al final de la tabla.
  let base = y + LEYENDA_ARRIBA
  for (const renglon of leyenda) {
    for (const { x, trozo } of renglon) {
      d.texto(trozo.t, X_LEYENDA + x, base, 7.2, trozo.negrita)
      if (trozo.subrayado) {
        d.letra(7.2, trozo.negrita)
        d.linea(X_LEYENDA + x, base + 0.3, d.ancho(trozo.t), FINA)
      }
    }
    base += LEYENDA_RENGLON
  }
  const yFinLeyenda = y + altoLeyenda(leyenda.length)
  d.linea(X_TABLA, yFinLeyenda, ANCHO_GRUESA, GRUESA)

  // Bordes de afuera, de arriba a abajo.
  d.linea(X_BORDE_IZQ, Y_TABLA, GRUESA, yFinLeyenda + GRUESA - Y_TABLA)
  d.linea(X_BORDE_DER, Y_TABLA + GRUESA, GRUESA, yFinLeyenda - Y_TABLA)
}

export interface OpcionesTrazabilidadPdf {
  /** Sabores del catálogo para la leyenda; vacío, los de las paletas exportadas. */
  sabores?: SaborLeyenda[]
  /** Imágenes y fuente del formato; sin ellos (pruebas), Helvetica y sin imágenes. */
  recursos?: RecursosTrazabilidad | null
  /** Por defecto sí; las pruebas lo apagan para leer el texto del PDF. */
  comprimir?: boolean
}

export function generarTrazabilidadPdf(hojas: Hoja[], opciones: OpcionesTrazabilidadPdf = {}): Blob {
  const r = opciones.recursos ?? null
  const d = new Dibujo(r, opciones.comprimir ?? true)
  const sabores = opciones.sabores?.length ? opciones.sabores : saboresDeLasPaletas(hojas)
  const leyenda = d.partirLeyenda(parrafosLeyenda(sabores))
  const yFinTabla = Y_FIN_LEYENDA - altoLeyenda(leyenda.length)

  let primera = true
  for (const documento of armarDocumentos(hojas)) {
    const paginas = paginar(documento, yFinTabla)
    paginas.forEach((bloques, i) => {
      if (!primera) d.doc.addPage("letter", "portrait")
      primera = false
      dibujarPagina(d, r, documento, bloques, i + 1, paginas.length, leyenda)
    })
  }

  if (primera) d.texto("No hay paletas con estos filtros.", 10, 20, 11)
  return d.doc.output("blob")
}

/** «trazabilidad-paletizado-2026-11-11.pdf» (+ líneas si no son todas). */
export function nombreArchivoTrazabilidad(fecha: string, lineas: string[] | null): string {
  const sufijo = lineas && lineas.length ? `-${lineas.map((l) => l.replace(/^LINEA_/, "L")).join("-")}` : ""
  return `trazabilidad-paletizado-${fecha}${sufijo}.pdf`
}
