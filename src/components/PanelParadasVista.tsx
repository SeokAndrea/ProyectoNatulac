import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarDays, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CintaLinea, type EstadoLineaVista } from "@/components/CintaLinea"
import { cn } from "@/lib/utils"
import type { OeePeriodo } from "@/lib/eficiencia"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { type TurnoTipoCodigo } from "@/lib/catalogos"
import {
  agruparPorDia,
  fmtDuracion,
  LINEAS_PARADAS,
  minutosPorClaseSinSolape,
  NOMBRE_CLASE,
  nombreLineaParada,
  paradaAbierta,
  porTipo,
  porTipoYLinea,
  porTipoYLineaPorFrecuencia,
  primeraDeCadaLinea,
  type ClaseParada,
  type GrupoTipo,
  type Parada,
  type PuntoDiaParada,
} from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura, mismo estilo que el Panel de
 * Producción. Filtro de Turno (uno o "Todos") + Período (Hoy / Ayer / Últimos
 * 7 días / Este mes). Todo el contenido (Top por frecuencia y por tiempo
 * — la primera de cada línea — + las 3 líneas con su cinta animada, su
 * OEE (Disponibilidad × Rendimiento, mismo cálculo que el Panel de
 * Producción — ver OeeLinea), sus minutos no programados, sus paradas registradas y su
 * top 3 de no programadas) queda siempre
 * visible, sin secciones colapsables — el objetivo es que entre entero en
 * una sola pantalla, sin scroll. Rework 2026-09-28 (dueño): la info es
 * POR LÍNEA, ya no hay KPIs globales, ni minutos programados / ociosos,
 * ni paradas por Sabor / Familia / Presentación.
 *
 * `estadoLineas` es el estado EN VIVO de las 3 líneas — a propósito NO
 * depende del filtro de Fecha/Turno de acá abajo (ese filtro es para
 * historial; la cinta solo tiene sentido mostrando el turno activo
 * real). undefined = todavía cargando.
 */

type PeriodoCodigo = "HOY" | "AYER" | "7D" | "MES"
const PERIODO_FILTRO: { codigo: PeriodoCodigo; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "7D", etiqueta: "Últimos 7 días" },
  { codigo: "MES", etiqueta: "Este mes" },
]

const TURNO_FILTRO: { codigo: TurnoTipoCodigo | "TODOS"; etiqueta: string }[] = [
  { codigo: "TODOS", etiqueta: "Todos" },
  { codigo: "TURNO_1", etiqueta: "Turno 1" },
  { codigo: "TURNO_2", etiqueta: "Turno 2" },
  { codigo: "TURNO_3", etiqueta: "Turno 3" },
]

const CLASE_FILTRO: { codigo: ClaseParada | "TODAS"; etiqueta: string }[] = [
  { codigo: "TODAS", etiqueta: "Todas" },
  { codigo: "PROGRAMADA", etiqueta: "Programada" },
  { codigo: "NO_PROGRAMADA", etiqueta: "No programada" },
  { codigo: "OCIOSO", etiqueta: "Ocioso" },
]

export interface EstadoLineaEnVivo {
  lineaCodigo: string
  estado: EstadoLineaVista
  saborNombre: string | null
  lote: string | null
  /** Código de presentación de la corrida activa ("1000", "500"...) — para dibujar el envase correcto en la cinta. */
  presentacion?: string | null
}

/** Carga el OEE por línea (clave LINEA_1/2/3) del período y turno elegidos — ver cargarOeePeriodo (src/lib/eficienciaPeriodo.ts). */
export type CargarOee = (filtro: { desde: string; hasta: string; turnoTipo: string }) => Promise<Map<string, OeePeriodo>>

/** Carga las paradas del período — solo ese rango, no todo el historial. */
export type CargarParadas = (filtro: { desde: string; hasta: string }) => Promise<Parada[]>

/** Panel de pared: las paradas se vuelven a leer cada minuto; el OEE (más pesado, un pedido por turno) cada 5. */
const REFRESCO_PARADAS_MS = 60 * 1000
const REFRESCO_OEE_MS = 5 * 60 * 1000

