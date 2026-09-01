import { useEffect, useState } from "react"
import { ChevronLeft, Download, FileText, Loader2, RotateCcw, Search, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generarActaPdf } from "@/lib/actaPdf"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { datasetACsv, descargarCsv } from "@/lib/dataset"
import { obtenerEstadisticas } from "@/lib/estadisticas"
import { listarSabores, nombreSaborConFamilia } from "@/lib/sabores"
import { listarProgramacionHistorial, type CambioProgramacion } from "@/lib/programacion"
import { construirHistorial } from "@/lib/historial"
import { listarPersonal, type PersonalRegistrado } from "@/lib/personal"
import {
  eliminarTurno,
  listarActas,
  listarTurnosHistorial,
  obtenerTurnoDetalle,
  reabrirTurno,
  subirYRegistrarActa,
  turnosActivosPorArea,
  urlPublicaActa,
  type TurnoActivoArea,
  type TurnoResumen,
} from "@/lib/historialTurnos"
import { fechaLocal, type TurnoActivo } from "@/lib/turno"

/*
 * Auditoría: registro cronológico de acciones de cualquier turno
 * (Hora - Sección - Qué), buscable por supervisor y/o fecha — para
 * Super Administrador (todas las áreas menos PRUEBAS) y Administrador
 * de Área (acotado a la suya, ver rol_y_area_de() del lado del
 * servidor). El PDF del acta vive aparte, en su propia app (ver
 * src/pages/apps/Actas.tsx) — esto es solo el registro de acciones,
 * no el documento de cierre.
 *
 * Arriba de la búsqueda, un vistazo rápido de qué área tiene un turno
 * activo ahora mismo y quién es el supervisor.
 */
