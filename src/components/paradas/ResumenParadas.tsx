import { Fragment, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { selectClase } from "@/components/catalogo-fallas/estilos"
import { RangoFechas } from "@/components/paradas/RangoFechas"
import { Button } from "@/components/ui/button"
import { conFallas } from "@/lib/catalogoFallas/analisis"
import { useCatalogoFallas } from "@/lib/catalogoFallas/useCatalogoFallas"
import { useFallasDeParadas } from "@/lib/catalogoFallas/useFallasDeParadas"
import { fmtDuracion, LINEAS_PARADAS, nombreLineaParada, type Parada, type ResponsableParada } from "@/lib/paradas"
import {
  agruparResumen,
  comparacionPeriodo,
  esteMes,
  etiquetaSif,
  fallasQueMasSeRepiten,
  filtrarResumen,
  limitarGrupos,
  mesPasado,
  NOMBRE_NIVEL,
  personasQueAtendieron,
  sifDeFalla,
  totalesResumen,
  type NivelResumen,
  type Rango,
} from "@/lib/reportesResumen"
import { esInspeccion, listarSif, RUTA_SIF, type Sif } from "@/lib/sif"

/*
 * Pestaña «Resumen» de Reportes de paradas: qué subsistema (o equipo, sistema
 * o falla) quitó más tiempo, cuántas veces y el promedio. Más liviano que el
 * Panel de Paradas. Las cuentas viven en src/lib/reportesResumen.ts.
 */

const etiquetaFiltro = "text-xs font-semibold text-foreground"
const MAX_FILAS = 8

const NIVELES: NivelResumen[] = ["SUBSISTEMA", "EQUIPO", "SISTEMA", "FALLA"]

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
    <div role="group" aria-label={titulo} className="flex flex-col gap-1">
      <span className={etiquetaFiltro}>{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <Button
            key={o.valor}
            type="button"
            variant={valor === o.valor ? "default" : "outline"}
            aria-pressed={valor === o.valor}
            className="h-11"
            onClick={() => onChange(o.valor)}
          >
            {o.texto}
          </Button>
        ))}
      </div>
    </div>
  )
}

