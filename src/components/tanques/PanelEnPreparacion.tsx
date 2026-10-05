import { useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import type { AnalisisCalidad } from "@/lib/calidad"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
import { useAccion } from "@/lib/useAccion"
import { EstadoCalidadLote } from "./EstadoCalidadLote"
import type { AccionesTanque } from "./tipos"

/**
 * Tanque En Preparación: Liberar (o, si en el área libera Calidad, el
 * estado de su análisis) y Ajustar el volumen del lote antes de liberar.
 */
export function PanelEnPreparacion({
  lote,
  calidadLibera,
  ultimoAnalisis,
  puedeIrACalidad,
  liberarLote,
  ajustar,
}: {
  lote: PreparacionRegistro
  /** true = libera Calidad; false = libera el supervisor; null = cargando. */
  calidadLibera: boolean | null
  ultimoAnalisis: AnalisisCalidad | null
  puedeIrACalidad: boolean
  liberarLote: AccionesTanque["liberarLote"]
  ajustar: AccionesTanque["ajustar"]
}) {
  const liberar = useAccion()
  const ajuste = useAccion()
  const [mostrarAjuste, setMostrarAjuste] = useState(false)
  const [litros, setLitros] = useState("")
  const [detalle, setDetalle] = useState("")

  async function sumar() {
    const ok = await ajuste.ejecutar(() => ajustar(lote.id, Number(litros), detalle.trim() || null))
    if (!ok) return
    setLitros("")
    setDetalle("")
    setMostrarAjuste(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {calidadLibera ? (
        <EstadoCalidadLote ultimo={ultimoAnalisis} puedeIrACalidad={puedeIrACalidad} />
      ) : (
        <Button
          size="sm"
          className="self-start"
          disabled={calidadLibera === null || liberar.enviando || ajuste.enviando}
          onClick={() => liberar.ejecutar(() => liberarLote(lote.id))}
        >
          {liberar.enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          Liberar (marcar Listo)
        </Button>
      )}
      <MensajeError error={liberar.error} />

      {mostrarAjuste ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
          <p className="text-xs text-muted-foreground">Sumar jugo o agua al volumen del lote (antes de liberar).</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="Litros"
              className="h-8 w-24"
              value={litros}
              onChange={(e) => setLitros(e.target.value)}
            />
            <Input placeholder="Detalle (opcional)" className="h-8 w-40" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
            <Button size="sm" disabled={ajuste.enviando || !(Number(litros) > 0)} onClick={sumar}>
              {ajuste.enviando ? <Loader2 className="size-3.5 animate-spin" /> : "Sumar"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={ajuste.enviando}
              onClick={() => {
                setMostrarAjuste(false)
                ajuste.setError(null)
              }}
            >
              Cancelar
            </Button>
          </div>
          <MensajeError error={ajuste.error} />
        </div>
      ) : (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setMostrarAjuste(true)}>
          Ajustar
        </Button>
      )}
    </div>
  )
}
