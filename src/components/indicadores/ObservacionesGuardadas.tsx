import { useEffect, useState } from "react"
import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { capital, finDeMes, nombreMes } from "@/lib/indicadores/calculos"
import { listarObservacionesCorrida, type ObservacionCorrida } from "@/lib/observacionesCorrida"

const TURNO: Record<string, string> = { TURNO_1: "T1", TURNO_2: "T2", TURNO_3: "T3" }

/**
 * Las observaciones que la analista guardó en el Resumen Diario para los
 * lotes de esta línea en el mes (dueña, 2026-10-20). Sin ninguna, el botón
 * no aparece (lo vacío no se ve).
 */
export function ObservacionesGuardadas({ usuario, area, mes, linea }: { usuario: string; area: string; mes: string; linea: string }) {
  const [todas, setTodas] = useState<ObservacionCorrida[]>([])
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    let vivo = true
    listarObservacionesCorrida(usuario, area, mes, finDeMes(mes)).then((r) => {
      if (vivo) setTodas("error" in r ? [] : r)
    })
    return () => {
      vivo = false
    }
  }, [usuario, area, mes])
  const deLinea = todas.filter((o) => o.lineaCodigo.replace(/^LINEA_T?/, "") === linea)
  if (deLinea.length === 0) return null

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAbierto(true)}>
        <MessageSquareText className="size-3.5" /> Ver observaciones guardadas ({deLinea.length})
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Observaciones guardadas · Línea {linea}</DialogTitle>
            <DialogDescription>{capital(nombreMes(mes))}, desde el Resumen Diario</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col divide-y divide-border">
            {deLinea.map((o) => (
              <li key={o.corridaId} className="flex flex-col gap-1 py-2">
                <span className="text-xs text-muted-foreground">
                  <span className="num">
                    {o.fecha.slice(8, 10)}/{o.fecha.slice(5, 7)}
                  </span>{" "}
                  · {TURNO[o.turnoTipo] ?? o.turnoTipo}
                  {o.sabor ? ` · ${o.sabor}` : ""}
                  {o.lote ? ` ${o.lote}` : ""}
                  {o.volumenMl ? ` · ${o.volumenMl} ml` : ""}
                </span>
                <p className="text-sm whitespace-pre-wrap text-foreground">{o.texto}</p>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
