import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { MensajeError } from "@/components/MensajeError"
import { conSegundos, minutosEntre, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  paradaCruzoTurnoCerrado,
  terminarParada,
  TIPO_FALLA_SIN_ESPECIFICAR,
  TIPO_POR_CLASIFICAR,
  type Parada,
  type TipoParada,
} from "@/lib/paradas"
import { equipoMttoSugerido, SIN_SUBSISTEMA, useCatalogoMtto } from "@/lib/mttoCatalogo"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { useAccion } from "@/lib/useAccion"

const PAGINA = "Líneas"
const LARGO_SOLUCION = 300

const selectClase =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/**
 * Terminar parada (Mantenimiento, o el supervisor con el interruptor apagado):
 * el equipo y el subsistema de Mantenimiento (de su catálogo, o «Sin
 * subsistema»), qué se realizó y el tiempo final. El equipo y la falla de
 * Producción se quedan como los puso el supervisor. Los minutos o la hora de
 * comienzo solo valen si la parada no cruzó un turno cerrado: lo cerrado queda
 * fijo y solo se mueve el final.
 */
export function FormTerminarParada({
  parada,
  usuario,
  areaCodigo = null,
  onTerminada,
}: {
  parada: Parada
  usuario: string
  areaCodigo?: string | null
  onTerminada: () => void
}) {
  const equipos = useEquiposParadas()
  const catalogoProduccion = useCatalogoParadas()
  const { equipos: equiposMtto, subsistemas } = useCatalogoMtto()
  const [cruzo, setCruzo] = useState<boolean | null>(null)
  const tipoInicial = parada.tipoCodigo && parada.tipoCodigo !== TIPO_FALLA_SIN_ESPECIFICAR && parada.tipoCodigo !== TIPO_POR_CLASIFICAR ? parada.tipoCodigo : null
  const [tipo, setTipo] = useState<TipoParada | null>(null)
  /** null = Mantenimiento todavía no tocó el equipo: manda la preselección. */
  const [equipoElegido, setEquipoElegido] = useState<string | null>(null)
  const [subsistema, setSubsistema] = useState("")
  const [solucion, setSolucion] = useState(parada.solucion ?? "")
  const [conHoras, setConHoras] = useState(false)
  const [minutos, setMinutos] = useState("")
  // `inicio` viene recortado al turno que se mira: el comienzo verdadero es inicioReal.
  const inicioVerdadero = parada.inicioReal ?? parada.inicio
  const inicioOriginal = inicioVerdadero.slice(0, 16)
  const [comienzo, setComienzo] = useState(inicioOriginal)
  const [fin, setFin] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"

  useEffect(() => {
    let vivo = true
    void paradaCruzoTurnoCerrado(parada.id).then((c) => vivo && setCruzo(c))
    return () => {
      vivo = false
    }
  }, [parada.id])

  if (cruzo === null) {
    return (
      <div className="flex justify-center py-3 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    )
  }

  const tipoCodigo = tipo?.codigo ?? tipoInicial
  const equipoProduccion = catalogoProduccion.find((t) => t.codigo === tipoCodigo)?.equipoCodigo ?? null
  const equipoMtto = equipoElegido ?? equipoMttoSugerido(equiposMtto, equipoProduccion) ?? ""
  const subsistemasDelEquipo = subsistemas.filter((s) => s.activo && s.equipoCodigo === equipoMtto)
  const usaMinutos = !cruzo && !conHoras
  const n = Number(minutos)
  const finCalculado = usaMinutos ? (Number.isInteger(n) && n >= 1 ? sumarMinutos(inicioOriginal, n) : "") : fin
  const inicioFinal = usaMinutos || cruzo ? inicioOriginal : comienzo
  const duracion = finCalculado && inicioFinal ? minutosEntre(inicioFinal, finCalculado) : null
  const tiempoListo = finCalculado !== "" && duracion !== null && duracion > 0
  const listo = tipoCodigo !== null && equipoMtto !== "" && subsistema !== "" && solucion.trim() !== "" && tiempoListo

  async function confirmar() {
    if (!tipoCodigo || !listo) return
    const datos = {
      tipoCodigo,
      mttoEquipoCodigo: equipoMtto,
      subsistemaCodigo: subsistema,
      solucion: solucion.trim(),
      fin: conSegundos(finCalculado),
      inicio: !usaMinutos && !cruzo && comienzo !== inicioOriginal ? conSegundos(comienzo) : null,
    }
    if (await ejecutar(() => terminarParada(usuario, parada.id, datos, PAGINA))) onTerminada()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      {tipoInicial === null ? (
        <BuscadorTipoParada
          lineaCodigo={parada.lineaCodigo}
          area={area}
          equipos={equipos}
          permitir={(t) => t.codigo !== TIPO_FALLA_SIN_ESPECIFICAR}
          onElegir={setTipo}
        />
      ) : (
        <p className="min-w-0 truncate text-sm font-medium text-foreground">{parada.tipoNombre}</p>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Equipo de Mantenimiento
        <select
          className={selectClase}
          value={equipoMtto}
          onChange={(e) => {
            setEquipoElegido(e.target.value)
            setSubsistema("")
          }}
        >
          <option value="">Elige el equipo…</option>
          {equiposMtto
            .filter((e) => e.activo)
            .map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Subsistema
        <select className={selectClase} value={subsistema} onChange={(e) => setSubsistema(e.target.value)} disabled={equipoMtto === ""}>
          <option value="">Elige el subsistema…</option>
          <option value={SIN_SUBSISTEMA}>Sin subsistema</option>
          {subsistemasDelEquipo.map((s) => (
            <option key={s.id} value={s.codigo}>
              {s.codigo} · {s.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ¿Qué se realizó?
        <Textarea value={solucion} onChange={(e) => setSolucion(e.target.value.slice(0, LARGO_SOLUCION))} maxLength={LARGO_SOLUCION} rows={2} className="text-sm" />
      </label>

      {cruzo ? (
        <>
          <p className="text-xs text-muted-foreground">Empezó {inicioVerdadero.slice(11, 16)} (turno cerrado).</p>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Terminó a las
            <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
          </label>
        </>
      ) : (
        <>
          <div role="group" aria-label="Tiempo final" className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={usaMinutos ? "default" : "outline"} aria-pressed={usaMinutos} onClick={() => setConHoras(false)}>
              Minutos
            </Button>
            <Button type="button" size="sm" variant={usaMinutos ? "outline" : "default"} aria-pressed={!usaMinutos} onClick={() => setConHoras(true)}>
              Hora de comienzo y fin
            </Button>
          </div>
          {usaMinutos ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Minutos
              <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="h-9" />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Comenzó a las
                <Input type="datetime-local" value={comienzo} onChange={(e) => setComienzo(e.target.value)} className="h-9" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Terminó a las
                <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
              </label>
            </>
          )}
        </>
      )}
      {finCalculado !== "" && duracion !== null && duracion <= 0 && <p className="text-xs text-danger-foreground">El fin tiene que ser después del comienzo.</p>}

      <div className="flex justify-end">
        <Button size="sm" onClick={confirmar} disabled={enviando || !listo}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Terminar parada
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
