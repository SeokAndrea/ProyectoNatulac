import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, Clock, Search, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { rangoDePreset, type PresetFecha, type RangoFecha } from "@/lib/auditoriaVista"
import {
  agruparPorCodigo,
  agruparPorDia,
  agruparPorEquipo,
  duracionMin,
  esParadaDeLuz,
  fmtDuracion,
  LINEAS_PARADAS,
  minutosPorLinea,
  NOMBRE_CATEGORIA,
  nombreLineaParada as nombreLinea,
  nombreTurnoParada as nombreTurno,
  paradaAbierta,
  PISO_LUZ_MIN,
  resumenPorCategoria,
  type CategoriaParada,
  type Parada,
} from "@/lib/paradas"

/*
 * Vista de Paradas (downtime de Mantenimiento) — solo lectura.
 * Compartida entre la página real (src/pages/apps/Paradas.tsx) y el
 * preview sin login (src/pages/apps/ParadasDemo.tsx). Recibe las
 * paradas ya cargadas del rango + el catálogo de equipos; el filtro de
 * fecha lo maneja acá y avisa al padre por onRangoChange (la página
 * real re-consulta; el demo le pasa todo y lo ignora).
 */

const PRESETS: { codigo: PresetFecha; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "DIAS_7", etiqueta: "Últimos 7 días" },
  { codigo: "FECHA", etiqueta: "Fecha exacta" },
]

const LINEAS = LINEAS_PARADAS

const CATEGORIAS: { codigo: CategoriaParada | "TODAS"; etiqueta: string }[] = [
  { codigo: "TODAS", etiqueta: "Todas" },
  { codigo: "OPERACIONAL", etiqueta: "Operacional" },
  { codigo: "EXTERNA", etiqueta: "Externa" },
  { codigo: "MECANICA", etiqueta: "Mecánica" },
]
const badgeCat: Record<CategoriaParada, "info" | "warning" | "danger"> = {
  OPERACIONAL: "info",
  EXTERNA: "warning",
  MECANICA: "danger",
}
const dotCat: Record<CategoriaParada, string> = {
  OPERACIONAL: "bg-info",
  EXTERNA: "bg-warning",
  MECANICA: "bg-danger",
}

