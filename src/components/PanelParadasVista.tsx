import { useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, CalendarDays, ChevronDown, ChevronUp, Clock, Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CintaLinea, type EstadoLineaVista } from "@/components/CintaLinea"
import { cn } from "@/lib/utils"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { type TurnoTipoCodigo } from "@/lib/catalogos"
import {
  agruparPorDia,
  disponibilidadAprox,
  fmtDuracion,
  LINEAS_PARADAS,
  NOMBRE_CLASE,
  nombreLineaParada,
  paradaAbierta,
  porFamilia,
  porPresentacion,
  porSabor,
  porTipo,
  porTipoYLinea,
  porTipoYLineaPorFrecuencia,
  resumenPorClase,
  type ClaseParada,
  type GrupoAtributo,
  type GrupoTipo,
  type Parada,
  type PuntoDiaParada,
} from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura, mismo estilo y misma lógica
 * de filtro que el Panel de Producción: se mira UN turno puntual de UN
 * día (o los 3 turnos de ese día con "Todos"), no un rango — Select de
 * Turno + date picker de Fecha, igual que allá. Todo el contenido
 * (ranking + 3 líneas con su cinta animada + KPIs + Sabor/Familia/
 * Presentación) responde al diseño acordado con el dueño (UI diseño
 * paradas.pdf) y queda siempre visible, sin secciones colapsables — el
 * objetivo es que entre entero en una sola pantalla, sin scroll.
 * Compartido entre la página real y el preview /paradas-demo.
 *
 * `estadoLineas` es el estado EN VIVO de las 3 líneas — a propósito NO
 * depende del filtro de Fecha/Turno de acá abajo (ese filtro es para
 * historial; la cinta solo tiene sentido mostrando el turno activo
 * real). Si no se pasa (ej. el preview sin login), se muestra un
 * placeholder en vez de inventar un estado.
 */

type PeriodoCodigo = "3D" | "7D" | "RANGO"
const PERIODO_FILTRO: { codigo: PeriodoCodigo; etiqueta: string }[] = [
  { codigo: "3D", etiqueta: "Últimos 3 días" },
  { codigo: "7D", etiqueta: "Últimos 7 días" },
  { codigo: "RANGO", etiqueta: "Escoger período" },
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
}

export function PanelParadasVista({
  paradas,
  estadoLineas,
}: {
  paradas: Parada[]
  /** Estado en vivo de las 3 líneas (no filtrado). Ver nota de cabecera. */
  estadoLineas?: EstadoLineaEnVivo[]
}) {
  const [periodo, setPeriodo] = useState<PeriodoCodigo>("3D")
  const [rangoDesde, setRangoDesde] = useState(() => fechaPlanta())
  const [rangoHasta, setRangoHasta] = useState(() => fechaPlanta())
  const [clase, setClase] = useState<ClaseParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")
  const [turno, setTurno] = useState<TurnoTipoCodigo | "TODOS">("TODOS")
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const ahora = useMemo(() => new Date(), [])

  // "Escoger período" usa las 2 fechas elegidas; los otros dos se calculan
  // desde HOY (fecha de planta) para atrás. hasta siempre >= desde.
  const { desde, hasta } = useMemo(() => {
    const hoy = fechaPlanta()
    if (periodo === "3D") return { desde: restarDias(hoy, 2), hasta: hoy }
    if (periodo === "7D") return { desde: restarDias(hoy, 6), hasta: hoy }
    return rangoDesde <= rangoHasta ? { desde: rangoDesde, hasta: rangoHasta } : { desde: rangoHasta, hasta: rangoDesde }
  }, [periodo, rangoDesde, rangoHasta])

  const filtradas = useMemo(() => {
    return paradas
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
  const porClase = useMemo(() => resumenPorClase(filtradas, ahora), [filtradas, ahora])
  // Por tipo + línea (no solo tipo): el mismo tipo puede repetirse una vez
  // por línea, cada fila dice de cuál es — ver RankList (mostrarLinea).
  const tiposPorLinea = useMemo(() => porTipoYLinea(filtradas, ahora), [filtradas, ahora])
  const topFrecuencia = useMemo(() => porTipoYLineaPorFrecuencia(filtradas, ahora).slice(0, 5), [filtradas, ahora])
  const topTiempo = useMemo(() => tiposPorLinea.slice(0, 5), [tiposPorLinea])

  // Toda la planta (no por línea) — qué sabor/familia/presentación se
  // llevó más paradas. Las que no tienen dato asociado (CIP, orden y
  // limpieza, liberación de vapor) quedan afuera, ver nota en Parada.
  const porSaborRes = useMemo(() => porSabor(filtradas, ahora), [filtradas, ahora])
  const porFamiliaRes = useMemo(() => porFamilia(filtradas, ahora), [filtradas, ahora])
  const porPresentacionRes = useMemo(() => porPresentacion(filtradas, ahora), [filtradas, ahora])
  // Uno por columna de línea (ver el hero, abajo) — no filtrados por esa
  // línea, son de toda la planta.
  const ATRIBUTOS_PLANTA = [
    { titulo: "Paradas por Sabor", items: porSaborRes },
    { titulo: "Paradas por Familia", items: porFamiliaRes },
    { titulo: "Paradas por Presentación", items: porPresentacionRes },
  ]

  // Por día del rango: "Todos" son los 3 turnos de ese día, un turno puntual es 1.
  const diasEnRango = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000) + 1)
  const turnosEnRango = (turno === "TODOS" ? 3 : 1) * diasEnRango
  // Tendencia de la tarjeta "Vista" — un punto por día del rango elegido.
  const porDia = useMemo(() => agruparPorDia(filtradas, ahora), [filtradas, ahora])
  const disponibilidadPlanta = disponibilidadAprox(filtradas, turnosEnRango, 3, ahora)
  const classMinutes = (c: ClaseParada) => porClase.find((x) => x.clase === c)?.minutos ?? 0

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
              {periodo === "RANGO" && (
                <>
                  <Input type="date" className="h-8 w-36" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} />
                  <span className="text-xs text-muted-foreground">a</span>
                  <Input type="date" className="h-8 w-36" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} />
                </>
              )}
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

      {/* ---- Hero: ranking + líneas en vivo + KPIs ----
           Los laterales son fijos y anchos (320px) porque cargan
           listas/números; el centro se recorta a un máximo (260px por
           línea) para que las 3 tarjetas no queden infladas de espacio
           vacío en pantallas grandes. */}
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 items-stretch gap-3 lg:grid-cols-[300px_repeat(3,320px)_240px] lg:justify-center">
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

        {/* ---- Cada columna: la tarjeta de línea + su atributo de planta
             (Sabor/Familia/Presentación) separado, debajo — no forman
             una sola tarjeta, son dos con su propio marco cada una. Los
             3 atributos son de TODA la planta, no filtrados por esa
             línea — van ahí solo para aprovechar el alto de la columna. ---- */}
        {LINEAS_PARADAS.map((l, i) => {
          const propias = filtradas.filter((p) => p.lineaCodigo === l.codigo)
          const eficiencia = disponibilidadAprox(propias, turnosEnRango, 1, ahora)
          const enVivo = estadoLineas?.find((e) => e.lineaCodigo === l.codigo)
          const atributo = ATRIBUTOS_PLANTA[i]
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
                  <CintaLinea numeroLinea={i + 1} estado={enVivo.estado} saborNombre={enVivo.saborNombre} lote={enVivo.lote} />
                ) : (
                  <div className="grid h-28 place-items-center rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    Sin estado en vivo
                    <br />
                    (vista previa)
                  </div>
                )}
                <div className={cn("mt-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2", nivelSoft(eficiencia))}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Eficiencia</span>
                  <span className={cn("num text-3xl font-extrabold leading-none", nivelColor(eficiencia))}>{eficiencia}%</span>
                </div>
                <div className="mt-2">
                  <h3 className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">Top paradas por línea</h3>
                  <RankList items={porTipo(propias, ahora).slice(0, 3)} metrica="minutos" compacto />
                </div>
              </div>
              {atributo && <BarrasAtributo titulo={atributo.titulo} items={atributo.items} />}
            </div>
          )
        })}

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 content-start gap-2 lg:grid-cols-1">
            <Kpi etiqueta="Min. programadas" valor={classMinutes("PROGRAMADA")} icono={<Clock className="size-4" />} tono="text-info" />
            <Kpi etiqueta="Min. no programadas" valor={classMinutes("NO_PROGRAMADA")} icono={<AlertTriangle className="size-4" />} tono="text-danger" />
            <Kpi etiqueta="Min. tiempo ocioso" valor={classMinutes("OCIOSO")} tono="text-warning" />
            <Kpi etiqueta="Paradas registradas" valor={filtradas.length} tono="text-primary" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Disponibilidad de Planta</h2>
              <Gauge className={cn("size-5", nivelColor(disponibilidadPlanta))} aria-hidden="true" />
            </div>
            <div className="flex items-center justify-center">
              <AnilloPct pct={disponibilidadPlanta} tamano={96} />
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Aproximada — objetivo ≥ 90%</p>
          </div>
        </div>
      </div>

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

