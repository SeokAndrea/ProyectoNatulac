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
} from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { agruparPorSaborYLote } from "@/lib/agruparProduccion"
import { nombrePorCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { nivelMerma } from "@/lib/estadisticas"
import { cn } from "@/lib/utils"
import { LIMITE_MERMA } from "@/lib/turno"
import { useSesionTurno } from "@/lib/sesionTurno"
import { useProduccion } from "@/lib/produccion/useProduccion"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import { usePreparacion } from "@/lib/preparacion/usePreparacion"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useProductoTerminado } from "@/lib/productoTerminado"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"

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

/** Misma normalización que normalizar_lote() en la base: sirve para casar una corrida con su tanque por número de lote. */
function normalizarLote(lote: string | null): string | null {
  if (lote === null) return null
  const t = lote.trim()
  if (t === "") return null
  if (!/^[0-9]+$/.test(t)) return t
  return (t.replace(/^0+/, "") || "0").padStart(4, "0")
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
  const sesion = useSesionTurno()
  const {
    corridas,
    contadores,
    cargando: cargandoProduccion,
    registrarContador,
    entregarCorrida,
    terminarSaborLinea,
  } = useProduccion()
  const { registros: productoTerminado, cargando: cargandoPT, registrarProductoTerminado } = useProductoTerminado()
  const { tanques, preparaciones, medirTanque, cargando: cargandoPreparacion } = usePreparacion()
  const { lineas, presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()
  const cargando = sesion.cargando || cargandoProduccion || cargandoPT || cargandoPreparacion

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado" fullWidth>
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!sesion.turnoId) {
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

  const corridasUsadas = [...corridas].sort((a, b) => b.activadaEn.localeCompare(a.activadaEn))

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
    <AppShell title="Producto Terminado y Contador" description={`Turno ${sesion.codigo}`} fullWidth>
      <div className="flex flex-col gap-3">
        {pendientes.length === 0 && cerradas.length > 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No hay corridas pendientes de carga — todas las de este turno ya están cerradas.
          </p>
        )}
        <ListaCorridas
          corridas={pendientes}
          contadores={contadores}
          productoTerminado={productoTerminado}
          tanques={tanques}
          preparaciones={preparaciones}
          lineas={lineas}
          presentaciones={presentaciones}
          onRegistrarProducto={registrarProductoTerminado}
          onRegistrarContador={registrarContador}
          onEntregarCorrida={entregarCorrida}
          onTerminarSabor={terminarSaborLinea}
          onMedirTanque={medirTanque}
        />

        {cerradas.length > 0 && (
          <CorridasCerradas
            corridas={cerradas}
            contadores={contadores}
            productoTerminado={productoTerminado}
            tanques={tanques}
            preparaciones={preparaciones}
            lineas={lineas}
            presentaciones={presentaciones}
            onRegistrarProducto={registrarProductoTerminado}
            onRegistrarContador={registrarContador}
            onEntregarCorrida={entregarCorrida}
            onTerminarSabor={terminarSaborLinea}
            onMedirTanque={medirTanque}
          />
        )}
      </div>
    </AppShell>
  )
}

// GrupoLote/GrupoSabor/agruparPorSaborYLote se movieron a src/lib/agruparProduccion.ts (compartido con el acta en PDF).

