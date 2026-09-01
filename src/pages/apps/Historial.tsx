import { useEffect, useState } from "react"
import { ChevronLeft, Download, FileText, Loader2, RotateCcw, Search, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generarActaPdf } from "@/lib/actaPdf"
import { AREAS, CARGOS, GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { datasetACsv, descargarCsv } from "@/lib/dataset"
import { obtenerEstadisticas } from "@/lib/estadisticas"
import { listarSabores, nombreSaborConFamilia } from "@/lib/sabores"
import { listarAuditoria, type RegistroAuditoria } from "@/lib/auditoria"
import { construirHistorial } from "@/lib/historial"
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
  /** Texto libre para filtrar por persona (nombre o usuario), en turnos y en el registro de actividad — de cualquier área y rol. */
  const [busquedaPersona, setBusquedaPersona] = useState("")
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
  /* Registro de actividad (auditoría universal). Solo SUPERADMINISTRADOR;
   * necesita la migración de auditoría — sin ella el RPC devuelve []. */
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([])
  const [filtroAccion, setFiltroAccion] = useState("TODAS")

  useEffect(() => {
    if (!session) return
    turnosActivosPorArea(session.username).then(setTurnosActivos)
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
  /** ¿La persona (nombre + usuario) coincide con lo que se escribió en "Buscar persona"? Vacío = todos. */
  const coincidePersona = (nombre: string | null | undefined, usuario: string | null | undefined) => {
    const q = busquedaPersona.trim().toLowerCase()
    return !q || `${nombre ?? ""} ${usuario ?? ""}`.toLowerCase().includes(q)
  }

  async function exportarDataset() {
    setExportando(true)
    try {
      let filas = await obtenerEstadisticas({ ...rangoBusqueda(), areaCodigo: null })
      filas = filas.filter((f) => coincidePersona(f.supervisorNombre, f.supervisorUsuario))
      const sufijo = [
        verTodo ? "historico-completo" : `${fechaDesde}_${fechaHasta}`,
        busquedaPersona.trim() ? busquedaPersona.trim().replace(/\s+/g, "-") : "todos",
      ].join("_")
      descargarCsv(`dataset-produccion_${sufijo}.csv`, datasetACsv(filas, familiaPorSabor))
    } finally {
      setExportando(false)
    }
  }

  async function buscar() {
    if (!session) return
    setCargando(true)
    const lista = await listarTurnosHistorial(session.username, rangoBusqueda())
    setTurnos(lista)
    if (esSuperadmin) {
      setAuditoria(await listarAuditoria(session.username, rangoBusqueda()))
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

  const accionesAuditoria = [...new Set(auditoria.map((r) => r.accion))].sort()
  const turnosVisibles = turnos.filter((t) => coincidePersona(t.supervisorNombre, t.supervisorUsuario))
  const auditoriaVisible = auditoria.filter(
    (r) => (filtroAccion === "TODAS" || r.accion === filtroAccion) && coincidePersona(r.usuarioNombre, r.usuario),
  )
  /** Registro agrupado por día (más nuevo primero, como viene). */
  const auditoriaPorDia = auditoriaVisible.reduce<{ dia: string; registros: RegistroAuditoria[] }[]>((acc, r) => {
    const dia = new Date(r.ocurridoEn).toLocaleDateString("es-CO", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    const grupo = acc[acc.length - 1]
    if (grupo && grupo.dia === dia) grupo.registros.push(r)
    else acc.push({ dia, registros: [r] })
    return acc
  }, [])

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
                <Label htmlFor="buscar-persona">Buscar</Label>
                <Input
                  id="buscar-persona"
                  placeholder="Nombre o usuario (cualquier área)"
                  value={busquedaPersona}
                  onChange={(e) => setBusquedaPersona(e.target.value)}
                />
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
          <SeccionColapsable
            titulo={`Registro de actividad${auditoriaVisible.length ? ` (${auditoriaVisible.length})` : ""}`}
            descripcion={`Registro diario de toda mutación (crear / editar / borrar): quién, cuándo, en qué página y los valores antes/después · ${
              verTodo ? "todo el histórico" : `${fechaDesde} → ${fechaHasta}`
            }.`}
          >
            <div className="flex flex-col gap-3">
              <Select value={filtroAccion} onValueChange={setFiltroAccion}>
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas las acciones</SelectItem>
                  {accionesAuditoria.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {cargando ? null : auditoriaVisible.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {auditoria.length === 0
                    ? "Sin actividad registrada en ese rango (o la migración de auditoría todavía no está aplicada)."
                    : "Nada coincide con ese filtro."}
                </p>
              ) : (
                auditoriaPorDia.map(({ dia, registros }) => (
                  <div key={dia} className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {dia} · {registros.length}
                    </p>
                    {registros.map((r, i) => (
                      <FilaAuditoria key={i} r={r} />
                    ))}
                  </div>
                ))
              )}
            </div>
          </SeccionColapsable>
        )}

        <div className="flex flex-col gap-2">
          {cargando ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : turnosVisibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No se encontraron turnos con esos filtros.</p>
          ) : (
            turnosVisibles.map((t) => (
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

const ACCION_AUDIT: Record<string, "success" | "warning" | "danger" | "muted" | "secondary"> = {
  CREAR: "success",
  ACTIVAR: "success",
  EDITAR: "warning",
  DESACTIVAR: "muted",
  RESET_PASSWORD: "secondary",
  ELIMINAR: "danger",
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

function FilaAuditoria({ r }: { r: RegistroAuditoria }) {
  const variant = ACCION_AUDIT[r.accion] ?? "outline"
  const claves = [...new Set([...Object.keys(r.antes ?? {}), ...Object.keys(r.despues ?? {})])]
  const diffs = claves
    .map((k) => ({ k, antes: r.antes?.[k], despues: r.despues?.[k] }))
    .filter((x) => JSON.stringify(x.antes ?? null) !== JSON.stringify(x.despues ?? null))

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>{r.accion}</Badge>
        <span className="font-medium text-foreground">{r.resumen ?? `${r.accion} · ${r.entidad}`}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {r.usuarioNombre ?? r.usuario ?? "—"}
        {r.usuarioCargo ? ` (${nombrePorCodigo(CARGOS, r.usuarioCargo)})` : ""} ·{" "}
        {new Date(r.ocurridoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
        {r.pagina ? ` · ${r.pagina}` : ""}
      </p>
      {diffs.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Ver valores</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {diffs.map((x) => (
              <li key={x.k}>
                <span className="text-muted-foreground">{x.k}:</span> {valorLegible(x.antes)}{" "}
                <span className="text-muted-foreground">→</span> {valorLegible(x.despues)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
