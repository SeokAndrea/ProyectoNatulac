import { useEffect, useState, type ReactNode } from "react"
import { CalendarPlus, CheckCircle2, Loader2, PenLine, Plus, Save, Search } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo, type AreaCodigo, type GrupoCodigo, type LineaCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import { presentacionesPorLineaLive, useCatalogosLive, type PresentacionLive } from "@/lib/catalogosLive"
import { corregirProductoTerminado, obtenerTurnoDetalle, listarTurnosHistorial, type TurnoResumen } from "@/lib/historialTurnos"
import { mermaEnvasesTurno, mermaSemielaboradoTurno } from "@/lib/panelProduccion"
import { listarPersonal, type PersonalRegistrado } from "@/lib/personal"
import { listarSabores, nombreSaborConFamilia, type Sabor } from "@/lib/sabores"
import { supabase } from "@/lib/supabase"
import { fechaLocal, mermaCorrida, type TurnoActivo } from "@/lib/turno"
import { agregarFilaTurnoManual, crearTurnoManual, editarFilaTurnoManual } from "@/lib/turnoManual"

/** Mismo horario fijo por turno que ya usa Panel de Producción (src/pages/apps/PanelProduccion.tsx) — evita que haya que tipearlo a mano. */
const HORARIOS: Record<TurnoTipoCodigo, { inicio: string; fin: string }> = {
  TURNO_1: { inicio: "07:00", fin: "15:00" },
  TURNO_2: { inicio: "15:00", fin: "22:30" },
  TURNO_3: { inicio: "22:30", fin: "07:00" },
  "12X12": { inicio: "07:00", fin: "19:00" },
}

function cajasTotales(paletas: number, cajasSueltas: number, presentacionCodigo: string, presentaciones: PresentacionLive[]): number {
  const cajasXPaleta = presentaciones.find((p) => p.codigo === presentacionCodigo)?.cajasXPaleta ?? 0
  return paletas * cajasXPaleta + cajasSueltas
}

/*
 * Carga y corrección manual de turnos viejos desde un acta en papel —
 * solo Super Administrador. Dos pestañas:
 *   - CREAR TURNO: arma el turno (supervisor + turno + grupo, el área
 *     sale sola del supervisor) y después va agregando sabores de a
 *     uno (Línea, Sabor, Presentación, Paletas, Restos, Contador de
 *     línea, Litros consumidos), viendo el total acumularse, hasta
 *     Terminar con Turno.
 *   - EDITAR TURNO: busca cualquier turno por fecha (real o cargado
 *     acá) y corrige sus filas — paletas/restos siempre (reusa
 *     registrar_producto_terminado(), seguro para turnos reales) y,
 *     si la fila es de una carga manual, también contador/litros
 *     consumidos.
 * Ver supabase/migrations/20260959090000_crear_turno_manual_paso_a_paso.sql
 * y 20260958090000_corregir_producto_terminado_auditoria.sql.
 */