function nivelColor(pct: number) {
  return pct >= 90 ? "text-success" : pct >= 75 ? "text-warning" : "text-danger"
}
function nivelSoft(pct: number) {
  return pct >= 90 ? "bg-success/10" : pct >= 75 ? "bg-warning/10" : "bg-danger/10"
}

/** Anillo de porcentaje (conic-gradient) — mismo patrón que MetaAnillo en PanelProduccion.tsx, para que los dos dashboards se lean igual. */
function AnilloPct({ pct, tamano }: { pct: number; tamano: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const color = clamped >= 90 ? "var(--success)" : clamped >= 75 ? "var(--warning)" : "var(--danger)"
  return (
    <div
      className="relative grid shrink-0 place-items-center rounded-full transition-all duration-700"
      style={{ width: tamano, height: tamano, background: `conic-gradient(${color} ${clamped * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
    >
      <div className="grid place-items-center rounded-full bg-background" style={{ width: tamano * 0.72, height: tamano * 0.72 }}>
        <span className="num font-bold" style={{ color, fontSize: tamano * 0.24 }}>
          {clamped}%
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

/** Gráfico de barras (top 5) por sabor/familia/presentación — mismo estilo visual que RankList, toda la planta junta. */
function BarrasAtributo({ titulo, items }: { titulo: string; items: GrupoAtributo[] }) {
  const top = items.slice(0, 5)
  const max = Math.max(1, ...top.map((i) => i.minutos))
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{titulo}</h2>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos asociados en el rango.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {top.map((item) => (
            <li key={item.clave}>
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.clave}</span>
                <span className="num font-semibold text-foreground">{fmtDuracion(item.minutos)}</span>
                <span className="text-muted-foreground">({item.veces}×)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, (item.minutos / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
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

function Kpi({ etiqueta, valor, icono, tono }: { etiqueta: string; valor: number; icono?: ReactNode; tono: string }) {
  return (
    <article className="flex flex-col items-center rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      {icono && <div className={cn("mb-2 flex size-9 items-center justify-center rounded-md bg-current/10", tono)}>{icono}</div>}
      <p className={cn("num text-4xl font-extrabold", icono ? "text-foreground" : tono)}>{valor}</p>
      <p className="mt-1.5 text-sm font-medium leading-snug text-muted-foreground">{etiqueta}</p>
    </article>
  )
}

