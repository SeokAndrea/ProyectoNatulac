import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AREAS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import {
  coincideBusqueda,
  construirHistorial,
  rangoDePreset,
  resumenTurno,
  turnoEnFiltro,
  type PresetFecha,
  type RangoFecha,
  type ResumenTurno,
} from "@/lib/auditoriaVista"
import type { EventoHistorial } from "@/lib/historial"
import { fechaLocal } from "@/lib/turno"
import type { TurnoResumen } from "@/lib/historialTurnos"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Vista reworkeada de Auditoría (ver plan-rework-auditoria.md): un
 * auditor ISO 9001 / jefe de producción entra y ve, sin fricción, qué
 * hizo cada supervisor en orden cronológico.
 *
 *   Filtro de fecha (Hoy / Ayer / Últimos 7 días / Fecha exacta + turno)
 *     └─ solapa por tipo de turno (Turno 1 / 2 / 3 / 12x12)
 *          └─ separador por fecha (más nueva primero)
 *               └─ fila colapsable por supervisor
 *                    ├─ resumen: sabores con sus lotes · por línea
 *                    │  (presentación / cajas / merma de envases) ·
 *                    │  cajas totales · litros consumidos → producidos
 *                    │  con merma de semielaborado
 *                    └─ (al abrir) línea de tiempo por hora, de lo
 *                       primero a lo último — construirHistorial()
 *
 * El buscador es texto libre: matchea persona, sabor, lote y el texto
 * de cualquier evento de la línea de tiempo. Filtra la lista; las
 * filas quedan contraídas hasta que se hace clic.
 *
 * El rango de fechas lo maneja este componente pero los turnos los
 * trae el padre (onRangoChange → vuelve a consultar). En el preview
 * /auditoria-demo el padre le pasa un fixture completo y onRangoChange
 * queda sin efecto.
 */
export interface TurnoAuditoria {
  resumen: TurnoResumen
  detalle: TurnoActivo
}

interface TurnoEnriquecido extends TurnoAuditoria {
  areaNombre: string
  eventos: EventoHistorial[]
  chips: ResumenTurno
}

const NUM = new Intl.NumberFormat("es-CO")
const PCT = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 })

const PRESETS: { codigo: PresetFecha; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Turnos de hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "DIAS_7", etiqueta: "Últimos 7 días" },
  { codigo: "FECHA", etiqueta: "Fecha exacta" },
]

