import { useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, Clock, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { rangoDePreset, type PresetFecha } from "@/lib/auditoriaVista"
import {
  agruparPorDia,
  CLASES_PARADA,
  COLOR_CLASE,
  duracionMin,
  fmtDesvio,
  fmtDuracion,
  LINEAS_PARADAS,
  minutosPorLinea,
  NOMBRE_CLASE,
  nombreLineaParada,
  paradaAbierta,
  porTipo,
  resumenPorClase,
  type ClaseParada,
  type Parada,
} from "@/lib/paradas"

/*
 * Panel de Paradas — dashboard solo lectura, mismo estilo que el Panel de
 * Producción. Hace explícitos todos los datos de paradas: tiempo perdido,
 * ocioso, por línea, desvío real vs. tiempo guía por tipo, tendencia y la
 * lista con filtros. Compartido entre la página real y el preview
 * /paradas-demo.
 */

const PRESETS: { codigo: PresetFecha; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "DIAS_7", etiqueta: "Últimos 7 días" },
  { codigo: "FECHA", etiqueta: "Fecha exacta" },
]

const CLASE_FILTRO: { codigo: ClaseParada | "TODAS"; etiqueta: string }[] = [
  { codigo: "TODAS", etiqueta: "Todas" },
  { codigo: "PROGRAMADA", etiqueta: "Programada" },
  { codigo: "NO_PROGRAMADA", etiqueta: "No programada" },
  { codigo: "OCIOSO", etiqueta: "Ocioso" },
]

export function PanelParadasVista({
  paradas,
  presetInicial = "DIAS_7",
}: {
  paradas: Parada[]
  presetInicial?: PresetFecha
}) {
  const [preset, setPreset] = useState<PresetFecha>(presetInicial)
  const [fechaExacta, setFechaExacta] = useState("")
  const [clase, setClase] = useState<ClaseParada | "TODAS">("TODAS")
  const [linea, setLinea] = useState("TODAS")

  const rango = useMemo(() => rangoDePreset(preset, fechaExacta), [preset, fechaExacta])
  const ahora = useMemo(() => new Date(), [])

  const filtradas = useMemo(() => {
    return paradas
      .filter((p) => {
        const dia = p.inicio.slice(0, 10)
        if (rango.desde && dia < rango.desde) return false
        if (rango.hasta && dia > rango.hasta) return false
        if (clase !== "TODAS" && p.clase !== clase) return false
        if (linea !== "TODAS" && p.lineaCodigo !== linea) return false
        return true
      })
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [paradas, rango, clase, linea])

  const totalMin = useMemo(() => filtradas.reduce((a, p) => a + duracionMin(p, ahora), 0), [filtradas, ahora])
  const ociosoMin = useMemo(
    () => filtradas.filter((p) => p.clase === "OCIOSO").reduce((a, p) => a + duracionMin(p, ahora), 0),
    [filtradas, ahora],
  )
  const abiertas = filtradas.filter(paradaAbierta).length
  const porClase = useMemo(() => resumenPorClase(filtradas, ahora), [filtradas, ahora])
  const porLinea = useMemo(() => minutosPorLinea(filtradas, ahora), [filtradas, ahora])
  const tipos = useMemo(() => porTipo(filtradas, ahora), [filtradas, ahora])
  const porDia = useMemo(() => agruparPorDia(filtradas, ahora), [filtradas, ahora])
  const maxDia = Math.max(1, ...porDia.map((d) => d.minutos))
  const maxLinea = Math.max(1, ...porLinea.map((l) => l.minutos))

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
      </div>

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi etiqueta="Tiempo perdido" valor={fmtDuracion(totalMin)} icono={<Clock className="size-4" />} />
        <Kpi etiqueta="Tiempo ocioso" valor={fmtDuracion(ociosoMin)} />
        <Kpi etiqueta="Paradas" valor={filtradas.length.toLocaleString("es-CO")} />
        <Kpi
          etiqueta="En curso"
          valor={abiertas.toLocaleString("es-CO")}
          destacar={abiertas > 0}
          icono={abiertas > 0 ? <AlertTriangle className="size-4 text-warning" /> : undefined}
        />
      </div>

      {/* ---- Reparto por clase ---- */}
      <div className="flex flex-wrap gap-2">
        {porClase
          .filter((c) => c.veces > 0)
          .map((c) => (
            <div key={c.clase} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              <span className={`size-2 rounded-full ${COLOR_CLASE[c.clase]}`} />
              <span className="text-xs text-muted-foreground">{c.etiqueta}</span>
              <span className="text-sm font-semibold text-foreground">{fmtDuracion(c.minutos)}</span>
              <span className="text-xs text-muted-foreground">({c.veces})</span>
            </div>
          ))}
        {porClase.every((c) => c.veces === 0) && (
          <p className="text-sm text-muted-foreground">Sin paradas en el rango.</p>
        )}
      </div>

      {/* ---- Por línea ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {porLinea.map((l) => (
          <div key={l.linea} className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">{nombreLineaParada(l.linea)}</h3>
              <span className="num text-sm font-semibold text-danger">{l.minutos ? fmtDuracion(l.minutos) : "—"}</span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="flex h-full">
                {CLASES_PARADA.map((c) =>
                  l.porClase[c] > 0 ? (
                    <div
                      key={c}
                      className={COLOR_CLASE[c]}
                      style={{ width: `${(l.porClase[c] / maxLinea) * 100}%` }}
                      title={`${NOMBRE_CLASE[c]}: ${fmtDuracion(l.porClase[c])}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
            <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {CLASES_PARADA.filter((c) => l.porClase[c] > 0).map((c) => (
                <li key={c} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${COLOR_CLASE[c]}`} />
                    {NOMBRE_CLASE[c]}
                  </span>
                  <span className="num text-foreground">{fmtDuracion(l.porClase[c])}</span>
                </li>
              ))}
              {l.veces === 0 && <li>Sin paradas.</li>}
            </ul>
          </div>
        ))}
      </div>

      {/* ---- Desvío por tipo ---- */}
      <SeccionColapsable
        titulo="Real vs. tiempo guía"
        descripcion="Cuánto pesa cada tipo y cuánto se desvía de su duración estándar."
        abiertoPorDefecto
      >
        {tipos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin paradas en el rango.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tipos.slice(0, 20).map((g) => (
              <li
                key={g.codigo}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm odd:bg-muted/40"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`size-2 shrink-0 rounded-full ${COLOR_CLASE[g.clase]}`} />
                  <span className="truncate text-foreground">{g.nombre}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{g.veces}×</span> · {fmtDuracion(g.minutos)}
                  {g.desvioMin != null && g.desvioMin !== 0 && (
                    <span className={g.desvioMin > 0 ? " text-danger" : " text-success"}>
                      {" "}
                      · {fmtDesvio(g.desvioMin)}
                    </span>
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

function Kpi({
  etiqueta,
  valor,
  destacar,
  icono,
}: {
  etiqueta: string
  valor: string
  destacar?: boolean
  icono?: ReactNode
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destacar ? "border-warning/40 bg-warning-soft/40" : "border-border"}`}>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {icono}
        {etiqueta}
      </p>
      <p className="num mt-0.5 text-lg font-bold text-foreground">{valor}</p>
    </div>
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
            {nombreLineaParada(p.lineaCodigo)} · {p.inicio.slice(0, 10)} {p.inicio.slice(11, 16)}
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
