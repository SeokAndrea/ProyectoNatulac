import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { PlayCircle, ClipboardCheck, CalendarDays, Clock, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GRUPOS, TURNO_TIPOS, nombrePorCodigo, type GrupoCodigo, type TurnoTipoCodigo } from "@/lib/catalogos"
import { useTurno, type DatosNuevoTurno, type TurnoActivo } from "@/lib/turno"

const fechaHoy = new Date().toLocaleDateString("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
})

/*
 * Formulario de "Empezar Turno": solo Turno + Grupo (fecha/hora se
 * fijan automáticamente al crear el turno, ver iniciarTurno en
 * src/lib/turno.tsx). Líneas y tanques NO se piden acá — son estado
 * continuo que se hereda solo del turno anterior de la misma área;
 * al confirmar, se manda derecho a Recepción
 * (src/pages/apps/Recepcion.tsx) para revisarlos.
 */
export default function ComenzarTurno() {
  const { turnoActivo, cargando, iniciarTurno } = useTurno()
  const navigate = useNavigate()

  if (cargando) {
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

  return <FormularioNuevoTurno onIniciar={iniciarTurno} onCreado={() => navigate("/recepcion")} />
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

function FormularioNuevoTurno({
  onIniciar,
  onCreado,
}: {
  onIniciar: (datos: DatosNuevoTurno) => Promise<{ ok: true } | { ok: false; error: string }>
  onCreado: () => void
}) {
  const [turnoTipo, setTurnoTipo] = useState<TurnoTipoCodigo | "">("")
  const [grupo, setGrupo] = useState<GrupoCodigo | "">("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const horaActual = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
  const formularioValido = turnoTipo !== "" && grupo !== ""

  async function handleSubmit() {
    if (!formularioValido) return
    setEnviando(true)
    setError(null)

    const resultado = await onIniciar({ turnoTipo, grupo })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    onCreado()
  }

  return (
    <AppShell title="Comenzar Turno" description="Registro de inicio de turno">
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Datos del turno</CardTitle>
          <CardDescription>
            Estos valores se mantienen fijos hasta que finalices el turno. Después vas a Recepción para
            revisar tanques y líneas.
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
