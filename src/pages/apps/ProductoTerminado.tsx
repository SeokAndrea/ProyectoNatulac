import { useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  Apple,
  Check,
  Cherry,
  ChevronDown,
  Citrus,
  Droplets,
  Grape,
  Leaf,
  Loader2,
  PackageCheck,
  PenLine,
  XCircle,
} from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nombrePorCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { nivelMerma } from "@/lib/estadisticas"
import { cn } from "@/lib/utils"
import { LIMITE_MERMA, useTurno, type LineaEnTurno, type ProductoTerminadoRegistro, type TurnoActivo } from "@/lib/turno"

const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

/** Ícono + color por sabor (por nombre de fruta) — mismo criterio de color que el Panel de Producción, con un ícono cuando hay uno razonable. */
const FRUTA_INFO: Array<{ prueba: RegExp; Icono: typeof Apple; color: string }> = [
  { prueba: /manzana/i, Icono: Apple, color: "var(--flavor-red)" },
  { prueba: /uva/i, Icono: Grape, color: "var(--flavor-red)" },
  { prueba: /durazno/i, Icono: Cherry, color: "var(--flavor-yellow)" },
  { prueba: /(naranja|mango)/i, Icono: Citrus, color: "var(--flavor-orange)" },
  { prueba: /pera/i, Icono: Leaf, color: "var(--flavor-green)" },
]
const COLORES_SABOR_FALLBACK = ["var(--flavor-orange)", "var(--flavor-green)", "var(--flavor-red)", "var(--flavor-yellow)"]

function infoSabor(nombre: string | null): { color: string; Icono: typeof Apple } {
  if (!nombre) return { color: "var(--muted-foreground)", Icono: Droplets }
  const encontrada = FRUTA_INFO.find((f) => f.prueba.test(nombre))
  if (encontrada) return encontrada
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) % 997
  return { color: COLORES_SABOR_FALLBACK[hash % COLORES_SABOR_FALLBACK.length], Icono: Droplets }
}

/*
 * Producto Terminado: una lista con TODA línea que se usó en el turno
 * (activa, esperando cierre, o ya finalizada — no solo las activas),
 * organizada en 3 niveles — Sabor → Lote → Línea — porque un sabor
 * puede tener varios lotes a lo largo del turno, y un lote puede estar
 * alimentando varias líneas a la vez. Envases de la llenadora
 * (Contador, un log que se acumula solo) se cargan junto a
 * Paletas/Cajas sueltas, pero estas últimas son el TOTAL actual (se
 * editan, no se suman) — ver FilaProductoTerminado. El sabor sale
 * solo de la corrida (el mismo que se copió del tanque al activar la
 * línea) — no se elige aparte. Un registro es por CORRIDA
 * (turnoLineaId), no por línea suelta.
 */
export default function ProductoTerminado() {
  const { turnoActivo, cargando, registrarProductoTerminado, registrarContador, entregarCorrida, terminarSaborLinea } = useTurno()
  const { lineas, presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <EmptyState
          icon={PackageCheck}
          title="Primero debes iniciar un turno"
          description="Producto Terminado se asocia al turno en curso. Inicia uno desde Comenzar Turno."
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/turno">Ir a Comenzar Turno</Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  const corridasUsadas = [...turnoActivo.lineas].sort((a, b) => b.activadaEn.localeCompare(a.activadaEn))

  if (corridasUsadas.length === 0) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <EmptyState
          icon={PackageCheck}
          title="Ninguna línea usada todavía"
          description="Activa una corrida en Preparación para poder registrar su producto terminado."
        />
      </AppShell>
    )
  }

  // Cerrada = ya finalizada, o ya "Cerrada" por este supervisor (entregada al siguiente turno) — ambas dejan de pedir carga.
  const pendientes = corridasUsadas.filter((l) => (l.activa || l.esperandoCierre) && l.entregadaEn === null)
  const cerradas = corridasUsadas.filter((l) => (!l.activa && !l.esperandoCierre) || l.entregadaEn !== null)

  return (
    <AppShell title="Producto Terminado y Contador" description={`Turno ${turnoActivo.codigo}`} fullWidth>
      <div className="flex flex-col gap-3">
        {pendientes.length === 0 && cerradas.length > 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay corridas pendientes de carga — todas las de este turno ya están cerradas.
          </p>
        )}
        <ListaCorridas
          corridas={pendientes}
          turnoActivo={turnoActivo}
          lineas={lineas}
          presentaciones={presentaciones}
          onRegistrarProducto={registrarProductoTerminado}
          onRegistrarContador={registrarContador}
          onEntregarCorrida={entregarCorrida}
          onTerminarSabor={terminarSaborLinea}
        />

        {cerradas.length > 0 && (
          <CorridasCerradas
            corridas={cerradas}
            turnoActivo={turnoActivo}
            lineas={lineas}
            presentaciones={presentaciones}
            onRegistrarProducto={registrarProductoTerminado}
            onRegistrarContador={registrarContador}
            onEntregarCorrida={entregarCorrida}
            onTerminarSabor={terminarSaborLinea}
          />
        )}
      </div>
    </AppShell>
  )
}