export default function Historial() {
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  const [turnosActivos, setTurnosActivos] = useState<TurnoActivoArea[]>([])
  const [supervisores, setSupervisores] = useState<PersonalRegistrado[]>([])
  /** "__todos__" = sin filtro por supervisor; si no, el usuario elegido. */
  const [supervisorUsuario, setSupervisorUsuario] = useState("__todos__")
  const [fechaDesde, setFechaDesde] = useState(() => fechaLocal(new Date()))
  const [fechaHasta, setFechaHasta] = useState(() => fechaLocal(new Date()))
  /** "Ver todo": ignora el rango de fechas y trae el histórico completo. */
  const [verTodo, setVerTodo] = useState(false)
  const [turnos, setTurnos] = useState<TurnoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState<TurnoResumen | null>(null)
  const [detalle, setDetalle] = useState<TurnoActivo | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const [reabriendo, setReabriendo] = useState(false)
  const [errorReabrir, setErrorReabrir] = useState<string | null>(null)
  const [reabierto, setReabierto] = useState(false)
  const [tieneActa, setTieneActa] = useState<boolean | null>(null)
  const [generandoActa, setGenerandoActa] = useState(false)
  const [errorActa, setErrorActa] = useState<string | null>(null)
  const [actaGeneradaUrl, setActaGeneradaUrl] = useState<string | null>(null)
  /* Exportar dataset de producción: solo SUPERADMINISTRADOR (ver el
   * botón más abajo). Usa el mismo rango de fechas de la búsqueda y
   * trae todas las áreas menos Pruebas (obtenerEstadisticas con
   * areaCodigo null). El mapa sabor -> familia es para la columna
   * `familia` del CSV. */
  const esSuperadmin = session?.rol === "SUPERADMINISTRADOR"
  const [familiaPorSabor, setFamiliaPorSabor] = useState<Map<string, string>>(new Map())
  const [exportando, setExportando] = useState(false)
  /* Cambios de la programación diaria (alta/cambio/baja de renglones del
   * plan), por fecha de edición. Solo SUPERADMINISTRADOR — necesita la
   * migración 20260977; sin ella el RPC devuelve []. */
  const [cambiosProg, setCambiosProg] = useState<CambioProgramacion[]>([])
  const [soloMisCambios, setSoloMisCambios] = useState(true)

  useEffect(() => {
    if (!session) return
    turnosActivosPorArea(session.username).then(setTurnosActivos)
    listarPersonal(session.username).then((lista) => setSupervisores(lista.filter((p) => p.rol === "SUPERVISOR" && p.activo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  useEffect(() => {
    if (!esSuperadmin) return
    listarSabores().then((sabores) =>
      setFamiliaPorSabor(new Map(sabores.map((s) => [nombreSaborConFamilia(s.nombre, s.familiaNombre), s.familiaNombre]))),
    )
  }, [esSuperadmin])

  /** Rango a mandar a los RPC: undefined cuando "Ver todo" está activo (los RPC lo tratan como "sin filtro"). */
  const rangoBusqueda = () =>
    verTodo ? { fechaDesde: undefined, fechaHasta: undefined } : { fechaDesde, fechaHasta }
  /** Supervisor elegido, o undefined para "Todos los supervisores". */
  const supFiltro = supervisorUsuario === "__todos__" ? undefined : supervisorUsuario

  async function exportarDataset() {
    setExportando(true)
    try {
      let filas = await obtenerEstadisticas({ ...rangoBusqueda(), areaCodigo: null })
      if (supFiltro) filas = filas.filter((f) => f.supervisorUsuario === supFiltro)
      const sufijo = [verTodo ? "historico-completo" : `${fechaDesde}_${fechaHasta}`, supFiltro ?? "todos"].join("_")
      descargarCsv(`dataset-produccion_${sufijo}.csv`, datasetACsv(filas, familiaPorSabor))
    } finally {
      setExportando(false)
    }
  }

  async function buscar() {
    if (!session) return
    setCargando(true)
    const lista = await listarTurnosHistorial(session.username, { supervisorUsuario: supFiltro, ...rangoBusqueda() })
    setTurnos(lista)
    if (esSuperadmin) {
      setCambiosProg(await listarProgramacionHistorial(session.username, rangoBusqueda()))
    }
    setCargando(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  async function verDetalle(turno: TurnoResumen) {
    if (!session) return
    setSeleccionado(turno)
    setReabierto(false)
    setTieneActa(null)
    setErrorActa(null)
    setActaGeneradaUrl(null)
    setCargandoDetalle(true)
    const t = await obtenerTurnoDetalle(session.username, turno.id)
    setDetalle(t)
    setCargandoDetalle(false)

    if (turno.estado === "CERRADO") {
      const actas = await listarActas(session.username, { areaCodigo: turno.area, fechaDesde: turno.fecha, fechaHasta: turno.fecha })
      setTieneActa(actas.some((a) => a.turnoId === turno.id))
    }
  }

  async function generarActaFaltante() {
    if (!session || !seleccionado || !detalle) return
    setGenerandoActa(true)
    setErrorActa(null)
    try {
      const blob = generarActaPdf({
        turno: detalle,
        supervisorNombre: seleccionado.supervisorNombre,
        area: seleccionado.area,
        lineas,
        presentaciones,
      })
      const resultado = await subirYRegistrarActa(session.username, detalle.id, seleccionado.area, detalle.codigo, blob)
      if (!resultado.ok) {
        setErrorActa(resultado.error)
        return
      }
      setActaGeneradaUrl(urlPublicaActa(resultado.acta.storagePath))
      setTieneActa(true)
    } catch {
      setErrorActa("No se pudo generar el PDF del acta. Intenta de nuevo.")
    } finally {
      setGenerandoActa(false)
    }
  }

  function volver() {
    setSeleccionado(null)
    setDetalle(null)
    setConfirmandoEliminar(false)
    setErrorEliminar(null)
    setErrorReabrir(null)
  }

  async function handleEliminar() {
    if (!session || !seleccionado) return
    setEliminando(true)
    setErrorEliminar(null)
    const resultado = await eliminarTurno(session.username, seleccionado.id)
    setEliminando(false)
    if (!resultado.ok) {
      setErrorEliminar(resultado.error)
      return
    }
    volver()
    buscar()
  }

  async function handleReabrir() {
    if (!session || !seleccionado) return
    setReabriendo(true)
    setErrorReabrir(null)
    const resultado = await reabrirTurno(session.username, seleccionado.id)
    setReabriendo(false)
    if (!resultado.ok) {
      setErrorReabrir(resultado.error)
      return
    }
    setReabierto(true)
    buscar()
  }

  const cambiosVisibles = cambiosProg.filter((c) => !soloMisCambios || c.usuarioUsuario === session?.username)

  if (seleccionado) {
    return (
      <AppShell title="Auditoría" description={`Turno ${seleccionado.codigo}`}>
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <Button variant="ghost" size="sm" className="self-start" onClick={volver}>
            <ChevronLeft className="size-4" />
            Volver a la búsqueda
          </Button>

          {cargandoDetalle || !detalle ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {seleccionado.estado === "CERRADO" && !reabierto && (
                  <Button variant="outline" onClick={handleReabrir} disabled={reabriendo}>
                    {reabriendo ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Reabrir Turno
                  </Button>
                )}
                {seleccionado.estado === "CERRADO" && (
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmandoEliminar((v) => !v)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar Turno
                  </Button>
                )}
              </div>

              {reabierto && (
                <p className="text-sm text-success">
                  Turno reabierto — el supervisor ya lo puede corregir y volver a Finalizar (eso genera una nueva versión del acta).
                </p>
              )}

              {detalle.cierreAutomatico && tieneActa === false && !actaGeneradaUrl && (
                <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
                  <p className="text-sm text-foreground">
                    Este turno se cerró solo por tiempo (nadie apretó Finalizar) — no tiene acta generada.
                  </p>
                  <Button size="sm" className="self-start" disabled={generandoActa} onClick={generarActaFaltante}>
                    {generandoActa ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                    Generar Acta
                  </Button>
                  {errorActa && (
                    <p className="text-xs text-destructive" role="alert">
                      {errorActa}
                    </p>
                  )}
                </div>
              )}

              {actaGeneradaUrl && (
                <p className="text-sm text-success">
                  Acta generada —{" "}
                  <a href={actaGeneradaUrl} target="_blank" rel="noreferrer" className="underline">
                    descargarla
                  </a>
                  .
                </p>
              )}
              {errorReabrir && (
                <p className="text-sm text-destructive" role="alert">
                  {errorReabrir}
                </p>
              )}

              {confirmandoEliminar && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <span>
                    ¿Eliminar el turno <span className="font-medium">{seleccionado.codigo}</span> definitivamente? No se
                    puede deshacer.
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleEliminar} disabled={eliminando}>
                    {eliminando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    Sí, eliminar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmandoEliminar(false)
                      setErrorEliminar(null)
                    }}
                    disabled={eliminando}
                  >
                    Cancelar
                  </Button>
                  {errorEliminar && <p className="w-full text-xs text-destructive">{errorEliminar}</p>}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {construirHistorial(detalle, lineas, presentaciones).map((ev, i) => (
                  <div key={i} className="flex gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span className="num w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{ev.hora}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-wide text-foreground uppercase">{ev.seccion}</p>
                      <p className="text-muted-foreground">{ev.detalle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Auditoría" description="Registro de acciones por supervisor y fecha">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        {turnosActivos.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {turnosActivos.map((t) => (
              <div
                key={t.areaCodigo}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{t.areaNombre}</span>
                {t.turnoId ? (
                  <Badge variant="success">Turno Activo · {t.supervisorNombre}</Badge>
                ) : (
                  <Badge variant="muted">Sin turno activo</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Buscar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>Supervisor</Label>
                <Select value={supervisorUsuario} onValueChange={setSupervisorUsuario}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__">Todos los supervisores</SelectItem>
                    {supervisores.map((s) => (
                      <SelectItem key={s.id} value={s.usuario}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fecha-desde">Desde</Label>
                <Input
                  id="fecha-desde"
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  disabled={verTodo}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fecha-hasta">Hasta</Label>
                <Input
                  id="fecha-hasta"
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  disabled={verTodo}
                />
              </div>
            </div>
            <label className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={verTodo}
                onChange={(e) => setVerTodo(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Ver todo (sin rango de fechas)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="self-start" onClick={buscar} disabled={cargando}>
                {cargando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Buscar
              </Button>
              {esSuperadmin && (
                <Button variant="outline" onClick={exportarDataset} disabled={exportando}>
                  {exportando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Exportar dataset (CSV)
                </Button>
              )}
            </div>
            {esSuperadmin && (
              <p className="text-xs text-muted-foreground">
                Una fila por corrida {verTodo ? "de todo el histórico" : "del rango de fechas"} · todas las áreas menos
                Pruebas.
              </p>
            )}
          </CardContent>
        </Card>

        {esSuperadmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Cambios de programación</CardTitle>
              <label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <input
                  type="checkbox"
                  checked={soloMisCambios}
                  onChange={(e) => setSoloMisCambios(e.target.checked)}
                  className="size-3.5 accent-primary"
                />
                Solo míos
              </label>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Altas, cambios y bajas del plan diario · por fecha de edición{" "}
                {verTodo ? "· todo el histórico" : `(${fechaDesde} → ${fechaHasta})`}.
              </p>
              {cargando ? null : cambiosVisibles.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {cambiosProg.length === 0
                    ? "No hay cambios de programación en ese rango."
                    : "No hay cambios tuyos en ese rango."}
                </p>
              ) : (
                cambiosVisibles.map((c, i) => <FilaCambioProg key={i} c={c} />)
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-2">
          {cargando ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : turnos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No se encontraron turnos con esos filtros.</p>
          ) : (
            turnos.map((t) => (
              <button
                key={t.id}
                onClick={() => verDetalle(t)}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/40"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {t.supervisorNombre} · {t.fecha}
                  </p>
                  <p className="text-muted-foreground">
                    {nombrePorCodigo(AREAS, t.area)} · {nombrePorCodigo(TURNO_TIPOS, t.turnoTipo)} ·{" "}
                    {nombrePorCodigo(GRUPOS, t.grupo)} · Código {t.codigo}
                  </p>
                </div>
                <Badge variant={t.estado === "ABIERTO" ? "secondary" : "outline"}>
                  {t.estado === "ABIERTO" ? "Abierto" : "Cerrado"}
                </Badge>
              </button>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}

const ACCION_PROG: Record<CambioProgramacion["accion"], { texto: string; variant: "success" | "warning" | "danger" }> = {
  ALTA: { texto: "Agregó", variant: "success" },
  CAMBIO: { texto: "Cambió", variant: "warning" },
  BAJA: { texto: "Quitó", variant: "danger" },
}

function FilaCambioProg({ c }: { c: CambioProgramacion }) {
  const a = ACCION_PROG[c.accion]
  const cajas =
    c.accion === "ALTA"
      ? `${c.cajasDespues ?? 0} cajas`
      : c.accion === "BAJA"
        ? `${c.cajasAntes ?? 0} cajas → —`
        : `${c.cajasAntes ?? 0} → ${c.cajasDespues ?? 0} cajas`
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {c.saborNombre}
          {c.presentacionMl ? ` · ${c.presentacionMl} ml` : ""} — {cajas}
        </p>
        <p className="text-xs text-muted-foreground">
          {nombrePorCodigo(AREAS, c.areaCodigo)} · jornada {c.fechaJornada} · {c.usuarioNombre ?? c.usuarioUsuario ?? "—"} ·{" "}
          {new Date(c.creadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
        </p>
      </div>
      <Badge variant={a.variant}>{a.texto}</Badge>
    </div>
  )
}