const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`

function Tarjeta({ titulo, valor, nota, alerta = false }: { titulo: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div className={"flex flex-col gap-1 rounded-xl border p-4 " + (alerta ? "border-warning/40 bg-warning-soft" : "border-border bg-card")}>
      <span className="text-sm text-foreground">{titulo}</span>
      <span className="num text-2xl font-medium whitespace-nowrap text-foreground">{valor}</span>
      <span className="text-sm text-foreground">{nota}</span>
    </div>
  )
}

interface Props {
  /** Las paradas del período elegido (sin filtrar). null = cargando. */
  paradas: Parada[] | null
  /** Las del período anterior de igual largo. null = cargando. */
  anteriores: Parada[] | null
  rango: Rango
  onRango: (r: Rango) => void
  /** "TODAS" o LINEA_n; compartido con la Lista. */
  linea: string
  onLinea: (l: string) => void
  hoy: string
  ahora: Date
  usuario: string | null
  /** Sesión de Mantenimiento: arranca en «De quién es: Mantenimiento». */
  deMantenimiento: boolean
}

export function ResumenParadas({ paradas, anteriores, rango, onRango, linea, onLinea, hoy, ahora, usuario, deMantenimiento }: Props) {
  const [deQuien, setDeQuien] = useState<"TODOS" | ResponsableParada>(deMantenimiento ? "MANTENIMIENTO" : "TODOS")
  const [atendioElegido, setAtendio] = useState("TODOS")
  const [nivel, setNivel] = useState<NivelResumen>("SUBSISTEMA")
  const [abierto, setAbierto] = useState<string | null>(null)

  const { catalogo } = useCatalogoFallas()
  const base = useMemo(() => filtrarResumen(paradas ?? [], { linea: "TODAS", responsable: "TODOS", atendio: "TODOS" }), [paradas])
  const fallas = useFallasDeParadas(base)

  const personas = useMemo(() => personasQueAtendieron(base), [base])
  // Si la persona elegida ya no aparece en este período, se cuenta como «Todos».
  const atendio = personas.includes(atendioElegido) ? atendioElegido : "TODOS"

  const filtros = { linea, responsable: deQuien, atendio }
  const actuales = useMemo(() => filtrarResumen(paradas ?? [], filtros), [paradas, linea, deQuien, atendio]) // eslint-disable-line react-hooks/exhaustive-deps
  const previas = useMemo(() => filtrarResumen(anteriores ?? [], filtros), [anteriores, linea, deQuien, atendio]) // eslint-disable-line react-hooks/exhaustive-deps
  const conFalla = useMemo(() => conFallas(actuales, fallas, catalogo), [actuales, fallas, catalogo])

  const totales = useMemo(() => totalesResumen(actuales, ahora), [actuales, ahora])
  const anterior = useMemo(() => totalesResumen(previas, ahora), [previas, ahora])
  const comparacion = comparacionPeriodo(totales, anterior)
  const grupos = useMemo(() => agruparResumen(actuales, conFalla, nivel, ahora), [actuales, conFalla, nivel, ahora])
  const { filas, otros } = useMemo(() => limitarGrupos(grupos, MAX_FILAS), [grupos])
  const repetidas = useMemo(() => fallasQueMasSeRepiten(actuales, conFalla, ahora), [actuales, conFalla, ahora])
  const primero = grupos[0] ?? null

  // Fallas repetidas (SIF) del período: cuántas Inspecciones e Intervenciones hubo en esas líneas.
  const [sifs, setSifs] = useState<Sif[] | "error" | null>(null)
  useEffect(() => {
    if (!usuario) return
    let vivo = true
    void listarSif(usuario).then((r) => vivo && setSifs(r.ok ? r.data : "error"))
    return () => {
      vivo = false
    }
  }, [usuario])
  const sif = useMemo(() => {
    if (!sifs || sifs === "error") return sifs
    const delPeriodo = sifs.filter((s) => s.fechaJornada >= rango.desde && s.fechaJornada <= rango.hasta && (linea === "TODAS" || s.lineaCodigo === linea))
    const inspecciones = delPeriodo.filter((s) => esInspeccion(s.estado)).length
    return { inspecciones, intervenciones: delPeriodo.length - inspecciones }
  }, [sifs, rango.desde, rango.hasta, linea])
  const listaSif = Array.isArray(sifs) ? sifs : []

  const esEsteMes = rango.desde === esteMes(hoy).desde && rango.hasta === esteMes(hoy).hasta
  const esMesPasado = rango.desde === mesPasado(hoy).desde && rango.hasta === mesPasado(hoy).hasta
  const nombreNivel = NOMBRE_NIVEL[nivel].toLowerCase()

  function verSusFallas() {
    if (!primero) return
    setAbierto(primero.clave)
    document.getElementById("ranking-resumen")?.scrollIntoView?.({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Filtros" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className={etiquetaFiltro}>Período</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" variant={esEsteMes ? "default" : "outline"} aria-pressed={esEsteMes} className="h-11" onClick={() => onRango(esteMes(hoy))}>
                Este mes
              </Button>
              <Button type="button" variant={esMesPasado ? "default" : "outline"} aria-pressed={esMesPasado} className="h-11" onClick={() => onRango(mesPasado(hoy))}>
                Mes pasado
              </Button>
              <RangoFechas desde={rango.desde} hasta={rango.hasta} max={hoy} onChange={onRango} />
            </div>
          </div>
          <Opciones<string>
            titulo="Línea"
            valor={linea}
            onChange={onLinea}
            opciones={[{ valor: "TODAS", texto: "Todas" }, ...LINEAS_PARADAS.map((l) => ({ valor: l.codigo as string, texto: l.nombre }))]}
          />
          <Opciones<"TODOS" | ResponsableParada>
            titulo="De quién es"
            valor={deQuien}
            onChange={setDeQuien}
            opciones={[
              { valor: "TODOS", texto: "Todos" },
              { valor: "OPERACIONAL", texto: "Producción" },
              { valor: "MANTENIMIENTO", texto: "Mantenimiento" },
            ]}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex min-w-0 flex-col gap-1">
            <span className={etiquetaFiltro}>Responsable (quién la atendió)</span>
            <select className={selectClase} value={atendio} onChange={(e) => setAtendio(e.target.value)}>
              <option value="TODOS">Todos</option>
              {personas.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className={etiquetaFiltro}>Agrupar por</span>
            <select
              className={selectClase}
              value={nivel}
              onChange={(e) => {
                setNivel(e.target.value as NivelResumen)
                setAbierto(null)
              }}
            >
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {NOMBRE_NIVEL[n]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-foreground">Cuenta las paradas no programadas (fallas); no cuenta programadas, LNP ni ocioso.</p>
      </section>

      {paradas === null ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : actuales.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">No hay paradas con esos filtros.</p>
      ) : (
        <>
          {primero && (
            <section aria-label="Lo que más paró" className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-danger/30 bg-danger-soft p-4 sm:p-5">
              <div className="flex min-w-0 flex-1 basis-80 items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger-foreground">
                  <AlertTriangle className="size-5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-semibold tracking-wide text-danger-foreground uppercase">
                    Lo que más te paró · {linea === "TODAS" ? "todas las líneas" : nombreLineaParada(linea)} · {rango.desde.slice(8)}/{rango.desde.slice(5, 7)} al {rango.hasta.slice(8)}/{rango.hasta.slice(5, 7)}
                  </p>
                  <p className="text-xl font-bold text-foreground sm:text-2xl">
                    {primero.nombre}
                  </p>
                  {primero.detalle && <p className="text-sm font-medium text-foreground">{primero.detalle}</p>}
                  <p className="text-sm text-foreground">
                    Se repitió <b>{veces(primero.veces)}</b>: {fmtDuracion(primero.minutos)} parada, <b>{fmtDuracion(primero.promedio)}</b> cada vez.
                    {primero.fallaMasComun && (
                      <>
                        {" "}
                        La falla más común: {primero.fallaMasComun.nombre} ({veces(primero.fallaMasComun.veces)}).
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button type="button" className="h-11 shrink-0 px-5" onClick={verSusFallas}>
                Ver sus fallas
              </Button>
            </section>
          )}

          <section aria-label="Totales" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Paradas" valor={String(totales.veces)} nota={comparacion.veces} />
            <Tarjeta titulo="Tiempo total parado" valor={fmtDuracion(totales.minutos)} nota={comparacion.tiempo} />
            <Tarjeta titulo="Promedio por parada" valor={fmtDuracion(totales.promedio)} nota={comparacion.promedio} />
            <Link to={RUTA_SIF} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Tarjeta
                alerta
                titulo="Fallas repetidas (SIF)"
                valor={sif && sif !== "error" ? String(sif.inspecciones + sif.intervenciones) : "—"}
                nota={
                  sif && sif !== "error"
                    ? `${sif.inspecciones} ${sif.inspecciones === 1 ? "inspección" : "inspecciones"} · ${sif.intervenciones} ${sif.intervenciones === 1 ? "intervención" : "intervenciones"}`
                    : sif === "error"
                      ? "No se pudieron leer. Toca para abrirlas."
                      : "Toca para abrirlas"
                }
              />
            </Link>
          </section>

          <section id="ranking-resumen" aria-label={`Por ${nombreNivel}`} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Por {nombreNivel}</h2>
              <span className="text-sm text-foreground">Ordenado por tiempo parado{nivel !== "FALLA" ? " · toca uno para ver sus fallas" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-foreground">
                    <th scope="col" className="px-4 py-2 font-semibold">{NOMBRE_NIVEL[nivel]}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Veces</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Tiempo total</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">Promedio</th>
                    <th scope="col" className="w-[28%] px-4 py-2 font-semibold">Parte del tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((g, i) => {
                    const expandible = g.fallas.length > 0
                    const estaAbierto = expandible && abierto === g.clave
                    const parte = totales.minutos ? Math.round((g.minutos / totales.minutos) * 100) : 0
                    return (
                      <Fragment key={g.clave}>
                        <tr className={"border-t border-border " + (estaAbierto ? "bg-muted/60" : "")}>
                          <td className="px-4 py-1.5">
                            {expandible ? (
                              <button
                                type="button"
                                aria-expanded={estaAbierto}
                                onClick={() => setAbierto(estaAbierto ? null : g.clave)}
                                className="flex min-h-11 w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                              >
                                {estaAbierto ? <ChevronDown className="size-4 shrink-0" aria-hidden /> : <ChevronRight className="size-4 shrink-0" aria-hidden />}
                                <span className="min-w-0">
                                  <b className="block text-foreground">{g.nombre}</b>
                                  {g.detalle && <span className="block text-xs text-foreground">{g.detalle}</span>}
                                </span>
                              </button>
                            ) : (
                              <div className="flex min-h-11 flex-col justify-center">
                                <b className="text-foreground">{g.nombre}</b>
                                {g.detalle && <span className="text-xs text-foreground">{g.detalle}</span>}
                              </div>
                            )}
                          </td>
                          <td className="num px-2 py-1.5 text-right">{g.veces}</td>
                          <td className="num px-2 py-1.5 text-right">{fmtDuracion(g.minutos)}</td>
                          <td className="num px-2 py-1.5 text-right">{fmtDuracion(g.promedio)}</td>
                          <td className="px-4 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 flex-1 rounded-sm bg-muted" role="presentation">
                                <div className={"h-2.5 rounded-sm " + (i === 0 ? "bg-danger" : "bg-primary")} style={{ width: `${parte}%` }} />
                              </div>
                              <span className="num w-9 text-right text-xs text-foreground">{parte} %</span>
                            </div>
                          </td>
                        </tr>
                        {estaAbierto && (
                          <tr className="bg-muted/60">
                            <td colSpan={5} className="px-4 pb-3 pl-10">
                              <ul className="flex flex-col gap-1.5 text-sm">
                                {g.fallas.map((f) => (
                                  <li key={f.clave} className="flex flex-wrap justify-between gap-x-3">
                                    <span className="text-foreground">{f.nombre}</span>
                                    <span className="num text-foreground">
                                      {veces(f.veces)} · {fmtDuracion(f.minutos)} · {fmtDuracion(f.promedio)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                  {otros && (
                    <tr className="border-t border-border">
                      <td className="px-4 py-3 text-foreground">Otros {otros.cantidad}</td>
                      <td className="num px-2 py-3 text-right">{otros.veces}</td>
                      <td className="num px-2 py-3 text-right">{fmtDuracion(otros.minutos)}</td>
                      <td className="num px-2 py-3 text-right">{fmtDuracion(otros.promedio)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 rounded-sm bg-muted" role="presentation">
                            <div className="h-2.5 rounded-sm bg-muted-foreground/60" style={{ width: `${totales.minutos ? Math.round((otros.minutos / totales.minutos) * 100) : 0}%` }} />
                          </div>
                          <span className="num w-9 text-right text-xs text-foreground">{totales.minutos ? Math.round((otros.minutos / totales.minutos) * 100) : 0} %</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {repetidas.length > 0 && (
            <section aria-label="Fallas que más se repiten" className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-foreground">Fallas que más se repiten</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {repetidas.map((f) => (
                  <div key={f.clave} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-semibold text-foreground">{f.nombre}</span>
                      {(() => {
                        const s = sifDeFalla(f, listaSif, rango)
                        return s ? (
                          <Link
                            to={`${RUTA_SIF}?sif=${s.id}`}
                            className={
                              "inline-flex min-h-11 items-center rounded-md px-2.5 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                              (esInspeccion(s.estado) ? "bg-warning-soft text-warning-foreground" : "bg-danger-soft text-danger-foreground")
                            }
                          >
                            {etiquetaSif(s.estado)}
                          </Link>
                        ) : null
                      })()}
                    </div>
                    {f.detalle && <span className="text-sm text-foreground">{f.detalle}</span>}
                    <span className="num text-sm text-foreground">
                      {veces(f.veces)} · {fmtDuracion(f.minutos)} · {fmtDuracion(f.promedio)} c/u
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
