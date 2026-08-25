import { useState } from "react"
import { Link } from "react-router-dom"
import { AlertTriangle, ArrowRightCircle, Check, Loader2, PackageCheck } from "lucide-react"
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
import { LIMITE_MERMA, useTurno, type LineaEnTurno, type ProductoTerminadoRegistro } from "@/lib/turno"

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

  return (
    <AppShell title="Producto Terminado y Contador" description={`Turno ${turnoActivo.codigo}`}>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {corridasUsadas.map((l) => {
          const contadorActual = turnoActivo.contadores
            .filter((c) => c.turnoLineaId === l.id)
            .reduce((a, c) => a + c.envasesLlenadora, 0)
          return (
            <FilaProductoTerminado
              key={l.id}
              lineaTurno={l}
              nombreLinea={nombrePorCodigo(lineas, l.linea)}
              contadorActual={contadorActual}
              presentaciones={presentaciones}
              registroExistente={turnoActivo.productoTerminado.find((p) => p.turnoLineaId === l.id) ?? null}
              onRegistrarProducto={registrarProductoTerminado}
              onRegistrarContador={registrarContador}
              onEntregarCorrida={entregarCorrida}
            />
          )
        })}
      </div>
    </AppShell>
  )
}

type ResultadoAccion = { ok: true } | { ok: false; error: string }

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
  onRegistrarProducto: (datos: {
    turnoLineaId: string
    linea: LineaEnTurno["linea"]
    saborId: string | null
    presentacion: PresentacionCodigo
    paletas: number
    cajasSueltas: number
  }) => Promise<ResultadoAccion>
  onRegistrarContador: (datos: {
    turnoLineaId: string
    linea: LineaEnTurno["linea"]
    envasesLlenadora: number
    justificacion: string
  }) => Promise<ResultadoAccion>
  onEntregarCorrida: (turnoLineaId: string) => Promise<ResultadoAccion>
}) {
  const saborId = registroExistente?.saborId ?? lineaTurno.saborId
  const corridaCerrada = !lineaTurno.activa && !lineaTurno.esperandoCierre
  const [envasesLlenadora, setEnvasesLlenadora] = useState("")
  const [paletas, setPaletas] = useState(registroExistente ? String(registroExistente.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(registroExistente ? String(registroExistente.cajasSueltas) : "")
  const [justificacion, setJustificacion] = useState("")
  const [continuaSiguienteTurno, setContinuaSiguienteTurno] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const presentacion = presentaciones.find((p) => p.codigo === lineaTurno.presentacion)
  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const cajasTotales = presentacion ? nPaletas * presentacion.cajasXPaleta + nCajasSueltas : 0
  const envasesProducidos = presentacion ? cajasTotales * presentacion.envasesXCaja : 0

  const nuevoContador = envasesLlenadora === "" ? 0 : Number(envasesLlenadora)
  const contadorTotalPreview = contadorActual + nuevoContador

  const mermaPct =
    contadorTotalPreview > 0 && (paletas !== "" || cajasSueltas !== "")
      ? Math.round((1 - envasesProducidos / contadorTotalPreview) * 10000) / 100
      : null
  const requiereJustificacion = mermaPct !== null && mermaPct > LIMITE_MERMA_PCT

  const hayContadorNuevo = envasesLlenadora !== "" && nuevoContador > 0
  const hayProducto = paletas !== "" && cajasSueltas !== "" && nPaletas >= 0 && nCajasSueltas >= 0
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
            <Label htmlFor={`paletas-${lineaTurno.id}`}>Paletas</Label>
            <Input
              id={`paletas-${lineaTurno.id}`}
              type="number"
              min={0}
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
              value={cajasSueltas}
              onChange={(e) => setCajasSueltas(e.target.value)}
            />
          </div>
        </div>

        {presentacion && (paletas !== "" || cajasSueltas !== "") && (
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{cajasTotales.toLocaleString("es-CO")} cajas</span>
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
