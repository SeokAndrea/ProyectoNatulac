import { AlertTriangle } from "lucide-react"
import type { Corrida } from "@/lib/produccion/tipos"

/** "LINEA_2" → "Línea 2", "LINEA_T2" → "Línea T2". */
const nombreLinea = (codigo: string) => `Línea ${codigo.replace(/^LINEA_/, "")}`

/**
 * El volumen del tanque baja recién cuando se carga el Producto Terminado.
 * Si a este lote le falta el PT de alguna corrida, el tanque marca litros que
 * ya se envasaron: prepararle encima, transferirlo, desvasarlo o entregárselo
 * entero a Vacío arrastra esos litros al otro lado y la merma sale falsa.
 */
export function AvisoPtPendiente({ corridas, accion }: { corridas: Corrida[]; accion: string }) {
  if (corridas.length === 0) return null
  const lineas = [...new Set(corridas.map((c) => nombreLinea(c.linea)))].join(", ")
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning-soft px-2 py-1.5 text-xs text-warning-foreground" role="alert">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Falta el Producto Terminado de {lineas}
        {corridas[0].lote ? ` (Lote ${corridas[0].lote})` : ""}: este tanque marca más litros de los que tiene. Antes de {accion}, carga el
        PT o mide el tanque.
      </span>
    </p>
  )
}
