import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowRightCircle, Check, ChevronDown, Loader2, PackageCheck } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nombrePorCodigo, type PresentacionCodigo } from "@/lib/catalogos"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { LIMITE_MERMA, useTurno, type LineaEnTurno, type ProductoTerminadoRegistro, type TurnoActivo } from "@/lib/turno"

const LIMITE_MERMA_PCT = LIMITE_MERMA * 100

/*
 * Producto Terminado: una lista con TODA línea que se usó en el turno
 * (activa, esperando cierre, o ya finalizada — no solo las activas),
 * cada una con Envases de la llenadora (Contador) al lado de
 * Paletas/Cajas sueltas — se cargan juntos acá, el contador se
 * acumula, nunca se pisa. El sabor sale solo de la corrida (el mismo
 * que se copió del tanque al activar la línea) — no se elige aparte.
 * Un registro es por CORRIDA (turnoLineaId), no por línea suelta — si
 * una línea va por su segundo lote del turno, es un registro nuevo,
 * no pisa al del lote anterior.
 */
export default function ProductoTerminado() {
  const { turnoActivo, cargando, registrarProductoTerminado, registrarContador, entregarCorrida } = useTurno()
  const { lineas, presentaciones, cargando: cargandoCatalogos } = useCatalogosLive()

  if (cargando || cargandoCatalogos) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado">
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!turnoActivo) {
    return (
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado">
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
      <AppShell title="Producto Terminado y Contador" description="Carga de lotes de producto terminado">
        <EmptyState
          icon={PackageCheck}
          title="Ninguna línea usada todavía"
          description="Activa una corrida en Preparación para poder registrar su producto terminado."
        />
      </AppShell>
    )
  }

  // Cerrada = ya finalizada, no solo entregada/pausada — esas siguen necesitando carga.
  const pendientes = corridasUsadas.filter((l) => l.activa || l.esperandoCierre)
  const cerradas = corridasUsadas.filter((l) => !l.activa && !l.esperandoCierre)

  return (
    <AppShell title="Producto Terminado y Contador" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
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
          />
        )}
      </div>
    </AppShell>
  )
}

/**
 * Un lote (preparación) puede estar siendo consumido por varias líneas
 * a la vez — agrupar las tarjetas por lote hace evidente esa relación
 * en vez de mostrarlas como corridas sueltas sin conexión visual.
 */
function agruparPorLote(corridas: LineaEnTurno[]): { key: string; lote: string | null; corridas: LineaEnTurno[] }[] {
  const grupos = new Map<string, LineaEnTurno[]>()
  for (const l of corridas) {
    const key = l.loteId ?? l.id
    grupos.set(key, [...(grupos.get(key) ?? []), l])
  }
  return [...grupos.entries()].map(([key, grupo]) => ({ key, lote: grupo[0].lote, corridas: grupo }))
}

