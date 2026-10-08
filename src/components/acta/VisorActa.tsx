import { useEffect, useState } from "react"
import { Download, Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { imprimirPaginas, paginasDeActa } from "@/lib/actaVisor"
import { descargarArchivo, descargarDesdeUrl, nombreArchivoActa } from "@/lib/descargarArchivo"

/*
 * El acta en pantalla, igual a la que se imprime, con Imprimir y Descargar
 * PDF. `fuente`: el PDF recién generado (Finalizar Turno) o la URL del acta
 * guardada (Mis Actas, Resumen Diario).
 */
export function VisorActa({ fuente, codigoTurno }: { fuente: Blob | string; codigoTurno: string }) {
  const [paginas, setPaginas] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    let vivo = true
    setPaginas(null)
    setError(null)
    paginasDeActa(fuente)
      .then((p) => vivo && setPaginas(p))
      .catch(() => vivo && setError("No se pudo mostrar el acta. Descárgala para verla."))
    return () => {
      vivo = false
    }
  }, [fuente])

  async function descargar() {
    if (typeof fuente !== "string") return descargarArchivo(fuente, nombreArchivoActa(codigoTurno))
    setDescargando(true)
    await descargarDesdeUrl(fuente, nombreArchivoActa(codigoTurno))
    setDescargando(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => paginas && imprimirPaginas(paginas)} disabled={!paginas}>
          <Printer className="size-4" />
          Imprimir acta
        </Button>
        <Button variant="outline" onClick={descargar} disabled={descargando}>
          {descargando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Descargar PDF
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : !paginas ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {paginas.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Acta ${codigoTurno}, página ${i + 1} de ${paginas.length}`}
              className="w-full rounded border border-border bg-white shadow-sm"
            />
          ))}
        </div>
      )}
    </div>
  )
}
