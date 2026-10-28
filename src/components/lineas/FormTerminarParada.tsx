import { useEffect, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { BuscadorTipoParada } from "@/components/BuscadorTipoParada"
import { MensajeError } from "@/components/MensajeError"
import { ahoraPlanta, conSegundos, minutosEntre, sumarMinutos } from "@/components/paradas/FormCompletarParada"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  clasificarFallaMantenimiento,
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
 * subsistema»; el supervisor no los ve: queda «Sin subsistema»), qué se realizó y el tiempo final. El equipo y la falla de
 * Producción se quedan como los puso el supervisor. Los minutos o la hora de
 * comienzo solo valen si la parada no cruzó un turno cerrado: lo cerrado queda
 * fijo y solo se mueve el final.
 *
 * Con `soloCodigo` (Mantenimiento, 2026-10-28): la falla ya terminó sin código
 * («Falla sin especificar»); se le pone el código y lo de Mantenimiento, sin
 * tocar las horas (clasificar_falla_mantenimiento).
 */
export function FormTerminarParada({
  parada,
  usuario,
  areaCodigo = null,
  esMantenimiento = false,
  soloCodigo = false,
  onTerminada,
}: {
  parada: Parada
  usuario: string
  areaCodigo?: string | null
  /** Solo Mantenimiento elige equipo y subsistema de su catálogo. */
  esMantenimiento?: boolean
  /** Solo ponerle el código a una falla ya cerrada: sin minutos ni horas. */
  soloCodigo?: boolean
  onTerminada: () => void
}) {
  const equipos = useEquiposParadas()
  const catalogoProduccion = useCatalogoParadas()
  const { equipos: equiposMtto, subsistemas } = useCatalogoMtto()
  const [cruzo, setCruzo] = useState<boolean | null>(soloCodigo ? false : null)
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
  /** Cuánto tardaron en repararla (opcional, solo Mantenimiento): queda de registro, no cambia el tiempo de la parada. */
  const [reparacion, setReparacion] = useState("")
  const { enviando, error, ejecutar } = useAccion()
  const area = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"

  useEffect(() => {
    // Solo el código: las horas no se tocan, no hace falta saber si cruzó un turno cerrado.
    if (soloCodigo) return
    let vivo = true
    void paradaCruzoTurnoCerrado(parada.id).then((c) => vivo && setCruzo(c))
    return () => {
      vivo = false
    }
  }, [parada.id, soloCodigo])

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
  // Los minutos mandan (dueña, 2026-10-27): van de entrada, también si la parada viene de un turno cerrado.
  const usaMinutos = !conHoras
  const n = Number(minutos)
  const nValido = Number.isInteger(n) && n >= 1
  // Con minutos, el fin es comienzo + minutos; si eso pasa de ahora, la parada empezó antes de que
  // la abrieran: termina ahora y empieza minutos antes (como completar_parada con un +1). Si viene
  // de un turno cerrado, el comienzo no se mueve: termina ahora.
  const ahora = ahoraPlanta()
  const finSumado = usaMinutos && nValido ? sumarMinutos(inicioOriginal, n) : ""
  const pasaDeAhora = finSumado !== "" && finSumado > ahora
  const empezoAntes = pasaDeAhora && !cruzo
  const finCalculado = usaMinutos ? (pasaDeAhora ? ahora : finSumado) : fin
  const inicioFinal = empezoAntes ? sumarMinutos(ahora, -n) : usaMinutos || cruzo ? inicioOriginal : comienzo
  const duracion = finCalculado && inicioFinal ? minutosEntre(inicioFinal, finCalculado) : null
  const tiempoListo = soloCodigo || (finCalculado !== "" && duracion !== null && duracion > 0)
  const nReparacion = Number(reparacion)
  const reparacionValida = reparacion === "" || (Number.isInteger(nReparacion) && nReparacion >= 1)
  const listo =
    tipoCodigo !== null && (!esMantenimiento || (equipoMtto !== "" && subsistema !== "")) && solucion.trim() !== "" && tiempoListo && reparacionValida

  async function confirmar() {
    if (!tipoCodigo || !listo) return
    if (soloCodigo) {
      const codigo = {
        tipoCodigo,
        mttoEquipoCodigo: equipoMtto,
        subsistemaCodigo: subsistema,
        solucion: solucion.trim(),
        reparacionMin: reparacion !== "" ? nReparacion : null,
      }
      if (await ejecutar(() => clasificarFallaMantenimiento(usuario, parada.id, codigo, PAGINA))) onTerminada()
      return
    }
    const datos = {
      tipoCodigo,
      mttoEquipoCodigo: esMantenimiento ? equipoMtto : "",
      subsistemaCodigo: esMantenimiento ? subsistema : SIN_SUBSISTEMA,
      solucion: solucion.trim(),
      fin: conSegundos(finCalculado),
      inicio: empezoAntes ? conSegundos(inicioFinal) : !usaMinutos && !cruzo && comienzo !== inicioOriginal ? conSegundos(comienzo) : null,
      ...(esMantenimiento && reparacion !== "" ? { reparacionMin: nReparacion } : {}),
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
      {esMantenimiento && (
        <>
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
        </>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ¿Qué se realizó?
        <Textarea value={solucion} onChange={(e) => setSolucion(e.target.value.slice(0, LARGO_SOLUCION))} maxLength={LARGO_SOLUCION} rows={2} className="text-sm" />
      </label>

      {soloCodigo ? null : cruzo ? (
        <>
          <p className="text-xs text-muted-foreground">Empezó {inicioVerdadero.slice(11, 16)} (turno cerrado).</p>
          {usaMinutos ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Minutos
              <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="h-9" />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Terminó a las
              <Input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} className="h-9" />
            </label>
          )}
          <Button type="button" variant="ghost" size="sm" className="self-start text-xs text-muted-foreground" onClick={() => setConHoras((v) => !v)}>
            {usaMinutos ? "Poner hora de fin (opcional)" : "Mejor poner solo los minutos"}
          </Button>
        </>
      ) : (
        <>
          {/* Lo principal son los minutos; la hora de inicio y fin, chica y opcional (como en Anotar). */}
          {usaMinutos ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Minutos
              <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="h-9" />
              {empezoAntes && (
                <span>
                  Empezó antes de abrirla: queda de <span className="num">{inicioFinal.slice(11, 16)}</span> a <span className="num">{ahora.slice(11, 16)}</span>.
                </span>
              )}
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
          <Button type="button" variant="ghost" size="sm" className="self-start text-xs text-muted-foreground" onClick={() => setConHoras((v) => !v)}>
            {usaMinutos ? "Poner hora de inicio y fin (opcional)" : "Mejor poner solo los minutos"}
          </Button>
        </>
      )}
      {finCalculado !== "" && duracion !== null && duracion <= 0 && <p className="text-xs text-danger-foreground">El fin tiene que ser después del comienzo.</p>}
      {esMantenimiento && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <label className="flex flex-wrap items-center gap-2">
            Tiempo de reparación (opcional)
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={reparacion}
              onChange={(e) => setReparacion(e.target.value)}
              className="num h-8 w-20 text-sm"
            />
            min
          </label>
          <span>Cuánto tardaron en repararla. Queda en el reporte; no cambia el tiempo de la parada.</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={confirmar} disabled={enviando || !listo}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {soloCodigo ? "Guardar código" : "Terminar parada"}
        </Button>
      </div>
      <MensajeError error={error} />
    </div>
  )
}
