import { useEffect, useRef, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TanqueVisual } from "@/components/TanqueVisual"
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
  litros_totales: number | null
  caudal_l_min: number
  valvulas: Record<string, boolean>
  /** Válvula de recirculación/CIP de cada tanque (no es la de entrada de agua) — ver plc-bridge/src/fuentes/s7.js. */
  auxiliares: Record<string, boolean>
  llenando: boolean
  /** Tags PLC_EXTRA_* de plc-bridge/bridge.conf: nombre → valor (null si el PLC no lo entregó). */
  extra?: Record<string, number | boolean | null>
  /** Tags que el PLC no pudo entregar (dirección mal configurada en bridge.conf). */
  tags_con_error?: string[]
}

/** Litros por debajo de la última lectura que cuentan como "empezó una dosis nueva" (tolerancia a ruido). */
const TOLERANCIA_REINICIO_L = 1

/**
 * Además del estado crudo, lleva la cuenta de cuánto ha entrado a cada
 * tanque DURANTE TODA esta preparación — no solo la dosis en curso.
 *
 * Por qué hace falta: un mismo llenado puede tener varios "ajustes" (el
 * operador abre, cierra, revisa, vuelve a abrir hasta llegar al nivel que
 * quiere). litros_actuales que manda el PLC es de la dosis actual nada más
 * (no sabemos con certeza si se reinicia al cambiar de tanque, al empezar
 * una dosis nueva del mismo tanque, o ambas — así que se detectan las dos
 * señales): cuando el tanque activo cambia, o cuando litros_actuales baja
 * respecto a la última lectura del mismo tanque, la dosis que estaba en
 * curso se da por cerrada y se suma al acumulado de ESE tanque.
 */
