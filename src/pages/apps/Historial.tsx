import { useEffect, useState } from "react"
import { ChevronLeft, Download, FileText, Loader2, RotateCcw, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { AuditoriaTurnos, type TurnoAuditoria } from "@/components/AuditoriaTurnos"
import { RegistroCambios } from "@/components/RegistroCambios"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { generarActaPdf } from "@/lib/actaPdf"
import { AREAS, nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { useAuth } from "@/lib/auth"
import { datasetACsv, descargarCsv } from "@/lib/dataset"
import { obtenerEstadisticas } from "@/lib/estadisticas"
import { listarSabores, nombreSaborConFamilia } from "@/lib/sabores"
import { listarAuditoria, type RegistroAuditoria } from "@/lib/auditoria"
import { rangoDePreset, type RangoFecha } from "@/lib/auditoriaVista"
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
  type Acta,
  type TurnoActivoArea,
  type TurnoResumen,
} from "@/lib/historialTurnos"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Auditoría: para el auditor ISO 9001 y el jefe de producción — qué
 * hizo cada supervisor, en orden cronológico, turno por turno, con el
 * resumen (sabores/lotes, cajas y las dos mermas) de un vistazo y la
 * línea de tiempo por hora al abrir cada fila. Ver plan-rework-auditoria.md.
 *
 * La grilla la arma <AuditoriaTurnos>; esta página trae los datos del
 * rango que ese componente pide (filtro de fecha) y aporta las
 * acciones por turno (acta, reabrir, eliminar). Abajo, colapsados:
 * el registro de cambios (auditoría universal), las actas de todas las
 * versiones y la exportación del dataset — todo para SUPERADMINISTRADOR
 * y Administrador de Área, en su alcance.
 */
export default function Historial() {
  const { session } = useAuth()
  const { lineas, presentaciones } = useCatalogosLive()
  const esSuperadmin = session?.rol === "SUPERADMINISTRADOR"

  const [turnosActivos, setTurnosActivos] = useState<TurnoActivoArea[]>([])
  const [rango, setRango] = useState<RangoFecha>(() => rangoDePreset("HOY", ""))
  const [turnos, setTurnos] = useState<TurnoAuditoria[]>([])
  const [actasPorTurno, setActasPorTurno] = useState<Map<string, Acta>>(new Map())
  const [actasRango, setActasRango] = useState<Acta[]>([])
  const [auditoria, setAuditoria] = useState<RegistroAuditoria[]>([])
  const [cargando, setCargando] = useState(true)

  /* Detalle de un turno: pantalla aparte con Reabrir / Eliminar /
   * Generar Acta faltante. Se abre desde el botón "Abrir" de la fila. */
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

  /* Exportar dataset de producción (solo SUPERADMINISTRADOR): mismo
   * rango del filtro, todas las áreas menos Pruebas. El mapa
   * sabor -> familia es para la columna `familia` del CSV. */
  const [familiaPorSabor, setFamiliaPorSabor] = useState<Map<string, string>>(new Map())
  const [exportando, setExportando] = useState(false)

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

  async function cargar(r: RangoFecha) {
    if (!session) return
    setCargando(true)
    const filtros = { fechaDesde: r.desde, fechaHasta: r.hasta }
    const resumenes = await listarTurnosHistorial(session.username, filtros)
    const detalles = await Promise.all(resumenes.map((t) => obtenerTurnoDetalle(session.username, t.id)))
    setTurnos(
      resumenes
        .map((resumen, i) => ({ resumen, detalle: detalles[i] }))
        .filter((x): x is TurnoAuditoria => x.detalle !== null),
    )

    const actas = await listarActas(session.username, filtros)
    setActasRango(actas)
    const vigentes = new Map<string, Acta>()
    for (const a of actas) if (a.estado === "VIGENTE") vigentes.set(a.turnoId, a)
    setActasPorTurno(vigentes)

    if (esSuperadmin) setAuditoria(await listarAuditoria(session.username, filtros))
    setCargando(false)
  }

  useEffect(() => {
    cargar(rango)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  function handleRangoChange(r: RangoFecha) {
    if (r.desde === rango.desde && r.hasta === rango.hasta) return
    setRango(r)
    cargar(r)
  }

  async function exportarDataset() {
    setExportando(true)
    try {
      const filas = await obtenerEstadisticas({ fechaDesde: rango.desde, fechaHasta: rango.hasta, areaCodigo: null })
      descargarCsv(`dataset-produccion_${rango.desde}_${rango.hasta}.csv`, datasetACsv(filas, familiaPorSabor))
    } finally {
      setExportando(false)
    }
  }

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
      setTieneActa(actasPorTurno.has(turno.id))
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
    cargar(rango)
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
  }

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
                    <span className="num w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">{ev.hora}</span>
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
    <AppShell title="Auditoría" description="Qué hizo cada supervisor, turno por turno">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
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

        <AuditoriaTurnos
          turnos={turnos}
          lineas={lineas}
          presentaciones={presentaciones}
          cargando={cargando}
          onRangoChange={handleRangoChange}
          accionesTurno={(t) => (
            <AccionesTurno acta={actasPorTurno.get(t.resumen.id)} onAbrir={() => verDetalle(t.resumen)} />
          )}
        />

        {esSuperadmin && (
          <SeccionColapsable
            titulo={`Registro de cambios (auditoría)${auditoria.length ? ` · ${auditoria.length}` : ""}`}
            descripcion="Toda mutación (crear / editar / borrar) del rango: cuándo, qué se tocó y quién. El antes/después detrás de «ver valores»."
          >
            <RegistroCambios registros={auditoria} />
          </SeccionColapsable>
        )}

        <SeccionColapsable
          titulo={`Actas del rango${actasRango.length ? ` · ${actasRango.length}` : ""}`}
          descripcion="El PDF de cierre de cada turno, todas las versiones (vigentes y anuladas)."
        >
          {actasRango.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin actas en ese rango.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {actasRango.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-mono font-medium text-foreground">{a.codigo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.supervisorNombre} · {a.fecha} · {nombrePorCodigo(AREAS, a.area)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={a.estado === "VIGENTE" ? "success" : "muted"}>
                      {a.estado === "VIGENTE" ? "Vigente" : "Anulada"}
                    </Badge>
                    <Button size="sm" variant="outline" asChild>
                      <a href={urlPublicaActa(a.storagePath)} target="_blank" rel="noreferrer">
                        <Download className="size-3.5" />
                        PDF
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SeccionColapsable>

        {esSuperadmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportarDataset} disabled={exportando}>
              {exportando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Exportar dataset (CSV)
            </Button>
            <span className="text-xs text-muted-foreground">
              Una fila por corrida del rango · todas las áreas menos Pruebas.
            </span>
          </div>
        )}
      </div>
    </AppShell>
  )
}

/** Acciones de una fila de supervisor: link al acta vigente (si hay) y "Abrir" el detalle del turno. */
function AccionesTurno({ acta, onAbrir }: { acta?: Acta; onAbrir: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {acta && (
        <Button size="sm" variant="ghost" asChild>
          <a href={urlPublicaActa(acta.storagePath)} target="_blank" rel="noreferrer">
            <FileText className="size-3.5" />
            Acta
          </a>
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onAbrir}>
        Abrir
      </Button>
    </div>
  )
}
