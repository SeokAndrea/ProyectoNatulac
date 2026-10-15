import { useState, type RefObject } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { capital, nombreMes } from "@/lib/indicadores/calculos"
import { esperarDibujo, exportarIndicadoresPdf } from "@/lib/indicadores/exportarPdf"
import { SECCIONES, type Seccion } from "@/components/indicadores/secciones"

/** Nombre de cada pantalla en la página del PDF: "Línea 1", "Semielaborado"… */
const TITULOS: Record<Seccion, string> = {
  "1": "Línea 1",
  "2": "Línea 2",
  "3": "Línea 3",
  semi: "Semielaborado",
  aus: "Ausentismo",
  inc: "Incidencias y seguimiento",
}

/**
 * Exportar las pantallas del mes a PDF, como respaldo (dueña, 2026-10-14):
 * pasa por cada una, la fotografía tal como se ve y arma una página por
 * pantalla. Al terminar vuelve a la pantalla en que estaba.
 */
export function BotonPdf({
  mes,
  seccion,
  onSeccion,
  lamina,
  secciones,
}: {
  mes: string
  seccion: Seccion
  onSeccion: (s: Seccion) => void
  /** Lo que se fotografía: la franja y la pantalla, sin la barra de filtros. */
  lamina: RefObject<HTMLDivElement | null>
  /** Las pantallas que van al PDF: las que tienen datos. */
  secciones: Seccion[]
}) {
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportar() {
    setExportando(true)
    setError(null)
    const volverA = seccion
    try {
      await exportarIndicadoresPdf(
        SECCIONES.filter((s) => secciones.includes(s.valor)).map((s) => ({
          titulo: TITULOS[s.valor],
          mostrar: async () => {
            onSeccion(s.valor)
            await esperarDibujo()
          },
        })),
        () => lamina.current,
        `Indicadores · ${capital(nombreMes(mes))} ${mes.slice(0, 4)}`,
        `Indicadores ${capital(nombreMes(mes))} ${mes.slice(0, 4)}.pdf`,
      )
    } catch {
      setError("No se pudo armar el PDF. Intenta de nuevo.")
    } finally {
      onSeccion(volverA)
      setExportando(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={exportar} disabled={exportando} title="Una página por pantalla, tal como se ve">
        {exportando ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
        {exportando ? "Armando PDF…" : "PDF"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
