import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RangoFechas } from "@/components/paradas/RangoFechas"
import { ResumenParadas } from "@/components/paradas/ResumenParadas"
import { ReporteParada, textoTiempos } from "@/components/paradas/ReporteParada"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { LINEAS_PARADAS, listarParadas, listarParadasLectura, nombreLineaParada, type Parada, type ResponsableParada } from "@/lib/paradas"
import type { VentanaTurno } from "@/lib/paradasTramo"
import { listarVentanasTurnos, ventanasDeParada } from "@/lib/ventanasParadas"
import { esteMes, periodoAnterior } from "@/lib/reportesResumen"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * Reportes de paradas: solo revisar. Parar, anotar y cubrir viven en Líneas
 * (Modo Paradas). Lista por fecha, línea, responsable y estado; cada fila abre
 * el reporte de la parada, que se puede imprimir (spec 2026-10-26, sección 8).
 * "?parada=<id>" abre un reporte de entrada.
 * Dos vistas: «Resumen» (la de entrada; qué subsistema paró más y cuánto) y la
 * Lista de paradas. "?vista=lista" recuerda la segunda.
 */

type Vista = "resumen" | "lista"

type FiltroLinea = "TODAS" | (typeof LINEAS_PARADAS)[number]["codigo"]
type FiltroResponsable = "TODOS" | ResponsableParada
type FiltroEstado = "TODOS" | "EN_CURSO" | "TERMINADA"

