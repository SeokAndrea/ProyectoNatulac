import { Activity, Boxes, Building2, CalendarDays, ClipboardList, Clock, RadioTower, Target, UserRound, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { AREAS, CARGOS, TURNO_TIPOS, nombreGrupo, nombrePorCodigo, type AreaCodigo } from "@/lib/catalogos"
import { horaPlanta } from "@/lib/tiempoPlanta"
import type { TurnoActivo } from "@/lib/turno"
import { cn } from "@/lib/utils"
import { HORARIOS, type ProgramacionItem } from "./calculosPanel"
import { ProgramacionCarrusel } from "./ProgramacionCarrusel"

export interface MetaBanner {
  pctCumplimiento: number | null
  ritmoPct: number | null
  totalReales: number
  totalEsperadas: number
}

/**
 * Cabecera del Panel: estado del turno, EN VIVO / fecha elegida (abre los
 * filtros), área, supervisor; y debajo Hora · Producción del turno ·
 * Programación diaria · Meta del turno.
 */
export function BannerSuperior({
  turno,
  buscado,
  enVivo,
  fecha,
  turnoTipo,
  textoUltimaActualizacion,
  puedeElegirArea,
  areaFiltro,
  supervisorCargo,
  ahora,
  cajas,
  litros,
  programacionItems,
  meta,
  onAlternarFiltros,
  onAbrirFiltros,
}: {
  turno: TurnoActivo | null
  /** Ya se terminó la primera búsqueda (para no decir "Sin turnos" mientras carga). */
  buscado: boolean
  enVivo: boolean
  fecha: string
  turnoTipo: string
  textoUltimaActualizacion: string | null
  puedeElegirArea: boolean
  areaFiltro: AreaCodigo | "TODAS"
  supervisorCargo: string | null
  ahora: Date
  cajas: number
  litros: number
  programacionItems: ProgramacionItem[]
  meta: MetaBanner | null
  onAlternarFiltros: () => void
  onAbrirFiltros: () => void
}) {
  const [hh, mm, ss] = horaPlanta(ahora).split(":")
  const horario = HORARIOS[turnoTipo]

  return (
    <section className="panel-banner shadow-panel relative overflow-hidden rounded-2xl border border-border">
      <div className="panel-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative flex flex-wrap items-center gap-2.5 border-b border-border/70 px-5 py-3">
        {turno?.estado === "ABIERTO" ? (
          <Badge variant="success" className="gap-1.5 py-1">
            <span className="relative flex size-1.5">
              <span className="dot-ring absolute inset-0 rounded-full bg-success" />
              <span className="relative inline-flex size-1.5 rounded-full bg-success" />
            </span>
            <Activity className="size-3.5" />
            En Operación
          </Badge>
        ) : turno ? (
          <Badge variant="muted" className="gap-1.5 py-1">
            <RadioTower className="size-3.5" />
            Turno cerrado
          </Badge>
        ) : (
          <Badge variant="muted" className="gap-1.5 py-1">
            <RadioTower className="size-3.5" />
            {buscado ? "Sin turnos registrados" : "Cargando"}
          </Badge>
        )}

        <button
          type="button"
          onClick={onAlternarFiltros}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
            enVivo ? "border-success/50 bg-success-soft text-success" : "border-primary/50 bg-primary/10 text-primary",
          )}
        >
          {enVivo ? (
            <>
              <span className="relative flex size-1.5">
                <span className="dot-ring absolute inset-0 rounded-full bg-success" />
                <span className="relative inline-flex size-1.5 rounded-full bg-success" />
              </span>
              EN VIVO
            </>
          ) : (
            <>
              <CalendarDays className="size-3.5" />
              FECHA: {fecha} · {nombrePorCodigo(TURNO_TIPOS, turnoTipo)}
            </>
          )}
        </button>

        {textoUltimaActualizacion && <span className="text-[11px] text-muted-foreground">Última actualización {textoUltimaActualizacion}</span>}

        {puedeElegirArea && (
          <button
            type="button"
            onClick={onAbrirFiltros}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground"
          >
            <Building2 className="size-3.5" />
            {areaFiltro === "TODAS" ? "Todas las áreas" : nombrePorCodigo(AREAS, areaFiltro)}
          </button>
        )}

        {turno && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground">
              <UserRound className="size-3.5 text-primary" />
              {turno.supervisorNombre}
              {supervisorCargo && <span className="text-muted-foreground">· {nombrePorCodigo(CARGOS, supervisorCargo)}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              Turno {turno.codigo} · {nombreGrupo(turno.grupo)}
              {turno.estado === "CERRADO" && turno.horaFin ? ` · Cerrado ${turno.horaFin.slice(0, 5)}` : ""}
            </span>
          </>
        )}
      </div>

      {turno && meta && (
        <>
          <div className="relative grid grid-cols-1 divide-y divide-border/70 md:grid-cols-4 md:divide-x md:divide-y-0">
            {/* HORA */}
            <BannerCelda icon={Clock} label="Hora" centrado>
              <p className="num flex items-baseline justify-center gap-1 text-4xl font-bold leading-none tracking-tight text-foreground">
                {hh}
                <span className="alert-pulse text-muted-foreground">:</span>
                {mm}
                <span className="text-lg font-semibold text-muted-foreground">:{ss}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {horario ? `Turno de ${horario.inicio} a ${horario.fin}` : "Sin horario definido"}
              </p>
            </BannerCelda>

            {/* PRODUCCIÓN — cajas + litros compactados en una sola celda para dejar libre la de Programación */}
            <BannerCelda icon={Boxes} label="Producción del turno" acento centrado>
              <div className="flex items-stretch divide-x divide-border/70">
                <div className="flex flex-1 flex-col items-center px-3">
                  <p className="num text-3xl font-bold leading-none tracking-tight text-foreground">{cajas.toLocaleString("es-CO")}</p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cajas</p>
                </div>
                <div className="flex flex-1 flex-col items-center px-3">
                  <p className="num text-3xl font-bold leading-none tracking-tight text-info">
                    {litros.toLocaleString("es-CO")}
                    <span className="ml-0.5 text-sm font-semibold text-info/60">L</span>
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Litros</p>
                </div>
              </div>
            </BannerCelda>

            {/* PROGRAMACIÓN — carrusel de sabores del día, rota cada 2.5s */}
            <BannerCelda icon={ClipboardList} label="Programación diaria" centrado>
              <ProgramacionCarrusel items={programacionItems} />
            </BannerCelda>

            {/* META */}
            <BannerCelda icon={Target} label="Meta del turno" centrado>
              <MetaAnillo pct={meta.pctCumplimiento} ritmoPct={meta.ritmoPct} reales={meta.totalReales} esperadas={meta.totalEsperadas} />
            </BannerCelda>
          </div>
        </>
      )}
    </section>
  )
}

