import { useEffect, useState } from "react"
import { Beaker, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MensajeError } from "@/components/MensajeError"
import { listarDesvases, type Desvase } from "@/lib/desvases"
import { nombreSaborConFamilia, unidadPreparacion, type Sabor } from "@/lib/sabores"
import type { DatosIniciarPreparacion, Resultado } from "@/lib/preparacion/tipos"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { DESVASE_HABILITADO, MOSTRAR_INSUMOS_PREPARACION, TANK_CAPACITY } from "./constantes"

/**
 * "Iniciar Preparación": sabor + lote + tambores (el volumen sale de
 * tambores × sabor.volumen). Si en el tanque quedaba un resto, se suma
 * al lote nuevo; si es de OTRO sabor, pide confirmar la mezcla.
 */
export function FormIniciarPreparacion({
  numeroTanque,
  sabores,
  volumenRestante,
  saborRestanteId,
  saborRestanteNombre,
  areaCodigo,
  usuarioSesion,
  onIniciar,
  onCancelar,
}: {
  numeroTanque: 1 | 2 | 3
  sabores: Sabor[]
  /** Litros que ya están físicamente en el tanque (resto de Standby) — se suman al nuevo lote, no desaparecen. */
  volumenRestante: number
  /** Sabor de ese resto (null si el tanque está vacío) — para avisar si el sabor nuevo no coincide. */
  saborRestanteId: string | null
  saborRestanteNombre: string | null
  areaCodigo: string | null
  usuarioSesion: string
  onIniciar: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  onCancelar: () => void
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const [tambores, setTambores] = useState("")
  const [agua, setAgua] = useState("")
  const [azucar, setAzucar] = useState("")
  const [acidoCitrico, setAcidoCitrico] = useState("")
  const [desvasesGuardados, setDesvasesGuardados] = useState<Desvase[]>([])
  const [desvaseId, setDesvaseId] = useState("")
  const [confirmandoSaborDistinto, setConfirmandoSaborDistinto] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  useEffect(() => {
    setDesvaseId("")
    if (!DESVASE_HABILITADO || !saborId || !areaCodigo) {
      setDesvasesGuardados([])
      return
    }
    listarDesvases(usuarioSesion, areaCodigo, saborId).then(setDesvasesGuardados)
  }, [saborId, areaCodigo, usuarioSesion])

  useEffect(() => {
    setConfirmandoSaborDistinto(false)
  }, [saborId])

  const saborElegido = sabores.find((s) => s.id === saborId)
  const unidadPrep = unidadPreparacion(saborElegido ? `${saborElegido.nombre} ${saborElegido.familiaNombre}` : null)
  const desvaseElegido = desvasesGuardados.find((r) => r.id === desvaseId)
  const litrosEstimados =
    saborElegido?.volumen && tambores !== "" && Number(tambores) > 0
      ? Math.round(Number(tambores) * saborElegido.volumen) + volumenRestante + (desvaseElegido?.litros ?? 0)
      : null
  const excedeCapacidad = litrosEstimados !== null && litrosEstimados > TANK_CAPACITY

  /** Se está preparando encima de un resto de OTRO sabor — se va a mezclar en silencio si no se confirma. */
  const saborDistintoDelResto = volumenRestante > 0 && saborRestanteId !== null && saborId !== "" && saborId !== saborRestanteId

  const valido = saborId !== "" && lote.trim() !== "" && tambores !== "" && Number(tambores) >= 0 && !excedeCapacidad

  async function handleSubmit() {
    if (!valido) return
    if (saborDistintoDelResto && !confirmandoSaborDistinto) {
      setConfirmandoSaborDistinto(true)
      return
    }
    await ejecutar(() =>
      onIniciar({
        numeroTanque,
        saborId: saborId || null,
        lote: lote.trim(),
        tambores: Number(tambores),
        agua: agua.trim() === "" ? null : Number(agua),
        azucar: azucar.trim() === "" ? null : Number(azucar),
        acidoCitrico: acidoCitrico.trim() === "" ? null : Number(acidoCitrico),
        desvaseId: desvaseId || null,
      }),
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Nueva preparación (lote independiente, no se suma a otros)
        {volumenRestante > 0 ? ` — se suman los ${volumenRestante.toLocaleString("es-CO")} L que quedaban en el tanque.` : ""}
      </p>
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
        <Input placeholder="Lote" value={lote} onChange={(e) => setLote(e.target.value)} />
        <Input
          type="number"
          min={0}
          step={0.5}
          inputMode="decimal"
          placeholder={unidadPrep === "kits" ? "Kits" : "Tambores"}
          value={tambores}
          onChange={(e) => setTambores(e.target.value)}
        />
        {MOSTRAR_INSUMOS_PREPARACION && (
          <>
            <Input type="number" min={0} placeholder="Agua (L)" value={agua} onChange={(e) => setAgua(e.target.value)} />
            <Input type="number" min={0} placeholder="Azúcar (kg)" value={azucar} onChange={(e) => setAzucar(e.target.value)} />
            <Input
              type="number"
              min={0}
              placeholder="Ácido cítrico (kg)"
              value={acidoCitrico}
              onChange={(e) => setAcidoCitrico(e.target.value)}
            />
          </>
        )}
      </div>

      {DESVASE_HABILITADO && saborId !== "" && desvasesGuardados.length > 0 && (
        <Select value={desvaseId} onValueChange={setDesvaseId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sumar un desvase guardado (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {desvasesGuardados.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.litros.toLocaleString("es-CO")} L · desvasado {new Date(r.creadoEn).toLocaleDateString("es-CO")}
                {r.loteOrigen ? ` · Lote ${r.loteOrigen}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {litrosEstimados !== null && (
        <p className={cn("text-xs", excedeCapacidad ? "font-medium text-destructive" : "text-muted-foreground")}>
          ≈ <span className="font-medium text-foreground">{litrosEstimados.toLocaleString("es-CO")} L</span> con este sabor (
          {saborElegido?.volumen?.toLocaleString("es-CO")} L por tambor)
          {desvaseElegido ? ` + ${desvaseElegido.litros.toLocaleString("es-CO")} L guardados` : ""}
          {excedeCapacidad && ` — supera la capacidad del tanque (${TANK_CAPACITY.toLocaleString("es-CO")} L)`}
        </p>
      )}

      {saborDistintoDelResto && (
        <p className="text-xs font-medium text-destructive" role="alert">
          Quedan {volumenRestante.toLocaleString("es-CO")} L de {saborRestanteNombre} en el tanque — se van a mezclar en
          silencio con el {saborElegido?.nombre} nuevo.
        </p>
      )}

      <MensajeError error={error} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={confirmandoSaborDistinto ? "destructive" : "default"} disabled={!valido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
          {confirmandoSaborDistinto ? "¿Seguro? Sí, mezclar y preparar" : "Iniciar Preparación"}
        </Button>
        <Button size="sm" variant="ghost" onClick={confirmandoSaborDistinto ? () => setConfirmandoSaborDistinto(false) : onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