/** 'YYYY-MM-DDTHH:MM:SS' → '21/09 14:05'. */
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`

function Opciones<T extends string>({
  titulo,
  valor,
  opciones,
  onChange,
}: {
  titulo: string
  valor: T
  opciones: { valor: T; texto: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={titulo} className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 text-xs text-muted-foreground">{titulo}</span>
      {opciones.map((o) => (
        <Button key={o.valor} type="button" size="sm" variant={valor === o.valor ? "default" : "outline"} onClick={() => onChange(o.valor)}>
          {o.texto}
        </Button>
      ))}
    </div>
  )
}

export default function ReportesParadas() {
  const { session } = useAuth()
  // El Área de Pruebas revisa Pruebas; el resto, Aséptico.
  const area = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const [params, setParams] = useSearchParams()
  const hoy = fechaPlanta()

  const vista: Vista = params.get("vista") === "lista" || params.get("parada") ? "lista" : "resumen"
  // Cada vista guarda su período: el Resumen arranca en «Este mes»; la Lista, en los últimos 30 días, como siempre.
  const [rangoResumen, setRangoResumen] = useState(() => esteMes(hoy))
  const [rangoLista, setRangoLista] = useState(() => ({ desde: restarDias(hoy, 29), hasta: hoy }))
  const rango = vista === "resumen" ? rangoResumen : rangoLista
  const setRango = vista === "resumen" ? setRangoResumen : setRangoLista
  const [linea, setLinea] = useState<FiltroLinea>("TODAS")
  const [responsable, setResponsable] = useState<FiltroResponsable>("TODOS")
  const [estado, setEstado] = useState<FiltroEstado>("TODOS")
  const [lista, setLista] = useState<Parada[] | null>(null)
  const [anteriores, setAnteriores] = useState<Parada[] | null>(null)
  const [turnos, setTurnos] = useState<VentanaTurno[]>([])
  const [abierta, setAbierta] = useState<string | null>(params.get("parada"))
  const [ahora, setAhora] = useState(() => new Date())

  const cargar = useCallback(async () => {
    setLista(null)
    const [paradas, ventanas] = await Promise.all([
      listarParadas({ desde: rango.desde, hasta: rango.hasta, area }),
      listarVentanasTurnos(area, rango.desde, rango.hasta),
    ])
    setLista(paradas)
    setTurnos(ventanas)
  }, [rango, area])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // El Resumen compara con el período anterior de igual largo.
  useEffect(() => {
    if (vista !== "resumen") return
    let vivo = true
    setAnteriores(null)
    const ant = periodoAnterior(rango)
    void listarParadasLectura({ desde: ant.desde, hasta: ant.hasta, area }).then((r) => vivo && setAnteriores(r))
    return () => {
      vivo = false
    }
  }, [vista, rango, area])

  function irA(v: Vista) {
    setAbierta(null)
    params.delete("parada")
    if (v === "lista") params.set("vista", "lista")
    else params.delete("vista")
    setParams(params, { replace: true })
  }

  // Las paradas en curso siguen sumando minutos.
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const filas = useMemo(
    () =>
      (lista ?? [])
        // Un +1 sin minutos todavía no es un reporte.
        .filter((p) => !p.pendiente)
        .filter((p) => linea === "TODAS" || p.lineaCodigo === linea)
        .filter((p) => responsable === "TODOS" || p.responsable === responsable)
        .filter((p) => estado === "TODOS" || (estado === "EN_CURSO" ? p.fin === null : p.fin !== null))
        .sort((a, b) => b.inicio.localeCompare(a.inicio)),
    [lista, linea, responsable, estado],
  )

  function abrir(id: string | null) {
    setAbierta(id)
    if (params.get("parada")) {
      // El reporte venía de ?parada=: al cerrarlo se queda en la Lista, no salta al Resumen.
      params.delete("parada")
      params.set("vista", "lista")
      setParams(params, { replace: true })
    }
  }

  const elegida = filas.find((p) => p.id === abierta) ?? null

  return (
    <AppShell title="Reportes de paradas" description="Revisar las paradas de las líneas y abrir su reporte">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div role="tablist" aria-label="Vista" className="flex gap-1 border-b border-border">
          {([["resumen", "Resumen"], ["lista", "Lista de paradas"]] as const).map(([v, texto]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => irA(v)}
              className={
                "min-h-11 border-b-2 px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (vista === v ? "border-primary font-semibold text-foreground" : "border-transparent text-foreground hover:bg-muted")
              }
            >
              {texto}
            </button>
          ))}
        </div>

        {vista === "resumen" ? (
          <ResumenParadas
            paradas={lista}
            anteriores={anteriores}
            rango={rango}
            onRango={setRango}
            linea={linea}
            onLinea={(l) => setLinea(l as FiltroLinea)}
            hoy={hoy}
            ahora={ahora}
            usuario={session?.username ?? null}
            deMantenimiento={session?.area === "MANTENIMIENTO"}
          />
        ) : (
        <>
        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-24 text-xs text-muted-foreground">Fecha</span>
            <RangoFechas desde={rango.desde} hasta={rango.hasta} max={hoy} onChange={setRango} />
          </div>
          <Opciones<FiltroLinea>
            titulo="Línea"
            valor={linea}
            onChange={setLinea}
            opciones={[{ valor: "TODAS", texto: "Todas" }, ...LINEAS_PARADAS.map((l) => ({ valor: l.codigo, texto: l.nombre }))]}
          />
          <Opciones<FiltroResponsable>
            titulo="Responsable"
            valor={responsable}
            onChange={setResponsable}
            opciones={[
              { valor: "TODOS", texto: "Todos" },
              { valor: "OPERACIONAL", texto: "Operacional" },
              { valor: "MANTENIMIENTO", texto: "Mantenimiento" },
            ]}
          />
          <Opciones<FiltroEstado>
            titulo="Estado"
            valor={estado}
            onChange={setEstado}
            opciones={[
              { valor: "TODOS", texto: "Todas" },
              { valor: "EN_CURSO", texto: "En curso" },
              { valor: "TERMINADA", texto: "Terminadas" },
            ]}
          />
        </section>

        {elegida && (
          <section className="flex flex-col gap-2">
            <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => abrir(null)}>
              Cerrar reporte
            </Button>
            <ReporteParada parada={elegida} ventanas={ventanasDeParada(elegida, turnos, ahora)} ahora={ahora} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          {lista === null ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay paradas con esos filtros.</p>
          ) : (
            filas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => abrir(p.id)}
                aria-pressed={p.id === abierta}
                className={
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary " +
                  (p.id === abierta ? "border-primary" : "border-border")
                }
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {nombreLineaParada(p.lineaCodigo)} · {p.tipoNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {corta(p.inicio)} → {p.fin ? corta(p.fin) : "en curso"}
                    {p.supervisorNombre ? ` · ${p.supervisorNombre}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={p.responsable === "MANTENIMIENTO" ? "warning" : "secondary"}>
                    {p.responsable === "MANTENIMIENTO" ? "Mantenimiento" : "Operacional"}
                  </Badge>
                  {p.fin === null && <Badge variant="warning">En curso</Badge>}
                  <span className="num text-xs text-muted-foreground">{textoTiempos(p, ventanasDeParada(p, turnos, ahora), ahora)}</span>
                </div>
              </button>
            ))
          )}
        </section>
        </>
        )}
      </div>
    </AppShell>
  )
}
