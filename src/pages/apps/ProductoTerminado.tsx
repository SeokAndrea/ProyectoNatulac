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
import { agruparPorSaborYLote, type GrupoLote } from "@/lib/agruparProduccion"
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

// GrupoLote/GrupoSabor/agruparPorSaborYLote se movieron a src/lib/agruparProduccion.ts (compartido con el acta en PDF).

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
              contadorActual={turnoActivo.contadores
                .filter((c) => c.turnoLineaId === l.id && !c.parcial)
                .reduce((a, c) => a + c.envasesLlenadora, 0)}
              contadorParcialRef={turnoActivo.contadores
                .filter((c) => c.turnoLineaId === l.id && c.parcial)
                .reduce((a, c) => a + c.envasesLlenadora, 0)}
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
 * activas de una sola vez (equivalente a apretar Terminar Lote en
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
  productoRetenido: boolean
  cajasRetenidas: number | null
  /** true = entrega parcial: paletas/cajas se suman al acumulado y la corrida queda abierta. */
  parcial?: boolean
}) => Promise<ResultadoAccion>

type OnRegistrarContador = (datos: {
  turnoLineaId: string
  linea: LineaEnTurno["linea"]
  envasesLlenadora: number
  /** Contador 2, opcional: envases buenos — ver ContadorRegistro.envasesBuenos en turno.tsx. */
  envasesBuenos?: number | null
  justificacion: string
  /** true = lectura de referencia de una entrega parcial (no cuenta para merma). */
  parcial?: boolean
}) => Promise<ResultadoAccion>

type OnEntregarCorrida = (turnoLineaId: string) => Promise<ResultadoAccion>
type OnTerminarSabor = (turnoLineaId: string) => Promise<ResultadoAccion>

type ProximoEstado = "TERMINO_SABOR" | "CONTINUA"

