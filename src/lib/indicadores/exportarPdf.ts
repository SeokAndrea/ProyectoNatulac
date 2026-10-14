import { toJpeg } from "html-to-image"
import jsPDF from "jspdf"

/*
 * Indicadores en PDF, como respaldo (dueña, 2026-10-14): una página A4
 * horizontal por pantalla, tal como se ve. La pantalla se va cambiando
 * (`mostrar`) y se fotografía el elemento que la contiene. Los botones
 * (Editar, Escribir, Gráficas/Tabla) no salen.
 */

export interface Lamina {
  /** Lo que va arriba de la página: "Línea 1". */
  titulo: string
  /** Pone esa pantalla y espera a que se dibuje. */
  mostrar: () => Promise<void>
}

/** Espera a que la pantalla nueva termine de dibujarse (gráficos con ResizeObserver incluidos). */
export const esperarDibujo = () =>
  new Promise<void>((listo) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => listo())), 500))

const sinBotones = (n: HTMLElement) => !(n instanceof HTMLElement && (n.tagName === "BUTTON" || n.dataset.noPdf !== undefined))

/** Estilos de los gráficos que vienen de clases (Tailwind) y la copia de html-to-image pierde. */
const PROPIEDADES_SVG = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "opacity", "font-size", "font-family", "font-weight"]

/**
 * Deja la pantalla lista para la foto y devuelve cómo volver atrás:
 *  - los gráficos con sus estilos escritos en el propio elemento;
 *  - si algo tiene scroll (incidencias largas), la pantalla se estira para que entre todo, sin barras.
 */
function prepararFoto(el: HTMLElement): () => void {
  const deshacer: (() => void)[] = []
  for (const n of el.querySelectorAll<SVGElement>("svg *")) {
    const antes = n.getAttribute("style")
    const cs = getComputedStyle(n)
    for (const p of PROPIEDADES_SVG) n.style.setProperty(p, cs.getPropertyValue(p))
    deshacer.push(() => (antes === null ? n.removeAttribute("style") : n.setAttribute("style", antes)))
  }
  const desbordes = [...el.querySelectorAll<HTMLElement>("*")].filter((n) => n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY))
  const extra = Math.max(0, ...desbordes.map((n) => n.scrollHeight - n.clientHeight))
  for (const n of desbordes) {
    const antes = n.style.overflowY
    n.style.overflowY = "visible"
    deshacer.push(() => (n.style.overflowY = antes))
  }
  if (extra > 0) {
    const { height, flex } = el.style
    el.style.flex = "none"
    el.style.height = `${el.offsetHeight + extra}px`
    deshacer.push(() => Object.assign(el.style, { height, flex }))
  }
  return () => deshacer.reverse().forEach((f) => f())
}

export async function exportarIndicadoresPdf(laminas: Lamina[], elemento: () => HTMLElement | null, encabezado: string, archivo: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const ancho = pdf.internal.pageSize.getWidth()
  const alto = pdf.internal.pageSize.getHeight()
  const margen = 8
  const fondo = getComputedStyle(document.body).backgroundColor || "#ffffff"

  for (const [i, l] of laminas.entries()) {
    await l.mostrar()
    const el = elemento()
    if (!el) continue
    const volver = prepararFoto(el)
    // Medida de la foto: con la pantalla ya estirada, si hizo falta.
    const fotoAncho = el.offsetWidth
    const fotoAlto = el.offsetHeight
    let img: string
    try {
      img = await toJpeg(el, { quality: 0.92, pixelRatio: 2, backgroundColor: fondo, filter: sinBotones })
    } finally {
      volver()
    }
    if (i > 0) pdf.addPage()
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(13)
    pdf.text(`${encabezado} · ${l.titulo}`, margen, margen + 4)
    // La foto entra entera en lo que queda de la hoja, sin deformarse.
    const arriba = margen + 8
    const libreAncho = ancho - 2 * margen
    const libreAlto = alto - arriba - margen
    const escala = Math.min(libreAncho / fotoAncho, libreAlto / fotoAlto)
    const w = fotoAncho * escala
    const h = fotoAlto * escala
    pdf.addImage(img, "JPEG", margen + (libreAncho - w) / 2, arriba, w, h)
  }
  pdf.save(archivo)
}