function BannerCelda({
  icon: Icon,
  label,
  acento,
  centrado,
  children,
}: {
  icon: LucideIcon
  label: string
  acento?: boolean
  centrado?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn("px-4 py-3", acento && "bg-background/40", centrado && "text-center")}>
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
          centrado && "justify-center",
        )}
      >
        <Icon className="size-3 text-primary" />
        {label}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** Anillo de cumplimiento — conic-gradient sobre tokens del tema. */
function MetaAnillo({ pct, ritmoPct, reales, esperadas }: { pct: number | null; ritmoPct: number | null; reales: number; esperadas: number }) {
  if (pct === null) {
    return (
      <div>
        <p className="num text-2xl font-bold leading-none tracking-tight text-muted-foreground">—</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Ninguna línea en uso.</p>
      </div>
    )
  }

  // El anillo muestra el AVANCE hacia la meta del turno; el color lo da la EFICIENCIA (de tiempo),
  // porque a mitad de turno el avance es bajo aunque todo vaya bien.
  const clamped = Math.max(0, Math.min(100, pct))
  const nivel = ritmoPct ?? pct
  const color = nivel >= 90 ? "var(--success)" : nivel >= 60 ? "var(--warning)" : "var(--danger)"

  return (
    <div className="flex items-center justify-center gap-2.5">
      <div
        className="relative grid size-11 shrink-0 place-items-center rounded-full transition-all duration-700"
        style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, color-mix(in oklab, var(--muted) 90%, transparent) 0deg)` }}
      >
        <div className="grid size-8 place-items-center rounded-full bg-background">
          <span className="num text-[11px] font-bold" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="num text-lg font-bold leading-none">
          {reales.toLocaleString("es-CO")}
          <span className="text-xs font-medium text-muted-foreground"> / {esperadas.toLocaleString("es-CO")}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Cajas reales vs. meta del turno{ritmoPct !== null ? " · eficiencia " + ritmoPct + "%" : ""}
        </p>
      </div>
    </div>
  )
}
