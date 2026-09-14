import { useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Gauge, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { CintaLinea, type EstadoLineaVista } from "@/components/CintaLinea"
import { cn } from "@/lib/utils"
import { fechaPlanta } from "@/lib/tiempoPlanta"
import { TURNO_TIPOS, nombrePorCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import {
  agruparPorDia,
  COLOR_CLASE,
  disponibilidadAprox,
  duracionMin,
  fmtDesvio,
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
} from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura, mismo estilo y misma lógica
 * de filtro que el Panel de Producción: se mira UN turno puntual de UN
 * día (o los 3 turnos de ese día con "Todos"), no un rango — Select de
 * Turno + date picker de Fecha, igual que allá. El "hero" de arriba
 * (ranking + 3 líneas con su cinta animada + KPIs) responde al diseño
 * acordado con el dueño (UI diseño paradas.pdf); las secciones de abajo
 * (real vs. guía, tendencia, lista) son detalle que ya existía y sigue
 * sirviendo. Compartido entre la página real y el preview /paradas-demo.
 *
 * `estadoLineas` es el estado EN VIVO de las 3 líneas — a propósito NO
 * depende del filtro de Fecha/Turno de acá abajo (ese filtro es para
 * historial; la cinta solo tiene sentido mostrando el turno activo
 * real). Si no se pasa (ej. el preview sin login), se muestra un
 * placeholder en vez de inventar un estado.
 */

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
  const [fecha, setFecha] = useState(() => fechaPlanta())
  const [clase, setClase] = useState<ClaseParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")
  const [turno, setTurno] = useState<TurnoTipoCodigo | "TODOS">("TODOS")
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const ahora = useMemo(() => new Date(), [])

  const filtradas = useMemo(() => {
    return paradas
      .filter((p) => {
        if (p.inicio.slice(0, 10) !== fecha) return false
        if (clase !== "TODAS" && p.clase !== clase) return false
        if (linea !== "TODAS" && p.lineaCodigo !== linea) return false
        if (turno !== "TODOS" && p.turnoTipo !== turno) return false
        return true
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [paradas, fecha, clase, linea, turno])

  const abiertas = filtradas.filter(paradaAbierta).length
  const porClase = useMemo(() => resumenPorClase(filtradas, ahora), [filtradas, ahora])
  const tipos = useMemo(() => porTipo(filtradas, ahora), [filtradas, ahora])
  // Por tipo + línea (no solo tipo): el mismo tipo puede repetirse una vez
  // por línea, cada fila dice de cuál es — ver RankList (mostrarLinea).
  const tiposPorLinea = useMemo(() => porTipoYLinea(filtradas, ahora), [filtradas, ahora])
  const topFrecuencia = useMemo(() => porTipoYLineaPorFrecuencia(filtradas, ahora).slice(0, 5), [filtradas, ahora])
  const topTiempo = useMemo(() => tiposPorLinea.slice(0, 5), [tiposPorLinea])
  const porDia = useMemo(() => agruparPorDia(filtradas, ahora), [filtradas, ahora])
  const maxDia = Math.max(1, ...porDia.map((d) => d.minutos))

  // Toda la planta (no por línea) — qué sabor/familia/presentación se
  // llevó más paradas. Las que no tienen dato asociado (CIP, orden y
  // limpieza, liberación de vapor) quedan afuera, ver nota en Parada.
  const porSaborRes = useMemo(() => porSabor(filtradas, ahora), [filtradas, ahora])
  const porFamiliaRes = useMemo(() => porFamilia(filtradas, ahora), [filtradas, ahora])
  const porPresentacionRes = useMemo(() => porPresentacion(filtradas, ahora), [filtradas, ahora])

  // Un solo día: "Todos" son los 3 turnos de esa fecha, un turno puntual es 1.
  const turnosEnRango = turno === "TODOS" ? 3 : 1
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
            <span className="text-xs text-muted-foreground">Fecha</span>
            <Input type="date" className="h-8 w-40" value={fecha} onChange={(e) => setFecha(e.target.value)} />
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
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 items-start gap-3 xl:grid-cols-[320px_repeat(3,minmax(0,260px))_320px] xl:justify-center">
        <div className="flex flex-col gap-3">
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
          <RankCard titulo="Top Paradas por Frecuencia" tono="info" items={topFrecuencia} metrica="veces" />
          <RankCard titulo="Top Paradas por Tiempo" tono="danger" items={topTiempo} metrica="minutos" />
        </div>

        {LINEAS_PARADAS.map((l, i) => {
          const propias = filtradas.filter((p) => p.lineaCodigo === l.codigo)
          const eficiencia = disponibilidadAprox(propias, turnosEnRango, 1, ahora)
          const enVivo = estadoLineas?.find((e) => e.lineaCodigo === l.codigo)
          return (
            <div key={l.codigo} className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-sm">
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
          )
        })}

        <div className="grid grid-cols-2 content-start gap-2 xl:grid-cols-1">
          <Kpi etiqueta="Min. programadas" valor={classMinutes("PROGRAMADA")} icono={<Clock className="size-4" />} tono="text-info" />
          <Kpi etiqueta="Min. no programadas" valor={classMinutes("NO_PROGRAMADA")} icono={<AlertTriangle className="size-4" />} tono="text-danger" />
          <Kpi etiqueta="Min. tiempo ocioso" valor={classMinutes("OCIOSO")} tono="text-warning" />
          <Kpi etiqueta="Paradas registradas" valor={filtradas.length} tono="text-primary" />
        </div>
      </div>

      {abiertas > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-sm text-warning">
          <AlertTriangle className="size-4 shrink-0" />
          {abiertas === 1 ? "Hay 1 parada en curso" : `Hay ${abiertas} paradas en curso`} en el rango filtrado.
        </div>
      )}

      {/* ---- Paradas por Sabor / Familia / Presentación — toda la planta,
           no por línea. Qué corría cuando pasó la parada; las que no
           tienen dato asociado (CIP, orden y limpieza, liberación de
           vapor) quedan afuera de las 3. ---- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BarrasAtributo titulo="Paradas por Sabor" items={porSaborRes} />
        <BarrasAtributo titulo="Paradas por Familia" items={porFamiliaRes} />
        <BarrasAtributo titulo="Paradas por Presentación" items={porPresentacionRes} />
      </div>

      {/* ---- Real vs. tiempo guía ---- */}
      <SeccionColapsable
        titulo="Real vs. tiempo guía"
        descripcion="Cuánto pesa cada tipo y cuánto se desvía de su duración estándar."
      >
        {tipos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin paradas en el rango.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tipos.slice(0, 20).map((g) => (
              <li key={g.codigo} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`size-2 shrink-0 rounded-full ${COLOR_CLASE[g.clase]}`} />
                  <span className="truncate text-foreground">{g.nombre}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{g.veces}×</span> · {fmtDuracion(g.minutos)}
                  {g.desvioMin != null && g.desvioMin !== 0 && (
                    <span className={g.desvioMin > 0 ? " text-danger" : " text-success"}> · {fmtDesvio(g.desvioMin)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SeccionColapsable>

      {/* ---- Tendencia ---- */}
      <SeccionColapsable titulo="Tendencia" descripcion="Tiempo perdido por día en el rango.">
        <div className="flex flex-col gap-1">
          {porDia.map((d) => (
            <div key={d.dia} className="flex items-center gap-2 text-xs">
              <span className="w-14 shrink-0 text-muted-foreground">{d.dia.slice(5)}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-warning" style={{ width: `${(d.minutos / maxDia) * 100}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right text-foreground">{fmtDuracion(d.minutos)}</span>
            </div>
          ))}
          {porDia.length === 0 && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TrendingUp className="size-4" /> Sin datos.
            </p>
          )}
        </div>
      </SeccionColapsable>

      {/* ---- Lista ---- */}
      <SeccionColapsable titulo="Lista de paradas" descripcion={`${filtradas.length} en el rango filtrado.`}>
        <div className="flex flex-col gap-2">
          {filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No hay paradas con esos filtros.</p>
          ) : (
            filtradas.map((p) => <FilaParada key={p.id} parada={p} ahora={ahora} />)
          )}
        </div>
      </SeccionColapsable>
    </div>
  )
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

function Kpi({ etiqueta, valor, icono, tono }: { etiqueta: string; valor: number; icono?: ReactNode; tono: string }) {
  return (
    <article className="flex flex-col items-center rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      {icono && <div className={cn("mb-2 flex size-9 items-center justify-center rounded-md bg-current/10", tono)}>{icono}</div>}
      <p className={cn("num text-4xl font-extrabold", icono ? "text-foreground" : tono)}>{valor}</p>
      <p className="mt-1.5 text-sm font-medium leading-snug text-muted-foreground">{etiqueta}</p>
    </article>
  )
}

function FilaParada({ parada: p, ahora }: { parada: Parada; ahora: Date }) {
  const min = duracionMin(p, ahora)
  const abierta = paradaAbierta(p)
  const desvio = p.tiempoGuiaMin != null ? min - p.tiempoGuiaMin : null

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className={`size-2 shrink-0 rounded-full ${COLOR_CLASE[p.clase]}`} title={NOMBRE_CLASE[p.clase]} />
            {p.tipoNombre}
            {p.origen === "SHEET" && <span className="text-[11px] font-normal text-muted-foreground">· del Sheet</span>}
          </p>
          {p.nota && <p className="mt-0.5 text-sm text-foreground/90">{p.nota}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {nombreLineaParada(p.lineaCodigo)} · {nombrePorCodigo(TURNO_TIPOS, p.turnoTipo)} · {p.inicio.slice(0, 10)}{" "}
            {p.inicio.slice(11, 16)}
            {p.fin ? `–${p.fin.slice(11, 16)}` : ""}
            {p.supervisorNombre ? ` · ${p.supervisorNombre}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="num flex items-center gap-1 text-sm font-semibold text-foreground">
            <Clock className="size-3.5 text-muted-foreground" />
            {fmtDuracion(min)}
          </span>
          {abierta ? (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="size-3" />
              En curso
            </Badge>
          ) : desvio != null && desvio !== 0 ? (
            <Badge variant={desvio > 0 ? "danger" : "success"} className="font-normal">
              {fmtDesvio(desvio)} vs. guía
            </Badge>
          ) : p.tiempoGuiaMin != null ? (
            <Badge variant="muted" className="font-normal">
              en guía
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}