export function PanelParadasVista({
  cargarParadas,
  estadoLineas,
  cargarOee,
}: {
  cargarParadas: CargarParadas
  /** Estado en vivo de las 3 líneas (no filtrado). Ver nota de cabecera. */
  estadoLineas?: EstadoLineaEnVivo[]
  cargarOee: CargarOee
}) {
  const [periodo, setPeriodo] = useState<PeriodoCodigo>("7D")
  const [clase, setClase] = useState<ClaseParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")
  const [turno, setTurno] = useState<TurnoTipoCodigo | "TODOS">("TODOS")
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  // Reloj del panel: avanza cada minuto y dispara la relectura de paradas.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), REFRESCO_PARADAS_MS)
    return () => clearInterval(id)
  }, [])

  // Todo se calcula desde HOY (fecha de planta): Hoy = solo hoy; Ayer = solo
  // el día de ayer; 7 días = hoy y los 6 anteriores; Este mes = del 1 hasta hoy.
  const hoy = fechaPlanta(ahora)
  const { desde, hasta } = useMemo(() => {
    if (periodo === "HOY") return { desde: hoy, hasta: hoy }
    if (periodo === "AYER") {
      const ayer = restarDias(hoy, 1)
      return { desde: ayer, hasta: ayer }
    }
    if (periodo === "7D") return { desde: restarDias(hoy, 6), hasta: hoy }
    return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
  }, [periodo, hoy])

  // Paradas del período. Se guardan con la clave del rango: al refrescar se
  // sigue viendo lo anterior; al cambiar de período, cargando.
  const claveParadas = `${desde}|${hasta}`
  const [paradasCargadas, setParadasCargadas] = useState<{ clave: string; filas: Parada[] } | null>(null)
  useEffect(() => {
    let vivo = true
    const clave = `${desde}|${hasta}`
    cargarParadas({ desde, hasta }).then((filas) => vivo && setParadasCargadas({ clave, filas }))
    return () => {
      vivo = false
    }
  }, [cargarParadas, desde, hasta, ahora])
  const paradas = paradasCargadas?.clave === claveParadas ? paradasCargadas.filas : null

  const filtradas = useMemo(() => {
    return (paradas ?? [])
      .filter((p) => {
        const dia = p.inicio.slice(0, 10)
        if (dia < desde || dia > hasta) return false
        if (clase !== "TODAS" && p.clase !== clase) return false
        if (linea !== "TODAS" && p.lineaCodigo !== linea) return false
        if (turno !== "TODOS" && p.turnoTipo !== turno) return false
        return true
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [paradas, desde, hasta, clase, linea, turno])

  const abiertas = filtradas.filter(paradaAbierta).length
  // Por tipo + línea, y de ahí SOLO la primera de cada línea (máximo 3
  // filas): cada fila dice de qué línea es — ver RankList.
  const topFrecuencia = useMemo(() => primeraDeCadaLinea(porTipoYLineaPorFrecuencia(filtradas, ahora)), [filtradas, ahora])
  const topTiempo = useMemo(() => primeraDeCadaLinea(porTipoYLinea(filtradas, ahora)), [filtradas, ahora])

  // OEE por línea del período — sale de Producción (contadores y velocidades),
  // no de las paradas, así que se pide aparte. Se guarda con la clave del
  // filtro que lo pidió: si no coincide con el filtro actual, está cargando.
  const claveOee = `${desde}|${hasta}|${turno}`
  // Cambia cada REFRESCO_OEE_MS: vuelve a pedir el OEE sin mostrar "calculando" otra vez.
  const vueltaOee = Math.floor(ahora.getTime() / REFRESCO_OEE_MS)
  const [oeeCargado, setOeeCargado] = useState<{ clave: string; datos: Map<string, OeePeriodo> } | null>(null)
  useEffect(() => {
    let vivo = true
    const clave = `${desde}|${hasta}|${turno}`
    cargarOee({ desde, hasta, turnoTipo: turno }).then(
      (datos) => vivo && setOeeCargado({ clave, datos }),
      () => vivo && setOeeCargado({ clave, datos: new Map() }),
    )
    return () => {
      vivo = false
    }
  }, [cargarOee, desde, hasta, turno, vueltaOee])
  const oee = oeeCargado?.clave === claveOee ? oeeCargado.datos : undefined

  // Tendencia de la tarjeta "Vista" — un punto por día del rango elegido.
  const porDia = useMemo(() => agruparPorDia(filtradas, ahora), [filtradas, ahora])

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Filtros — Turno/Fecha siempre visibles (el control principal,
           mismo patrón que Panel de Producción); Clase/Línea son
           secundarios, un botón "Ver filtros" en la MISMA fila los
           despliega debajo — nada de una card aparte. ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Turno</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {TURNO_FILTRO.map((t) => (
                <Button
                  key={t.codigo}
                  type="button"
                  size="sm"
                  variant={turno === t.codigo ? "default" : "outline"}
                  onClick={() => setTurno(t.codigo)}
                >
                  {t.etiqueta}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Período</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIODO_FILTRO.map((p) => (
                <Button
                  key={p.codigo}
                  type="button"
                  size="sm"
                  variant={periodo === p.codigo ? "default" : "outline"}
                  onClick={() => setPeriodo(p.codigo)}
                >
                  {p.etiqueta}
                </Button>
              ))}
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setMostrarFiltros((v) => !v)}>
            {mostrarFiltros ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {clase !== "TODAS" || linea !== "TODAS"
              ? `Filtros (${[clase !== "TODAS" && NOMBRE_CLASE[clase], linea !== "TODAS" && nombreLineaParada(linea)].filter(Boolean).join(" · ")})`
              : "Ver filtros"}
          </Button>
        </div>

        {mostrarFiltros && (
          <div className="flex flex-wrap items-center gap-1.5">
            {CLASE_FILTRO.map((c) => (
              <Button
                key={c.codigo}
                type="button"
                size="sm"
                variant={clase === c.codigo ? "default" : "outline"}
                onClick={() => setClase(c.codigo)}
              >
                {c.etiqueta}
              </Button>
            ))}
            <Select value={linea} onValueChange={setLinea}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas las líneas</SelectItem>
                {LINEAS_PARADAS.map((l) => (
                  <SelectItem key={l.codigo} value={l.codigo}>
                    {l.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {paradas === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <>
        {/* ---- Hero: ranking + líneas (en vivo + sus números) ----
             Ya no hay columna de KPIs globales: OEE, minutos no
             programados y paradas registradas van DENTRO de cada línea. */}
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 items-stretch gap-3 lg:grid-cols-[300px_repeat(3,340px)] lg:justify-center">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Vista</h2>
                <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-lg font-bold text-foreground">{PERIODO_FILTRO.find((p) => p.codigo === periodo)?.etiqueta}</p>
              <p className="text-xs text-muted-foreground">
                {fmtRangoCorto(desde, hasta)} · {TURNO_FILTRO.find((t) => t.codigo === turno)?.etiqueta}
              </p>
              <Sparkline datos={porDia} />
            </div>
            <RankCard titulo="Top Paradas por Frecuencia" tono="info" items={topFrecuencia} metrica="veces" />
            <RankCard titulo="Top Paradas por Tiempo" tono="danger" items={topTiempo} metrica="minutos" />
          </div>

          {/* ---- Una columna por línea: cinta en vivo + sus números. ---- */}
          {LINEAS_PARADAS.map((l, i) => {
            const propias = filtradas.filter((p) => p.lineaCodigo === l.codigo)
            const noProgramadas = propias.filter((p) => p.clase === "NO_PROGRAMADA")
            // Sin solape con las demás paradas de la línea (supervisor y Mantenimiento cargando la misma falla).
            const minutosNoProgramados = minutosPorClaseSinSolape(propias, ahora).NO_PROGRAMADA
            const enVivo = estadoLineas?.find((e) => e.lineaCodigo === l.codigo)
            return (
              <div key={l.codigo} className="flex min-w-0 flex-col gap-3">
                <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Producción</p>
                      <h2 className="text-lg font-bold text-foreground">{l.nombre}</h2>
                    </div>
                    {enVivo && (
                      <span
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2 py-1 text-[10px] font-bold uppercase text-success"
                        title="La cinta muestra el turno activo real, no el filtro de arriba"
                      >
                        <span className="alert-pulse size-1.5 rounded-full bg-current" />
                        En vivo
                      </span>
                    )}
                  </div>
                  {enVivo ? (
                    <CintaLinea
                      numeroLinea={i + 1}
                      estado={enVivo.estado}
                      saborNombre={enVivo.saborNombre}
                      lote={enVivo.lote}
                      presentacion={enVivo.presentacion}
                    />
                  ) : (
                    <div className="grid h-28 place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  )}
                  <OeeLinea oee={oee === undefined ? "cargando" : (oee.get(l.codigo) ?? null)} />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <DatoLinea etiqueta="Min. no programados" valor={minutosNoProgramados} tono="text-danger" />
                    <DatoLinea etiqueta="Paradas registradas" valor={propias.length} tono="text-primary" />
                  </div>
                  <div className="mt-3">
                    <h3 className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">Top 3 no programadas · tiempo</h3>
                    <div className="text-danger">
                      <RankList items={porTipo(noProgramadas, ahora).slice(0, 3)} metrica="minutos" compacto />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        </>
      )}

      {abiertas > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {abiertas === 1 ? "Hay 1 parada en curso" : `Hay ${abiertas} paradas en curso`} en el rango filtrado.
        </div>
      )}
    </div>
  )
}

const FMT_DIA_CORTO = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short" })

/** "YYYY-MM-DD","YYYY-MM-DD" → "14 sep" (mismo día) o "12–14 sep" (rango) — para la tarjeta "Vista". */
function fmtRangoCorto(desde: string, hasta: string) {
  const d = FMT_DIA_CORTO.format(new Date(`${desde}T00:00:00`))
  if (desde === hasta) return d
  const h = FMT_DIA_CORTO.format(new Date(`${hasta}T00:00:00`))
  return `${d} – ${h}`
}

/** Mismos cortes que la Eficiencia del Panel de Producción (LineaFilaCompacta): ≥ 90 verde, ≥ 60 amarillo, menos rojo. */
function colorNivel(pct: number | null) {
  return pct === null ? "var(--muted-foreground)" : pct >= 90 ? "var(--success)" : pct >= 60 ? "var(--warning)" : "var(--danger)"
}

/**
 * OEE de la línea en el período: el "reloj" (anillo) con el OEE, y al lado
 * sus dos factores en barritas — Disponibilidad × Rendimiento (Calidad = 1,
 * ver src/lib/eficiencia.ts) — para ver cuál de los dos lo baja.
 */
function OeeLinea({ oee }: { oee: OeePeriodo | null | "cargando" }) {
  if (oee === "cargando") {
    return (
      <div className="mt-2 flex h-[104px] items-center justify-center gap-2 rounded-lg bg-muted/40 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Calculando OEE…
      </div>
    )
  }
  if (oee === null || oee.oeePct === null) {
    return (
      <div className="mt-2 flex h-[104px] flex-col items-center justify-center rounded-lg bg-muted/40 text-center text-xs text-muted-foreground">
        <span className="text-[10px] font-bold uppercase tracking-wide">OEE</span>
        Sin producción en el período
      </div>
    )
  }
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <AnilloPct pct={oee.oeePct} tamano={88} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          OEE · {oee.turnos} {oee.turnos === 1 ? "turno" : "turnos"}
        </p>
        <FactorOee etiqueta="Disponibilidad" pct={oee.disponibilidadPct} />
        <FactorOee etiqueta="Rendimiento" pct={oee.rendimientoPct} />
      </div>
    </div>
  )
}

function FactorOee({ etiqueta, pct }: { etiqueta: string; pct: number | null }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="num font-semibold text-foreground">{pct === null ? "—" : `${pct}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, backgroundColor: colorNivel(pct) }} />
      </div>
    </div>
  )
}

/** Anillo de porcentaje (conic-gradient) — mismo patrón que MetaAnillo en PanelProduccion.tsx, para que los dos dashboards se lean igual. */
function AnilloPct({ pct, tamano }: { pct: number; tamano: number }) {
  const color = colorNivel(pct)
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full transition-all duration-700"
      style={{ width: tamano, height: tamano, background: `conic-gradient(${color} ${Math.max(0, Math.min(100, pct)) * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
    >
      <div className="grid place-items-center rounded-full bg-background" style={{ width: tamano * 0.72, height: tamano * 0.72 }}>
        <span className="num font-bold" style={{ color, fontSize: tamano * 0.24 }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

function RankList({ items, metrica, compacto = false }: { items: GrupoTipo[]; metrica: "veces" | "minutos"; compacto?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i[metrica]))
  if (items.length === 0) return <p className="text-xs text-muted-foreground">Sin paradas.</p>
  return (
    <ol className={compacto ? "flex flex-col gap-2" : "flex flex-col gap-3"}>
      {items.map((item, index) => (
        <li key={item.codigo}>
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="num w-4 text-muted-foreground">{index + 1}</span>
            <span
              className="min-w-0 flex-1 truncate font-medium text-foreground"
              title={item.lineaCodigo ? `${item.nombre} (${nombreLineaParada(item.lineaCodigo)})` : item.nombre}
            >
              {item.nombre}
              {item.lineaCodigo && <span className="font-normal text-muted-foreground"> ({nombreLineaParada(item.lineaCodigo)})</span>}
            </span>
            <span className="num font-semibold text-foreground">
              {item[metrica]}
              {metrica === "minutos" ? " min" : "×"}
            </span>
          </div>
          <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-current" style={{ width: `${Math.max(8, (item[metrica] / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function RankCard({ titulo, tono, items, metrica }: { titulo: string; tono: "info" | "danger"; items: GrupoTipo[]; metrica: "veces" | "minutos" }) {
  return (
    <section className={cn("rounded-xl border border-t-4 bg-card p-4 shadow-sm", tono === "info" ? "border-t-info text-info" : "border-t-danger text-danger")}>
      <h2 className="mb-4 text-sm font-semibold text-card-foreground">{titulo}</h2>
      <div className={tono === "info" ? "text-info" : "text-danger"}>
        <RankList items={items} metrica={metrica} />
      </div>
    </section>
  )
}

const SPARK_W = 280
const SPARK_H = 36

/** Tendencia de minutos perdidos por día, dentro del rango elegido — un vistazo en vez de la vieja tabla "Tendencia". */
function Sparkline({ datos }: { datos: PuntoDiaParada[] }) {
  if (datos.length < 2) return <p className="mt-2 text-xs text-muted-foreground">Hace falta un período de más de un día para ver la tendencia.</p>

  const max = Math.max(1, ...datos.map((d) => d.minutos))
  const pad = 4
  const stepX = (SPARK_W - pad * 2) / (datos.length - 1)
  const puntos = datos.map((d, i) => ({
    x: pad + i * stepX,
    y: pad + (1 - d.minutos / max) * (SPARK_H - pad * 2),
    dia: d.dia,
    minutos: d.minutos,
  }))
  const path = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
  const ultimoDia = puntos[puntos.length - 1].dia

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="mt-2 h-9 w-full"
      role="img"
      aria-label={`Tendencia de minutos perdidos por día: ${datos.map((d) => `${d.dia.slice(5)} ${fmtDuracion(d.minutos)}`).join(", ")}`}
    >
      <path d={path} fill="none" stroke="var(--info)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {puntos.map((p) => (
        <circle key={p.dia} cx={p.x} cy={p.y} r={p.dia === ultimoDia ? 3 : 1.5} fill="var(--info)">
          <title>{`${p.dia.slice(5)}: ${fmtDuracion(p.minutos)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

/** Número chico de una línea (Min. no programados / Paradas registradas), debajo de su Eficiencia. */
function DatoLinea({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background/60 px-2 py-2 text-center">
      <p className={cn("num text-2xl font-extrabold leading-none", tono)}>{valor.toLocaleString("es-CO")}</p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-muted-foreground">{etiqueta}</p>
    </div>
  )
}

