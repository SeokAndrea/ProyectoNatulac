import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { EtiquetaPaleta } from "@/components/robot-tavil/EtiquetaPaleta"
import { registrarImpresion, type Paleta } from "@/lib/trazabilidadPaletizado"

/*
 * Imprime el ticket de una paleta (prueba con la impresión del navegador, plan
 * docs/ticket-paletas/plan-tickets-paletas.md, opción A). Arma un documento
 * aparte de 100 × 150 mm por copia y abre la impresión del navegador. Con
 * Chrome en modo --kiosk-printing sale directo por la impresora
 * predeterminada, sin el cuadro de impresión.
 */

/** Las @font-face de la app (IBM Plex Sans y JetBrains Mono) para el documento de impresión. */
function fuentesDeLaApp(): string {
  const reglas: string[] = []
  for (const hoja of Array.from(document.styleSheets)) {
    let lista: CSSRuleList
    try {
      lista = hoja.cssRules
    } catch {
      continue
    }
    for (const r of Array.from(lista)) {
      if (typeof CSSFontFaceRule !== "undefined" && r instanceof CSSFontFaceRule && /IBM Plex Sans|JetBrains Mono/i.test(r.cssText)) reglas.push(r.cssText)
    }
  }
  return reglas.join("\n")
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** HTML de las etiquetas (una por copia). */
export function htmlEtiquetas(paleta: Paleta, copias: number): string {
  const div = document.createElement("div")
  const raiz = createRoot(div)
  const n = Math.max(1, Math.min(4, Math.trunc(copias) || 1))
  flushSync(() =>
    raiz.render(
      <>
        {Array.from({ length: n }, (_, i) => (
          <EtiquetaPaleta key={i} paleta={paleta} />
        ))}
      </>,
    ),
  )
  const html = div.innerHTML
  raiz.unmount()
  return html
}

/** Manda a imprimir el ticket. Falla (rechaza) si el navegador no deja abrir la impresión. */
export async function imprimirEtiquetas(paleta: Paleta, copias: number): Promise<void> {
  const html = htmlEtiquetas(paleta, copias)
  const marco = document.createElement("iframe")
  marco.setAttribute("aria-hidden", "true")
  marco.tabIndex = -1
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  document.body.appendChild(marco)
  const quitar = () => marco.remove()
  try {
    const doc = marco.contentDocument
    const ventana = marco.contentWindow
    if (!doc || !ventana) throw new Error("sin documento")
    doc.open()
    doc.write(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ticket ${paleta.ticket ?? ""}</title><style>` +
        fuentesDeLaApp() +
        "@page{size:100mm 150mm;margin:0}html,body{margin:0;padding:0;background:#fff}" +
        ".etiqueta{break-after:page;page-break-after:always}.etiqueta:last-child{break-after:auto;page-break-after:auto}" +
        `</style></head><body>${html}</body></html>`,
    )
    doc.close()
    // Que las fuentes estén cargadas antes de imprimir (sin esperar más de 2 s).
    const fuentes = doc.fonts ? Promise.all(Array.from(doc.fonts).map((f) => f.load().catch(() => null))) : Promise.resolve()
    await Promise.race([fuentes, esperar(2000)])
    ventana.addEventListener("afterprint", () => setTimeout(quitar, 500), { once: true })
    ventana.focus()
    ventana.print()
    // Si el navegador no avisa el final, se quita igual al rato.
    setTimeout(quitar, 120_000)
  } catch (e) {
    quitar()
    throw e
  }
}

/**
 * Imprime y cuenta la impresión en la base (la reimpresión queda en
 * Auditoría). Devuelve la paleta al día, o el error para mostrar.
 */
export async function imprimirYRegistrar(
  usuario: string,
  paleta: Paleta,
  copias: number,
  pagina: string,
): Promise<{ paleta: Paleta | null; error: string | null }> {
  try {
    await imprimirEtiquetas(paleta, copias)
  } catch {
    return { paleta: null, error: "No se pudo abrir la impresión. Toca «Reimprimir» para intentar de nuevo." }
  }
  const r = await registrarImpresion(usuario, paleta.id, copias, pagina)
  return r.ok ? { paleta: r.data, error: null } : { paleta: null, error: r.error }
}