interface GrupoLote {
  key: string
  loteId: string | null
  lote: string | null
  corridas: LineaEnTurno[]
}

interface GrupoSabor {
  key: string
  saborNombre: string | null
  lotes: GrupoLote[]
}

/**
 * Sabor → Lote, con las líneas de cada lote SIEMPRE en el mismo orden
 * (Línea 1, 2, 3...) sin importar cuál se activó primero — para que
 * la posición de cada línea en la lista no salte de un momento a otro.
 */
function agruparPorSaborYLote(corridas: LineaEnTurno[]): GrupoSabor[] {
  const porSabor = new Map<string, LineaEnTurno[]>()
  for (const l of corridas) {
    const key = l.saborId ?? `sin-sabor-${l.saborNombre ?? "?"}`
    porSabor.set(key, [...(porSabor.get(key) ?? []), l])
  }

  return [...porSabor.entries()].map(([key, grupo]) => {
    const porLote = new Map<string, LineaEnTurno[]>()
    for (const l of grupo) {
      const loteKey = l.loteId ?? l.id
      porLote.set(loteKey, [...(porLote.get(loteKey) ?? []), l])
    }

    const lotes: GrupoLote[] = [...porLote.entries()].map(([loteKey, corridasLote]) => ({
      key: loteKey,
      loteId: corridasLote[0].loteId,
      lote: corridasLote[0].lote,
      corridas: [...corridasLote].sort((a, b) => a.linea.localeCompare(b.linea)),
    }))

    return { key, saborNombre: grupo[0].saborNombre, lotes }
  })
}

