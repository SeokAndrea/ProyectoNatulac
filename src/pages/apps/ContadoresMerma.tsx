import { useState } from "react"
import { Link } from "react-router-dom"
import { Gauge, AlertTriangle, CircleOff, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { ListaContadores } from "@/components/ListaContadores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { nombrePorCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { mermaCorrida, useTurno, type LineaEnTurno } from "@/lib/turno"

/*
 * "Contador": un solo valor por registro — envases que salieron de la
 * llenadora — ligado a la corrida ACTIVA de la línea elegida
 * (turnoLineaId). La merma ya no se calcula acá adentro: sale de
 * comparar esto contra Producto Terminado de esa misma corrida (ver
 * mermaCorrida en src/lib/turno.tsx), por eso puede quedar "Pendiente"
 * hasta que se cargue el Producto Terminado correspondiente. La
 * justificación es opcional al cargar el contador y se puede agregar
 * después, una vez que la merma ya se puede calcular.
 */
export default function ContadoresMerma() {
  const { turnoActivo, cargando, registrarContador } = useTurno()

  if (cargando) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por corrida del turno en curso">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por corrida del turno en curso">
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

  const lineasActivas = turnoActivo.lineas.filter((l) => l.activa)

  if (lineasActivas.length === 0) {
    return (
      <AppShell title="Contadores y Merma" description="Envases por corrida del turno en curso">
        <EmptyState
          icon={CircleOff}
          title="Ninguna línea activa"
          description="Activa una corrida en Preparación para poder cargar sus contadores."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/preparacion">Ir a Preparación</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Contadores y Merma" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <FormularioContador lineasActivas={lineasActivas} onRegistrar={registrarContador} />
        {turnoActivo.contadores.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrado en este turno</CardTitle>
            </CardHeader>
            <CardContent>
              <ListaContadores contadores={turnoActivo.contadores} productoTerminado={turnoActivo.productoTerminado} />
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}

function FormularioContador({
  lineasActivas,
  onRegistrar,
}: {
  lineasActivas: LineaEnTurno[]
  onRegistrar: (datos: {
    turnoLineaId: string
    linea: LineaEnTurno["linea"]
    envasesLlenadora: number
    justificacion: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const { lineas: lineasCatalogo, presentaciones } = useCatalogosLive()
  const [turnoLineaId, setTurnoLineaId] = useState(lineasActivas[0]?.id ?? "")
  const [llenadora, setLlenadora] = useState("")
  const [justificacion, setJustificacion] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const corridaElegida = lineasActivas.find((l) => l.id === turnoLineaId) ?? null
  const nLlenadora = Number(llenadora)
  const formularioValido = turnoLineaId !== "" && llenadora !== "" && nLlenadora > 0

  async function handleSubmit() {
    if (!formularioValido || !corridaElegida) return
    setEnviando(true)
    setError(null)
    const resultado = await onRegistrar({
      turnoLineaId,
      linea: corridaElegida.linea,
      envasesLlenadora: nLlenadora,
      justificacion: justificacion.trim(),
    })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setLlenadora("")
    setJustificacion("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contador de envases</CardTitle>
        <CardDescription>Envases que salieron de la llenadora, para la corrida activa de una línea.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Línea</Label>
          <Select value={turnoLineaId} onValueChange={setTurnoLineaId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una línea" />
            </SelectTrigger>
            <SelectContent>
              {lineasActivas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {nombrePorCodigo(lineasCatalogo, l.linea)}
                  {l.saborNombre ? ` · ${l.saborNombre}` : ""}
                  {l.lote ? ` · Lote ${l.lote}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="llenadora">Envases de la llenadora</Label>
          <Input id="llenadora" type="number" min={0} value={llenadora} onChange={(e) => setLlenadora(e.target.value)} />
        </div>

        {corridaElegida && (
          <MermaPreview turnoLineaId={corridaElegida.id} envasesLlenadora={nLlenadora} presentaciones={presentaciones} />
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="justificacion" className="text-muted-foreground">
            Justificación (opcional — se puede agregar después)
          </Label>
          <Textarea
            id="justificacion"
            placeholder="Si la merma de esta corrida termina alta, explicá el motivo..."
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
          />
        </div>

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

/**
 * Vista previa de la merma con lo ya cargado + lo que se está por
 * registrar — solo informativa, no bloquea nada. Si Producto
 * Terminado de esta corrida todavía no existe, no hay con qué
 * comparar.
 */
function MermaPreview({
  turnoLineaId,
  envasesLlenadora,
  presentaciones,
}: {
  turnoLineaId: string
  envasesLlenadora: number
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
}) {
  const { turnoActivo } = useTurno()
  if (!turnoActivo || envasesLlenadora <= 0) return null

  const merma = mermaCorrida(
    turnoLineaId,
    {
      contadores: [
        ...turnoActivo.contadores,
        { id: "preview", linea: "" as never, turnoLineaId, envasesLlenadora, justificacion: "", creadoEn: "" },
      ],
      productoTerminado: turnoActivo.productoTerminado,
    },
    presentaciones,
  )

  if (!merma) {
    return (
      <p className="text-xs text-muted-foreground">Todavía no hay Producto Terminado de esta corrida para calcular la merma.</p>
    )
  }

  return (
    <div
      className={
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
        (merma.pct > 3 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/40 text-muted-foreground")
      }
    >
      {merma.pct > 3 && <AlertTriangle className="size-4 shrink-0" />}
      Merma estimada: <span className="font-medium">{merma.pct}%</span>
      {merma.pct > 3 ? " — supera el 3%, conviene justificar." : " (límite 3%)"}
    </div>
  )
}