export function AuditoriaTurnos({
  turnos,
  lineas,
  presentaciones,
  presetInicial = "HOY",
  cargando = false,
  onRangoChange,
  accionesTurno,
}: {
  /** Los turnos ya cargados para el rango vigente (el padre los trae según onRangoChange). */
  turnos: TurnoAuditoria[]
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
  presetInicial?: PresetFecha
  cargando?: boolean
  /** Se llama cuando cambia el rango de fechas (preset o fecha exacta) — el padre re-consulta. */
  onRangoChange?: (rango: RangoFecha) => void
  /** Slot por fila de supervisor (ej. link al acta, "abrir turno"). */
  accionesTurno?: (turno: TurnoAuditoria) => ReactNode
}) {
  const [preset, setPreset] = useState<PresetFecha>(presetInicial)
  const [fechaExacta, setFechaExacta] = useState(() => fechaLocal(new Date()))
  const [turnoTipoFiltro, setTurnoTipoFiltro] = useState<string>("TODOS")
  const [busqueda, setBusqueda] = useState("")
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const enriquecidos = useMemo<TurnoEnriquecido[]>(
    () =>
      turnos.map((t) => ({
        ...t,
        areaNombre: nombrePorCodigo(AREAS, t.resumen.area),
        eventos: construirHistorial(t.detalle, lineas, presentaciones),
        chips: resumenTurno(t.detalle, lineas, presentaciones),
      })),
    [turnos, lineas, presentaciones],
  )

  const rango = useMemo(() => rangoDePreset(preset, fechaExacta), [preset, fechaExacta])
  const tipoFiltro = preset === "FECHA" && turnoTipoFiltro !== "TODOS" ? turnoTipoFiltro : null

  // Avisar al padre cuando cambia el rango, sin repetir el aviso inicial
  // (el padre ya arranca cargando ese mismo rango).
  const rangoAvisado = useRef<string | null>(null)
  useEffect(() => {
    const clave = `${rango.desde}|${rango.hasta}`
    if (rangoAvisado.current === null) {
      rangoAvisado.current = clave
      return
    }
    if (rangoAvisado.current === clave) return
    rangoAvisado.current = clave
    onRangoChange?.(rango)
  }, [rango, onRangoChange])
  const enRango = useMemo(
    () => enriquecidos.filter((t) => turnoEnFiltro(t.resumen.fecha, t.resumen.turnoTipo, rango, tipoFiltro)),
    [enriquecidos, rango, tipoFiltro],
  )

  const q = busqueda.trim()
  const visibles = useMemo(
    () => enRango.filter((t) => coincideBusqueda(t.detalle, t.chips, t.eventos, t.areaNombre, q)),
    [enRango, q],
  )

  /** Tipos de turno que tienen al menos un turno visible, en el orden del catálogo. */
  const tiposConTurnos = TURNO_TIPOS.filter((tt) => visibles.some((t) => t.resumen.turnoTipo === tt.codigo))
  const [tabManual, setTabManual] = useState<string | null>(null)
  const tabActiva = tabManual && tiposConTurnos.some((tt) => tt.codigo === tabManual) ? tabManual : tiposConTurnos[0]?.codigo

  function alternar(id: string) {
    setAbiertos((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.codigo}
              type="button"
              size="sm"
              variant={preset === p.codigo ? "default" : "outline"}
              onClick={() => setPreset(p.codigo)}
            >
              {p.etiqueta}
            </Button>
          ))}
          {preset === "FECHA" && (
            <>
              <Input
                type="date"
                className="h-8 w-40"
                value={fechaExacta}
                onChange={(e) => setFechaExacta(e.target.value)}
              />
              <Select value={turnoTipoFiltro} onValueChange={setTurnoTipoFiltro}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos los turnos</SelectItem>
                  {TURNO_TIPOS.map((tt) => (
                    <SelectItem key={tt.codigo} value={tt.codigo}>
                      {tt.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por supervisor, sabor, lote o cualquier texto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {q && (
          <p className="text-xs text-muted-foreground">
            {visibles.length === 1 ? "1 turno coincide" : `${visibles.length} turnos coinciden`} con “{q}”.
          </p>
        )}
      </div>

      {cargando ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : tiposConTurnos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {q ? `Nada coincide con “${q}” en ese rango.` : "No hay turnos en ese rango de fechas."}
        </p>
      ) : (
        <Tabs value={tabActiva} onValueChange={setTabManual}>
          <TabsList>
            {tiposConTurnos.map((tt) => {
              const n = visibles.filter((t) => t.resumen.turnoTipo === tt.codigo).length
              return (
                <TabsTrigger key={tt.codigo} value={tt.codigo}>
                  {tt.nombre} · {n}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {tiposConTurnos.map((tt) => (
            <TabsContent key={tt.codigo} value={tt.codigo}>
              <SolapaTurno
                turnos={visibles.filter((t) => t.resumen.turnoTipo === tt.codigo)}
                abiertos={abiertos}
                onAlternar={alternar}
                accionesTurno={accionesTurno}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

/** Contenido de una solapa: los turnos de ese tipo, separados por fecha (más nueva primero). */
function SolapaTurno({
  turnos,
  abiertos,
  onAlternar,
  accionesTurno,
}: {
  turnos: TurnoEnriquecido[]
  abiertos: Set<string>
  onAlternar: (id: string) => void
  accionesTurno?: (turno: TurnoAuditoria) => ReactNode
}) {
  const porFecha = agruparPorFecha(turnos)

  return (
    <div className="flex flex-col gap-5">
      {porFecha.map(({ fecha, turnos: delDia }) => (
        <div key={fecha} className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {formatearFecha(fecha)} · {delDia.length} supervisor{delDia.length === 1 ? "" : "es"}
          </p>
          {delDia.map((t) => (
            <FilaSupervisor
              key={t.resumen.id}
              turno={t}
              abierto={abiertos.has(t.resumen.id)}
              onAlternar={() => onAlternar(t.resumen.id)}
              acciones={accionesTurno?.(t)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function FilaSupervisor({
  turno,
  abierto,
  onAlternar,
  acciones,
}: {
  turno: TurnoEnriquecido
  abierto: boolean
  onAlternar: () => void
  acciones?: ReactNode
}) {
  const { chips } = turno
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onAlternar}>
          {abierto ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-foreground">{turno.detalle.supervisorNombre}</span>{" "}
            <span className="text-xs text-muted-foreground">
              {turno.areaNombre} · Cód. {turno.detalle.codigo}
            </span>
          </span>
        </button>
        <Badge variant={turno.detalle.estado === "ABIERTO" ? "secondary" : "outline"}>
          {turno.detalle.estado === "ABIERTO" ? "Abierto" : "Cerrado"}
        </Badge>
        {acciones}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <ChipResumen etiqueta="Sabores" valor={textoSabores(chips)} />
        {chips.porLinea.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {chips.porLinea.map((l, i) => (
              <span key={i}>
                <span className="font-medium text-foreground">{l.linea}:</span> {l.presentacion}
                {l.sabor ? ` · ${l.sabor}` : ""}
                {l.lote ? ` · Lote ${l.lote}` : ""} · {NUM.format(l.cajas)} cajas ·{" "}
                <Merma etiqueta="merma de envases" pct={l.mermaEnvasesPct} />
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <ChipResumen etiqueta="Cajas" valor={NUM.format(chips.cajas)} />
          <span>
            <span className="font-medium text-foreground">Litros:</span>{" "}
            {NUM.format(chips.litrosConsumidos)} consumidos → {NUM.format(chips.litrosProducidos)} producidos ·{" "}
            <Merma etiqueta="merma de semielaborado" pct={chips.mermaSemielaboradoPct} />
          </span>
        </div>
      </div>

      {abierto && (
        <div className="flex flex-col gap-2 border-t border-border p-3">
          {turno.eventos.map((ev, i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <span className="num w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">{ev.hora}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-foreground uppercase">{ev.seccion}</p>
                <p className="text-muted-foreground">{ev.detalle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Fresa (lotes 0903-A1, 0903-A2), Durazno (lote 0903-A6)". */
function textoSabores(chips: ResumenTurno): string {
  if (chips.sabores.length === 0) return "—"
  return chips.sabores
    .map((s) => {
      if (s.lotes.length === 0) return s.sabor
      const etiqueta = s.lotes.length === 1 ? "lote" : "lotes"
      return `${s.sabor} (${etiqueta} ${s.lotes.join(", ")})`
    })
    .join(", ")
}

/** Etiqueta + % de merma, todo en negrita. "—" cuando falta un dato para calcularla. */
function Merma({ etiqueta, pct }: { etiqueta: string; pct: number | null }) {
  return (
    <strong className="font-semibold text-foreground">
      {etiqueta} {pct === null ? "—" : `${PCT.format(pct)}%`}
    </strong>
  )
}

function ChipResumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{etiqueta}:</span> {valor || "—"}
    </span>
  )
}

function agruparPorFecha(turnos: TurnoEnriquecido[]): { fecha: string; turnos: TurnoEnriquecido[] }[] {
  const orden = [...turnos].sort(
    (a, b) =>
      b.resumen.fecha.localeCompare(a.resumen.fecha) ||
      a.detalle.supervisorNombre.localeCompare(b.detalle.supervisorNombre),
  )
  const grupos: { fecha: string; turnos: TurnoEnriquecido[] }[] = []
  for (const t of orden) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.fecha === t.resumen.fecha) ultimo.turnos.push(t)
    else grupos.push({ fecha: t.resumen.fecha, turnos: [t] })
  }
  return grupos
}

function formatearFecha(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`)
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
}
