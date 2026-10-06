import { useState } from "react"
import { Check, CheckCircle2, Loader2, PenLine } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { nombrePresentacion, type ItemDia } from "@/lib/resumenDia"

type Resultado = { ok: true } | { ok: false; error: string }
const miles = (n: number) => n.toLocaleString("es-CO")

/**
 * Un sabor + presentación del día: sus cajas, el estado y Confirmar /
 * Corregir el total. Al corregir también se puede cambiar la presentación
 * (ej. se cargó como 250 y era 200): las cajas pasan a la otra fila.
 */
export function ItemValidar({
  item: i,
  volumenes,
  guardar,
  moverA,
  onCambio,
}: {
  item: ItemDia
  /** Presentaciones que se pueden elegir (ml). */
  volumenes: number[]
  guardar: (cajas: number | null, nota: string) => Promise<Resultado>
  /** Pasa `cajas` a la presentación `volumenMl` (esta fila queda en 0). */
  moverA: (volumenMl: number, cajas: number, nota: string) => Promise<Resultado>
  onCambio: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [cajas, setCajas] = useState(String(i.cajasOficiales))
  const [volumen, setVolumen] = useState(i.volumenMl)
  const [nota, setNota] = useState(i.nota ?? "")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nCajas = Number(cajas)
  const valido = cajas !== "" && Number.isInteger(nCajas) && nCajas >= 0
  const cambiaPresentacion = volumen !== i.volumenMl

  async function ejecutar(accion: () => Promise<Resultado>) {
    setEnviando(true)
    setError(null)
    const r = await accion()
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setEditando(false)
    onCambio()
  }

  const opciones = [...new Set([i.volumenMl, ...volumenes])].sort((a, b) => b - a)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{i.saborNombre}</p>
          <p className="text-xs text-muted-foreground">{nombrePresentacion(i.volumenMl)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-base font-bold text-foreground">{miles(i.cajasOficiales)} cajas</span>
          {i.estado === "CONFIRMADO" ? (
            <Badge>Confirmado</Badge>
          ) : i.estado === "EDITADO" ? (
            <Badge variant="secondary">Corregido</Badge>
          ) : (
            <Badge variant="outline">Pendiente</Badge>
          )}
        </div>
      </div>

      {i.estado === "EDITADO" && (
        <p className="text-xs text-muted-foreground">
          Supervisor: <span className="num">{miles(i.cajasSupervisor)}</span> cajas
        </p>
      )}
      {i.estado !== "PENDIENTE" && i.validadoPorNombre && (
        <p className="text-xs text-muted-foreground">
          {i.estado === "EDITADO" ? "Corrigió" : "Confirmó"} {i.validadoPorNombre}
          {i.nota ? ` — ${i.nota}` : ""}
        </p>
      )}

      {editando ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-2">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Total de cajas</span>
              <Input type="number" inputMode="numeric" min={0} value={cajas} onChange={(e) => setCajas(e.target.value)} className="h-8 w-32" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Presentación</span>
              <select
                value={volumen}
                onChange={(e) => setVolumen(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {opciones.map((v) => (
                  <option key={v} value={v}>
                    {v} ml
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cambiaPresentacion && (
            <p className="text-xs text-muted-foreground">
              Las {valido ? miles(nCajas) : "—"} cajas pasan a {i.saborNombre} {volumen} ml y esta fila queda en 0.
            </p>
          )}
          <Input placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8" />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!valido || enviando}
              onClick={() => ejecutar(() => (cambiaPresentacion ? moverA(volumen, nCajas, nota) : guardar(nCajas, nota)))}
            >
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {cambiaPresentacion ? `Pasar a ${volumen} ml` : "Guardar corrección"}
            </Button>
            <Button size="sm" variant="ghost" disabled={enviando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {i.estado !== "CONFIRMADO" && (
            <Button size="sm" variant="outline" disabled={enviando} onClick={() => ejecutar(() => guardar(null, ""))}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {i.estado === "EDITADO" ? "Volver a lo del supervisor" : "Confirmar"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={enviando}
            onClick={() => {
              setCajas(String(i.cajasOficiales))
              setVolumen(i.volumenMl)
              setNota(i.nota ?? "")
              setEditando(true)
            }}
          >
            <PenLine className="size-3.5" />
            Corregir
          </Button>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
