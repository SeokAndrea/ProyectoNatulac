import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { MensajeError } from "@/components/MensajeError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TanqueVisual } from "@/components/TanqueVisual"
import { useAuth } from "@/lib/auth"
import { puede } from "@/lib/permisos"
import { tokenSesion } from "@/lib/sesionToken"
import { diaMesPlanta, horaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

/*
 * Contador de Agua (solo Producción Aséptico, ver src/lib/apps.tsx): muestra
 * en vivo lo que transmite el plc-bridge (ver /plc-bridge en la raíz del
 * repo). Todo lo que se ve sale tal cual del PLC: esta pantalla no calcula
 * litros, caudal ni tiempos.
 *
 * Quien tiene el permiso VALVULA_AUX (Supervisor, o como extra) abre y cierra
 * las válvulas auxiliares: la orden va al bridge con la credencial de la
 * sesión, el bridge le pregunta a la base si puede (y ahí queda la
 * auditoría) y escribe el bit en el PLC. El 1/0 que se ve sigue siendo lo
 * que lee el PLC, así una orden desde la HMI también se ve acá.
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

/** Quién dio la orden desde la app. */
interface Persona {
  usuario: string
  nombre: string
}

/** Una apertura de la válvula auxiliar (Actuador_Aux_Tank_X) que registra el bridge. */
interface AperturaAux {
  tanque: number
  inicio: string
  /** null = desde la HMI/PLC; sin el campo = registro de antes de que se guardara. */
  abierta_por?: Persona | null
  /** null = sigue abierta. */
  fin: string | null
  cerrada_por?: Persona | null
  /** "bridge reiniciado" si se cortó el registro; si no, null. */
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
  /** Últimas aperturas de las válvulas auxiliares, la más reciente primero. */
  aperturas_aux?: AperturaAux[]
  /** El bridge acepta órdenes para las válvulas auxiliares (PLC_API_URL / PLC_CONTROL_AUX). */
  control_aux?: boolean
  /** false = el bridge no tiene comunicación con el PLC (solo en modo real). */
  conectado?: boolean
}

/** Lo que contesta el bridge a una orden (plc-bridge/src/control.js). */
type ResultadoOrden = { ok: true } | { ok: false; error: string }

const ESPERA_RESPUESTA_MS = 10000

function usePlcLlenado(url: string) {
  const [estado, setEstado] = useState<EstadoLlenado | null>(null)
  const [conectado, setConectado] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const pendientes = useRef(new Map<string, (r: ResultadoOrden) => void>())
  const contadorOrdenes = useRef(0)

  useEffect(() => {
    let reintento: ReturnType<typeof setTimeout> | null = null
    let cancelado = false

    function conectar() {
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onopen = () => setConectado(true)

      socket.onmessage = (evento) => {
        try {
          const mensaje = JSON.parse(evento.data)
          if (mensaje.tipo === "respuesta") {
            pendientes.current.get(mensaje.id)?.(mensaje.ok ? { ok: true } : { ok: false, error: mensaje.error })
            pendientes.current.delete(mensaje.id)
          } else {
            setEstado(mensaje)
          }
        } catch {
          // mensaje no válido, se ignora
        }
      }

      socket.onclose = () => {
        setConectado(false)
        if (!cancelado) reintento = setTimeout(conectar, 2000)
      }

      socket.onerror = () => socket.close()
    }

    conectar()

    return () => {
      cancelado = true
      if (reintento) clearTimeout(reintento)
      socketRef.current?.close()
    }
  }, [url])

  /** Manda una orden al bridge y espera su respuesta. */
  const enviar = useCallback((orden: Record<string, unknown>): Promise<ResultadoOrden> => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: "Sin conexión al bridge." })
    }
    // Contador y no crypto.randomUUID(): la app se sirve por http en la red y ahí no existe.
    const id = `orden-${++contadorOrdenes.current}`
    return new Promise((resolve) => {
      const vencer = setTimeout(() => {
        pendientes.current.delete(id)
        resolve({ ok: false, error: "El bridge no respondió." })
      }, ESPERA_RESPUESTA_MS)
      pendientes.current.set(id, (r) => {
        clearTimeout(vencer)
        resolve(r)
      })
      socket.send(JSON.stringify({ ...orden, id }))
    })
  }, [])

  return { estado, conectado, enviar }
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

/** Tiempo entre dos instantes ISO: "42 s" / "3 min 05 s" / "1 h 02 min". */
function duracionLegible(desde: string, hasta: string): string {
  const total = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 1000))
  const h = Math.floor(total / 3600)
  const min = Math.floor((total % 3600) / 60)
  const seg = total % 60
  if (h > 0) return `${h} h ${String(min).padStart(2, "0")} min`
  if (min > 0) return `${min} min ${String(seg).padStart(2, "0")} s`
  return `${seg} s`
}

