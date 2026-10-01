/**
 * Descarga un archivo (Blob) en el navegador con el nombre dado. Sirve en
 * el teléfono: Android lo guarda en Descargas; el iPhone lo abre para
 * guardarlo o compartirlo.
 *
 * La URL temporal se libera un minuto después, no en el acto: algunos
 * navegadores de teléfono empiezan la descarga recién después del clic.
 */
export function descargarArchivo(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Baja un archivo de una URL (ej. el acta guardada en Storage) y lo
 * descarga con el nombre dado. El atributo `download` no funciona con
 * enlaces de otro dominio, por eso se trae primero como Blob. Si falla,
 * lo abre en una pestaña nueva.
 */
export async function descargarDesdeUrl(url: string, nombreArchivo: string): Promise<void> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(String(resp.status))
    descargarArchivo(await resp.blob(), nombreArchivo)
  } catch {
    window.open(url, "_blank", "noopener")
  }
}

/** "Acta_A20261001_T1G2.pdf" */
export function nombreArchivoActa(codigoTurno: string): string {
  return `Acta_${codigoTurno.replace(/[^\w-]+/g, "_")}.pdf`
}
