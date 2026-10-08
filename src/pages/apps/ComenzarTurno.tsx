import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PlayCircle, ClipboardCheck, CalendarDays, Clock, Loader2, UserCheck, Repeat } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RevisionInicioTurno } from "@/components/RevisionInicioTurno"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/lib/auth"
import {
  grupoDeRotacion,
  guardarEsquemaTurnos,
  guardarTurnosAutomaticos,
  obtenerAjustesTurnos,
  type AjustesTurnos,
} from "@/lib/ajustesTurnos"
import { GRUPOS, TURNO_TIPOS, nombreGrupo, nombrePorCodigo, type AreaCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import { puede } from "@/lib/permisos"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { useSesionTurno, type ResponsableTurno } from "@/lib/sesionTurno"
import { franjaDeHora, franjaParaIniciar, franjaSiguienteTemprano, horaCortaPlanta, horaDelDiaPlanta } from "@/lib/tiempoPlanta"
import { HORA_OFRECER_T2_NOCHE, esT2DelDia } from "@/lib/turno12x12"

const fechaHoy = new Date().toLocaleDateString("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** Turnos que se inician a mano. El 12x12 ya no es un turno aparte: se trabaja como T1/T2/T3 (ver AjustesDeTurnos). */
const TURNOS_NORMALES = TURNO_TIPOS.filter((t) => t.codigo !== "12X12")

/*
 * Comenzar Turno. Día normal: el supervisor inicia su turno (Turno + Grupo)
 * y hace la revisión de inicio aquí mismo. Lo nuevo (migración 20261080):
 *   - Si el respaldo abrió el turno solo ("Sin responsable"), se ASUME: se
 *     elige el grupo y se queda como responsable.
 *   - Si el turno abierto tiene otro responsable, se puede tomar el RELEVO
 *     (en 12x12 el T2 del día no se releva: se comienza el T2 de la noche).
 *   - Arriba, en una línea, los interruptores del área: 12x12 y respaldo automático.
 * Cualquiera con permiso puede cargar datos en el turno abierto aunque no lo
 * haya asumido; todo queda firmado por usuario.
 */
export default function ComenzarTurno() {
  const sesion = useSesionTurno()
  const { session } = useAuth()
  const { tanques, cargando: cargandoPreparacion } = usePreparacion()
  const { corridas, cargando: cargandoProduccion } = useProduccion()
  const [sabores, setSabores] = useState<Sabor[]>([])

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const cargando = sesion.cargando || cargandoPreparacion || cargandoProduccion
  // SUPERADMINISTRADOR no tiene área fija (session.area null): hoy todos los Super Admin son de Aséptico.
  const area: AreaCodigo = session?.area ?? "ASEPTICO"

  if (cargando) {
    return (
      <AppShell title="Comenzar Turno" description="Registro de inicio de turno">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!sesion.turnoId) {
    return (
      <AppShell title="Comenzar Turno" description="Registro de inicio de turno">
        <div className="mx-auto flex max-w-lg flex-col gap-4">
          <AjustesDeTurnos area={area} />
          <FormularioNuevoTurno area={area} onIniciar={sesion.iniciarTurno} />
        </div>
      </AppShell>
    )
  }

  const soyResponsable = !sesion.sinResponsable && sesion.supervisorUsuario === session?.username.toLowerCase()
  if (!soyResponsable) {
    // El turno abierto no es el que toca comenzar ahora (ya terminó, o falta 1 h o menos para el
    // cambio): se ofrece comenzar el de ahora, que cierra el abierto. Si el abierto sigue siendo el
    // de esta hora (llegó antes), también se puede asumir ese.
    const objetivo = franjaParaIniciar()
    const actual = franjaDeHora()
    const esElObjetivo = sesion.fecha === objetivo.fecha && sesion.turnoTipo === objetivo.tipo
    const esElActual = sesion.fecha === actual.fecha && sesion.turnoTipo === actual.tipo
    // Llegó temprano (1–4 h antes del cambio): debajo del relevo, comenzar ya el siguiente.
    const siguiente = franjaSiguienteTemprano()
    const ofrecerSiguiente = esElObjetivo && esElActual && (siguiente.fecha !== actual.fecha || siguiente.tipo !== actual.tipo)
    // 12x12: el T2 del día no se releva; desde las 18:00 se cierra y se comienza el T2 de la noche.
    const t2Noche = esT2DelDia(sesion.esquema, sesion.turnoTipo, sesion.horaInicio) && horaDelDiaPlanta() >= HORA_OFRECER_T2_NOCHE
    return (
      <AppShell title="Comenzar Turno" description={`Turno ${sesion.codigo}`}>
        <div className="mx-auto flex max-w-lg flex-col gap-4">
          <AjustesDeTurnos area={area} />
          {t2Noche ? (
            <ComenzarTurnoDeAhora area={area} objetivo={{ tipo: "TURNO_2", fecha: sesion.fecha! }} terminado={false} noche />
          ) : (
            <>
              {!esElObjetivo && <ComenzarTurnoDeAhora area={area} objetivo={objetivo} terminado={!esElActual} />}
              {(esElObjetivo || esElActual) && <AsumirTurno />}
              {ofrecerSiguiente && <ComenzarTurnoDeAhora area={area} objetivo={siguiente} terminado={false} temprano />}
            </>
          )}
        </div>
      </AppShell>
    )
  }

  /** Revisión de inicio completa: los 3 tanques y toda corrida activa quedaron confirmados. */
  const revisionCompleta =
    tanques.every((t) => t.confirmadoInicioEn !== null) && corridas.filter((c) => c.activa).every((c) => c.confirmadoInicioEn !== null)

  if (!revisionCompleta) {
    return (
      <AppShell title="Comenzar Turno" description={`Turno ${sesion.codigo} · revisa tanques y líneas`} fullWidth>
        <RevisionInicioTurno sabores={sabores} />
      </AppShell>
    )
  }

  return (
    <AppShell title="Comenzar Turno" description="Ya hay un turno en curso">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <AjustesDeTurnos area={area} />
        <TurnoYaEnCurso />
      </div>
    </AppShell>
  )
}

/** Quién estuvo a cargo del turno, en orden (relevos incluidos). */
function ListaResponsables({ responsables, fecha }: { responsables: ResponsableTurno[]; fecha: string | null }) {
  if (responsables.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {responsables.map((r) => (
        <li key={`${r.usuario}-${r.desde}`} className="flex items-center justify-between gap-2">
          <span className="text-foreground">{r.nombre}</span>
          <span className="text-xs text-muted-foreground">
            {r.motivo === "RELEVO" ? "Relevo · " : ""}
            {fecha ? horaCortaPlanta(r.desde, fecha) : ""} – {r.hasta && fecha ? horaCortaPlanta(r.hasta, fecha) : "ahora"}
          </span>
        </li>
      ))}
    </ul>
  )
}

/*
 * "Comenzar Turno" y "Finalizar Turno" son dos páginas separadas: esta
 * solo inicia. Si ya hay un turno en curso y la revisión de inicio ya
 * quedó completa, no repite el resumen aquí (eso vive en Finalizar
 * Turno, src/pages/apps/FinalizarTurno.tsx) — solo avisa y manda para
 * allá.
 */
function TurnoYaEnCurso() {
  const sesion = useSesionTurno()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ya tienes un turno en curso</CardTitle>
        <CardDescription>
          Código {sesion.codigo} · {nombrePorCodigo(TURNO_TIPOS, sesion.turnoTipo!)} ·{" "}
          {nombreGrupo(sesion.grupo!)}
          {sesion.esquema === "12x12" ? " · 12x12" : ""}. Para iniciar uno nuevo, primero cierra el actual desde
          Finalizar Turno.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ListaResponsables responsables={sesion.responsables} fecha={sesion.fecha} />
        <GrupoDelTurno />
        <Button asChild className="w-full">
          <Link to="/finalizar-turno">
            <ClipboardCheck className="size-4" />
            Ir a Finalizar Turno
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/*
 * Turno abierto que no es mío: o lo abrió el respaldo sin responsable
 * (se asume), o está a cargo de otra persona (se toma el relevo). El T2 del
 * día de 12x12 no pasa por acá desde las 18:00: se comienza el de la noche.
 */
function AsumirTurno() {
  const sesion = useSesionTurno()
  const { session } = useAuth()
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tomar el relevo le quita el turno a otra persona: pide un segundo clic.
  const [confirmandoRelevo, setConfirmandoRelevo] = useState(false)

  const area: AreaCodigo = session?.area ?? "ASEPTICO"
  const grupoRotacion = useGrupoDeRotacion(area, sesion.fecha, sesion.turnoTipo)
  useEffect(() => {
    if (grupoRotacion) setGrupo((g) => g || grupoRotacion)
  }, [grupoRotacion])

  const puedeAsumir = puede(session, "TURNO_ASUMIR")
  const esRelevo = !sesion.sinResponsable
  const valido = !sesion.grupoPendiente || grupo !== ""

  async function asumir() {
    if (!valido) return
    if (esRelevo && !confirmandoRelevo) {
      setConfirmandoRelevo(true)
      return
    }
    setEnviando(true)
    setError(null)
    const r = await sesion.asumirTurno(grupo === "" ? null : grupo)
    setEnviando(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {esRelevo ? "Turno a cargo de otra persona" : "Turno abierto sin responsable"}
          {sesion.esquema === "12x12" && <Badge variant="outline">12x12</Badge>}
        </CardTitle>
        <CardDescription>
          {sesion.codigo} · {nombrePorCodigo(TURNO_TIPOS, sesion.turnoTipo!)}
          {esRelevo
            ? ` · responsable: ${sesion.supervisorNombre}.`
            : ". Lo abrió el sistema porque nadie hizo el relevo a tiempo."}{" "}
          Puedes cargar datos sin asumirlo; todo queda registrado con tu usuario.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ListaResponsables responsables={sesion.responsables} fecha={sesion.fecha} />

        {sesion.grupoPendiente && (
          <div className="flex flex-col gap-2">
            <Label>Grupo</Label>
            <SelectorGrupo value={grupo} rotacion={grupoRotacion} onChange={setGrupo} />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {puedeAsumir ? (
          <Button className="w-full" disabled={!valido || enviando} onClick={asumir}>
            {enviando ? (
              <Loader2 className="size-4 animate-spin" />
            ) : esRelevo ? (
              <Repeat className="size-4" />
            ) : (
              <UserCheck className="size-4" />
            )}
            {esRelevo
              ? confirmandoRelevo
                ? `Sí, quedo a cargo en lugar de ${sesion.supervisorNombre}`
                : "Tomar el relevo"
              : "Asumir turno"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">No tienes permiso para asumir turnos.</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Grupo que le toca a ese turno por la rotación semanal (null mientras carga, o si el área no tiene rotación). */
function useGrupoDeRotacion(area: AreaCodigo, fecha: string | null, turnoTipo: TurnoTipoCodigo | "" | null): GrupoCodigo | null {
  const [grupo, setGrupo] = useState<GrupoCodigo | null>(null)
  useEffect(() => {
    if (!fecha || !turnoTipo) {
      setGrupo(null)
      return
    }
    let vigente = true
    grupoDeRotacion(area, fecha, turnoTipo).then((g) => {
      if (vigente) setGrupo(g)
    })
    return () => {
      vigente = false
    }
  }, [area, fecha, turnoTipo])
  return grupo
}

/** Selector de grupo; marca cuál es el de la rotación. */
function SelectorGrupo({
  value,
  rotacion,
  onChange,
  disabled,
}: {
  value: GrupoCodigo | ""
  rotacion: GrupoCodigo | null
  onChange: (grupo: GrupoCodigo) => void
  disabled?: boolean
}) {
  return (
    <>
      <Select value={value} onValueChange={(v) => onChange(v as GrupoCodigo)} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Selecciona un grupo" />
        </SelectTrigger>
        <SelectContent>
          {GRUPOS.map((g) => (
            <SelectItem key={g.codigo} value={g.codigo}>
              {g.nombre}
              {g.codigo === rotacion ? " · rotación" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rotacion && value !== "" && value !== rotacion && (
        <p className="text-xs text-warning-foreground">Por la rotación de esta semana le toca al {nombreGrupo(rotacion)}.</p>
      )}
    </>
  )
}

/*
 * El turno abierto no es el que toca comenzar ahora: ya terminó (ej. el T3
 * que quedó abierto y son las 7:20) o falta 1 h o menos para el cambio. Se
 * comienza el de ahora: el servidor cierra el abierto entregando las
 * corridas activas y el nuevo las hereda (migración 20261087). Cierra el
 * turno de otra persona: pide un segundo clic. `noche`: 12x12, el T2 del día
 * se cierra y se comienza el T2 de la noche (migración 20261106). `temprano`:
 * faltan 1–4 h para el cambio; va debajo del relevo (migración 20261108).
 */
function ComenzarTurnoDeAhora({
  area,
  objetivo,
  terminado,
  noche = false,
  temprano = false,
}: {
  area: AreaCodigo
  objetivo: { tipo: TurnoTipoCodigo; fecha: string }
  terminado: boolean
  noche?: boolean
  temprano?: boolean
}) {
  const sesion = useSesionTurno()
  const { session } = useAuth()
  const grupoRotacion = useGrupoDeRotacion(area, objetivo.fecha, objetivo.tipo)
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (grupoRotacion) setGrupo((g) => g || grupoRotacion)
  }, [grupoRotacion])

  const nombreObjetivo = `${nombrePorCodigo(TURNO_TIPOS, objetivo.tipo)}${noche ? " (noche)" : ""}`
  const nombreAbierto = nombrePorCodigo(TURNO_TIPOS, sesion.turnoTipo!)
  const [, mesAbierto, diaAbierto] = (sesion.fecha ?? "").split("-")

  async function comenzar() {
    if (grupo === "") return
    if (!confirmando) {
      setConfirmando(true)
      return
    }
    setEnviando(true)
    setError(null)
    const r = await sesion.iniciarTurno(objetivo.tipo, grupo)
    setEnviando(false)
    if (!r.ok) {
      setError(r.error)
      setConfirmando(false)
    }
  }

  if (!puede(session, "TURNO_ASUMIR")) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {terminado ? `El turno ${sesion.codigo} ya terminó` : `¿Vienes para el ${nombreObjetivo}?`}
          {noche && <Badge variant="outline">12x12</Badge>}
        </CardTitle>
        <CardDescription>
          {noche ? (
            <>
              A las 19:00 el Turno 2 del día se cierra con su acta y el supervisor de la noche comienza otro.
              {!sesion.sinResponsable && ` Lo ideal es que ${sesion.supervisorNombre} lo finalice primero; si no, su acta queda pendiente.`}{" "}
              El nuevo sigue con los tanques y las líneas como están.
            </>
          ) : temprano ? (
            <>
              Si llegaste antes para el {nombreObjetivo} ({TURNO_TIPOS.find((t) => t.codigo === objetivo.tipo)?.horario}), puedes
              comenzarlo ya: el {sesion.codigo} se cierra y el nuevo sigue con los tanques y las líneas como están. Si tomas el
              relevo de arriba, al llegar la hora el {nombreObjetivo} se abre a tu nombre.
            </>
          ) : (
            <>
              {terminado
                ? `Es el ${nombreAbierto} del ${diaAbierto}/${mesAbierto}${sesion.sinResponsable ? ", sin responsable" : `, a cargo de ${sesion.supervisorNombre}`}. `
                : "Falta poco para el cambio de turno. "}
              Al comenzar el {nombreObjetivo}, el {sesion.codigo} se cierra y el nuevo sigue con los tanques y las líneas como
              están.{!terminado && " Si sigues en el turno de ahora, asúmelo abajo."}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Grupo</Label>
          <SelectorGrupo
            value={grupo}
            rotacion={grupoRotacion}
            onChange={(g) => {
              setGrupo(g)
              setConfirmando(false)
            }}
            disabled={enviando}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="w-full" disabled={grupo === "" || enviando} onClick={comenzar}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          {confirmando ? `Sí, cerrar ${sesion.codigo} y comenzar el ${nombreObjetivo}` : `Comenzar ${nombreObjetivo}`}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Grupo del turno en curso; el responsable lo puede cambiar si ese día no se cumplió la rotación. */
function GrupoDelTurno() {
  const sesion = useSesionTurno()
  const { session } = useAuth()
  const area: AreaCodigo = session?.area ?? "ASEPTICO"
  const grupoRotacion = useGrupoDeRotacion(area, sesion.fecha, sesion.turnoTipo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiar(g: GrupoCodigo) {
    if (g === sesion.grupo) return
    setGuardando(true)
    setError(null)
    const r = await sesion.cambiarGrupo(g)
    setGuardando(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Grupo del turno</Label>
      <SelectorGrupo
        value={sesion.grupoPendiente ? "" : (sesion.grupo ?? "")}
        rotacion={grupoRotacion}
        onChange={cambiar}
        disabled={guardando}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function FormularioNuevoTurno({
  area,
  onIniciar,
}: {
  area: AreaCodigo
  onIniciar: (turnoTipo: TurnoTipoCodigo, grupo: GrupoCodigo) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  // Viene elegido el turno de ahora, o el siguiente si falta 1 h o menos (el que llega antes). Se puede cambiar.
  const [turnoTipo, setTurnoTipo] = useState<TurnoTipoCodigo | "">(() => franjaParaIniciar().tipo)
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const grupoRotacion = useGrupoDeRotacion(area, franjaParaIniciar().fecha, turnoTipo)
  const [grupoTocado, setGrupoTocado] = useState(false)
  // El grupo viene de la rotación mientras no lo cambien a mano.
  useEffect(() => {
    if (!grupoTocado && grupoRotacion) setGrupo(grupoRotacion)
  }, [grupoRotacion, grupoTocado])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const horaActual = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
  const formularioValido = turnoTipo !== "" && grupo !== ""

  async function handleSubmit() {
    if (!formularioValido) return
    setEnviando(true)
    setError(null)

    const resultado = await onIniciar(turnoTipo, grupo)
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del turno</CardTitle>
        <CardDescription>
          Estos valores se mantienen fijos hasta que finalices el turno. Después revisas tanques y
          líneas aquí mismo, antes de arrancar producción.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4" />
            <span className="capitalize">{fechaHoy}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4" />
            <span>{horaActual} (se registra al confirmar)</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Turno</Label>
          <Select value={turnoTipo} onValueChange={(v) => setTurnoTipo(v as TurnoTipoCodigo)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un turno" />
            </SelectTrigger>
            <SelectContent>
              {TURNOS_NORMALES.map((t) => (
                <SelectItem key={t.codigo} value={t.codigo}>
                  {t.nombre}
                  {t.horario ? ` · ${t.horario}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Grupo</Label>
          <SelectorGrupo
            value={grupo}
            rotacion={grupoRotacion}
            onChange={(v) => {
              setGrupoTocado(true)
              setGrupo(v)
            }}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="mt-2 w-full" disabled={!formularioValido || enviando} onClick={handleSubmit}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          Empezar Turno
        </Button>
      </CardContent>
    </Card>
  )
}

/*
 * Interruptores del área, en una sola línea y solo para quien puede usarlos:
 *   - 12x12 (ESQUEMA_TURNOS): encendido = dos supervisores (7–19 y 19–7). A las
 *     19:00 se cierra el T2 del día y se abre el de la noche. Se aplica al turno abierto y a
 *     los siguientes (migración 20261085).
 *   - Respaldo automático (solo el dueño).
 */
function AjustesDeTurnos({ area }: { area: AreaCodigo }) {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  const [ajustes, setAjustes] = useState<AjustesTurnos | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeEsquema = puede(session, "ESQUEMA_TURNOS")
  const esDueno = session?.esDueno ?? false

  useEffect(() => {
    if (!puedeEsquema && !esDueno) return
    obtenerAjustesTurnos(area).then(setAjustes)
  }, [area, puedeEsquema, esDueno])

  if ((!puedeEsquema && !esDueno) || !ajustes || !session) return null

  const es12x12 = ajustes.esquema === "12x12"

  async function cambiar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setGuardando(true)
    setError(null)
    const r = await accion()
    if (!r.ok) setError(r.error)
    setAjustes(await obtenerAjustesTurnos(area))
    // El 12x12 también cambia el turno abierto: se refresca sin pantalla de carga.
    await sesion.refrescar()
    setGuardando(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      {puedeEsquema && (
        <label
          className="flex cursor-pointer items-center gap-2"
          title="Dos supervisores: 7:00 a 19:00 y 19:00 a 7:00. Se guarda como turnos 1, 2 y 3; a las 19:00 se cierra el Turno 2 y el de la noche abre otro."
        >
          <Switch
            checked={es12x12}
            disabled={guardando}
            onCheckedChange={(v) => cambiar(() => guardarEsquemaTurnos(session.username, area, v ? "12x12" : "3x8"))}
          />
          <span className="font-medium text-foreground">12x12</span>
          <span className="text-xs text-muted-foreground">{es12x12 ? "Encendido · Turno 2 se parte a las 19:00" : "Apagado"}</span>
        </label>
      )}
      {esDueno && (
        <label
          className="flex cursor-pointer items-center gap-2"
          title="Si 30 min después de la hora de inicio nadie inició el turno, el sistema lo abre sin responsable para que alguien lo asuma."
        >
          <Switch
            checked={ajustes.turnosAutomaticos}
            disabled={guardando}
            onCheckedChange={(v) => cambiar(() => guardarTurnosAutomaticos(session.username, area, v))}
          />
          <span className="font-medium text-foreground">Respaldo automático</span>
          <span className="text-xs text-muted-foreground">{ajustes.turnosAutomaticos ? "Encendido" : "Apagado"}</span>
        </label>
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  )
}
