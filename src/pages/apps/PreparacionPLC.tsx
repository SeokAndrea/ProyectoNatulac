import { useEffect, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/*
 * Vista de prueba (solo para el usuario "arondon", ver usuarioPermitido en
 * src/lib/apps.tsx) que muestra en vivo lo que transmite el plc-bridge
 * (ver /plc-bridge en la raíz del repo) mientras se define la conexión
 * real al PLC de Preparación — hoy el bridge corre en modo simulación.
 */

const URL_PLC_BRIDGE = import.meta.env.VITE_PLC_BRIDGE_WS_URL || "ws://192.168.10.143:4036"
const NUMEROS_TANQUE = [1, 2, 3] as const

interface EstadoLlenado {
  timestamp: string
  fuente: string
  tanque_activo: number | null
  setpoint_l: number | null
  litros_actuales: number
  caudal_l_min: number
  valvulas: Record<string, boolean>
  llenando: boolean
}

function usePlcLlenado(url: string) {
  const [estado, setEstado] = useState<EstadoLlenado | null>(null)
  const [conectado, setConectado] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let reintento: ReturnType<typeof setTimeout> | null = null
    let cancelado = false

    function conectar() {
      socket = new WebSocket(url)

      socket.onopen = () => setConectado(true)

      socket.onmessage = (evento) => {
        try {
          setEstado(JSON.parse(evento.data))
        } catch {
          // mensaje no válido, se ignora
        }
      }

      socket.onclose = () => {
        setConectado(false)
        if (!cancelado) reintento = setTimeout(conectar, 2000)
      }

      socket.onerror = () => socket?.close()
    }

    conectar()

    return () => {
      cancelado = true
      if (reintento) clearTimeout(reintento)
      socket?.close()
    }
  }, [url])

  return { estado, conectado }
}

export default function PreparacionPLC() {
  const { estado, conectado } = usePlcLlenado(URL_PLC_BRIDGE)

  return (
    <AppShell
      title="Llenado PLC (prueba)"
      description="Litros y estado de válvula en vivo desde el PLC de Preparación — vista de prueba."
    >
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("size-2.5 rounded-full", conectado ? "bg-success" : "bg-destructive")} />
        {conectado ? `Conectado (fuente: ${estado?.fuente ?? "..."})` : "Sin conexión al bridge — reintentando..."}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {NUMEROS_TANQUE.map((numero) => (
          <TarjetaTanque key={numero} numero={numero} estado={estado} />
        ))}
      </div>

      {estado && (
        <details className="mt-6 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Ver último mensaje crudo</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono">{JSON.stringify(estado, null, 2)}</pre>
        </details>
      )}
    </AppShell>
  )
}

function TarjetaTanque({ numero, estado }: { numero: number; estado: EstadoLlenado | null }) {
  const activo = estado?.tanque_activo === numero
  const abierta = !!estado?.valvulas?.[String(numero)]
  const litros = activo ? (estado?.litros_actuales ?? 0) : 0
  const setpoint = activo ? (estado?.setpoint_l ?? 0) : 0
  const porcentaje = setpoint > 0 ? Math.min(100, (litros / setpoint) * 100) : 0

  return (
    <Card className={cn(activo && "ring-2 ring-primary")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tanque {numero}</CardTitle>
          <Badge variant={abierta ? "success" : "muted"}>{abierta ? "Válvula abierta" : "Válvula cerrada"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!activo ? (
          <p className="py-6 text-center text-sm text-muted-foreground">En espera</p>
        ) : (
          <>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${porcentaje.toFixed(1)}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Litros actuales</span>
              <span className="font-medium">{litros.toFixed(1)} L</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Setpoint</span>
              <span className="font-medium">{setpoint} L</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Caudal: {(estado?.caudal_l_min ?? 0).toFixed(1)} L/min</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
