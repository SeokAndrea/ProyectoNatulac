import { useEffect, useState } from "react"
import { Droplets, Fuel, Loader2, Thermometer } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import {
  GASOIL_CONSUMO_L_POR_HORA,
  gasoilHorasDisponibles,
  nivelGasoil,
  obtenerLecturaServiciosIndustriales,
  registrarLecturaServiciosIndustriales,
  type LecturaServiciosIndustriales,
} from "@/lib/panelProduccion"

/*
 * Servicios Industriales: cargar Temperatura del Quantum, Agua
 * Osmotizada y Gasoil — los valores que ya se mostraban de solo
 * lectura arriba de Tanques en el Panel de Producción (ver
 * ServiciosIndustrialesFranja en PanelProduccion.tsx), pero que hasta
 * hoy nadie podía cargar desde ninguna pantalla: la RPC
 * (registrar_lectura_servicios_industriales) y el rol
 * (SERVICIOS_INDUSTRIALES) ya existían, solo faltaba esta página.
 * Meramente informativo — no alimenta ningún cálculo de merma ni de
 * otro tipo, y no depende de ningún turno.
 */
export default function ServiciosIndustriales() {
  const { session } = useAuth()
  const [lectura, setLectura] = useState<LecturaServiciosIndustriales | null>(null)
  const [cargando, setCargando] = useState(true)
  const [temperaturaQuantum, setTemperaturaQuantum] = useState("")
  const [aguaOsmotizada, setAguaOsmotizada] = useState("")
  const [gasoil, setGasoil] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    obtenerLecturaServiciosIndustriales().then((l) => {
      setLectura(l)
      setCargando(false)
    })
  }, [])

  const valido = temperaturaQuantum.trim() !== "" || aguaOsmotizada.trim() !== "" || gasoil.trim() !== ""

  async function guardar() {
    if (!valido || !session || enviando) return
    setEnviando(true)
    setError(null)
    setGuardado(false)
    const resultado = await registrarLecturaServiciosIndustriales(
      session.username,
      temperaturaQuantum.trim() === "" ? null : Number(temperaturaQuantum),
      aguaOsmotizada.trim() === "" ? null : Number(aguaOsmotizada),
      gasoil.trim() === "" ? null : Number(gasoil),
    )
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setLectura(resultado.lectura)
    setTemperaturaQuantum("")
    setAguaOsmotizada("")
    setGasoil("")
    setGuardado(true)
  }

  return (
    <AppShell title="Servicios Industriales" description="Temperatura del Quantum, Agua Osmotizada y Gasoil">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Última lectura</CardTitle>
            <CardDescription>Es lo que ve el Panel de Producción ahora mismo, arriba de Tanques.</CardDescription>
          </CardHeader>
          <CardContent>
            {cargando ? (
              <div className="flex justify-center py-4 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                  <Thermometer className="size-4 shrink-0 text-warning" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Quantum</p>
                    <p className="num font-semibold text-foreground">
                      {lectura?.temperaturaQuantum ?? "—"}
                      {lectura?.temperaturaQuantum !== null && lectura?.temperaturaQuantum !== undefined ? "°C" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                  <Droplets className="size-4 shrink-0 text-info" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Agua Osmotizada</p>
                    <p className="num font-semibold text-foreground">
                      {lectura?.aguaOsmotizada?.toLocaleString("es-CO") ?? "—"}
                      {lectura?.aguaOsmotizada !== null && lectura?.aguaOsmotizada !== undefined ? " L" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
                  <Fuel className="size-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Gasoil</p>
                    <p className="num font-semibold text-foreground">
                      {lectura?.gasoil?.toLocaleString("es-CO") ?? "—"}
                      {lectura?.gasoil !== null && lectura?.gasoil !== undefined ? " L" : ""}
                    </p>
                  </div>
                </div>
                {lectura?.gasoil !== null && lectura?.gasoil !== undefined && (
                  <div className="col-span-2">
                    <BarraGasoilDisponible litros={lectura.gasoil} />
                  </div>
                )}
                {lectura && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    {new Date(lectura.actualizadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                    {lectura.actualizadoPorNombre ? ` · ${lectura.actualizadoPorNombre}` : ""}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cargar lectura nueva</CardTitle>
            <CardDescription>Cargar al menos uno de los tres valores.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="temp-quantum">Temperatura del Quantum (°C)</Label>
              <Input
                id="temp-quantum"
                type="number"
                inputMode="decimal"
                placeholder="Ej. 4.5"
                value={temperaturaQuantum}
                onChange={(e) => setTemperaturaQuantum(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="agua-osmotizada">Agua Osmotizada (L)</Label>
              <Input
                id="agua-osmotizada"
                type="number"
                inputMode="decimal"
                placeholder="Ej. 15000"
                value={aguaOsmotizada}
                onChange={(e) => setAguaOsmotizada(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gasoil">Gasoil (L)</Label>
              <Input
                id="gasoil"
                type="number"
                inputMode="decimal"
                placeholder="Ej. 200"
                value={gasoil}
                onChange={(e) => setGasoil(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            {guardado && !error && <p className="text-sm text-success">Lectura guardada.</p>}

            <Button disabled={!valido || enviando} onClick={guardar}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar lectura
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

/**
 * Semáforo de Gasoil: convierte los litros cargados en horas de
 * autonomía (a GASOIL_CONSUMO_L_POR_HORA) y pinta una barra roja /
 * amarilla / verde contra un corte de luz — ver umbrales en
 * panelProduccion.ts. La barra llena al 100% en GASOIL_UMBRAL_VERDE_HORAS
 * × 1.5 horas: de ahí para arriba ya está verde, no hace falta más escala.
 */
function BarraGasoilDisponible({ litros }: { litros: number }) {
  const horas = gasoilHorasDisponibles(litros)
  const nivel = nivelGasoil(horas)
  const escalaMaxima = 24
  const barra = Math.max(0, Math.min(100, (horas / escalaMaxima) * 100))

  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Autonomía de gasoil</span>
        <span
          className={cn(
            "num text-sm font-semibold",
            nivel === "danger" ? "text-danger" : nivel === "warn" ? "text-warning" : "text-success",
          )}
        >
          {horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            nivel === "danger" ? "bg-danger" : nivel === "warn" ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${barra}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{GASOIL_CONSUMO_L_POR_HORA} L/h</p>
    </div>
  )
}
