import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { nombreSaborConFamilia, unidadPreparacion, type Sabor } from "@/lib/sabores"
import type { CondicionTanque, DatosCambiarTanque, TanqueRecepcion } from "@/lib/turno"

type Resultado = { ok: true } | { ok: false; error: string }

/** Los lotes son 4 dígitos (0001, 0002...) — si escriben solo el número (ej. "3"), se completa con ceros a la izquierda. */
function normalizarLote(valor: string): string {
  const recortado = valor.trim()
  return /^\d+$/.test(recortado) ? recortado.padStart(4, "0") : recortado
}

/**
 * Formulario para cambiar la condición de un tanque — compartido
 * entre Preparación (donde se abre/cierra con un botón "Cambiar
 * estado") y el paso 2 de Comenzar Turno (donde se muestra siempre
 * abierto, para revisar/confirmar los 3 tanques al arrancar el
 * turno). La lógica es la misma en los dos lados: es estado continuo,
 * cambiarlo acá es lo mismo que cambiarlo en Preparación.
 */
export function TanqueEditForm({
  tanque,
  sabores,
  onGuardar,
  onCancelar,
  guardarTexto = "Guardar",
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  onGuardar: (datos: DatosCambiarTanque) => Promise<Resultado>
  onCancelar?: () => void
  guardarTexto?: string
}) {
  const [condicion, setCondicion] = useState<CondicionTanque>(tanque.condicion)
  const [saborId, setSaborId] = useState(tanque.saborId ?? "")
  const [volumenL, setVolumenL] = useState(tanque.volumenL !== null ? String(tanque.volumenL) : "")
  const [tambores, setTambores] = useState("")
  const [lote, setLote] = useState(tanque.lote ?? "")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Listo y Standby (resto del lote) piden sabor/volumen/lote. */
  const requiereDatos = condicion === "LISTO" || condicion === "STANDBY"
  /*
   * "En Preparación (no liberado)" también permite cargar la
   * preparación (sabor + tambores + lote) sin liberarla — igual que
   * Iniciar Preparación; el volumen sale de tambores × volumen del
   * sabor. Es opcional: se puede dejar el tanque En Preparación sin
   * datos (los 3 campos vacíos).
   */
  const esPrepConDatos = condicion === "EN_PREPARACION" && (saborId !== "" || tambores !== "" || lote.trim() !== "")
  const saborElegido = sabores.find((s) => s.id === saborId) ?? null
  const unidadPrep = unidadPreparacion(saborElegido ? `${saborElegido.nombre} ${saborElegido.familiaNombre}` : null)
  const volumenDeTambores =
    saborElegido?.volumen && tambores !== "" ? Math.round(Number(tambores) * saborElegido.volumen) : null

  const datosValidos =
    (!requiereDatos && !esPrepConDatos) ||
    (requiereDatos &&
      saborId !== "" &&
      volumenL !== "" &&
      Number(volumenL) > 0 &&
      Number(volumenL) <= 20000 &&
      lote.trim() !== "") ||
    (esPrepConDatos && saborId !== "" && tambores !== "" && Number(tambores) > 0 && lote.trim() !== "")

  async function guardar() {
    if (!datosValidos) return
    setGuardando(true)
    setError(null)
    const resultado = await onGuardar({
      numeroTanque: tanque.numeroTanque,
      condicion,
      saborId: requiereDatos || esPrepConDatos ? saborId : null,
      volumenL: requiereDatos ? Number(volumenL) : null,
      tambores: esPrepConDatos ? Number(tambores) : null,
      lote: requiereDatos || esPrepConDatos ? normalizarLote(lote) : null,
    })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <Select value={condicion} onValueChange={(v) => setCondicion(v as CondicionTanque)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="LISTO">Listo (liberado)</SelectItem>
          <SelectItem value="STANDBY">Con restos (resto del lote)</SelectItem>
          <SelectItem value="EN_PREPARACION">En Preparación (no liberado)</SelectItem>
          <SelectItem value="SUCIO">Sucio</SelectItem>
          <SelectItem value="CIP">En CIP</SelectItem>
          <SelectItem value="LIMPIO">Limpio</SelectItem>
        </SelectContent>
      </Select>

      {(requiereDatos || condicion === "EN_PREPARACION") && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={saborId} onValueChange={setSaborId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sabor" />
            </SelectTrigger>
            <SelectContent>
              {sabores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {nombreSaborConFamilia(s.nombre, s.familiaNombre)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {condicion === "EN_PREPARACION" ? (
            <Input
              type="number"
              min={0}
              placeholder={unidadPrep === "kits" ? "Kits" : "Tambores"}
              value={tambores}
              onChange={(e) => setTambores(e.target.value)}
            />
          ) : (
            <Input
              type="number"
              min={0}
              max={20000}
              placeholder="Volumen (L)"
              value={volumenL}
              onChange={(e) => setVolumenL(e.target.value)}
            />
          )}
          <Input className="col-span-2" placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
          {condicion === "EN_PREPARACION" && (
            <p className="col-span-2 text-[11px] text-muted-foreground">
              {volumenDeTambores !== null
                ? `≈ ${volumenDeTambores.toLocaleString("es-CO")} L (${unidadPrep} × volumen del sabor). Se guarda sin liberar.`
                : `Sabor + ${unidadPrep} + lote — o deja los 3 vacíos para marcar el tanque En Preparación sin datos.`}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!datosValidos || guardando} onClick={guardar}>
          {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {guardarTexto}
        </Button>
        {onCancelar && (
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