export function ParadasLista({
  paradas,
  presetInicial = "DIAS_7",
  onRangoChange,
}: {
  paradas: Parada[]
  presetInicial?: PresetFecha
  onRangoChange?: (rango: RangoFecha) => void
}) {
  const [preset, setPreset] = useState<PresetFecha>(presetInicial)
  const [fechaExacta, setFechaExacta] = useState("")
  const [categoria, setCategoria] = useState<CategoriaParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")
  const [equipo, setEquipo] = useState("TODOS")
  const [texto, setTexto] = useState("")

  const rango = useMemo(() => rangoDePreset(preset, fechaExacta), [preset, fechaExacta])
  const ahora = useMemo(() => new Date(), [])

  // Avisar al padre cuando cambia el rango (la página real re-consulta;
  // el preview le pasa todo y lo ignora).
  useEffect(() => {
    if (rango.desde) onRangoChange?.(rango)
  }, [rango, onRangoChange])

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase()
    return paradas
      .filter((p) => {
        const dia = p.inicio.slice(0, 10)
        if (rango.desde && dia < rango.desde) return false
        if (rango.hasta && dia > rango.hasta) return false
        if (categoria !== "TODAS" && p.categoria !== categoria) return false
        if (linea !== "TODAS" && p.linea !== linea) return false
        if (equipo !== "TODOS" && p.equipoCodigo !== equipo) return false
        if (
          q &&
          ![p.descripcion, p.equipoNombre, p.subsistemaCodigo, p.subsistemaNombre, p.supervisorNombre, p.linea]
            .filter(Boolean)
            .some((s) => (s as string).toLowerCase().includes(q))
        )
          return false
        return true
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [paradas, rango, categoria, linea, equipo, texto])

  const totalMin = useMemo(() => filtradas.reduce((a, p) => a + duracionMin(p, ahora), 0), [filtradas, ahora])
  const porCategoria = useMemo(() => resumenPorCategoria(filtradas, ahora), [filtradas, ahora])
  const porLinea = useMemo(() => minutosPorLinea(filtradas, ahora), [filtradas, ahora])
  const porCodigo = useMemo(() => agruparPorCodigo(filtradas, ahora), [filtradas, ahora])
  const porEquipo = useMemo(() => agruparPorEquipo(filtradas, ahora), [filtradas, ahora])
  const porDia = useMemo(() => agruparPorDia(filtradas, ahora), [filtradas, ahora])
  const maxDia = Math.max(1, ...porDia.map((d) => d.minutos))
  const abiertas = filtradas.filter(paradaAbierta).length

  // Opciones de equipo: distintos de las paradas del rango completo (sin el filtro de equipo).
  const equiposOrdenados = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of paradas) m.set(p.equipoCodigo, p.equipoNombre)
    return [...m.entries()].map(([codigo, nombre]) => ({ codigo, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [paradas])

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Filtros ---- */}
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
            <Input type="date" className="h-8 w-40" value={fechaExacta} onChange={(e) => setFechaExacta(e.target.value)} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIAS.map((c) => (
            <Button
              key={c.codigo}
              type="button"
              size="sm"
              variant={categoria === c.codigo ? "default" : "outline"}
              onClick={() => setCategoria(c.codigo)}
            >
              {c.etiqueta}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={linea} onValueChange={setLinea}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las líneas</SelectItem>
              {LINEAS.map((l) => (
                <SelectItem key={l.codigo} value={l.codigo}>
                  {l.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={equipo} onValueChange={setEquipo}>
            <SelectTrigger className="h-8 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos los equipos</SelectItem>
              {equiposOrdenados.map((e) => (
                <SelectItem key={e.codigo} value={e.codigo}>
                  {e.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-9"
              placeholder="Buscar por falla, código, equipo, supervisor…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ---- Resumen ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Resumen etiqueta="Paradas" valor={filtradas.length.toLocaleString("es-CO")} />
        <Resumen etiqueta="Tiempo perdido" valor={fmtDuracion(totalMin)} />
        <Resumen etiqueta="En curso" valor={abiertas.toLocaleString("es-CO")} destacar={abiertas > 0} />
        <Resumen
          etiqueta="Prom. por parada"
          valor={filtradas.length ? fmtDuracion(Math.round(totalMin / filtradas.length)) : "—"}
        />
      </div>
      {/* reparto por categoría (Operacional / Externa / Mecánica) */}
      <div className="flex flex-wrap gap-2">
        {porCategoria
          .filter((c) => c.veces > 0)
          .map((c) => (
            <div key={c.categoria} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              <span className={`size-2 rounded-full ${dotCat[c.categoria]}`} />
              <span className="text-xs text-muted-foreground">{c.etiqueta}</span>
              <span className="text-sm font-semibold text-foreground">{fmtDuracion(c.minutos)}</span>
              <span className="text-xs text-muted-foreground">({c.veces})</span>
            </div>
          ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {porLinea.map((l) => (
          <Badge key={l.linea} variant="muted" className="font-normal">
            {nombreLinea(l.linea)}: <span className="ml-1 font-semibold">{fmtDuracion(l.minutos)}</span>
            <span className="ml-1 text-muted-foreground">({l.veces})</span>
          </Badge>
        ))}
      </div>

      {/* ---- Frecuencia por código (lo que importa) ---- */}
      <SeccionColapsable
        titulo="Frecuencia por código"
        descripcion="Cuántas veces se repitió cada código de subsistema y cuánto tiempo sumó."
        abiertoPorDefecto
      >
        {porCodigo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin paradas en el rango.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {porCodigo.slice(0, 20).map((g) => (
              <li key={g.clave} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40">
                <span className="min-w-0 truncate text-foreground">{g.etiqueta}</span>
                <span className="shrink-0 text-muted-foreground">
                  <span className="font-semibold text-foreground">{g.veces}×</span> · {fmtDuracion(g.minutos)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SeccionColapsable>

      {/* ---- Tendencia ---- */}
      <SeccionColapsable titulo="Tendencia" descripcion="Tiempo perdido por día y por equipo en el rango.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {porDia.map((d) => (
              <div key={d.dia} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">{d.dia.slice(5)}</span>
                <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full rounded bg-warning" style={{ width: `${(d.minutos / maxDia) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-foreground">{fmtDuracion(d.minutos)}</span>
              </div>
            ))}
            {porDia.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Top equipos</p>
            <ul className="flex flex-col gap-1">
              {porEquipo.slice(0, 8).map((g) => (
                <li key={g.clave} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{g.etiqueta}</span>
                  <span className="shrink-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">{fmtDuracion(g.minutos)}</span> · {g.veces}×
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SeccionColapsable>

      {/* ---- Lista ---- */}
      <div className="flex flex-col gap-2">
        {filtradas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hay paradas con esos filtros.</p>
        ) : (
          filtradas.map((p) => <FilaParada key={p.id} parada={p} ahora={ahora} />)
        )}
      </div>
    </div>
  )
}

function Resumen({ etiqueta, valor, destacar }: { etiqueta: string; valor: string; destacar?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destacar ? "border-warning/40 bg-warning-soft/40" : "border-border"}`}>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="text-base font-semibold text-foreground">{valor}</p>
    </div>
  )
}

function FilaParada({ parada: p, ahora }: { parada: Parada; ahora: Date }) {
  const [abierto, setAbierto] = useState(false)
  const larga = p.descripcion.length > 120
  const abiertaEnCurso = paradaAbierta(p)
  const min = duracionMin(p, ahora)
  const luz = esParadaDeLuz(p)
  const pisoAplica = (p.pisoMin ?? 0) > 0 && Math.max(0, Math.round((((p.fin ? new Date(p.fin) : ahora).getTime() - new Date(p.inicio).getTime()) / 60000))) < (p.pisoMin ?? 0)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className={`size-2 shrink-0 rounded-full ${dotCat[p.categoria]}`} title={NOMBRE_CATEGORIA[p.categoria]} />
            {p.categoria === "MECANICA" && <Wrench className="size-3.5 shrink-0 text-muted-foreground" />}
            {p.equipoNombre}
            {p.subsistemaCodigo && (
              <span className="font-normal text-muted-foreground">
                · {p.subsistemaCodigo}
                {p.subsistemaNombre ? ` · ${p.subsistemaNombre}` : ""}
              </span>
            )}
          </p>
          <p className={`mt-0.5 text-sm text-foreground/90 ${!abierto && larga ? "line-clamp-2" : ""}`}>{p.descripcion}</p>
          {larga && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
              {abierto ? "Menos" : "Más"}
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {nombreLinea(p.linea)} · {nombreTurno(p.turnoTipo)} · {p.inicio.slice(0, 10)} {p.inicio.slice(11, 16)}
            {p.supervisorNombre ? ` · ${p.supervisorNombre}` : ""}
            {p.reporta ? ` (${p.reporta.toLowerCase()})` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
            <Clock className="size-3.5 text-muted-foreground" />
            {fmtDuracion(min)}
          </span>
          {abiertaEnCurso ? (
            <Badge variant="warning" className="gap-1">
              <AlertTriangle className="size-3" />
              En curso
            </Badge>
          ) : (
            <Badge variant={badgeCat[p.categoria]} className="font-normal">
              {NOMBRE_CATEGORIA[p.categoria].replace(" (Mantenimiento)", "")}
            </Badge>
          )}
          {luz && pisoAplica && (
            <span className="text-[11px] text-warning">asume {PISO_LUZ_MIN} min (CIP tras corte)</span>
          )}
          {p.procuraMin != null && p.procuraMin > 0 && (
            <span className="text-[11px] text-muted-foreground">procura {fmtDuracion(p.procuraMin)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