function ListaCorridas({
  corridas,
  contadores,
  productoTerminado,
  tanques,
  preparaciones,
  lineas,
  presentaciones,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
  onMedirTanque,
}: {
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
  onMedirTanque: OnMedirTanque
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
            <button
              key={l.key}
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
              contadorActual={contadores
                .filter((c) => c.corridaId === l.id && !c.parcial)
                .reduce((a, c) => a + c.envasesLlenadora, 0)}
              presentaciones={presentaciones}
              tanques={tanques}
              preparaciones={preparaciones}
              registroExistente={productoTerminado.find((p) => p.corridaId === l.id) ?? null}
              onRegistrarProducto={onRegistrarProducto}
              onRegistrarContador={onRegistrarContador}
              onEntregarCorrida={onEntregarCorrida}
              onTerminarSabor={onTerminarSabor}
              onMedirTanque={onMedirTanque}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Corridas ya finalizadas: colapsadas por defecto detrás de un toggle, para no tener que scrollear entre ellas para llegar a las que sí necesitan carga. */
function CorridasCerradas({
  corridas,
  contadores,
  productoTerminado,
  tanques,
  preparaciones,
  lineas,
  presentaciones,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
  onMedirTanque,
}: {
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
  onMedirTanque: OnMedirTanque
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
          contadores={contadores}
          productoTerminado={productoTerminado}
          tanques={tanques}
          preparaciones={preparaciones}
          lineas={lineas}
          presentaciones={presentaciones}
          onRegistrarProducto={onRegistrarProducto}
          onRegistrarContador={onRegistrarContador}
          onEntregarCorrida={onEntregarCorrida}
          onTerminarSabor={onTerminarSabor}
          onMedirTanque={onMedirTanque}
        />
      )}
    </div>
  )
}

type ResultadoAccion = { ok: true } | { ok: false; error: string }

/*
 * productoRetenido/cajasRetenidas NO están acá: el módulo Producto
 * Terminado nuevo (src/lib/productoTerminado.ts) ya no los expone —
 * confirmado muertos (el frontend siempre mandaba false/null), ver
 * plan-rework-3-modulos-y-merma.md §2.9. registrarProductoTerminado()
 * los manda fijos del lado del módulo.
 */
type OnRegistrarProducto = (datos: {
  corridaId: string
  linea: Corrida["linea"]
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
  /** true = entrega parcial: paletas/cajas se suman al acumulado y la corrida queda abierta. */
  parcial?: boolean
}) => Promise<ResultadoAccion>

type OnRegistrarContador = (datos: {
  corridaId: string
  linea: Corrida["linea"]
  envasesLlenadora: number
  /** Contador 2 (envases buenos), obligatorio — ver ContadorRegistro.envasesBuenos en src/lib/produccion/tipos.ts. */
  envasesBuenos?: number | null
  justificacion: string
  /** true = lectura de referencia de una entrega parcial (no cuenta para merma). */
  parcial?: boolean
}) => Promise<ResultadoAccion>

type OnEntregarCorrida = (corridaId: string) => Promise<ResultadoAccion>
type OnTerminarSabor = (corridaId: string) => Promise<ResultadoAccion>
type OnMedirTanque = (numeroTanque: 1 | 2 | 3, volumenReal: number) => Promise<ResultadoAccion>

type ProximoEstado = "TERMINO_SABOR" | "CONTINUA"

