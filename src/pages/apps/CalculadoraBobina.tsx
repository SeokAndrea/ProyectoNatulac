import { useEffect, useState } from "react"
import { CircleDashed, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import {
  calcularEnvasesRestantes,
  guardarCalculoBobina,
  listarCalculosBobina,
  listarTiposBobina,
  type CalculoBobina,
  type TipoBobina,
} from "@/lib/bobina"
import { fechaJornadaPlanta } from "@/lib/tiempoPlanta"

/*
 * Envases restantes en una bobina de material de empaque, a partir de
 * la distancia medida del core al borde de la bobina — reemplaza la
 * caminata hasta la PC para abrir el Excel "Control de Existencias"
 * (hoja "Cálculos") cada vez que Daniela necesita ese número. Cada
 * cálculo se puede guardar y queda listado por jornada de planta,
 * mismo criterio de fecha que usa Programación.
 */
export default function CalculadoraBobina() {
  const { session } = useAuth()
  const fecha = fechaJornadaPlanta()
  const [tipos, setTipos] = useState<TipoBobina[]>([])
  const [historial, setHistorial] = useState<CalculoBobina[]>([])
  const [cargando, setCargando] = useState(true)
  const [tipoId, setTipoId] = useState("")
  const [distancia, setDistancia] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    Promise.all([listarTiposBobina(), listarCalculosBobina(fecha)]).then(([t, h]) => {
      setTipos(t.filter((x) => x.activo))
      setHistorial(h)
      setCargando(false)
    })
  }, [fecha])

  const tipo = tipos.find((t) => t.id === tipoId)
  const distanciaNum = Number(distancia)
  const valido = tipo !== undefined && distancia.trim() !== "" && distanciaNum > 0
  const resultado = valido ? calcularEnvasesRestantes(distanciaNum, tipo) : null

  async function guardar() {
    if (!valido || !tipo || resultado === null || !session || guardando) return
    setGuardando(true)
    setError(null)
    setGuardado(false)
    const respuesta = await guardarCalculoBobina(session.username, fecha, tipo.id, distanciaNum, resultado)
    setGuardando(false)
    if (!respuesta.ok) {
      setError(respuesta.error)
      return
    }
    setHistorial(await listarCalculosBobina(fecha))
    setDistancia("")
    setGuardado(true)
  }

  return (
    <AppShell title="Calculadora de Bobina" description="Envases restantes según la medida de la bobina">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Medir bobina</CardTitle>
            <CardDescription>Distancia del core al borde de la bobina, en centímetros.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tipo-bobina">Tipo de envase</Label>
              {cargando ? (
                <div className="flex justify-center py-2 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <Select value={tipoId} onValueChange={setTipoId}>
                  <SelectTrigger id="tipo-bobina" className="w-full">
                    <SelectValue placeholder="Elegir tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="distancia-bobina">Distancia medida (cm)</Label>
              <Input
                id="distancia-bobina"
                type="number"
                inputMode="decimal"
                placeholder="Ej. 14"
                value={distancia}
                onChange={(e) => setDistancia(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
              <CircleDashed className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Envases restantes</p>
                <p className="num font-semibold text-foreground">{resultado !== null ? resultado.toLocaleString("es-CO") : "—"}</p>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {guardado && !error && <p className="text-sm text-success">Cálculo guardado.</p>}

            <Button disabled={!valido || guardando} onClick={guardar}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guardados hoy</CardTitle>
            <CardDescription>Jornada del {fecha}</CardDescription>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="flex justify-center py-4 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : historial.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no se guardó ningún cálculo hoy.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {historial.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{c.tipoBobinaNombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.distanciaCm} cm
                        {c.usuario ? ` · ${c.usuario}` : ""}
                        {` · ${new Date(c.creadoEn).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    </div>
                    <p className="num shrink-0 font-semibold text-foreground">{c.envases.toLocaleString("es-CO")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
