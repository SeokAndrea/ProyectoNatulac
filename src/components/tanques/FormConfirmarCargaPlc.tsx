import { useEffect, useState } from "react"
import { Beaker, Loader2, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MensajeError } from "@/components/MensajeError"
import { listarDesvases, type Desvase } from "@/lib/desvases"
import { type CargaPlc, type DatosConfirmarCarga, kitsDeMedioEnMedio } from "@/lib/preparacion/plc"
import type { Resultado } from "@/lib/preparacion/tipos"
import { nombreSaborConFamilia, type Sabor } from "@/lib/sabores"
import { horaPlanta } from "@/lib/tiempoPlanta"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { cifra, DESVASE_HABILITADO, TANK_CAPACITY } from "./constantes"

const kitsTexto = (n: number) => `${cifra(n)} ${n === 1 ? "kit" : "kits"}`
const hora = (iso: string) => horaPlanta(new Date(iso))

/** Lo que queda en el tanque de antes (Con Restos), si queda algo. */
export interface RestoEnTanque {
  litros: number
  saborId: string | null
  saborNombre: string | null
  lote: string | null
}

/**
 * Registrar una carga del PLC como lote: el agua y los kits ya vienen del PLC,
 * el supervisor elige sabor y lote (y, si hace falta, corrige los kits). Como
 * «Iniciar Preparación»: suma el resto que había en el tanque, un desvase
 * guardado, y pide confirmar si mezcla sabores. A diferencia de aquel, pasar
 * de 20.000 L solo avisa: el líquido ya está en el tanque.
 */
