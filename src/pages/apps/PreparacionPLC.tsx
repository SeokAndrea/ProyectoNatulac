import { useEffect, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TanqueVisual } from "@/components/TanqueVisual"
import { diaMesPlanta, horaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

/*
 * Vista de prueba (solo para el usuario "arondon", ver usuarioPermitido en
 * src/lib/apps.tsx) que muestra en vivo lo que transmite el plc-bridge
 * (ver /plc-bridge en la raíz del repo). Todo lo que se ve sale tal cual del
 * PLC: esta pantalla no calcula litros, caudal ni tiempos.
 */

const URL_PLC_BRIDGE = import.meta.env.VITE_PLC_BRIDGE_WS_URL || "ws://192.168.10.143:4036"
const NUMEROS_TANQUE = [1, 2, 3] as const

/** Un llenado del registro que guarda el bridge (plc-bridge/src/registro.js). */
interface Llenado {
  tanque: number
  inicio: string
  /** null = sigue abierto. */
  fin: string | null
  /** Último PLC_Totales_Litros leído mientras el tanque estuvo seleccionado. */
  litros_tanque: number | null
  motivo_fin: string | null
}

interface EstadoLlenado {
  timestamp: string
  fuente: string
  tanque_activo: number | null
  setpoint_l: number | null
  /** PLC_Actuales_Litros: litros de la apertura en curso. */
  litros_actuales: number | null
  /** PLC_Totales_Litros: total que entró al tanque seleccionado (el PLC lo pone en 0 al cambiar de tanque). */
  litros_tanque: number | null
  /** PLC_Caudal_LPM. */
  caudal_l_min: number | null
  valvulas: Record<string, boolean>
  /** Válvula de recirculación/CIP de cada tanque (no es la de entrada de agua) — ver plc-bridge/src/fuentes/s7.js. */
  auxiliares: Record<string, boolean>
  llenando: boolean
  /** Tags PLC_EXTRA_* de plc-bridge/bridge.conf: nombre → valor (null si el PLC no lo entregó). */
  extra?: Record<string, number | boolean | null>
  /** Tags que el PLC no pudo entregar (dirección mal configurada en bridge.conf). */
  tags_con_error?: string[]
  /** Últimos llenados, el más reciente primero. */
  llenados?: Llenado[]
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

/** "1.020 L" / "sin dato" */
function litrosLegibles(litros: number | null | undefined): string {
  return litros == null ? "sin dato" : `${litros.toLocaleString("es-VE")} L`
}

/** "28/10 14:05:32" en hora de planta. */
function momentoLegible(iso: string): string {
  const d = new Date(iso)
  return `${diaMesPlanta(d)} ${horaPlanta(d)}`
}

export default function PreparacionPLC() {
  const { estado, conectado } = usePlcLlenado(URL_PLC_BRIDGE)
  const llenados = estado?.llenados ?? []

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
          <TarjetaTanque
            key={numero}
            numero={numero}
            estado={estado}
            ultimoLlenado={llenados.find((l) => l.tanque === numero) ?? null}
          />
        ))}
      </div>

      {estado?.tags_con_error && estado.tags_con_error.length > 0 && (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          El PLC no está entregando: {estado.tags_con_error.join(", ")}. Revisa la dirección de esos tags en
          plc-bridge/bridge.conf.
        </p>
      )}

      {estado && <RegistroLlenados llenados={llenados} />}

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
  ultimoLlenado,
}: {
  numero: number
  estado: EstadoLlenado | null
  /** Llenado más reciente de este tanque (abierto si es el tanque activo). */
  ultimoLlenado: Llenado | null
}) {
  const activo = estado?.tanque_activo === numero
  const abierta = !!estado?.valvulas?.[String(numero)]
  const auxEncendido = !!estado?.auxiliares?.[String(numero)]
  const litros = estado?.litros_actuales ?? 0
  const setpoint = estado?.setpoint_l ?? 0
  const porcentaje = setpoint > 0 ? Math.min(100, (litros / setpoint) * 100) : 0

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
        {!activo ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            <p>En espera</p>
            {ultimoLlenado?.fin && (
              <p className="mt-2 text-xs">
                Último llenado:{" "}
                <span className="font-medium text-foreground">{litrosLegibles(ultimoLlenado.litros_tanque)}</span>
                <br />
                {momentoLegible(ultimoLlenado.inicio)} – {momentoLegible(ultimoLlenado.fin)}
              </p>
            )}
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
                llenado={{ litros, setpointL: setpoint, caudalLMin: estado?.caudal_l_min ?? 0 }}
              />
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${porcentaje.toFixed(1)}%` }} />
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Fila etiqueta="Setpoint (esta apertura)" valor={litrosLegibles(estado?.setpoint_l)} />
              <Fila etiqueta="Litros actuales" valor={litrosLegibles(estado?.litros_actuales)} />
              <Fila etiqueta="Total ingresado al tanque" valor={litrosLegibles(estado?.litros_tanque)} destacado />
              <Fila
                etiqueta="Caudal"
                valor={estado?.caudal_l_min == null ? "sin dato" : `${estado.caudal_l_min.toLocaleString("es-VE")} L/min`}
              />
              {ultimoLlenado && !ultimoLlenado.fin && (
                <Fila etiqueta="Seleccionado desde" valor={momentoLegible(ultimoLlenado.inicio)} />
              )}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Registro de llenados que guarda el bridge: cuándo se seleccionó cada tanque, hasta cuándo, y el total del PLC. */
function RegistroLlenados({ llenados }: { llenados: Llenado[] }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Registro de llenados</CardTitle>
      </CardHeader>
      <CardContent>
        {llenados.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay llenados registrados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanque</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead className="text-right">Total ingresado</TableHead>
                <TableHead>Cierre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {llenados.map((l) => (
                <TableRow key={`${l.tanque}-${l.inicio}`}>
                  <TableCell className="font-medium">Tanque {l.tanque}</TableCell>
                  <TableCell>{momentoLegible(l.inicio)}</TableCell>
                  <TableCell>{l.fin ? momentoLegible(l.fin) : <Badge variant="info">En curso</Badge>}</TableCell>
                  <TableCell className="text-right font-medium">{litrosLegibles(l.litros_tanque)}</TableCell>
                  <TableCell className="text-muted-foreground">{l.motivo_fin ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
