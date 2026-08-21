import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { PlayCircle, ClipboardCheck, CalendarDays, Clock, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  GRUPOS,
  TURNO_TIPOS,
  nombrePorCodigo,
  type GrupoCodigo,
  type LineaCodigo,
  type PresentacionCodigo,
  type TurnoTipoCodigo,
} from "@/lib/catalogos"
import { useCatalogosLive, presentacionesPorLineaLive, velocidadesParaLive } from "@/lib/catalogosLive"
import { listarSabores, type Sabor } from "@/lib/sabores"
import {
  useTurno,
  type CondicionTanque,
  type DatosNuevoTanque,
  type DatosNuevoTurno,
  type LineaEnTurno,
  type TurnoActivo,
} from "@/lib/turno"

const fechaHoy = new Date().toLocaleDateString("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

/*
 * Formulario de "Empezar Turno". Fecha y hora NO son editables: se
 * fijan automáticamente al momento de presionar el botón (ver
 * iniciarTurno en src/lib/turno.tsx). El resto de los campos los
 * elige el supervisor y quedan fijos para el resto de la gestión
 * hasta "Finalizar Turno".
 *
 * Flujo: Turno → Grupo → Líneas a usar → Recepción (3 tanques,
 * obligatorio, va al final). Cada línea que se marca pide su propia
 * Presentación y Velocidad (la velocidad no se escribe a mano: se
 * elige entre las opciones tabuladas para esa combinación
 * línea+presentación, ver src/lib/catalogosLive.tsx) —
 * dos líneas pueden estar llenando presentaciones distintas al mismo
 * tiempo, por eso esto va por línea y no una sola vez para todo el
 * turno.
 */
export default function ComenzarTurno() {
  const { turnoActivo, cargando, iniciarTurno } = useTurno()
  const { cargando: cargandoCatalogos } = useCatalogosLive()

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Comenzar Turno" description="Registro de inicio de turno">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (turnoActivo) {
    return <TurnoYaEnCurso turno={turnoActivo} />
  }

  return <FormularioNuevoTurno onIniciar={iniciarTurno} />
}

/*
 * "Comenzar Turno" y "Finalizar Turno" son dos páginas separadas: esta
 * solo inicia. Si ya hay un turno en curso, no repite el resumen acá
 * (eso vive en Finalizar Turno, src/pages/apps/FinalizarTurno.tsx) —
 * solo avisa y manda para allá.
 */
function TurnoYaEnCurso({ turno }: { turno: TurnoActivo }) {
  return (
    <AppShell title="Comenzar Turno" description="Ya hay un turno en curso">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Ya tienes un turno en curso</CardTitle>
          <CardDescription>
            Código {turno.codigo} · {nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)} ·{" "}
            {nombrePorCodigo(GRUPOS, turno.grupo)}. Para iniciar uno nuevo, primero cierra el actual
            desde Finalizar Turno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/finalizar-turno">
              <ClipboardCheck className="size-4" />
              Ir a Finalizar Turno
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  )
}

type ConfigLinea = { presentacion: PresentacionCodigo | ""; envasesHora: number | "" }

interface TanqueForm {
  condicion: CondicionTanque | ""
  saborId: string
  volumenL: string
  lote: string
}

const numerosTanque = [1, 2, 3] as const
const tanqueVacio: TanqueForm = { condicion: "", saborId: "", volumenL: "", lote: "" }

function tanqueCompleto(t: TanqueForm) {
  if (t.condicion === "") return false
  if (t.condicion !== "VOLUMEN") return true
  const volumen = Number(t.volumenL)
  return t.saborId !== "" && t.volumenL !== "" && volumen > 0 && volumen <= 20000 && t.lote.trim() !== ""
}