export function FormConfirmarCargaPlc({
  carga,
  sabores,
  resto,
  areaCodigo,
  usuarioSesion,
  calidadLibera,
  modoVacio,
  onConfirmar,
}: {
  carga: CargaPlc
  sabores: Sabor[]
  resto: RestoEnTanque | null
  areaCodigo: string | null
  usuarioSesion: string
  /** true = libera Calidad; false = el supervisor; null = cargando (no se ofrece liberar). */
  calidadLibera: boolean | null
  modoVacio: boolean
  onConfirmar: (datos: DatosConfirmarCarga) => Promise<Resultado>
}) {
  const [saborId, setSaborId] = useState("")
  const [lote, setLote] = useState("")
  const kitsPlcValidos = carga.kits !== null && kitsDeMedioEnMedio(carga.kits)
  const [corrigiendo, setCorrigiendo] = useState(!kitsPlcValidos)
  const [kitsEscritos, setKitsEscritos] = useState(kitsPlcValidos && carga.kits !== null ? String(carga.kits) : "")
  const [restoSumado, setRestoSumado] = useState(true)
  const [desvasesGuardados, setDesvasesGuardados] = useState<Desvase[]>([])
  const [desvaseId, setDesvaseId] = useState("")
  /** Pidiendo confirmar la mezcla: null = no; si no, si era «Registrar y liberar». */
  const [confirmandoMezcla, setConfirmandoMezcla] = useState<{ liberar: boolean } | null>(null)
  const { enviando, error, ejecutar } = useAccion()

  useEffect(() => {
    if (!DESVASE_HABILITADO || !saborId || !areaCodigo) return
    let vigente = true
    listarDesvases(usuarioSesion, areaCodigo, saborId).then((d) => {
      if (vigente) setDesvasesGuardados(d)
    })
    return () => {
      vigente = false
    }
  }, [saborId, areaCodigo, usuarioSesion])

  /** Otro sabor: los desvases guardados y la confirmación de mezcla eran del anterior. */
  function elegirSabor(id: string) {
    setSaborId(id)
    setDesvaseId("")
    setDesvasesGuardados([])
    setConfirmandoMezcla(null)
  }

  const kitsUsados = corrigiendo ? (kitsEscritos.trim() === "" ? null : Number(kitsEscritos)) : carga.kits
  const kitsOk = kitsUsados !== null && kitsDeMedioEnMedio(kitsUsados)
  /** Lo que se manda: null = los del PLC. */
  const kitsAMandar = !corrigiendo || kitsUsados === carga.kits ? null : kitsUsados
  const difiere = corrigiendo && kitsOk && carga.kits !== null && kitsUsados !== carga.kits

  const saborElegido = sabores.find((s) => s.id === saborId)
  const desvaseElegido = desvasesGuardados.find((d) => d.id === desvaseId)
  const ajustesHechos = carga.ajustes.filter((a) => a.hechoEn !== null)
  const litrosAjustes = ajustesHechos.reduce((suma, a) => suma + a.litros, 0)
  const litrosResto = resto && restoSumado ? resto.litros : 0
  const litrosEstimados =
    saborElegido?.volumen && kitsOk && kitsUsados !== null
      ? Math.round(kitsUsados * saborElegido.volumen) + litrosResto + (desvaseElegido?.litros ?? 0) + litrosAjustes
      : null
  const pasaDelTope = litrosEstimados !== null && litrosEstimados > TANK_CAPACITY

  const mezcla = resto !== null && restoSumado && resto.saborId !== null && saborId !== "" && saborId !== resto.saborId
  const terminada = carga.estado === "PENDIENTE"
  const puedeLiberar = terminada && !modoVacio && calidadLibera === false
  const valido = saborId !== "" && lote.trim() !== "" && kitsOk && restoSumado

  async function registrar(liberar: boolean) {
    if (!valido) return
    if (mezcla && !confirmandoMezcla) {
      setConfirmandoMezcla({ liberar })
      return
    }
    await ejecutar(() =>
      onConfirmar({
        cargaId: carga.id,
        saborId,
        lote: lote.trim(),
        kits: kitsAMandar,
        desvaseId: desvaseId || null,
        paraVacio: modoVacio,
        liberar,
      }),
    )
  }

  const cargado = [carga.aguaFormulaL !== null ? `${cifra(carga.aguaFormulaL)} L de agua` : null, carga.kits !== null ? kitsTexto(carga.kits) : null]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-dashed p-3", modoVacio ? "border-vacio/50" : "border-info/50")}>
      <p className="text-sm font-semibold text-foreground">Falta sabor y lote</p>
      {cargado && <p className="text-xs text-muted-foreground">Cargado en el PLC: {cargado}</p>}
      {terminada && carga.terminadaEn && (
        <p className="text-xs text-muted-foreground">El operador terminó en el PLC a las {hora(carga.terminadaEn)}.</p>
      )}
      {ajustesHechos.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {ajustesHechos.map((a) => (
            <li key={a.id}>{`Ajuste de agua: +${cifra(a.litros)} L · ${hora(a.hechoEn ?? a.iniciadoEn)}`}</li>
          ))}
        </ul>
      )}

      {resto && (
        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="mb-1 text-foreground">
            {`En el tanque había ${cifra(resto.litros)} L de ${resto.saborNombre ?? "sin sabor"}${resto.lote ? ` (lote ${resto.lote})` : ""}.`}
          </legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`resto-${carga.id}`} checked={restoSumado} onChange={() => setRestoSumado(true)} />
            Se sumaron a esta preparación
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`resto-${carga.id}`} checked={!restoSumado} onChange={() => setRestoSumado(false)} />
            Se sacaron antes
          </label>
          {!restoSumado && (
            <p className="font-medium text-destructive" role="alert">
              Haz primero la transferencia o el desvase (botones de abajo) y después registra la carga.
            </p>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Select value={saborId} onValueChange={elegirSabor}>
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
      </div>

      {carga.kits === null && <p className="text-xs font-medium text-destructive">El PLC no registró los kits: escríbelos.</p>}
      {carga.kits !== null && !kitsPlcValidos && (
        <p className="text-xs font-medium text-destructive">{`El PLC marcó ${cifra(carga.kits)} kits y van de medio en medio: corrígelos.`}</p>
      )}
      {corrigiendo ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-28"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            placeholder="Kits"
            value={kitsEscritos}
            onChange={(e) => setKitsEscritos(e.target.value)}
          />
          {difiere && carga.kits !== null && <span className="text-xs text-muted-foreground">{`Difiere del PLC (${cifra(carga.kits)}).`}</span>}
          {kitsUsados !== null && !kitsOk && <span className="text-xs text-destructive">Van de medio en medio (0,5 · 1 · 1,5 …).</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span>{`Kits: ${cifra(carga.kits ?? 0)} (del PLC)`}</span>
          <Button size="sm" variant="ghost" onClick={() => setCorrigiendo(true)}>
            <PenLine className="size-3.5" />
            Corregir
          </Button>
        </div>
      )}

      {DESVASE_HABILITADO && saborId !== "" && desvasesGuardados.length > 0 && (
        <Select value={desvaseId} onValueChange={setDesvaseId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sumar un desvase guardado (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {desvasesGuardados.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {cifra(d.litros)} L · desvasado {new Date(d.creadoEn).toLocaleDateString("es-CO")}
                {d.loteOrigen ? ` · Lote ${d.loteOrigen}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {litrosEstimados !== null && (
        <p className="text-xs text-muted-foreground">
          ≈ <span className="font-medium text-foreground">{cifra(litrosEstimados)} L</span> con este sabor ({cifra(saborElegido?.volumen ?? 0)} L por kit)
          {desvaseElegido ? ` + ${cifra(desvaseElegido.litros)} L guardados` : ""}
        </p>
      )}
      {pasaDelTope && (
        <p className="text-xs font-medium text-warning-foreground" role="alert">
          Pasa de {cifra(TANK_CAPACITY)} L: revísalo. El líquido ya está en el tanque, así que se puede registrar igual.
        </p>
      )}
      {mezcla && resto && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {`Quedan ${cifra(resto.litros)} L de ${resto.saborNombre} en el tanque: se van a mezclar con el ${saborElegido?.nombre ?? "sabor"} nuevo.`}
        </p>
      )}

      <MensajeError error={error} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={confirmandoMezcla ? "destructive" : "default"} disabled={!valido || enviando} onClick={() => registrar(confirmandoMezcla?.liberar ?? false)}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Beaker className="size-3.5" />}
          {confirmandoMezcla ? "¿Seguro? Sí, mezclar y registrar" : modoVacio ? "Registrar para Vacío" : "Registrar"}
        </Button>
        {puedeLiberar && !confirmandoMezcla && (
          <Button size="sm" variant="outline" disabled={!valido || enviando} onClick={() => registrar(true)}>
            Registrar y liberar
          </Button>
        )}
        {confirmandoMezcla && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmandoMezcla(null)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
