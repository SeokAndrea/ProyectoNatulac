import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Validacion } from "@/lib/validarJornada"

type Resultado = { ok: true } | { ok: false; error: string }

export type AccionValidar = { tipo: "CONFIRMAR" } | { tipo: "CORREGIR"; valor: number } | { tipo: "NO_CUENTA" }

const ETIQUETA: Record<Validacion["estado"], string> = { CONFIRMADO: "Confirmado", EDITADO: "Corregido", EXCLUIDA: "No cuenta" }

/** Valor original, o tachado con el corregido al lado. */
export function ValorValidado({ original, validacion, unidad = "" }: { original: number; validacion: Validacion | null; unidad?: string }) {
  const n = (v: number) => `${v.toLocaleString("es-CO")}${unidad}`
  if (validacion?.valor == null) return <span className="num">{n(original)}</span>
  return (
    <span className="num whitespace-nowrap">
      <span className="mr-1 text-xs text-muted-foreground line-through">{n(original)}</span>
      <span className="font-semibold text-info">{n(validacion.valor)}</span>
    </span>
  )
}

/**
 * Confirmar / Corregir (y "No cuenta" en paradas) de una fila. Corregir
 * abre un campo con el valor original. Con la jornada validada solo
 * muestra el estado.
 */
export function AccionesFila({
  validacion,
  valorOriginal,
  bloqueada,
  conNoCuenta = false,
  onAccion,
}: {
  validacion: Validacion | null
  valorOriginal: number
  /** Jornada validada: no se cambia. */
  bloqueada: boolean
  conNoCuenta?: boolean
  onAccion: (accion: AccionValidar) => Promise<Resultado>
}) {
  const [editando, setEditando] = useState(false)
  /** "Cambiar" una fila ya revisada: vuelven las tres opciones. */
  const [rehaciendo, setRehaciendo] = useState(false)
  const [valor, setValor] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function hacer(accion: AccionValidar) {
    setEnviando(true)
    setError(null)
    const r = await onAccion(accion)
    setEnviando(false)
    if (!r.ok) return setError(r.error)
    setEditando(false)
    setRehaciendo(false)
  }

  if (editando) {
    const n = Number(valor)
    const valido = valor.trim() !== "" && Number.isFinite(n) && n >= 0
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center justify-end gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            className="h-7 w-24 text-right"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label="Valor corregido"
            autoFocus
          />
          <Button size="sm" className="h-7" disabled={!valido || enviando} onClick={() => hacer({ tipo: "CORREGIR", valor: n })}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={enviando}
            onClick={() => {
              setEditando(false)
              setRehaciendo(false)
            }}
          >
            Cancelar
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  const abrirCorreccion = () => {
    setValor(String(validacion?.valor ?? valorOriginal))
    setEditando(true)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {validacion && !rehaciendo ? (
          <>
            <Badge variant={validacion.estado === "EXCLUIDA" ? "muted" : validacion.estado === "EDITADO" ? "info" : "success"}>
              {ETIQUETA[validacion.estado]}
            </Badge>
            {!bloqueada && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setRehaciendo(true)}>
                Cambiar
              </Button>
            )}
          </>
        ) : bloqueada ? (
          <Badge variant="muted">Sin revisar</Badge>
        ) : (
          <>
            <Button size="sm" variant="outline" className="h-7" disabled={enviando} onClick={() => hacer({ tipo: "CONFIRMAR" })}>
              {enviando ? <Loader2 className="size-3.5 animate-spin" /> : "Confirmar"}
            </Button>
            <Button size="sm" variant="outline" className="h-7" disabled={enviando} onClick={abrirCorreccion}>
              Corregir
            </Button>
            {conNoCuenta && (
              <Button size="sm" variant="outline" className="h-7" disabled={enviando} onClick={() => hacer({ tipo: "NO_CUENTA" })}>
                No cuenta
              </Button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
