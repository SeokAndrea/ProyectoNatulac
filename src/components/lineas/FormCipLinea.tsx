import { useState } from "react"
import { Beaker, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { LineaCodigo } from "@/lib/catalogos"
import { MOTIVOS_CIP, type Corrida, type MotivoCip } from "@/lib/produccion/tipos"
import { MensajeError } from "./MensajeError"
import type { AccionesLinea } from "./tipos"
import { useAccion } from "./useAccion"

const nombreMotivo = (m: MotivoCip) => MOTIVOS_CIP.find((x) => x.codigo === m)?.nombre ?? m

/**
 * Formulario de CIP, paso a paso (plan-lineas-pt-paradas.md, sección C):
 * motivo → (con corrida) ¿el lote sigue? → descripción opcional →
 * confirmar dos veces. Cada respuesta reemplaza a su pregunta (lo
 * respondido queda en una línea); Cancelar borra todo.
 */
export function FormCipLinea({
  lineaCodigo,
  corrida,
  ponerEnCip,
  onCerrar,
}: {
  lineaCodigo: LineaCodigo
  /** Corrida corriendo o en pausa que entra al CIP; null = línea sin corrida. */
  corrida: Corrida | null
  ponerEnCip: AccionesLinea["ponerEnCip"]
  onCerrar: () => void
}) {
  const [motivo, setMotivo] = useState<MotivoCip | null>(null)
  const [loteSigue, setLoteSigue] = useState<boolean | null>(null)
  const [descripcion, setDescripcion] = useState("")
  const [confirmar, setConfirmar] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  const lote = corrida?.lote ?? ""
  const listo = motivo !== null && (!corrida || loteSigue !== null)

  async function enviar() {
    if (!motivo) return
    if (!confirmar) {
      setConfirmar(true)
      return
    }
    const ok = await ejecutar(() =>
      ponerEnCip({
        linea: lineaCodigo,
        motivo,
        descripcion,
        corridaId: corrida?.id ?? null,
        loteSigue: corrida ? loteSigue : null,
      }),
    )
    if (ok) onCerrar()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-foreground">Poner en CIP</p>
      {motivo === null ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Motivo del CIP</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_CIP.map((m) => (
              <Button key={m.codigo} size="sm" variant="outline" onClick={() => setMotivo(m.codigo)}>
                {m.nombre}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Motivo: <span className="font-medium text-foreground">{nombreMotivo(motivo)}</span>
        </p>
      )}

      {corrida && motivo !== null && (
        loteSigue === null ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">¿El Lote {lote} sigue después del CIP?</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setLoteSigue(true)}>
                Sí, sigue
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLoteSigue(false)}>
                No, termina aquí
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Lote {lote}: <span className="font-medium text-foreground">{loteSigue ? "sigue después del CIP" : "termina aquí"}</span>
          </p>
        )
      )}

      {listo && (
        <>
          <Textarea
            value={descripcion}
            onChange={(e) => {
              setDescripcion(e.target.value.slice(0, 140))
              setConfirmar(false)
            }}
            maxLength={140}
            rows={2}
            placeholder="Descripción breve (opcional: ya está el motivo)"
            className="text-sm"
          />
          {confirmar && (
            <p className="rounded-md bg-muted/60 p-2 text-xs text-foreground">
              {corrida
                ? loteSigue
                  ? `La línea para y queda en CIP. El Lote ${lote} continúa al terminar el CIP.`
                  : `La corrida del Lote ${lote} se detiene y queda esperando su Producto Terminado.`
                : "La línea queda en CIP."}{" "}
              Se suma un +1 en Registrar Paradas. ¿Confirmas?
            </p>
          )}
        </>
      )}

      <MensajeError error={error} />
      <div className="flex flex-wrap gap-2">
        {listo && (
          <Button size="sm" variant={confirmar ? "destructive" : "default"} onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
            {confirmar ? "Sí, poner en CIP" : "Poner en CIP"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