export default function CrearTurno() {
  const { session } = useAuth()
  const usuarioSesion = session?.username ?? ""

  return (
    <AppShell title="Crear Turno" description="Carga y corrección manual desde un acta en papel" fullWidth>
      <div className="mx-auto max-w-2xl">
        <Tabs defaultValue="crear">
          <TabsList className="h-12 p-1.5">
            <TabsTrigger value="crear" className="h-9 px-4">
              <CalendarPlus className="size-5" />
              CREAR TURNO
            </TabsTrigger>
            <TabsTrigger value="editar" className="h-9 px-4">
              <PenLine className="size-5" />
              EDITAR TURNO
            </TabsTrigger>
          </TabsList>
          <TabsContent value="crear" className="pt-4">
            <FormularioNuevo usuarioSesion={usuarioSesion} />
          </TabsContent>
          <TabsContent value="editar" className="pt-4">
            <BuscarYEditar usuarioSesion={usuarioSesion} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

function FormularioNuevo({ usuarioSesion }: { usuarioSesion: string }) {
  const [supervisores, setSupervisores] = useState<PersonalRegistrado[]>([])
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [area, setArea] = useState<AreaCodigo | "">("")
  const [supervisorUsuario, setSupervisorUsuario] = useState("")
  const [fecha, setFecha] = useState(fechaLocal(new Date()))
  const [turnoTipo, setTurnoTipo] = useState<TurnoTipoCodigo | "">("")
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const [horaInicio, setHoraInicio] = useState("07:00")
  const [horaFin, setHoraFin] = useState("15:00")
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)
  const [turno, setTurno] = useState<TurnoActivo | null>(null)

  useEffect(() => {
    listarPersonal(usuarioSesion).then((lista) =>
      setSupervisores(lista.filter((p) => p.rol === "SUPERVISOR" && p.activo && p.area !== null && p.area !== "PRUEBAS")),
    )
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [usuarioSesion])

  const supervisoresDelArea = area ? supervisores.filter((s) => s.area === area) : supervisores
  const areaSupervisor = supervisores.find((s) => s.usuario === supervisorUsuario)?.area ?? null
  const valido = area !== "" && supervisorUsuario !== "" && fecha !== "" && turnoTipo !== "" && grupo !== ""

  async function crear() {
    if (!valido) return
    setCreando(true)
    setErrorCrear(null)
    const resultado = await crearTurnoManual(usuarioSesion, {
      supervisorUsuario,
      fecha,
      turnoTipo,
      grupo,
      horaInicio,
      horaFin,
    })
    setCreando(false)
    if (!resultado.ok) {
      setErrorCrear(resultado.error)
      return
    }
    setTurno(resultado.turno)
  }

  function terminar() {
    setTurno(null)
    setSupervisorUsuario("")
    setTurnoTipo("")
    setGrupo("")
  }

  if (turno && areaSupervisor) {
    return <AgregarSabor usuarioSesion={usuarioSesion} turno={turno} areaSupervisor={areaSupervisor} sabores={sabores} onTerminar={terminar} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="size-5" />
          Crear turno
        </CardTitle>
        <CardDescription>Elegí el supervisor, turno y grupo — el área sale sola del supervisor.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Área</Label>
            <Select
              value={area}
              onValueChange={(v) => {
                setArea(v as AreaCodigo)
                setSupervisorUsuario("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                {AREAS.filter((a) => a.codigo !== "PRUEBAS").map((a) => (
                  <SelectItem key={a.codigo} value={a.codigo}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Supervisor</Label>
            <Select value={supervisorUsuario} onValueChange={setSupervisorUsuario} disabled={!area}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={area ? "Supervisor" : "Elegí un área primero"} />
              </SelectTrigger>
              <SelectContent>
                {supervisoresDelArea.map((s) => (
                  <SelectItem key={s.usuario} value={s.usuario}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Turno</Label>
            <Select
              value={turnoTipo}
              onValueChange={(v) => {
                const codigo = v as TurnoTipoCodigo
                setTurnoTipo(codigo)
                setHoraInicio(HORARIOS[codigo].inicio)
                setHoraFin(HORARIOS[codigo].fin)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Turno" />
              </SelectTrigger>
              <SelectContent>
                {TURNO_TIPOS.map((t) => (
                  <SelectItem key={t.codigo} value={t.codigo}>
                    {t.nombre}
                    {t.horario ? ` · ${t.horario}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Grupo</Label>
            <Select value={grupo} onValueChange={(v) => setGrupo(v as GrupoCodigo)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Grupo" />
              </SelectTrigger>
              <SelectContent>
                {GRUPOS.map((g) => (
                  <SelectItem key={g.codigo} value={g.codigo}>
                    {g.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hora inicio</Label>
            <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hora fin</Label>
            <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
          </div>
        </div>

        {errorCrear && (
          <p className="text-sm text-destructive" role="alert">
            {errorCrear}
          </p>
        )}

        <Button disabled={!valido || creando} onClick={crear}>
          {creando ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
          Crear turno
        </Button>
      </CardContent>
    </Card>
  )
}

interface FilaSaborForm {
  lineaCodigo: LineaCodigo | ""
  saborId: string
  presentacionVolumenMl: number | ""
  /** Como viene en el acta de papel — se traduce solo a paletas + restos según cajas/paleta de la presentación. */
  cajas: string
  envasesLlenadora: string
  litrosConsumidos: string
}

function filaSaborVacia(): FilaSaborForm {
  return { lineaCodigo: "", saborId: "", presentacionVolumenMl: "", cajas: "", envasesLlenadora: "", litrosConsumidos: "" }
}

/** Cajas → paletas + restos, según cuántas cajas entran en una paleta de esa presentación. */
function paletasYRestos(cajas: number, cajasXPaleta: number): { paletas: number; restos: number } {
  if (cajasXPaleta <= 0) return { paletas: 0, restos: cajas }
  return { paletas: Math.floor(cajas / cajasXPaleta), restos: cajas % cajasXPaleta }
}

/** Paso 2 de Crear Turno: el turno ya existe (vacío) — se van agregando sabores de a uno, viendo el total del turno crecer. */
function AgregarSabor({
  usuarioSesion,
  turno: turnoInicial,
  areaSupervisor,
  sabores,
  onTerminar,
}: {
  usuarioSesion: string
  turno: TurnoActivo
  areaSupervisor: string
  sabores: Sabor[]
  onTerminar: () => void
}) {
  const { presentaciones, lineas } = useCatalogosLive()
  const [turno, setTurno] = useState(turnoInicial)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Turno {turno.codigo} — {nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)} · {nombrePorCodigo(GRUPOS, turno.grupo)}
          </CardTitle>
          <CardDescription>Total cargado hasta ahora — agregá otro sabor o terminá.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {turno.productoTerminado.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no agregaste ningún sabor.</p>
          ) : (
            turno.productoTerminado.map((pt) => (
              <p key={pt.id} className="text-sm text-muted-foreground">
                {nombrePorCodigo(lineas, pt.linea)}: {pt.paletas} paletas + {pt.cajasSueltas} restos ={" "}
                {cajasTotales(pt.paletas, pt.cajasSueltas, pt.presentacion, presentaciones)} cajas ({pt.saborNombre})
              </p>
            ))
          )}
        </CardContent>
      </Card>

      <FormularioAgregarSabor
        usuarioSesion={usuarioSesion}
        turnoId={turno.id}
        areaSupervisor={areaSupervisor}
        sabores={sabores}
        onAgregado={setTurno}
        extra={
          <Button variant="outline" onClick={onTerminar}>
            <CheckCircle2 className="size-4" />
            Terminar con turno
          </Button>
        }
      />
    </div>
  )
}

/** El form de "Línea, Sabor, Presentación, Cajas, Contador, Litros" — compartido entre el paso 2 de Crear Turno y "Agregar sabor" dentro de Editar Turno. */
function FormularioAgregarSabor({
  usuarioSesion,
  turnoId,
  areaSupervisor,
  sabores,
  onAgregado,
  extra,
}: {
  usuarioSesion: string
  turnoId: string
  areaSupervisor: string
  sabores: Sabor[]
  onAgregado: (turno: TurnoActivo) => void
  extra?: ReactNode
}) {
  const { presentaciones, velocidades } = useCatalogosLive()
  const [lineasArea, setLineasArea] = useState<{ codigo: LineaCodigo; nombre: string }[]>([])
  const [fila, setFila] = useState<FilaSaborForm>(filaSaborVacia())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .rpc("listar_lineas", { p_area_codigo: areaSupervisor })
      .then(({ data }) => {
        const lista = (data ?? []) as { codigo: string; nombre: string; activo: boolean }[]
        setLineasArea(lista.filter((l) => l.activo).map((l) => ({ codigo: l.codigo as LineaCodigo, nombre: l.nombre })))
      })
  }, [areaSupervisor])

  function actualizar(cambios: Partial<FilaSaborForm>) {
    setFila((prev) => ({ ...prev, ...cambios }))
  }

  const presentacionesDeLinea = fila.lineaCodigo
    ? presentaciones.filter((p) => presentacionesPorLineaLive(velocidades, fila.lineaCodigo as LineaCodigo).includes(p.codigo))
    : []
  const presentacionElegida = presentaciones.find((p) => p.codigo === String(fila.presentacionVolumenMl))
  const cajasXPaleta = presentacionElegida?.cajasXPaleta ?? 0
  const { paletas: paletasCalculadas, restos: restosCalculados } = paletasYRestos(Number(fila.cajas) || 0, cajasXPaleta)

  const valido =
    fila.lineaCodigo !== "" &&
    fila.saborId !== "" &&
    fila.presentacionVolumenMl !== "" &&
    fila.cajas !== "" &&
    fila.envasesLlenadora !== "" &&
    fila.litrosConsumidos !== ""

  async function agregar() {
    if (!valido) return
    setEnviando(true)
    setError(null)
    const resultado = await agregarFilaTurnoManual(usuarioSesion, {
      turnoId,
      lineaCodigo: fila.lineaCodigo as LineaCodigo,
      saborId: fila.saborId,
      presentacionVolumenMl: Number(fila.presentacionVolumenMl),
      paletas: paletasCalculadas,
      cajasSueltas: restosCalculados,
      envasesLlenadora: Number(fila.envasesLlenadora),
      litrosConsumidos: Number(fila.litrosConsumidos),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onAgregado(resultado.turno)
    setFila(filaSaborVacia())
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="size-4" />
          Agregar sabor
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={fila.lineaCodigo}
            onValueChange={(v) => actualizar({ lineaCodigo: v as LineaCodigo, presentacionVolumenMl: "" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Línea" />
            </SelectTrigger>
            <SelectContent>
              {lineasArea.map((l) => (
                <SelectItem key={l.codigo} value={l.codigo}>
                  {l.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fila.saborId} onValueChange={(v) => actualizar({ saborId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sabor" />
            </SelectTrigger>
            <SelectContent>
              {sabores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {nombreSaborConFamilia(s.nombre, s.familiaNombre)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={fila.presentacionVolumenMl === "" ? "" : String(fila.presentacionVolumenMl)}
            onValueChange={(v) => actualizar({ presentacionVolumenMl: Number(v) })}
            disabled={!fila.lineaCodigo}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={fila.lineaCodigo ? "Presentación" : "Elegí una línea primero"} />
            </SelectTrigger>
            <SelectContent>
              {presentacionesDeLinea.map((p) => (
                <SelectItem key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            placeholder="Contador de línea"
            value={fila.envasesLlenadora}
            onChange={(e) => actualizar({ envasesLlenadora: e.target.value })}
          />
          <Input
            type="number"
            min={0}
            placeholder="Cajas (como en el acta)"
            value={fila.cajas}
            onChange={(e) => actualizar({ cajas: e.target.value })}
            disabled={!fila.presentacionVolumenMl}
          />
          <Input
            className="col-span-2"
            type="number"
            min={0}
            placeholder="Litros consumidos del tanque (semielaborado)"
            value={fila.litrosConsumidos}
            onChange={(e) => actualizar({ litrosConsumidos: e.target.value })}
          />
        </div>

        {fila.cajas !== "" && fila.presentacionVolumenMl !== "" && (
          <p className="text-xs text-muted-foreground">
            {fila.cajas} cajas ÷ {cajasXPaleta} cajas/paleta = <span className="font-medium text-foreground">{paletasCalculadas} paletas</span> +{" "}
            <span className="font-medium text-foreground">{restosCalculados} restos</span>
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button disabled={!valido || enviando} onClick={agregar}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Agregar sabor
          </Button>
          {extra}
        </div>
      </CardContent>
    </Card>
  )
}

function BuscarYEditar({ usuarioSesion }: { usuarioSesion: string }) {
  const { presentaciones, lineas } = useCatalogosLive()
  const [fecha, setFecha] = useState(fechaLocal(new Date()))
  const [resultados, setResultados] = useState<TurnoResumen[]>([])
  const [buscando, setBuscando] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const [resumenAbierto, setResumenAbierto] = useState<TurnoResumen | null>(null)
  const [turno, setTurno] = useState<TurnoActivo | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [mostrarAgregar, setMostrarAgregar] = useState(false)

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  async function buscar() {
    setBuscando(true)
    const lista = await listarTurnosHistorial(usuarioSesion, { fechaDesde: fecha, fechaHasta: fecha })
    setResultados(lista)
    setBuscando(false)
    setBuscado(true)
  }

  async function abrir(resumen: TurnoResumen) {
    setResumenAbierto(resumen)
    setMostrarAgregar(false)
    setCargandoDetalle(true)
    const detalle = await obtenerTurnoDetalle(usuarioSesion, resumen.id)
    setTurno(detalle)
    setCargandoDetalle(false)
  }

  async function recargar() {
    if (!turno) return
    const detalle = await obtenerTurnoDetalle(usuarioSesion, turno.id)
    setTurno(detalle)
  }

  const mermaEnvases = turno ? mermaEnvasesTurno(turno, presentaciones) : null
  const mermaSemielaborado = turno ? mermaSemielaboradoTurno(turno) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="size-5" />
          Buscar y corregir un turno
        </CardTitle>
        <CardDescription>Cualquier turno, real o cargado acá — si faltó una paleta o el dato no cerraba, corregilo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Button variant="outline" disabled={buscando} onClick={buscar}>
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Buscar
          </Button>
        </div>

        {buscado && resultados.length === 0 && !turno && <p className="text-sm text-muted-foreground">Ningún turno ese día.</p>}

        {resultados.length > 0 && !turno && (
          <div className="flex flex-col gap-1.5">
            {resultados.map((r) => (
              <button
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() => abrir(r)}
              >
                <span>
                  {r.codigo} · {r.supervisorNombre}
                </span>
                <span className="text-xs text-muted-foreground">{nombrePorCodigo(AREAS, r.area)}</span>
              </button>
            ))}
          </div>
        )}

        {cargandoDetalle && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {turno && !cargandoDetalle && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Turno {turno.codigo}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTurno(null)
                  setResumenAbierto(null)
                }}
              >
                Cerrar
              </Button>
            </div>

            {turno.productoTerminado.length > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumen por sabor</p>
                {turno.productoTerminado.map((pt) => {
                  const merma = pt.turnoLineaId ? mermaCorrida(pt.turnoLineaId, turno, presentaciones) : null
                  return (
                    <div key={pt.id} className="flex items-center justify-between gap-2">
                      <span>
                        {pt.saborNombre ?? "sin sabor"} · {pt.litrosProducidos.toLocaleString("es-CO")} L
                      </span>
                      <span className="num font-medium">{merma !== null ? `${merma.pct}% merma` : "—"}</span>
                    </div>
                  )
                })}
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/70 pt-1 font-medium">
                  <span>Merma de envase (turno)</span>
                  <span className="num">{mermaEnvases?.pct !== null && mermaEnvases !== null ? `${mermaEnvases.pct}%` : "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2 font-medium">
                  <span>Merma de semielaborado (turno)</span>
                  <span className="num">
                    {mermaSemielaborado?.pct !== null && mermaSemielaborado !== null ? `${mermaSemielaborado.pct}%` : "—"}
                  </span>
                </div>
              </div>
            )}

            {turno.productoTerminado.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este turno no tiene Producto Terminado registrado.</p>
            ) : (
              turno.productoTerminado.map((pt) => {
                const linea = turno.lineas.find((l) => l.id === pt.turnoLineaId)
                const lote = linea?.loteId ? turno.preparaciones.find((p) => p.id === linea.loteId) : null
                const esManual = lote?.lote === "ACTA"
                return (
                  <FilaEditable
                    key={pt.id}
                    usuarioSesion={usuarioSesion}
                    turnoLineaId={pt.turnoLineaId}
                    nombreLinea={nombrePorCodigo(lineas, pt.linea)}
                    saborNombre={pt.saborNombre}
                    presentacionNombre={nombrePorCodigo(presentaciones, pt.presentacion)}
                    paletas={pt.paletas}
                    cajasSueltas={pt.cajasSueltas}
                    cajasTotales={cajasTotales(pt.paletas, pt.cajasSueltas, pt.presentacion, presentaciones)}
                    esManual={esManual}
                    envasesLlenadoraInicial={esManual ? (turno.contadores.find((c) => c.turnoLineaId === pt.turnoLineaId)?.envasesLlenadora ?? 0) : null}
                    litrosConsumidosInicial={esManual ? (lote?.volumenInicialL ?? 0) : null}
                    editadoPorNombre={pt.editadoPorNombre}
                    onGuardado={recargar}
                  />
                )
              })
            )}

            {mostrarAgregar ? (
              <FormularioAgregarSabor
                usuarioSesion={usuarioSesion}
                turnoId={turno.id}
                areaSupervisor={resumenAbierto?.area ?? ""}
                sabores={sabores}
                onAgregado={(t) => {
                  setTurno(t)
                  setMostrarAgregar(false)
                }}
                extra={
                  <Button variant="ghost" onClick={() => setMostrarAgregar(false)}>
                    Cancelar
                  </Button>
                }
              />
            ) : (
              <Button variant="outline" size="sm" className="self-start" onClick={() => setMostrarAgregar(true)}>
                <Plus className="size-3.5" />
                Agregar sabor
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FilaEditable({
  usuarioSesion,
  turnoLineaId,
  nombreLinea,
  saborNombre,
  presentacionNombre,
  paletas: paletasIniciales,
  cajasSueltas: cajasSueltasIniciales,
  cajasTotales: cajasTotalesIniciales,
  esManual,
  envasesLlenadoraInicial,
  litrosConsumidosInicial,
  editadoPorNombre,
  onGuardado,
}: {
  usuarioSesion: string
  turnoLineaId: string | null
  nombreLinea: string
  saborNombre: string | null
  presentacionNombre: string
  paletas: number
  cajasSueltas: number
  cajasTotales: number
  esManual: boolean
  envasesLlenadoraInicial: number | null
  litrosConsumidosInicial: number | null
  editadoPorNombre: string | null
  onGuardado: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [paletas, setPaletas] = useState(String(paletasIniciales))
  const [cajasSueltas, setCajasSueltas] = useState(String(cajasSueltasIniciales))
  const [envasesLlenadora, setEnvasesLlenadora] = useState(String(envasesLlenadoraInicial ?? 0))
  const [litrosConsumidos, setLitrosConsumidos] = useState(String(litrosConsumidosInicial ?? 0))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!turnoLineaId) return
    setGuardando(true)
    setError(null)
    const resultado = esManual
      ? await editarFilaTurnoManual(usuarioSesion, {
          turnoLineaId,
          paletas: Number(paletas),
          cajasSueltas: Number(cajasSueltas),
          envasesLlenadora: Number(envasesLlenadora),
          litrosConsumidos: Number(litrosConsumidos),
        })
      : await corregirProductoTerminado(usuarioSesion, {
          turnoLineaId,
          paletas: Number(paletas),
          cajasSueltas: Number(cajasSueltas),
        })
    setGuardando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setEditando(false)
    onGuardado()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground">
            {nombreLinea} · {saborNombre ?? "sin sabor"} · {presentacionNombre}: {paletasIniciales} paletas + {cajasSueltasIniciales}{" "}
            restos = {cajasTotalesIniciales} cajas
          </p>
          {editadoPorNombre && <Badge variant="warning">EDITADO POR: {editadoPorNombre.toUpperCase()}</Badge>}
        </div>
        {!editando && turnoLineaId && (
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            <PenLine className="size-3.5" />
            Editar
          </Button>
        )}
      </div>

      {editando && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" min={0} placeholder="Paletas" value={paletas} onChange={(e) => setPaletas(e.target.value)} />
            <Input type="number" min={0} placeholder="Restos" value={cajasSueltas} onChange={(e) => setCajasSueltas(e.target.value)} />
            {esManual && (
              <>
                <Input
                  type="number"
                  min={0}
                  placeholder="Contador de línea"
                  value={envasesLlenadora}
                  onChange={(e) => setEnvasesLlenadora(e.target.value)}
                />
                <Input
                  type="number"
                  min={0}
                  placeholder="Litros consumidos"
                  value={litrosConsumidos}
                  onChange={(e) => setLitrosConsumidos(e.target.value)}
                />
              </>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={guardando} onClick={guardar}>
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