function ListaCorridas({
  corridas,
  turnoActivo,
  lineas,
  presentaciones,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
}: {
  corridas: LineaEnTurno[]
  turnoActivo: TurnoActivo
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
}) {
  const grupos = agruparPorLote(corridas)
  const [loteAbierto, setLoteAbierto] = useState<string | null>(grupos.length === 1 ? grupos[0].key : null)
  const grupoSeleccionado = grupos.find((g) => g.key === loteAbierto) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {grupos.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setLoteAbierto((actual) => (actual === g.key ? null : g.key))}
            className={
              "flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-3 text-center transition-colors " +
              (loteAbierto === g.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/30 text-foreground hover:bg-muted/60")
            }
          >
            <span className="text-sm font-semibold uppercase tracking-wide">Lote {g.lote ?? "sin código"}</span>
            <span className="text-xs text-muted-foreground">
              {g.corridas.length} {g.corridas.length === 1 ? "línea" : "líneas"}
            </span>
          </button>
        ))}
      </div>

      {grupoSeleccionado &&
        grupoSeleccionado.corridas.map((l) => (
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
          />
        ))}
    </div>
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
}: {
  corridas: LineaEnTurno[]
  turnoActivo: TurnoActivo
  lineas: ReturnType<typeof useCatalogosLive>["lineas"]
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
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

function FilaProductoTerminado({
  lineaTurno,
  nombreLinea,
  contadorActual,
  presentaciones,
  registroExistente,
  onRegistrarProducto,
  onRegistrarContador,
  onEntregarCorrida,
}: {
  lineaTurno: LineaEnTurno
  nombreLinea: string
  contadorActual: number
  presentaciones: ReturnType<typeof useCatalogosLive>["presentaciones"]
  registroExistente: ProductoTerminadoRegistro | null
  onRegistrarProducto: OnRegistrarProducto
  onRegistrarContador: OnRegistrarContador
  onEntregarCorrida: OnEntregarCorrida
}) {
  const saborId = registroExistente?.saborId ?? lineaTurno.saborId
  const corridaCerrada = !lineaTurno.activa && !lineaTurno.esperandoCierre
  const [envasesLlenadora, setEnvasesLlenadora] = useState("")
  /** Paletas/Cajas sueltas son SIEMPRE lo que se suma ahora (no el total) — igual que el Contador, se acumulan, nunca se pisan. */
  const [paletas, setPaletas] = useState("")
  const [cajasSueltas, setCajasSueltas] = useState("")
  const [justificacion, setJustificacion] = useState("")
  const [continuaSiguienteTurno, setContinuaSiguienteTurno] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasXPaleta = presentacion?.cajasXPaleta ?? 0
  const cajasAcumuladas = registroExistente ? registroExistente.paletas * cajasXPaleta + registroExistente.cajasSueltas : 0
  const cajasNuevas = nPaletas * cajasXPaleta + nCajasSueltas
  const cajasTotalPreview = cajasAcumuladas + cajasNuevas
  const envasesProducidos = presentacion ? cajasTotalPreview * presentacion.envasesXCaja : 0

  const nuevoContador = envasesLlenadora === "" ? 0 : Number(envasesLlenadora)
  const contadorTotalPreview = contadorActual + nuevoContador

  const mermaPct =
    contadorTotalPreview > 0 && (paletas !== "" || cajasSueltas !== "" || cajasAcumuladas > 0)
      ? Math.round((1 - envasesProducidos / contadorTotalPreview) * 10000) / 100
      : null
  const requiereJustificacion = mermaPct !== null && mermaPct > LIMITE_MERMA_PCT

  const hayContadorNuevo = envasesLlenadora !== "" && nuevoContador > 0
  const hayProducto = (paletas !== "" || cajasSueltas !== "") && nPaletas >= 0 && nCajasSueltas >= 0
  const valido =
    (hayContadorNuevo || hayProducto || continuaSiguienteTurno) && (!requiereJustificacion || justificacion.trim() !== "")

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

    if (continuaSiguienteTurno) {
      const resultado = await onEntregarCorrida(lineaTurno.id)
      if (!resultado.ok) {
        setEnviando(false)
        setError(resultado.error)
        return
      }
    }

    setEnviando(false)
    setEnvasesLlenadora("")
    setPaletas("")
    setCajasSueltas("")
    setJustificacion("")
    setContinuaSiguienteTurno(false)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {nombreLinea}
            {lineaTurno.lote ? ` · Lote ${lineaTurno.lote}` : ""}
            {registroExistente && <Check className="size-3.5 text-muted-foreground" />}
          </CardTitle>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Contador acumulado: {contadorActual.toLocaleString("es-CO")} envases
          </span>
        </div>
        <CardDescription>{presentacion?.nombre ?? `${lineaTurno.presentacion} ml`}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {registroExistente && (
          <div className="grid grid-cols-3 divide-x divide-border rounded-lg border bg-muted/30">
            <div className="flex flex-col items-center gap-0.5 px-2 py-3">
              <span className="num text-2xl font-bold leading-none text-foreground">{cajasAcumuladas.toLocaleString("es-CO")}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Total cajas</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-2 py-3">
              <span className="num text-2xl font-bold leading-none text-foreground">
                {registroExistente.paletas.toLocaleString("es-CO")}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Paletas</span>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-2 py-3">
              <span className="num text-2xl font-bold leading-none text-foreground">
                {(presentacion ? cajasAcumuladas * presentacion.envasesXCaja : 0).toLocaleString("es-CO")}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Envases</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`contador-${lineaTurno.id}`}>Envases llenadora (Contador)</Label>
            {corridaCerrada ? (
              <p className="flex h-9 items-center text-xs text-muted-foreground">Corrida cerrada — no se puede sumar más.</p>
            ) : (
              <Input
                id={`contador-${lineaTurno.id}`}
                type="number"
                min={0}
                placeholder="Sumar al contador"
                value={envasesLlenadora}
                onChange={(e) => setEnvasesLlenadora(e.target.value)}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sabor</Label>
            <p className="flex h-9 items-center text-sm text-foreground">{lineaTurno.saborNombre ?? "—"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`paletas-${lineaTurno.id}`}>Sumar paletas</Label>
            <Input
              id={`paletas-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Paletas nuevas"
              value={paletas}
              onChange={(e) => setPaletas(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resto-${lineaTurno.id}`}>Sumar cajas sueltas</Label>
            <Input
              id={`resto-${lineaTurno.id}`}
              type="number"
              min={0}
              placeholder="Cajas nuevas"
              value={cajasSueltas}
              onChange={(e) => setCajasSueltas(e.target.value)}
            />
          </div>
        </div>

        {presentacion && (paletas !== "" || cajasSueltas !== "") && (
          <p className="text-sm text-muted-foreground">
            Vas a sumar <span className="font-medium text-foreground">{cajasNuevas.toLocaleString("es-CO")} cajas</span> — quedando en{" "}
            <span className="font-medium text-foreground">{cajasTotalPreview.toLocaleString("es-CO")} cajas</span> acumuladas.
          </p>
        )}

        {mermaPct !== null && (
          <div
            className={
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
              (requiereJustificacion
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted/40 text-muted-foreground")
            }
          >
            {requiereJustificacion && <AlertTriangle className="size-4 shrink-0" />}
            Merma estimada: <span className="font-medium">{mermaPct}%</span>
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

        {lineaTurno.activa &&
          (lineaTurno.entregadaEn ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowRightCircle className="size-3.5" />
              Entregada al siguiente turno a las {lineaTurno.entregadaEn.slice(11, 16)}.
            </p>
          ) : (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={continuaSiguienteTurno} onCheckedChange={(v) => setContinuaSiguienteTurno(v === true)} />
              Esta línea va a continuar en el siguiente turno — cerrar mi parte con estos valores.
            </label>
          ))}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button size="sm" className="self-start" onClick={guardar} disabled={!valido || enviando}>
          {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
          {registroExistente ? "Actualizar" : "Registrar"}
        </Button>
      </CardContent>
    </Card>
  )
}