function FormularioNuevoTurno({ onIniciar }: { onIniciar: (datos: DatosNuevoTurno) => Promise<{ ok: true } | { ok: false; error: string }> }) {
  const [turnoTipo, setTurnoTipo] = useState<TurnoTipoCodigo | "">("")
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const [ninguna, setNinguna] = useState(false)
  const [lineas, setLineas] = useState<LineaCodigo[]>([])
  const [config, setConfig] = useState<Partial<Record<LineaCodigo, ConfigLinea>>>({})
  const [tanques, setTanques] = useState<Record<1 | 2 | 3, TanqueForm>>({
    1: { ...tanqueVacio },
    2: { ...tanqueVacio },
    3: { ...tanqueVacio },
  })
  const [sabores, setSabores] = useState<Sabor[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { lineas: lineasCatalogo, presentaciones, velocidades } = useCatalogosLive()

  useEffect(() => {
    listarSabores().then((lista) => setSabores(lista.filter((s) => s.activo)))
  }, [])

  const horaActual = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })

  const lineasCompletas = lineas.every((l) => {
    const c = config[l]
    return c && c.presentacion !== "" && c.envasesHora !== ""
  })
  const tanquesCompletos = numerosTanque.every((n) => tanqueCompleto(tanques[n]))
  const formularioValido =
    turnoTipo !== "" && grupo !== "" && (ninguna || (lineas.length > 0 && lineasCompletas)) && tanquesCompletos

  function toggleLinea(codigo: LineaCodigo, checked: boolean) {
    setNinguna(false)
    if (checked) {
      setLineas((actual) => [...actual, codigo])
      setConfig((actual) => ({ ...actual, [codigo]: { presentacion: "", envasesHora: "" } }))
    } else {
      setLineas((actual) => actual.filter((l) => l !== codigo))
      setConfig((actual) => {
        const { [codigo]: _quitada, ...resto } = actual
        return resto
      })
    }
  }

  function toggleNinguna(checked: boolean) {
    setNinguna(checked)
    if (checked) {
      setLineas([])
      setConfig({})
    }
  }

  function setPresentacionDeLinea(codigo: LineaCodigo, presentacion: PresentacionCodigo) {
    setConfig((actual) => ({ ...actual, [codigo]: { presentacion, envasesHora: "" } }))
  }

  function setVelocidadDeLinea(codigo: LineaCodigo, envasesHora: number) {
    setConfig((actual) => {
      const actualLinea = actual[codigo]
      if (!actualLinea) return actual
      return { ...actual, [codigo]: { ...actualLinea, envasesHora } }
    })
  }

  function setTanque(numero: 1 | 2 | 3, valor: TanqueForm) {
    setTanques((actual) => ({ ...actual, [numero]: valor }))
  }

  async function handleSubmit() {
    if (!formularioValido) return
    setEnviando(true)
    setError(null)

    const lineasFinal: LineaEnTurno[] = ninguna
      ? []
      : lineas.map((l) => {
          const c = config[l]!
          return { linea: l, presentacion: c.presentacion as PresentacionCodigo, envasesHora: c.envasesHora as number }
        })

    const tanquesFinal: DatosNuevoTanque[] = numerosTanque.map((n) => {
      const t = tanques[n]
      const esVolumen = t.condicion === "VOLUMEN"
      return {
        numeroTanque: n,
        condicion: t.condicion as CondicionTanque,
        saborId: esVolumen ? t.saborId : null,
        volumenL: esVolumen ? Number(t.volumenL) : null,
        lote: esVolumen ? t.lote.trim() : null,
      }
    })

    const resultado = await onIniciar({ turnoTipo, grupo, lineas: lineasFinal, tanques: tanquesFinal })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
    }
  }

  return (
    <AppShell title="Comenzar Turno" description="Registro de inicio de turno">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Datos del turno</CardTitle>
          <CardDescription>Estos valores se mantienen fijos hasta que finalices el turno.</CardDescription>
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
                {TURNO_TIPOS.map((t) => (
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
            <Select value={grupo} onValueChange={(v) => setGrupo(v as GrupoCodigo)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un grupo" />
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

          <div className="flex flex-col gap-2">
            <Label>Líneas a usar</Label>
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              {lineasCatalogo.filter((l) => l.activo).map((l) => {
                const activa = lineas.includes(l.codigo)
                const presentacionesDisponibles = presentacionesPorLineaLive(velocidades, l.codigo)
                const c = config[l.codigo]
                const opcionesVelocidad = c?.presentacion ? velocidadesParaLive(velocidades, l.codigo, c.presentacion) : []

                return (
                  <div key={l.codigo} className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={activa}
                        disabled={ninguna}
                        onCheckedChange={(checked) => toggleLinea(l.codigo, checked === true)}
                      />
                      {l.nombre}
                    </label>

                    {activa && (
                      <div className="ml-6 grid grid-cols-2 gap-2">
                        <Select
                          value={c?.presentacion ?? ""}
                          onValueChange={(v) => setPresentacionDeLinea(l.codigo, v)}
                          disabled={presentacionesDisponibles.length === 0}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={presentacionesDisponibles.length === 0 ? "Sin datos" : "Presentación"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {presentacionesDisponibles.map((codigo) => (
                              <SelectItem key={codigo} value={codigo}>
                                {nombrePorCodigo(presentaciones, codigo)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={c?.envasesHora ? String(c.envasesHora) : ""}
                          onValueChange={(v) => setVelocidadDeLinea(l.codigo, Number(v))}
                          disabled={!c?.presentacion || opcionesVelocidad.length === 0}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Velocidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {opcionesVelocidad.map((v) => (
                              <SelectItem key={v.envasesHora} value={String(v.envasesHora)}>
                                {v.envasesHora} env/h · {v.litrosHora} L/h
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="mt-1 border-t border-border pt-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={ninguna} onCheckedChange={(checked) => toggleNinguna(checked === true)} />
                  Ninguna (parada / limpieza / mantenimiento)
                </label>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <Label>Recepción</Label>
            <CardDescription>Condición de los 3 tanques al llegar de turno.</CardDescription>
            <div className="flex flex-col gap-4 rounded-lg border border-border p-3">
              {numerosTanque.map((numero) => (
                <TanqueRecepcionCampo
                  key={numero}
                  numero={numero}
                  valor={tanques[numero]}
                  sabores={sabores}
                  onCambiar={(v) => setTanque(numero, v)}
                />
              ))}
            </div>
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
    </AppShell>
  )
}

function TanqueRecepcionCampo({
  numero,
  valor,
  sabores,
  onCambiar,
}: {
  numero: 1 | 2 | 3
  valor: TanqueForm
  sabores: Sabor[]
  onCambiar: (v: TanqueForm) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <p className="text-sm font-medium text-foreground">Tanque {numero}</p>

      <Select value={valor.condicion} onValueChange={(v) => onCambiar({ ...valor, condicion: v as CondicionTanque })}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Condición del tanque" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="VOLUMEN">Volumen en L</SelectItem>
          <SelectItem value="SUCIO">Sucio</SelectItem>
          <SelectItem value="VACIO">Vacío</SelectItem>
        </SelectContent>
      </Select>

      {valor.condicion === "VOLUMEN" && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={valor.saborId} onValueChange={(v) => onCambiar({ ...valor, saborId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sabor" />
            </SelectTrigger>
            <SelectContent>
              {sabores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre} ({s.familiaNombre})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={20000}
            placeholder="Volumen (L), máx. 20.000"
            value={valor.volumenL}
            onChange={(e) => onCambiar({ ...valor, volumenL: e.target.value })}
          />
          <Input
            className="col-span-2"
            placeholder="Lote"
            value={valor.lote}
            onChange={(e) => onCambiar({ ...valor, lote: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}