function FilaProductoTerminado({
  lineaTurno,
  nombreLinea,
  contadorActual,
  presentaciones,
  tanques,
  preparaciones,
  registroExistente,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
  onTerminarSabor,
  onMedirTanque,
}: {
  lineaTurno: Corrida
  nombreLinea: string
  contadorActual: number
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  registroExistente: ProductoTerminadoRegistro | null
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
  onTerminarSabor: OnTerminarSabor
  onMedirTanque: OnMedirTanque
}) {
  const saborId = registroExistente?.saborId ?? lineaTurno.saborId
  /** Ya se decidió el destino de esta corrida (Terminó Corrida o Entregada al siguiente turno) — queda bloqueada salvo "Editar un error". */
  const estaCerrada = (!lineaTurno.activa && !lineaTurno.esperandoCierre) || lineaTurno.entregadaEn !== null
  /** Corrida en pausa (parada reversible): no se puede cargar producto terminado hasta reanudarla. */
  const estaPausada = lineaTurno.pausadaEn !== null && !estaCerrada
  /** Sigue corriendo y todavía no se decidió su próximo estado — acá se elige y se cierra de una. */
  const puedeElegirProximoEstado = lineaTurno.activa && lineaTurno.entregadaEn === null

  const [editandoError, setEditandoError] = useState(false)
  const [envasesLlenadora, setEnvasesLlenadora] = useState("")
  /** Contador 2 (envases buenos), obligatorio junto con el contador de la llenadora. */
  const [envasesBuenos, setEnvasesBuenos] = useState("")
  /** Paletas/Cajas son el TOTAL actual de la corrida (se editan, reemplazan — sin entregas parciales). */
  const [paletas, setPaletas] = useState(registroExistente ? String(registroExistente.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(registroExistente ? String(registroExistente.cajasSueltas) : "")
  const [justificacion, setJustificacion] = useState("")
  const [proximoEstado, setProximoEstado] = useState<ProximoEstado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** Tras cerrar una corrida (Terminar / Entregar) se pide medir el tanque de ese lote — así deja de verse "lleno" y no se re-corre. */
  const [medicionTanque, setMedicionTanque] = useState<TanqueRecepcion | null>(null)
  const [medicionValor, setMedicionValor] = useState("")
  const [enviandoMedicion, setEnviandoMedicion] = useState(false)
  const [errorMedicion, setErrorMedicion] = useState<string | null>(null)

  /** El tanque Liberado que alimenta esta corrida (por sabor + número de lote). null si ya se cerró / vació. */
  function tanqueDeEstaCorrida(): TanqueRecepcion | null {
    return (
      tanques.find(
        (t) =>
          (t.condicion === "LISTO" || t.condicion === "STANDBY") &&
          t.saborId === saborId &&
          normalizarLote(t.lote) === normalizarLote(lineaTurno.lote),
      ) ?? null
    )
  }

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasXPaleta = presentacion?.cajasXPaleta ?? 0
  const cajasEsteRegistro = nPaletas * cajasXPaleta + nCajasSueltas
  const acumuladoPaletas = nPaletas
  const acumuladoCajasSueltas = nCajasSueltas
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
  const hayDatos = hayContadorNuevo || hayProducto
  const modoCorreccion = estaCerrada && editandoError
  /** El Contador 2 (envases buenos) es OBLIGATORIO junto con el contador de la llenadora, y no puede superarlo. */
  const buenosValido =
    !hayContadorNuevo ||
    (nuevoContadorBuenos !== null && nuevoContadorBuenos >= 0 && nuevoContadorBuenos <= nuevoContador)
  const valido =
    hayDatos &&
    buenosValido &&
    (!puedeElegirProximoEstado || proximoEstado !== null) &&
    (!requiereJustificacion || justificacion.trim() !== "")
  const textoBoton = modoCorreccion
    ? "Guardar corrección"
    : puedeElegirProximoEstado
      ? "Cerrar"
      : "Registrar"

  async function guardar() {
    if (!valido) return
    // Si esta pasada CIERRA la corrida (Terminar / Entregar), después se pide medir el tanque.
    const cerrando = !modoCorreccion && proximoEstado !== null
    setEnviando(true)
    setError(null)

    // "Terminar" primero: deja la corrida en ESPERANDO_PT para que el
    // contador/PT que siguen la cierren de verdad (costura 2 —
    // terminar_sabor_linea ya no cierra por su cuenta).
    if (proximoEstado === "TERMINO_SABOR") {
      const resultado = await onTerminarSabor(lineaTurno.id)
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    if (hayContadorNuevo) {
      const resultado = await onRegistrarContador({
        corridaId: lineaTurno.id,
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
        corridaId: lineaTurno.id,
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

    setEnviando(false)
    setEnvasesLlenadora("")
    setEnvasesBuenos("")
    setJustificacion("")
    setProximoEstado(null)
    setEditandoError(false)

    if (cerrando) {
      const tanque = tanqueDeEstaCorrida()
      if (tanque) {
        setMedicionTanque(tanque)
        setMedicionValor("")
        setErrorMedicion(null)
      }
    }
  }

  // Tras cerrar la corrida: medir el tanque de ese lote (queda antes de la
  // vista "Cerrada" para que el paso no se pierda cuando la corrida ya se cerró).
  if (medicionTanque) {
    const prepTanque = preparaciones.find(
      (p) => p.numeroTanque === medicionTanque.numeroTanque && p.cerradoEn === null,
    )
    const nMedicion = Number(medicionValor)
    const medicionValida = medicionValor.trim() !== "" && Number.isFinite(nMedicion) && nMedicion >= 0

    const guardarMedicion = async () => {
      if (!medicionValida || !medicionTanque) return
      setEnviandoMedicion(true)
      setErrorMedicion(null)
      const resultado = await onMedirTanque(medicionTanque.numeroTanque, nMedicion)
      setEnviandoMedicion(false)
      if (!resultado.ok) {
        setErrorMedicion(resultado.error)
        return
      }
      setMedicionTanque(null)
      setMedicionValor("")
    }

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
            <Badge variant="warning">Medir Tanque {medicionTanque.numeroTanque}</Badge>
          </div>
          <CardDescription>Se cargó el Producto Terminado</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Mide el Tanque {medicionTanque.numeroTanque} y anota cuántos litros quedaron. Así el tanque deja de verse lleno
            y no se vuelve a correr por error; si quedó en cero, el lote se cierra solo.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`medicion-${lineaTurno.id}`}>Litros en el Tanque {medicionTanque.numeroTanque}</Label>
            <Input
              id={`medicion-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Litros medidos"
              value={medicionValor}
              onChange={(e) => setMedicionValor(e.target.value)}
            />
            {prepTanque?.volumenActualL != null && (
              <p className="text-xs text-muted-foreground">
                Teórico ahora: {prepTanque.volumenActualL.toLocaleString("es-CO")} L
              </p>
            )}
          </div>
          {errorMedicion && (
            <p className="text-sm text-destructive" role="alert">
              {errorMedicion}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={guardarMedicion} disabled={!medicionValida || enviandoMedicion}>
              {enviandoMedicion ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Guardar medición
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={enviandoMedicion}
              onClick={() => {
                setMedicionTanque(null)
                setMedicionValor("")
                setErrorMedicion(null)
              }}
            >
              No medir ahora
            </Button>
          </div>
        </CardContent>
      </Card>
    )
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
                {lineaTurno.entregadaEn ? `Entregada a las ${horaCortaPlanta(lineaTurno.entregadaEn, lineaTurno.entregadaEn)}` : "Sabor terminado"}
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
            <Label htmlFor={`contador-${lineaTurno.id}`}>Envases llenadora (Contador)</Label>
            <Input
              id={`contador-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Sumar al contador"
              value={envasesLlenadora}
              onChange={(e) => setEnvasesLlenadora(e.target.value)}
            />
            <Label htmlFor={`contador-buenos-${lineaTurno.id}`}>Envases buenos (Contador 2)</Label>
            <Input
              id={`contador-buenos-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Envases buenos"
              value={envasesBuenos}
              onChange={(e) => setEnvasesBuenos(e.target.value)}
              aria-invalid={hayContadorNuevo && !buenosValido}
            />
            {hayContadorNuevo && !buenosValido && (
              <p className="text-xs text-destructive" role="alert">
                {envasesBuenos === ""
                  ? "El Contador 2 (envases buenos) es obligatorio junto con el contador de la llenadora."
                  : "Los envases buenos no pueden superar el total de la llenadora."}
              </p>
            )}
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
            Total:{" "}
            <span className="font-medium text-foreground">{cajasEsteRegistro.toLocaleString("es-CO")} cajas</span>,{" "}
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
                Terminar
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
                Entregar línea (sigue el próximo turno)
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
