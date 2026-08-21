import { useEffect, useState } from "react"
import { ChevronLeft, FileText, Loader2, Search, Trash2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ActaTurno } from "@/components/ActaTurno"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import { listarPersonal, type PersonalRegistrado } from "@/lib/personal"
import { eliminarTurno, listarTurnosHistorial, obtenerTurnoDetalle, type TurnoResumen } from "@/lib/historialTurnos"
import type { TurnoActivo } from "@/lib/turno"

/*
 * Auditoría: buscar cualquier turno (abierto o cerrado, de cualquier
 * área/supervisor) por supervisor y/o rango de fechas, y ver su
 * detalle completo — solo SUPERADMINISTRADOR (ver rolesPermitidos en
 * src/lib/apps.tsx y src/App.tsx). Reutiliza <ActaTurno /> para el
 * detalle, así que desde acá también se puede generar el PDF de
 * cualquier turno pasado, no solo del que está en curso.
 */
export default function Historial() {
  const { session } = useAuth()
  const [supervisores, setSupervisores] = useState<PersonalRegistrado[]>([])
  const [supervisorUsuario, setSupervisorUsuario] = useState("")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [turnos, setTurnos] = useState<TurnoResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [seleccionado, setSeleccionado] = useState<TurnoResumen | null>(null)
  const [detalle, setDetalle] = useState<TurnoActivo | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    listarPersonal(session.username).then((lista) => setSupervisores(lista.filter((p) => p.rol === "SUPERVISOR" && p.activo)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  async function buscar() {
    if (!session) return
    setCargando(true)
    const lista = await listarTurnosHistorial(session.username, { supervisorUsuario, fechaDesde, fechaHasta })
    setTurnos(lista)
    setCargando(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.username])

  async function verDetalle(turno: TurnoResumen) {
    if (!session) return
    setSeleccionado(turno)
    setCargandoDetalle(true)
    const t = await obtenerTurnoDetalle(session.username, turno.id)
    setDetalle(t)
    setCargandoDetalle(false)
  }

  function volver() {
    setSeleccionado(null)
    setDetalle(null)
    setConfirmandoEliminar(false)
    setErrorEliminar(null)
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

  if (seleccionado) {
    return (
      <AppShell title="Auditoría" description={`Turno ${seleccionado.codigo}`}>
        <div className="mx-auto flex max-w-2xl flex-col gap-4 print:hidden">
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
                <Button variant="outline" onClick={() => window.print()}>
                  <FileText className="size-4" />
                  Generar Acta (PDF)
                </Button>
                {seleccionado.estado === "CERRADO" && (
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmandoEliminar((v) => !v)}
                  >
                    <Trash2 className="size-4" />
                    Eliminar Acta
                  </Button>
                )}
              </div>

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

              <Card className="overflow-hidden p-0">
                <ActaTurno turno={detalle} supervisorNombre={seleccionado.supervisorNombre} area={seleccionado.area} />
              </Card>
            </>
          )}
        </div>

        {detalle && (
          <div className="hidden print:block">
            <ActaTurno turno={detalle} supervisorNombre={seleccionado.supervisorNombre} area={seleccionado.area} />
          </div>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell title="Auditoría" description="Historial de turnos por supervisor y fecha">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
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
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
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
                <Input id="fecha-desde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fecha-hasta">Hasta</Label>
                <Input id="fecha-hasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
              </div>
            </div>
            <Button className="self-start" onClick={buscar} disabled={cargando}>
              {cargando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Buscar
            </Button>
          </CardContent>
        </Card>

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