function FilaProductoTerminado({
  lineaTurno,
  nombreLinea,
  contadorActual,
  contadorParcialRef,
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
  /** Suma de las lecturas de contador tomadas en entregas parciales — solo referencia, no cuenta para merma. */
  contadorParcialRef: number
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
  /** Corrida en pausa (parada reversible): no se puede cargar producto terminado hasta reanudarla. */
  const estaPausada = lineaTurno.pausadaEn !== null && !estaCerrada
  /** Sigue corriendo y todavía no se decidió su próximo estado — acá se elige y se cierra de una. */
  const puedeElegirProximoEstado = lineaTurno.activa && lineaTurno.entregadaEn === null
  /**
   * La corrida ya usó "entrega parcial": desde acá Paletas/Cajas se
   * cargan por INCREMENTO (lo nuevo desde la última entrega) y se
   * suman al acumulado — no se edita el total.
   */
  const modoIncremental = registroExistente?.tieneParciales ?? false
  const parciales = registroExistente?.parciales ?? []

  const [editandoError, setEditandoError] = useState(false)
  const [envasesLlenadora, setEnvasesLlenadora] = useState("")
  /** Contador 2, opcional: envases buenos — ver ContadorRegistro.envasesBuenos en turno.tsx. */
  const [envasesBuenos, setEnvasesBuenos] = useState("")
  /**
   * Sin parciales: Paletas/Cajas son el TOTAL actual (se editan, reemplazan).
   * Con parciales (modoIncremental): arrancan vacías — son el incremento nuevo.
   */
  const [paletas, setPaletas] = useState(!modoIncremental && registroExistente ? String(registroExistente.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(
    !modoIncremental && registroExistente ? String(registroExistente.cajasSueltas) : "",
  )
  const [justificacion, setJustificacion] = useState("")
  const [proximoEstado, setProximoEstado] = useState<ProximoEstado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasXPaleta = presentacion?.cajasXPaleta ?? 0
  /** Cajas de ESTE registro (el incremento, si es modo incremental). */
  const cajasEsteRegistro = nPaletas * cajasXPaleta + nCajasSueltas
  /** Paletas/cajas TOTALES de la corrida tras guardar (acumulado + incremento en modo incremental). */
  const acumuladoPaletas = (modoIncremental ? (registroExistente?.paletas ?? 0) : 0) + nPaletas
  const acumuladoCajasSueltas = (modoIncremental ? (registroExistente?.cajasSueltas ?? 0) : 0) + nCajasSueltas
  const cajasAcumuladas = acumuladoPaletas * cajasXPaleta + acumuladoCajasSueltas
  const envasesAcumulados = presentacion ? cajasAcumuladas * presentacion.envasesXCaja : 0
  const litrosPreview = presentacion ? (cajasEsteRegistro * presentacion.envasesXCaja * presentacion.volumenMl) / 1000 : 0

  const nuevoContador = envasesLlenadora === "" ? 0 : Number(envasesLlenadora)
  const contadorTotalPreview = contadorActual + nuevoContador
  const nuevoContadorBuenos = envasesBuenos === "" ? null : Number(envasesBuenos)

  const mermaPct =
    contadorTotalPreview > 0 && (paletas !== "" || cajasSueltas !== "")
      ? Math.round((1 - envasesAcumulados / contadorTotalPreview) * 10000) / 100
      : null
  const nivel = mermaPct === null ? null : nivelMerma(mermaPct, LIMITE_MERMA_PCT)
  const requiereJustificacion = nivel === "danger"
  /** Todavía no hay contador definitivo (solo lecturas de referencia): la merma que se ve es provisional. */
  const mermaProvisional = mermaPct !== null && contadorActual === 0

  const hayContadorNuevo = envasesLlenadora !== "" && nuevoContador > 0
  const hayProducto = (paletas !== "" || cajasSueltas !== "") && nPaletas >= 0 && nCajasSueltas >= 0
  const hayIncremento = nPaletas > 0 || nCajasSueltas > 0
  const hayDatos = hayContadorNuevo || hayProducto
  const modoCorreccion = estaCerrada && editandoError
  const valido =
    hayDatos &&
    (!puedeElegirProximoEstado || proximoEstado !== null) &&
    (!requiereJustificacion || justificacion.trim() !== "")
  /** "Entrega parcial": solo con un incremento de producto cargado, mientras la corrida sigue activa. */
  const puedeEntregaParcial = puedeElegirProximoEstado && hayIncremento && (!requiereJustificacion || justificacion.trim() !== "")
  const textoBoton = modoCorreccion
    ? "Guardar corrección"
    : puedeElegirProximoEstado
      ? "Cerrar"
      : "Registrar"

  function limpiarCampos() {
    setPaletas("")
    setCajasSueltas("")
    setEnvasesLlenadora("")
    setEnvasesBuenos("")
    setJustificacion("")
  }

  /** Registra una entrega parcial: suma el incremento, deja la corrida abierta. El contador va como referencia. */
  async function entregarParcial() {
    if (!puedeEntregaParcial || enviando) return
    setEnviando(true)
    setError(null)

    if (hayContadorNuevo) {
      const resultado = await onRegistrarContador({
        turnoLineaId: lineaTurno.id,
        linea: lineaTurno.linea,
        envasesLlenadora: nuevoContador,
        envasesBuenos: nuevoContadorBuenos,
        justificacion: justificacion.trim(),
        parcial: true,
      })
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    const resultado = await onRegistrarProducto({
      turnoLineaId: lineaTurno.id,
      linea: lineaTurno.linea,
      saborId: saborId || null,
      presentacion: lineaTurno.presentacion,
      paletas: nPaletas,
      cajasSueltas: nCajasSueltas,
      productoRetenido: false,
      cajasRetenidas: null,
      parcial: true,
    })
    if (!resultado.ok) {
      setEnviando(false)
      setError(resultado.error)
      return
    }

    setEnviando(false)
    limpiarCampos()
  }

  async function guardar() {
    if (!valido) return
    setEnviando(true)
    setError(null)

    if (hayContadorNuevo) {
      const resultado = await onRegistrarContador({
        turnoLineaId: lineaTurno.id,
        linea: lineaTurno.linea,
        envasesLlenadora: nuevoContador,
        envasesBuenos: nuevoContadorBuenos,
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
        productoRetenido: false,
        cajasRetenidas: null,
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
    setEnvasesBuenos("")
    setJustificacion("")
    setProximoEstado(null)
    setEditandoError(false)
  }

  // Línea parada: no se carga producto terminado hasta reanudarla (desde Preparación).
  if (estaPausada && !editandoError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">
                {nombreLinea}
              </span>
              {lineaTurno.lote && <span className="text-lg font-normal text-muted-foreground">Lote {lineaTurno.lote}</span>}
            </CardTitle>
            <Badge variant="warning">Parada</Badge>
          </div>
          <CardDescription>{presentacion?.nombre ?? `${lineaTurno.presentacion} ml`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            La línea está parada. Reanúdala en Preparación para poder cargar su producto terminado.
          </p>
          {registroExistente && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Paletas · Cajas sueltas</p>
                <p className="font-medium text-foreground">
                  {registroExistente.paletas} · {registroExistente.cajasSueltas}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Litros producidos</p>
                <p className="font-medium text-foreground">
                  {(registroExistente.litrosProducidos ?? 0).toLocaleString("es-CO")} L
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={() => setEditandoError(true)}
          >
            <PenLine className="size-3.5" />
            Editar un error
          </Button>
        </CardContent>
      </Card>
    )
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
              {lineaTurno.lote && <span className="text-lg font-normal text-muted-foreground">Lote {lineaTurno.lote}</span>}
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

          {parciales.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {parciales.length} {parciales.length === 1 ? "entrega parcial" : "entregas parciales"}:{" "}
              {parciales.map((p) => `+${p.paletas}`).join(" · ")} paletas.
            </p>
          )}

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
            {lineaTurno.lote && <span className="text-lg font-normal text-muted-foreground">Lote {lineaTurno.lote}</span>}
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
            <Label htmlFor={`contador-${lineaTurno.id}`}>
              {modoIncremental ? "Envases llenadora (contador final)" : "Envases llenadora (Contador)"}
            </Label>
            <Input
              id={`contador-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Sumar al contador"
              value={envasesLlenadora}
              onChange={(e) => setEnvasesLlenadora(e.target.value)}
            />
            <Label htmlFor={`contador-buenos-${lineaTurno.id}`}>Envases buenos (Contador 2, opcional)</Label>
            <Input
              id={`contador-buenos-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Envases buenos"
              value={envasesBuenos}
              onChange={(e) => setEnvasesBuenos(e.target.value)}
            />
            {modoIncremental && (
              <p className="text-xs text-muted-foreground">
                En una entrega parcial es solo de referencia. El que cuenta para la merma es el contador final.
                {contadorParcialRef > 0 && ` Referencia parcial acumulada: ${contadorParcialRef.toLocaleString("es-CO")} envases.`}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sabor</Label>
            <p className="flex h-9 items-center text-sm text-foreground">{lineaTurno.saborNombre ?? "—"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`paletas-${lineaTurno.id}`}>{modoIncremental ? "Paletas nuevas" : "Paletas"}</Label>
            <Input
              id={`paletas-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder={modoIncremental ? "Paletas nuevas" : "Paletas"}
              value={paletas}
              onChange={(e) => setPaletas(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resto-${lineaTurno.id}`}>{modoIncremental ? "Cajas sueltas nuevas" : "Cajas sueltas"}</Label>
            <Input
              id={`resto-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder={modoIncremental ? "Cajas sueltas nuevas" : "Cajas sueltas"}
              value={cajasSueltas}
              onChange={(e) => setCajasSueltas(e.target.value)}
            />
          </div>
        </div>

        {presentacion && (paletas !== "" || cajasSueltas !== "") && (
          <p className="text-sm text-muted-foreground">
            {modoIncremental ? "Esta entrega" : "Total"}:{" "}
            <span className="font-medium text-foreground">{cajasEsteRegistro.toLocaleString("es-CO")} cajas</span>,{" "}
            <span className="font-medium text-foreground">{litrosPreview.toLocaleString("es-CO")} L</span>.
            {modoIncremental && (
              <>
                {" "}
                Acumulado de la corrida:{" "}
                <span className="font-medium text-foreground">
                  {acumuladoPaletas.toLocaleString("es-CO")} paletas · {acumuladoCajasSueltas.toLocaleString("es-CO")} cajas sueltas ·{" "}
                  {cajasAcumuladas.toLocaleString("es-CO")} cajas
                </span>
                .
              </>
            )}
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
            {mermaProvisional ? "Merma provisional (contra el contador de referencia)" : "Merma estimada"}:{" "}
            <span className="font-semibold">{mermaPct}%</span>
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

        {parciales.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
            <p className="font-medium text-foreground">
              Entregas parciales ({parciales.length}) — acumulado {registroExistente?.paletas ?? 0} paletas ·{" "}
              {registroExistente?.cajasSueltas ?? 0} cajas sueltas
            </p>
            {parciales.map((p) => (
              <p key={p.id} className="text-muted-foreground">
                + {p.paletas} paletas
                {p.cajasSueltas > 0 ? ` · ${p.cajasSueltas} cajas sueltas` : ""}
                {" · "}
                {p.creadoEn.slice(11, 16)}
                {p.usuarioNombre ? ` · ${p.usuarioNombre}` : ""}
              </p>
            ))}
          </div>
        )}

        {puedeElegirProximoEstado && (
          <div className="flex flex-col gap-1.5">
            <Label>Entrega parcial</Label>
            <button
              type="button"
              onClick={entregarParcial}
              disabled={!puedeEntregaParcial || enviando}
              title="Suma solo las paletas nuevas al acumulado y deja la corrida abierta"
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors",
                "border-foreground/25 text-foreground hover:bg-muted/60",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              Sumar paletas y continuar lote
            </button>
            <p className="text-xs text-muted-foreground">
              Carga solo las paletas nuevas desde la última entrega. El contador queda como referencia; el que cuenta es el del
              cierre definitivo.
            </p>
          </div>
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
                Terminar Lote
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

        <div className="flex flex-wrap gap-2">
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