/** "Ana Pérez" / "HMI" (sin orden de la app) / null (registro viejo, no se sabe). */
function quienLegible(persona: Persona | null | undefined): string | null {
  if (persona === undefined) return null
  return persona ? persona.nombre : "HMI"
}

export default function PreparacionPLC() {
  const { estado, conectado, enviar } = usePlcLlenado(URL_PLC_BRIDGE)
  // El permiso, con la sesión que se muestra («Ver como» lo prueba); la orden va con el usuario real.
  const { session, sessionReal } = useAuth()
  const llenados = estado?.llenados ?? []
  const aperturasAux = estado?.aperturas_aux ?? []
  const puedeAccionar = puede(session, "VALVULA_AUX")
  const controlListo = conectado && !!estado?.control_aux && estado.conectado !== false

  const accionarAux = useCallback(
    (tanque: number, abrir: boolean) =>
      enviar({ tipo: "valvula_aux", tanque, abrir, usuario: sessionReal?.username ?? "", sesion: tokenSesion() }),
    [enviar, sessionReal],
  )

  return (
    <AppShell
      title="Contador de Agua"
      description="Litros, caudal y válvulas en vivo desde el PLC de Preparación."
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
            ultimaAperturaAux={aperturasAux.find((a) => a.tanque === numero) ?? null}
            puedeAccionar={puedeAccionar}
            controlListo={controlListo}
            onAccionarAux={accionarAux}
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

      {estado && <RegistroAperturasAux aperturas={aperturasAux} />}

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
  ultimaAperturaAux,
  puedeAccionar,
  controlListo,
  onAccionarAux,
}: {
  numero: number
  estado: EstadoLlenado | null
  /** Llenado más reciente de este tanque (abierto si es el tanque activo). */
  ultimoLlenado: Llenado | null
  /** Apertura más reciente de la válvula auxiliar de este tanque (fin = null si sigue abierta). */
  ultimaAperturaAux: AperturaAux | null
  /** La sesión tiene el permiso VALVULA_AUX. */
  puedeAccionar: boolean
  /** El bridge está conectado al PLC y acepta órdenes. */
  controlListo: boolean
  onAccionarAux: (tanque: number, abrir: boolean) => Promise<ResultadoOrden>
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
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Tanque {numero}</CardTitle>
          <EstadoValvula nombre="Válvula de agua" abierta={abierta} />
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
        {/* Actuador_Aux_Tank_X (recirculación/CIP): el bit crudo del PLC, sin
            cruzar todavía con la condición real del tanque — ver nota en s7.js. */}
        <BotonValvulaAux
          numero={numero}
          abierta={auxEncendido}
          apertura={ultimaAperturaAux}
          ahora={estado?.timestamp ?? null}
          puedeAccionar={puedeAccionar}
          controlListo={controlListo}
          onAccionar={(abrir) => onAccionarAux(numero, abrir)}
        />
      </CardContent>
    </Card>
  )
}

/** Cuánto espera la pantalla a que el PLC muestre el cambio después de una orden. */
const ESPERA_CAMBIO_MS = 10000

/**
 * Válvula auxiliar de un tanque: estado 1/0 que manda el PLC, cuánto lleva
 * abierta (o cuándo se cerró y cuánto estuvo abierta) y quién la abrió o
 * cerró, según el registro del bridge. El tiempo corre con la hora de cada
 * lectura del bridge, no con el reloj de esta PC.
 *
 * Con permiso VALVULA_AUX, tocarla pide «¿Seguro?» y manda la orden; la
 * pantalla espera a que el PLC muestre el cambio (el 1/0 nunca se pinta
 * antes de que el PLC lo confirme).
 */
