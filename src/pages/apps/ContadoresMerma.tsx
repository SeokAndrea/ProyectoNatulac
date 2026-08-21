import { useState } from "react"
import { Link } from "react-router-dom"
import { Gauge, AlertTriangle, CircleOff, Info, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { ListaContadores } from "@/components/ListaContadores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { nombrePorCodigo, type LineaCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { LIMITE_MERMA, useTurno } from "@/lib/turno"

/*
 * "Contador": conteo de envases por línea (llenadora / buenos /
 * desechados) del turno en curso — hay una llenadora por línea, por
 * eso el conteo depende de cuántas y cuáles líneas se eligieron en
 * Comenzar Turno. La merma teórica (desechados / llenadora) no
 * debería superar el 3% (LIMITE_MERMA en src/lib/turno.tsx); si lo
 * supera, la justificación es obligatoria porque queda como respaldo
 * para el acta.
 *
 * Buenos + desechados NO tiene que sumar exacto el total de la
 * llenadora (confirmado con un caso real: 7061 llenadora, 6874
 * buenos, 162 desechados — no cierra y es válido), así que esa
 * diferencia se muestra como dato informativo, nunca bloquea el
 * registro.
 */
export default function ContadoresMerma() {
  const { turnoActivo, cargando, registrarContador } = useTurno()

  if (cargando) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por línea del turno en curso">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por línea del turno en curso">
        <EmptyState
          icon={Gauge}
          title="Primero debes iniciar un turno"
          description="Los contadores se asocian al turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  if (turnoActivo.lineas.length === 0) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por línea del turno en curso">
        <EmptyState
          icon={CircleOff}
          title="El turno está registrado como parada"
          description="No se seleccionaron líneas en uso para este turno, así que no hay llenadoras para contar."
        />
      </AppShell>
    )
  }

  return (
    <AppShell title="Contadores y Merma" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <FormularioContador lineas={turnoActivo.lineas.map((l) => l.linea)} onRegistrar={registrarContador} />
        {turnoActivo.contadores.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrado en este turno</CardTitle>
            </CardHeader>
            <CardContent>
              <ListaContadores contadores={turnoActivo.contadores} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function FormularioContador({
  lineas,
  onRegistrar,
}: {
  lineas: LineaCodigo[]
  onRegistrar: (datos: {
    linea: LineaCodigo
    envasesLlenadora: number
    envasesBuenos: number
    envasesDesechados: number
    justificacion: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const { lineas: lineasCatalogo } = useCatalogosLive()
  const [linea, setLinea] = useState<LineaCodigo | "">(lineas[0] ?? "")
  const [llenadora, setLlenadora] = useState("")
  const [buenos, setBuenos] = useState("")
  const [desechados, setDesechados] = useState("")
  const [justificacion, setJustificacion] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nLlenadora = Number(llenadora)
  const nBuenos = Number(buenos)
  const nDesechados = Number(desechados)
  const totalesCargados = llenadora !== "" && buenos !== "" && desechados !== ""
  // Buenos + desechados no siempre suman exacto el total de la
  // llenadora (hay diferencias reales de conteo) — no se bloquea por
  // eso, solo se muestra como dato informativo.
  const diferencia = totalesCargados ? nLlenadora - (nBuenos + nDesechados) : 0
  const mermaPct = totalesCargados && nLlenadora > 0 ? Math.round((nDesechados / nLlenadora) * 10000) / 100 : 0
  const requiereJustificacion = totalesCargados && nLlenadora > 0 && nDesechados / nLlenadora > LIMITE_MERMA

  const formularioValido =
    linea !== "" &&
    totalesCargados &&
    nLlenadora > 0 &&
    (!requiereJustificacion || justificacion.trim().length > 0)

  async function handleSubmit() {
    if (!formularioValido) return
    setEnviando(true)
    setError(null)
    const resultado = await onRegistrar({
      linea,
      envasesLlenadora: nLlenadora,
      envasesBuenos: nBuenos,
      envasesDesechados: nDesechados,
      justificacion: justificacion.trim(),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setLlenadora("")
    setBuenos("")
    setDesechados("")
    setJustificacion("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contador de envases</CardTitle>
        <CardDescription>Carga el conteo de la llenadora para una línea.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Línea</Label>
          <Select value={linea} onValueChange={(v) => setLinea(v as LineaCodigo)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una línea" />
            </SelectTrigger>
            <SelectContent>
              {lineas.map((codigo) => (
                <SelectItem key={codigo} value={codigo}>
                  {nombrePorCodigo(lineasCatalogo, codigo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="llenadora">Envases llenadora</Label>
            <Input id="llenadora" type="number" min={0} value={llenadora} onChange={(e) => setLlenadora(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="buenos">Envases buenos</Label>
            <Input id="buenos" type="number" min={0} value={buenos} onChange={(e) => setBuenos(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="desechados">Desechados</Label>
            <Input id="desechados" type="number" min={0} value={desechados} onChange={(e) => setDesechados(e.target.value)} />
          </div>
        </div>

        {totalesCargados && diferencia !== 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            {diferencia > 0
              ? `${diferencia} envase(s) de la llenadora sin categorizar como buenos ni desechados.`
              : `Buenos + desechados supera en ${-diferencia} a los envases de la llenadora — revisa los números.`}
          </p>
        )}

        {totalesCargados && nLlenadora > 0 && (
          <div
            className={
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
              (requiereJustificacion
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/40 text-muted-foreground")
            }
          >
            {requiereJustificacion && <AlertTriangle className="size-4 shrink-0" />}
            Merma teórica: <span className="font-medium">{mermaPct}%</span>
            {requiereJustificacion ? " — supera el 3%, requiere justificación." : " (límite 3%)"}
          </div>
        )}

        {requiereJustificacion && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="justificacion">Justificación (obligatoria para el acta)</Label>
            <Textarea
              id="justificacion"
              placeholder="Explica el motivo de la merma por encima del 3%..."
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="mt-2 w-full" disabled={!formularioValido || enviando} onClick={handleSubmit}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Registrar
        </Button>
      </CardContent>
    </Card>
  )
}