function usePlcLlenado(url: string) {
  const [estado, setEstado] = useState<EstadoLlenado | null>(null)
  const [conectado, setConectado] = useState(false)
  const [acumulados, setAcumulados] = useState<Record<number, number>>({})
  const [ultimosSetpoints, setUltimosSetpoints] = useState<Record<number, number>>({})
  const previoRef = useRef<{ tanque: number | null; litros: number }>({ tanque: null, litros: 0 })

  useEffect(() => {
    let socket: WebSocket | null = null
    let reintento: ReturnType<typeof setTimeout> | null = null
    let cancelado = false

    function conectar() {
      socket = new WebSocket(url)

      socket.onopen = () => setConectado(true)

      socket.onmessage = (evento) => {
        let nuevo: EstadoLlenado
        try {
          nuevo = JSON.parse(evento.data)
        } catch {
          return // mensaje no válido, se ignora
        }
        setEstado(nuevo)

        const anterior = previoRef.current
        const tanqueNuevo = nuevo.tanque_activo
        const litrosNuevo = nuevo.litros_actuales ?? 0
        const cambioDeTanque = anterior.tanque !== tanqueNuevo
        const empezoDosisNueva =
          !cambioDeTanque && tanqueNuevo != null && litrosNuevo < anterior.litros - TOLERANCIA_REINICIO_L

        if (anterior.tanque != null && (cambioDeTanque || empezoDosisNueva)) {
          const tanqueACerrar = anterior.tanque
          const litrosDeEsaDosis = anterior.litros
          setAcumulados((prev) => ({ ...prev, [tanqueACerrar]: (prev[tanqueACerrar] ?? 0) + litrosDeEsaDosis }))
        }

        previoRef.current = { tanque: tanqueNuevo, litros: tanqueNuevo != null ? litrosNuevo : 0 }

        if (tanqueNuevo != null && nuevo.setpoint_l != null) {
          setUltimosSetpoints((prev) => ({ ...prev, [tanqueNuevo]: nuevo.setpoint_l as number }))
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

  return { estado, conectado, acumulados, ultimosSetpoints }
}

/** "5 min 03 s" / "42 s" / "completado" / "calculando…" */
function formatearTiempoEstimado(litrosFaltantes: number, caudalLMin: number): string {
  if (litrosFaltantes <= 0) return "completado"
  if (caudalLMin <= 0) return "calculando…"
  const segundos = Math.round((litrosFaltantes / caudalLMin) * 60)
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return min > 0 ? `${min} min ${seg.toString().padStart(2, "0")} s` : `${seg} s`
}

export default function PreparacionPLC() {
  const { estado, conectado, acumulados, ultimosSetpoints } = usePlcLlenado(URL_PLC_BRIDGE)

  return (
    <AppShell
      title="Llenado PLC (prueba)"
      description="Litros y estado de válvula en vivo desde el PLC de Preparación — vista de prueba."
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className={cn("size-2.5 rounded-full", conectado ? "bg-success" : "bg-destructive")} />
          {conectado ? `Conectado (fuente: ${estado?.fuente ?? "..."})` : "Sin conexión al bridge — reintentando..."}
        </span>
        {conectado && estado?.litros_totales != null && (
          <span>
            Contador general del PLC:{" "}
            <span className="font-medium text-foreground">{estado.litros_totales.toFixed(1)} L</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {NUMEROS_TANQUE.map((numero) => (
          <TarjetaTanque
            key={numero}
            numero={numero}
            estado={estado}
            acumulado={acumulados[numero] ?? 0}
            ultimoSetpoint={ultimosSetpoints[numero] ?? null}
          />
        ))}
      </div>

      {estado?.tags_con_error && estado.tags_con_error.length > 0 && (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          El PLC no está entregando: {estado.tags_con_error.join(", ")}. Revisa la dirección de esos tags en
          plc-bridge/bridge.conf.
        </p>
      )}

      {estado?.extra && Object.keys(estado.extra).length > 0 && <OtrosDatos extra={estado.extra} />}

      {estado && (
        <details className="mt-6 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Ver último mensaje crudo</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono">{JSON.stringify(estado, null, 2)}</pre>
        </details>
      )}
    </AppShell>
  )
}

function TarjetaTanque({
  numero,
  estado,
  acumulado,
  ultimoSetpoint,
}: {
  numero: number
  estado: EstadoLlenado | null
  /** Litros de dosis ya cerradas de este tanque (sin contar la que esté en curso ahora). */
  acumulado: number
  /** Último setpoint visto para este tanque, para seguir mostrándolo mientras está "en espera" entre ajustes. */
  ultimoSetpoint: number | null
}) {
  const activo = estado?.tanque_activo === numero
  const abierta = !!estado?.valvulas?.[String(numero)]
  const auxEncendido = !!estado?.auxiliares?.[String(numero)]
  const litros = activo ? (estado?.litros_actuales ?? 0) : 0
  const setpoint = activo ? (estado?.setpoint_l ?? 0) : (ultimoSetpoint ?? 0)
  const caudal = activo ? (estado?.caudal_l_min ?? 0) : 0
  const porcentaje = setpoint > 0 ? Math.min(100, (litros / setpoint) * 100) : 0
  // Total REAL de esta preparación: lo de dosis/ajustes anteriores + lo que lleva la dosis en curso.
  const totalIngresado = acumulado + litros
  const tiempoEstimado = activo ? formatearTiempoEstimado(Math.max(0, setpoint - litros), caudal) : null

  return (
    <Card className={cn(activo && "ring-2 ring-primary")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Tanque {numero}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant={abierta ? "success" : "muted"}>{abierta ? "Entrada abierta" : "Entrada cerrada"}</Badge>
            {/* Recirculación/CIP: el bit crudo del PLC, sin cruzar todavía con la
                condición real del tanque (recepcion_tanques.condicion) — ver nota
                en s7.js. Por ahora se etiqueta genérico como "Aux". */}
            {auxEncendido && <Badge variant="info">Aux. encendido</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!activo && totalIngresado <= 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">En espera</p>
        ) : !activo ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            En espera del próximo ajuste — lleva{" "}
            <span className="font-medium text-foreground">{totalIngresado.toFixed(1)} L</span>
            {setpoint > 0 ? ` de ${setpoint} L` : ""}
          </div>
        ) : (
          <>
            {/* Tanque con la animación de llenado — mismo componente que el Panel de Producción */}
            <div className="overflow-hidden rounded-lg border border-border">
              <TanqueVisual
                numeroTanque={numero}
                condicion="EN_PREPARACION"
                volumenL={null}
                color="var(--info)"
                llenado={{ litros, setpointL: setpoint, caudalLMin: caudal }}
              />
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${porcentaje.toFixed(1)}%` }} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Fila etiqueta="Setpoint (esta apertura)" valor={`${setpoint} L`} />
              <Fila etiqueta="Litros actuales" valor={`${litros.toFixed(1)} L`} />
              <Fila etiqueta="Total ingresado al tanque" valor={`${totalIngresado.toFixed(1)} L`} destacado />
              <Fila etiqueta="Caudal" valor={`${caudal.toFixed(1)} L/min`} />
              <Fila etiqueta="Tiempo estimado" valor={tiempoEstimado ?? "calculando…"} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** "temperatura_agua" → "Temperatura agua" */
function nombreLegible(nombre: string): string {
  const texto = nombre.replace(/_/g, " ")
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function valorLegible(valor: number | boolean | null): string {
  if (valor === null) return "sin dato"
  if (typeof valor === "boolean") return valor ? "Encendido" : "Apagado"
  return valor.toLocaleString("es-VE", { maximumFractionDigits: 3 })
}

/** Tags agregados en bridge.conf (PLC_EXTRA_*): aparecen solos, sin tocar esta pantalla. */
function OtrosDatos({ extra }: { extra: Record<string, number | boolean | null> }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Otros datos del PLC</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {Object.entries(extra).map(([nombre, valor]) => (
            <Fila key={nombre} etiqueta={nombreLegible(nombre)} valor={valorLegible(valor)} />
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function Fila({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("font-medium", destacado && "text-primary")}>{valor}</dd>
    </div>
  )
}