function ListaCorridas({
  corridas,
  turnoActivo,
  lineas,
  presentaciones,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
}: {
  corridas: LineaEnTurno[]
  turnoActivo: TurnoActivo
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
}) {
  const grupos = agruparPorSaborYLote(corridas)
  const [saborAbierto, setSaborAbierto] = useState<string | null>(grupos.length === 1 ? grupos[0].key : null)
  const [loteAbierto, setLoteAbierto] = useState<string | null>(null)

  const grupoSabor = grupos.find((g) => g.key === saborAbierto) ?? null
  const loteEfectivo = loteAbierto ?? (grupoSabor?.lotes.length === 1 ? grupoSabor.lotes[0].key : null)
  const grupoLote = grupoSabor?.lotes.find((l) => l.key === loteEfectivo) ?? null

  function abrirSabor(key: string) {
    setSaborAbierto((actual) => (actual === key ? null : key))
    setLoteAbierto(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        {grupos.map((g) => {
          const { color, Icono } = infoSabor(g.saborNombre)
          const totalLineas = g.lotes.reduce((a, l) => a + l.corridas.length, 0)
          const abierto = saborAbierto === g.key
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => abrirSabor(g.key)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border-2 px-3 py-6 text-center transition-colors",
                abierto
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-foreground/25 bg-muted/30 text-foreground hover:bg-muted/60",
              )}
            >
              <Icono className="size-8" style={{ color: abierto ? undefined : color }} />
              <span className="text-base font-semibold uppercase tracking-wide">{g.saborNombre ?? "Sin sabor"}</span>
              <span className="text-xs text-muted-foreground">
                {g.lotes.length} {g.lotes.length === 1 ? "lote" : "lotes"} · {totalLineas} {totalLineas === 1 ? "línea" : "líneas"}
              </span>
            </button>
          )
        })}
      </div>

      {grupoSabor && (
        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {grupoSabor.lotes.map((l) => (
            <div key={l.key} className="relative">
              <button
                type="button"
                onClick={() => setLoteAbierto((actual) => (actual === l.key ? null : l.key))}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-6 text-center transition-colors",
                  loteEfectivo === l.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-foreground/25 bg-muted/30 text-foreground hover:bg-muted/60",
                )}
              >
                <span className="text-base font-semibold uppercase tracking-wide">Lote {l.lote ?? "sin código"}</span>
                <span className="text-xs text-muted-foreground">
                  {l.corridas.length} {l.corridas.length === 1 ? "línea" : "líneas"}
                </span>
              </button>
              <BotonCerrarLote lote={l} onTerminarSabor={onTerminarSabor} />
            </div>
          ))}
        </div>
      )}

      {grupoLote && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {grupoLote.corridas.map((l) => (
            <FilaProductoTerminado
              key={l.id}
              lineaTurno={l}
              nombreLinea={nombrePorCodigo(lineas, l.linea)}
              contadorActual={turnoActivo.contadores.filter((c) => c.turnoLineaId === l.id).reduce((a, c) => a + c.envasesLlenadora, 0)}
              presentaciones={presentaciones}
              registroExistente={turnoActivo.productoTerminado.find((p) => p.turnoLineaId === l.id) ?? null}
              onRegistrarProducto={onRegistrarProducto}
              onRegistrarContador={onRegistrarContador}
              onEntregarCorrida={onEntregarCorrida}
              onTerminarSabor={onTerminarSabor}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * "Cerrar" un lote entero: termina el sabor de todas sus líneas
 * activas de una sola vez (equivalente a apretar Terminó Sabor en
 * cada una) — no borra ni oculta nada, las corridas cerradas se
 * siguen viendo igual que siempre en "Corridas cerradas", con la
 * misma información del turno.
 */
function BotonCerrarLote({ lote, onTerminarSabor }: { lote: GrupoLote; onTerminarSabor: OnTerminarSabor }) {
  const [confirmando, setConfirmando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activas = lote.corridas.filter((c) => c.activa)

  if (activas.length === 0) return null

  async function cerrar() {
    setCerrando(true)
    setError(null)
    for (const corrida of activas) {
      const resultado = await onTerminarSabor(corrida.id)
      if (!resultado.ok) {
        setError(resultado.error)
        setCerrando(false)
        return
      }
    }
    setCerrando(false)
    setConfirmando(false)
  }

  if (confirmando) {
    return (
      <div className="absolute -top-2 -right-2 z-10 flex flex-col items-end gap-1">
        <div className="flex items-center gap-1 rounded-full border border-destructive/40 bg-background px-1.5 py-1 shadow-sm">
          <button type="button" className="px-1 text-[10px] font-semibold text-destructive" onClick={cerrar} disabled={cerrando}>
            {cerrando ? <Loader2 className="size-3 animate-spin" /> : "Sí, cerrar"}
          </button>
          <button
            type="button"
            className="px-1 text-[10px] text-muted-foreground"
            onClick={() => setConfirmando(false)}
            disabled={cerrando}
          >
            No
          </button>
        </div>
        {error && <p className="max-w-32 text-right text-[10px] text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      title={`Cerrar Lote ${lote.lote ?? ""} — termina el sabor de sus ${activas.length} ${activas.length === 1 ? "línea" : "líneas"}`}
      className="absolute -top-2.5 -right-2.5 z-10 flex items-center gap-1 rounded-full border border-destructive/40 bg-background px-2 py-1 text-destructive shadow-md transition-colors hover:bg-destructive/10"
      onClick={() => setConfirmando(true)}
    >
      <XCircle className="size-4" />
      <span className="text-[10px] font-semibold">Cerrar</span>
    </button>
  )
}

/** Corridas ya finalizadas: colapsadas por defecto detrás de un toggle, para no tener que scrollear entre ellas para llegar a las que sí necesitan carga. */
function CorridasCerradas({
  corridas,
  turnoActivo,
  lineas,
  presentaciones,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
}: {
  corridas: LineaEnTurno[]
  turnoActivo: TurnoActivo
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={`size-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
        {abierto ? "Ocultar" : "Ver"} corridas cerradas ({corridas.length})
      </button>
      {abierto && (
        <ListaCorridas
          corridas={corridas}
          turnoActivo={turnoActivo}
          lineas={lineas}
          presentaciones={presentaciones}
          onRegistrarProducto={onRegistrarProducto}
          onRegistrarContador={onRegistrarContador}
          onEntregarCorrida={onEntregarCorrida}
          onTerminarSabor={onTerminarSabor}
        />
      )}
    </div>
  )
}

type ResultadoAccion = { ok: true } | { ok: false; error: string }

type OnRegistrarProducto = (datos: {
  turnoLineaId: string
  linea: LineaEnTurno["linea"]
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
}) => Promise<ResultadoAccion>

type OnRegistrarContador = (datos: {
  turnoLineaId: string
  linea: LineaEnTurno["linea"]
  envasesLlenadora: number
  justificacion: string
}) => Promise<ResultadoAccion>

type OnEntregarCorrida = (turnoLineaId: string) => Promise<ResultadoAccion>
type OnTerminarSabor = (turnoLineaId: string) => Promise<ResultadoAccion>

type ProximoEstado = "TERMINO_SABOR" | "CONTINUA"

function FilaProductoTerminado({
  lineaTurno,
  nombreLinea,
  contadorActual,
  presentaciones,
  registroExistente,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
}: {
  lineaTurno: LineaEnTurno
  nombreLinea: string
  contadorActual: number
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  registroExistente: ProductoTerminadoRegistro | null
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
}) {
  const saborId = registroExistente?.saborId ?? lineaTurno.saborId
  /** Ya se decidió el destino de esta corrida (Terminó Corrida o Entregada al siguiente turno) — queda bloqueada salvo "Editar un error". */
  const estaCerrada = (!lineaTurno.activa && !lineaTurno.esperandoCierre) || lineaTurno.entregadaEn !== null
  /** Sigue corriendo y todavía no se decidió su próximo estado — acá se elige y se cierra de una. */
  const puedeElegirProximoEstado = lineaTurno.activa && lineaTurno.entregadaEn === null

  const [editandoError, setEditandoError] = useState(false)
  const [envasesLlenadora, setEnvasesLlenadora] = useState("")
  /** Paletas/Cajas sueltas son el TOTAL actual — se editan (reemplazan lo que había), no se suman. */
  const [paletas, setPaletas] = useState(registroExistente ? String(registroExistente.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(registroExistente ? String(registroExistente.cajasSueltas) : "")
  const [justificacion, setJustificacion] = useState("")
  const [proximoEstado, setProximoEstado] = useState<ProximoEstado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasXPaleta = presentacion?.cajasXPaleta ?? 0
  const cajasTotalPreview = nPaletas * cajasXPaleta + nCajasSueltas
  const envasesProducidos = presentacion ? cajasTotalPreview * presentacion.envasesXCaja : 0
  const litrosPreview = presentacion ? (envasesProducidos * presentacion.volumenMl) / 1000 : 0

  const nuevoContador = envasesLlenadora === "" ? 0 : Number(envasesLlenadora)
  const contadorTotalPreview = contadorActual + nuevoContador

  const mermaPct =
    contadorTotalPreview > 0 && (paletas !== "" || cajasSueltas !== "")
      ? Math.round((1 - envasesProducidos / contadorTotalPreview) * 10000) / 100
      : null
  const nivel = mermaPct === null ? null : nivelMerma(mermaPct, LIMITE_MERMA_PCT)
  const requiereJustificacion = nivel === "danger"

  const hayContadorNuevo = envasesLlenadora !== "" && nuevoContador > 0
  const hayProducto = (paletas !== "" || cajasSueltas !== "") && nPaletas >= 0 && nCajasSueltas >= 0
  const hayDatos = hayContadorNuevo || hayProducto
  const modoCorreccion = estaCerrada && editandoError
  const valido =
    hayDatos &&
    (!puedeElegirProximoEstado || proximoEstado !== null) &&
    (!requiereJustificacion || justificacion.trim() !== "")
  const textoBoton = modoCorreccion ? "Guardar corrección" : puedeElegirProximoEstado ? "Cerrar" : "Registrar"

  async function guardar() {
    if (!valido) return
    setEnviando(true)
    setError(null)

    if (hayContadorNuevo) {
      const resultado = await onRegistrarContador({
        turnoLineaId: lineaTurno.id,
        linea: lineaTurno.linea,
        envasesLlenadora: nuevoContador,
        justificacion: justificacion.trim(),
      })
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    if (hayProducto) {
      const resultado = await onRegistrarProducto({
        turnoLineaId: lineaTurno.id,
        linea: lineaTurno.linea,
        saborId: saborId || null,
        presentacion: lineaTurno.presentacion,
        paletas: nPaletas,
        cajasSueltas: nCajasSueltas,
      })
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    if (proximoEstado === "CONTINUA") {
      const resultado = await onEntregarCorrida(lineaTurno.id)
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    if (proximoEstado === "TERMINO_SABOR") {
      const resultado = await onTerminarSabor(lineaTurno.id)
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    setEnviando(false)
    setEnvasesLlenadora("")
    setJustificacion("")
    setProximoEstado(null)
    setEditandoError(false)
  }

  // Ya cerrada (Terminó Corrida o Entregada) y no se está corrigiendo un error: vista bloqueada, solo lectura.
  if (estaCerrada && !editandoError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">
                {nombreLinea}
              </span>
              {lineaTurno.lote && <span className="text-sm font-normal text-muted-foreground">Lote {lineaTurno.lote}</span>}
            </CardTitle>
            <Badge variant="muted">Cerrada</Badge>
          </div>
          <CardDescription>{presentacion?.nombre ?? `${lineaTurno.presentacion} ml`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Contador acumulado</p>
              <p className="font-medium text-foreground">{contadorActual.toLocaleString("es-CO")} envases</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paletas · Cajas sueltas</p>
              <p className="font-medium text-foreground">
                {registroExistente ? `${registroExistente.paletas} · ${registroExistente.cajasSueltas}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Litros producidos</p>
              <p className="font-medium text-foreground">{(registroExistente?.litrosProducidos ?? 0).toLocaleString("es-CO")} L</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className="font-medium text-foreground">
                {lineaTurno.entregadaEn ? `Entregada a las ${lineaTurno.entregadaEn.slice(11, 16)}` : "Sabor terminado"}
              </p>
            </div>
          </div>

          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setEditandoError(true)}>
            <PenLine className="size-3.5" />
            Editar un error
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">{nombreLinea}</span>
            {lineaTurno.lote && <span className="text-sm font-normal text-muted-foreground">Lote {lineaTurno.lote}</span>}
            {registroExistente && <Check className="size-3.5 text-muted-foreground" />}
          </CardTitle>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Contador acumulado: {contadorActual.toLocaleString("es-CO")} envases
          </span>
        </div>
        <CardDescription>{presentacion?.nombre ?? `${lineaTurno.presentacion} ml`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`contador-${lineaTurno.id}`}>Envases llenadora (Contador)</Label>
            <Input
              id={`contador-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Sumar al contador"
              value={envasesLlenadora}
              onChange={(e) => setEnvasesLlenadora(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sabor</Label>
            <p className="flex h-9 items-center text-sm text-foreground">{lineaTurno.saborNombre ?? "—"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`paletas-${lineaTurno.id}`}>Paletas</Label>
            <Input
              id={`paletas-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Paletas"
              value={paletas}
              onChange={(e) => setPaletas(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resto-${lineaTurno.id}`}>Cajas sueltas</Label>
            <Input
              id={`resto-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Cajas sueltas"
              value={cajasSueltas}
              onChange={(e) => setCajasSueltas(e.target.value)}
            />
          </div>
        </div>

        {presentacion && (paletas !== "" || cajasSueltas !== "") && (
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{cajasTotalPreview.toLocaleString("es-CO")} cajas</span>,{" "}
            <span className="font-medium text-foreground">{envasesProducidos.toLocaleString("es-CO")} envases</span>,{" "}
            <span className="font-medium text-foreground">{litrosPreview.toLocaleString("es-CO")} L</span>.
          </p>
        )}

        {mermaPct !== null && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              nivel === "danger"
                ? "border-danger/40 bg-danger-soft text-danger"
                : nivel === "warn"
                  ? "border-warning/40 bg-warning-soft text-warning"
                  : "border-success/35 bg-success-soft text-success",
            )}
          >
            {requiereJustificacion && <AlertTriangle className="size-4 shrink-0" />}
            Merma estimada: <span className="font-semibold">{mermaPct}%</span>
            {requiereJustificacion ? ` — supera el ${LIMITE_MERMA_PCT}%, requiere justificación.` : ` (límite ${LIMITE_MERMA_PCT}%)`}
          </div>
        )}

        {requiereJustificacion && (
          <Textarea
            placeholder="Justificación de la merma..."
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
          />
        )}

        {puedeElegirProximoEstado && (
          <div className="flex flex-col gap-1.5">
            <Label>¿Qué pasa con esta línea?</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setProximoEstado("TERMINO_SABOR")}
                className={cn(
                  "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors",
                  proximoEstado === "TERMINO_SABOR"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-foreground/25 text-foreground hover:bg-muted/60",
                )}
              >
                Terminó Corrida
              </button>
              <button
                type="button"
                onClick={() => setProximoEstado("CONTINUA")}
                className={cn(
                  "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors",
                  proximoEstado === "CONTINUA"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-foreground/25 text-foreground hover:bg-muted/60",
                )}
              >
                Continúa siguiente turno
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button size="sm" className="self-start" onClick={guardar} disabled={!valido || enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
            {textoBoton}
          </Button>
          {modoCorreccion && (
            <Button size="sm" variant="ghost" onClick={() => setEditandoError(false)} disabled={enviando}>
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
