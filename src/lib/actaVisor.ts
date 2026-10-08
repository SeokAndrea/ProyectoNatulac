import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"

/*
 * Ver e imprimir el acta dentro de la app (dueña, 2026-10-08: los
 * supervisores no lograban imprimirla desde el teléfono). El acta sigue
 * siendo el MISMO PDF de siempre (src/lib/actaPdf.ts): aquí solo se dibuja
 * cada página como imagen con pdf.js (que se carga recién al abrir un acta)
 * y se imprime desde un iframe con solo esas páginas.
 */

/** Las páginas del PDF como imágenes (data URL), del ancho pedido en píxeles. */
export async function paginasDeActa(fuente: Blob | string, ancho = 1400): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const datos = typeof fuente === "string" ? await (await fetch(fuente)).arrayBuffer() : await fuente.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(datos) }).promise
  const paginas: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const base = pagina.getViewport({ scale: 1 })
    const viewport = pagina.getViewport({ scale: ancho / base.width })
    const canvas = document.createElement("canvas")
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Este navegador no puede dibujar el acta.")
    await pagina.render({ canvasContext: ctx, viewport }).promise
    paginas.push(canvas.toDataURL("image/jpeg", 0.92))
  }
  await doc.destroy()
  return paginas
}

/** Abre la impresión con solo las páginas del acta (una por hoja A4). */
export function imprimirPaginas(paginas: string[]): void {
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(
    `<!doctype html><html><head><title>Acta</title><style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:100%;break-after:page}img:last-child{break-after:auto}</style></head><body>${paginas
      .map((src) => `<img src="${src}" alt="">`)
      .join("")}</body></html>`,
  )
  doc.close()
  const quitar = () => setTimeout(() => iframe.remove(), 1000)
  win.addEventListener("afterprint", quitar)
  const imgs = Array.from(doc.images)
  Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r))))).then(() => {
    win.focus()
    win.print()
    // Algunos navegadores no avisan "afterprint": se quita igual al rato.
    setTimeout(() => iframe.remove(), 60000)
  })
}