function BotonValvulaAux({
  numero,
  abierta,
  apertura,
  ahora,
  puedeAccionar,
  controlListo,
  onAccionar,
}: {
  numero: number
  abierta: boolean
  apertura: AperturaAux | null
  /** Hora de la última lectura del bridge (ISO). */
  ahora: string | null
  puedeAccionar: boolean
  controlListo: boolean
  onAccionar: (abrir: boolean) => Promise<ResultadoOrden>
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  /** Lo que se ordenó y todavía no se ve en el PLC. */
  const [esperando, setEsperando] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enCurso = abierta && apertura && !apertura.fin ? apertura : null
  const cerrada = !abierta && apertura?.fin ? apertura : null
  const accion = abierta ? "cerrar" : "abrir"
  const ocupado = enviando || esperando !== null
  const habilitado = puedeAccionar && controlListo && !ocupado

  // El PLC ya muestra lo ordenado: listo (ajuste durante el render, sin efecto).
  if (esperando !== null && abierta === esperando) setEsperando(null)

  // Si no llega a tiempo, se avisa.
  useEffect(() => {
    if (esperando === null) return
    const vencer = setTimeout(() => {
      setEsperando(null)
      setError("El PLC no mostró el cambio. Revisa la válvula en la HMI.")
    }, ESPERA_CAMBIO_MS)
    return () => clearTimeout(vencer)
  }, [esperando])

  async function confirmar() {
    const abrir = !abierta
    setConfirmando(false)
    setEnviando(true)
    setError(null)
    const resultado = await onAccionar(abrir)
    setEnviando(false)
    if (resultado.ok) setEsperando(abrir)
    else setError(resultado.error)
  }

  const motivoBloqueo = !puedeAccionar
    ? "No tienes permiso para abrir o cerrar esta válvula"
    : !controlListo
      ? "Control remoto no disponible: sin comunicación con el PLC o deshabilitado en el bridge"
      : undefined

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        disabled={!habilitado}
        title={motivoBloqueo}
        onClick={() => {
          setError(null)
          setConfirmando(true)
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border p-3 text-left disabled:cursor-default",
          "enabled:hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          abierta ? "border-success/50 bg-success/10" : "border-border bg-muted/40",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md font-mono text-xl font-bold",
            abierta ? "bg-success text-white" : "bg-muted-foreground/20 text-muted-foreground",
          )}
        >
          {abierta ? "1" : "0"}
        </span>
        <span className="min-w-0 text-xs leading-snug">
          <span className="block text-sm font-medium">
            Válvula auxiliar: <span className={cn(abierta && "text-success")}>{abierta ? "Abierta" : "Cerrada"}</span>
          </span>
          {enCurso && ahora && (
            <span className="block text-muted-foreground">
              Abierta desde {momentoLegible(enCurso.inicio)}
              {quienLegible(enCurso.abierta_por) && <> por {quienLegible(enCurso.abierta_por)}</>} · lleva{" "}
              <span className="font-medium text-foreground">{duracionLegible(enCurso.inicio, ahora)}</span>
            </span>
          )}
          {cerrada?.fin && (
            <span className="block text-muted-foreground">
              Se cerró {momentoLegible(cerrada.fin)}
              {quienLegible(cerrada.cerrada_por) && <> por {quienLegible(cerrada.cerrada_por)}</>} · estuvo abierta{" "}
              <span className="font-medium text-foreground">{duracionLegible(cerrada.inicio, cerrada.fin)}</span>
            </span>
          )}
          {!enCurso && !cerrada && <span className="block text-muted-foreground">Sin aperturas registradas</span>}
          {habilitado && !confirmando && (
            <span className="mt-0.5 block font-medium text-primary">Toca para {accion}</span>
          )}
          {ocupado && (
            <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {enviando ? "Enviando la orden…" : "Esperando al PLC…"}
            </span>
          )}
        </span>
      </button>
      {confirmando && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3">
          <p className="w-full text-sm text-foreground">
            ¿Seguro? Se va a {accion} la válvula auxiliar del Tanque {numero} en el PLC.
          </p>
          <Button size="sm" variant={abierta ? "destructive" : "default"} onClick={confirmar}>
            Sí, {accion}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </div>
      )}
      <MensajeError error={error} />
    </div>
  )
}

/** Indicador fijo (solo lectura) del estado de una válvula, tal cual lo entrega el PLC. */
function EstadoValvula({ nombre, abierta }: { nombre: string; abierta: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        abierta ? "border-success/40 bg-success/10" : "border-border bg-muted/50",
      )}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", abierta ? "bg-success" : "bg-muted-foreground/40")} />
      <span className="leading-tight">
        <span className="block text-muted-foreground">{nombre}</span>
        <span className={cn("font-medium", abierta && "text-success")}>{abierta ? "Abierta" : "Cerrada"}</span>
      </span>
    </div>
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

/** Registro de aperturas de las válvulas auxiliares: cuándo se abrió cada una, cuándo se cerró y quién lo hizo. */
function RegistroAperturasAux({ aperturas }: { aperturas: AperturaAux[] }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Registro de válvulas auxiliares</CardTitle>
      </CardHeader>
      <CardContent>
        {aperturas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Todavía no hay aperturas registradas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanque</TableHead>
                <TableHead>Se abrió</TableHead>
                <TableHead>Abrió</TableHead>
                <TableHead>Se cerró</TableHead>
                <TableHead>Cerró</TableHead>
                <TableHead className="text-right">Tiempo abierta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aperturas.map((a) => (
                <TableRow key={`${a.tanque}-${a.inicio}`}>
                  <TableCell className="font-medium">Tanque {a.tanque}</TableCell>
                  <TableCell>{momentoLegible(a.inicio)}</TableCell>
                  <TableCell>{quienLegible(a.abierta_por) ?? "—"}</TableCell>
                  <TableCell>
                    {a.fin ? (
                      <>
                        {momentoLegible(a.fin)}
                        {a.motivo_fin && <span className="text-muted-foreground"> ({a.motivo_fin})</span>}
                      </>
                    ) : (
                      <Badge variant="success">Abierta</Badge>
                    )}
                  </TableCell>
                  <TableCell>{a.fin ? (quienLegible(a.cerrada_por) ?? "—") : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {a.fin ? duracionLegible(a.inicio, a.fin) : "—"}
                  </TableCell>
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
