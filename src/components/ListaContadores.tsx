import { Badge } from "@/components/ui/badge"
import { nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { LIMITE_MERMA, mermaCorrida, type ContadorRegistro, type ProductoTerminadoRegistro } from "@/lib/turno"

const MERMA_MAX = LIMITE_MERMA * 100

/**
 * Lista de contadores (envases llenadora) cargados en el turno, con
 * la merma de cada corrida — se calcula comparando contra Producto
 * Terminado de esa misma corrida (turnoLineaId), no es una columna
 * propia del contador. Si Producto Terminado todavía no se cargó para
 * esa corrida, se muestra "pendiente" en vez de un número. La usan
 * Contadores y Merma (mientras se van cargando) y el Acta de Fin de
 * Turno (con los totales, para el cierre).
 */
export function ListaContadores({
  contadores,
  productoTerminado,
  mostrarTotales = false,
}: {
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  mostrarTotales?: boolean
}) {
  const { lineas, presentaciones } = useCatalogosLive()
  const totalLlenadora = contadores.reduce((a, c) => a + c.envasesLlenadora, 0)

  return (
    <div className="flex flex-col gap-2">
      {contadores.map((c) => {
        const merma = c.turnoLineaId ? mermaCorrida(c.turnoLineaId, { contadores, productoTerminado }, presentaciones) : null
        const requiereJustificacion = merma !== null && merma.pct > MERMA_MAX
        return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">{nombrePorCodigo(lineas, c.linea)}</p>
              <p className="text-muted-foreground">{c.envasesLlenadora} llenadora</p>
              {requiereJustificacion && c.justificacion && (
                <p className="mt-1 text-xs text-muted-foreground italic">"{c.justificacion}"</p>
              )}
            </div>
            <Badge variant={requiereJustificacion ? "destructive" : "secondary"}>
              {merma !== null ? `${merma.pct}%` : "Pendiente"}
            </Badge>
          </div>
        )
      })}

      {mostrarTotales && contadores.length > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-foreground">Total del turno</p>
            <p className="text-muted-foreground">{totalLlenadora} llenadora</p>
          </div>
        </div>
      )}
    </div>
  )
}
