import { useState } from "react"
import { AlertTriangle, Loader2, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { LIMITE_MERMA_PCT, vistaPreviaCarga } from "./calculosPT"
import { CabeceraFila } from "./CabeceraFila"
import type { AccionesPT } from "./tipos"

type ProximoEstado = "TERMINO_SABOR" | "CONTINUA"

/**
 * Carga de una corrida: Contador (llenadora + Contador 2) y Paletas / Cajas
 * sueltas — estas son el TOTAL actual de la corrida (se editan, no se
 * suman). Con la corrida corriendo, además se elige qué pasa con la línea
 * (Terminar o Entregar al próximo turno) y se cierra de una.
 *
 * Guardar son varios pedidos seguidos (contador → terminar → PT →
 * entregar), no uno solo: si uno falla, los anteriores ya quedaron. Por eso
 * el contador se limpia apenas se guarda (se SUMA: reintentar no debe
 * mandarlo dos veces), y el PT va después de terminar, para que sea él quien
 * cierra la corrida — si falla, la corrida sigue esperando su PT en esta
 * misma tarjeta. Cerrar (Terminar, Entregar, o una corrida ya detenida)
 * exige el PT: si no produjo nada, 0 paletas y 0 cajas.
 *
 * Corrigiendo una corrida cerrada ("Editar un error") el contador NO suma:
 * arranca en el total de la corrida y lo escrito lo reemplaza
 * (corregir_contador_corrida). Solo se manda lo que cambió.
 */
export function FormCargaPT({
  corrida,
  nombreLinea,
  saborId,
  presentacion,
  contadorActual,
  contadorBuenosActual,
  registro,
  modoCorreccion,
  puedeElegirProximoEstado,
  acciones,
  onGuardado,
  onCancelarCorreccion,
}: {
  corrida: Corrida
  nombreLinea: string
  saborId: string | null
  presentacion: PresentacionLive | undefined
  contadorActual: number
  /** Suma de Contador 2 (envases buenos) de esta corrida. */
  contadorBuenosActual: number
  registro: ProductoTerminadoRegistro | null
  /** Corrigiendo una corrida ya cerrada ("Editar un error"). */
  modoCorreccion: boolean
  /** Sigue corriendo y todavía no se decidió su próximo estado. */
  puedeElegirProximoEstado: boolean
  acciones: AccionesPT
  /** Se guardó; `cerrando` = esta pasada cerró la corrida (Terminar / Entregar). */
  onGuardado: (cerrando: boolean) => void
  onCancelarCorreccion: () => void
}) {
  /** Corrigiendo: el contador arranca en el total de la corrida y lo escrito lo REEMPLAZA (no se suma). */
  const totalInicial = modoCorreccion && contadorActual > 0
  const [envasesLlenadora, setEnvasesLlenadora] = useState(totalInicial ? String(contadorActual) : "")
  /** Contador 2 (envases buenos), obligatorio junto con el contador de la llenadora. */
  const [envasesBuenos, setEnvasesBuenos] = useState(totalInicial ? String(contadorBuenosActual) : "")
  const [paletas, setPaletas] = useState(registro ? String(registro.paletas) : "")
  const [cajasSueltas, setCajasSueltas] = useState(registro ? String(registro.cajasSueltas) : "")
  const [justificacion, setJustificacion] = useState("")
  const [proximoEstado, setProximoEstado] = useState<ProximoEstado | null>(null)
  /** El contador de esta pasada ya se guardó y el resto falló: se avisa para que no lo vuelvan a escribir. */
  const [contadorGuardado, setContadorGuardado] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  // Corrigiendo, lo escrito ya es el total: la vista previa no le suma lo cargado.
  const previa = vistaPreviaCarga({
    presentacion,
    paletas,
    cajasSueltas,
    contadorActual: modoCorreccion ? 0 : contadorActual,
    contadorBuenosActual: modoCorreccion ? 0 : contadorBuenosActual,
    envasesLlenadora,
    envasesBuenos,
  })

  const nPaletas = Number(paletas) || 0
  const nCajasSueltas = Number(cajasSueltas) || 0
  const nuevoContador = envasesLlenadora === "" ? 0 : Number(envasesLlenadora)
  const nuevoContadorBuenos = envasesBuenos === "" ? null : Number(envasesBuenos)
  const hayProducto = (paletas !== "" || cajasSueltas !== "") && nPaletas >= 0 && nCajasSueltas >= 0
  /** Corrigiendo: el total quedó distinto del de la corrida. */
  const contadorCorregido =
    modoCorreccion && nuevoContador >= 0 && (nuevoContador !== contadorActual || (nuevoContadorBuenos ?? 0) !== contadorBuenosActual)
  /** Corrigiendo: solo se manda el PT si cambió (pasada 1 h la base ya no deja reescribirlo). */
  const ptCorregido = modoCorreccion && hayProducto && (!registro || nPaletas !== registro.paletas || nCajasSueltas !== registro.cajasSueltas)
  const hayContadorNuevo = modoCorreccion ? contadorCorregido && nuevoContador > 0 : envasesLlenadora !== "" && nuevoContador > 0
  /** El Contador 2 (envases buenos) es OBLIGATORIO junto con el contador de la llenadora, y no puede superarlo. */
  const buenosValido =
    !hayContadorNuevo || (nuevoContadorBuenos !== null && nuevoContadorBuenos >= 0 && nuevoContadorBuenos <= nuevoContador)
  const requiereJustificacion = previa.nivel === "danger" && (!modoCorreccion || contadorCorregido)
  /** Esta pasada cierra la corrida (o ya está detenida esperando su PT): sin PT quedaría cerrada sin producción. */
  const requierePt = !modoCorreccion && (proximoEstado !== null || corrida.esperandoCierre)
  const faltaPt = requierePt && !hayProducto
  const valido =
    (modoCorreccion ? contadorCorregido || ptCorregido : hayContadorNuevo || hayProducto) &&
    buenosValido &&
    !faltaPt &&
    (!puedeElegirProximoEstado || proximoEstado !== null) &&
    (!requiereJustificacion || justificacion.trim() !== "")
  const textoBoton = modoCorreccion ? "Guardar corrección" : puedeElegirProximoEstado ? "Cerrar" : "Registrar"

  async function guardar() {
    if (!valido) return
    // Si esta pasada CIERRA la corrida (Terminar / Entregar), después se pide medir el tanque.
    const cerrando = !modoCorreccion && proximoEstado !== null
    setContadorGuardado(false)
    if (modoCorreccion) {
      // Corrección: el contador queda en el total escrito (reemplaza, reintentar no duplica) y el PT es un total.
      const ok = await ejecutar(async () => {
        if (contadorCorregido) {
          const r = await acciones.corregirContador({
            corridaId: corrida.id,
            linea: corrida.linea,
            envasesLlenadora: nuevoContador,
            envasesBuenos: nuevoContador === 0 ? 0 : nuevoContadorBuenos,
            justificacion: justificacion.trim(),
          })
          if (!r.ok) return r
        }
        if (ptCorregido) {
          return acciones.registrarProducto({
            corridaId: corrida.id,
            linea: corrida.linea,
            saborId: saborId || null,
            presentacion: corrida.presentacion,
            paletas: nPaletas,
            cajasSueltas: nCajasSueltas,
          })
        }
        return { ok: true }
      })
      if (ok) onGuardado(false)
      return
    }
    const ok = await ejecutar(async () => {
      // 1. Contador. Con la corrida corriendo no la cierra; se limpia apenas
      //    queda guardado, así un reintento no lo suma dos veces.
      if (hayContadorNuevo) {
        const r = await acciones.registrarContador({
          corridaId: corrida.id,
          linea: corrida.linea,
          envasesLlenadora: nuevoContador,
          envasesBuenos: nuevoContadorBuenos,
          justificacion: justificacion.trim(),
        })
        if (!r.ok) return r
        setEnvasesLlenadora("")
        setEnvasesBuenos("")
        setJustificacion("")
        setContadorGuardado(true)
      }
      // 2. "Terminar": deja la corrida en ESPERANDO_PT (costura 2 —
      //    terminar_sabor_linea no cierra por su cuenta).
      if (proximoEstado === "TERMINO_SABOR") {
        const r = await acciones.terminarSabor(corrida.id)
        if (!r.ok) return r
      }
      // 3. PT: cierra la corrida que quedó esperando. Es un total (se
      //    reemplaza), reintentarlo no duplica nada.
      if (hayProducto) {
        const r = await acciones.registrarProducto({
          corridaId: corrida.id,
          linea: corrida.linea,
          saborId: saborId || null,
          presentacion: corrida.presentacion,
          paletas: nPaletas,
          cajasSueltas: nCajasSueltas,
        })
        if (!r.ok) return r
      }
      if (proximoEstado === "CONTINUA") return acciones.entregarCorrida(corrida.id)
      return { ok: true }
    })
    if (!ok) return
    setContadorGuardado(false)
    setProximoEstado(null)
    onGuardado(cerrando)
  }

  return (
    <Card>
      <CabeceraFila
        nombreLinea={nombreLinea}
        lote={corrida.lote}
        conCheck={registro !== null}
        derecha={
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Contador acumulado: {contadorActual.toLocaleString("es-CO")} envases
          </span>
        }
        descripcion={presentacion?.nombre ?? `${corrida.presentacion} ml`}
      />
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`contador-${corrida.id}`}>Envases llenadora (Contador)</Label>
            <Input
              id={`contador-${corrida.id}`}
              type="number"
              min={0}
              placeholder={modoCorreccion ? "Contador" : "Sumar al contador"}
              value={envasesLlenadora}
              onChange={(e) => setEnvasesLlenadora(e.target.value)}
            />
            <Label htmlFor={`contador-buenos-${corrida.id}`}>Envases buenos (Contador 2)</Label>
            <Input
              id={`contador-buenos-${corrida.id}`}
              type="number"
              min={0}
              placeholder="Envases buenos"
              value={envasesBuenos}
              onChange={(e) => setEnvasesBuenos(e.target.value)}
              aria-invalid={hayContadorNuevo && !buenosValido}
            />
            {previa.textoBuenos && <p className="text-xs text-muted-foreground">{previa.textoBuenos}</p>}
            {hayContadorNuevo && !buenosValido && (
              <p className="text-xs text-destructive" role="alert">
                {envasesBuenos === ""
                  ? "El Contador 2 (envases buenos) es obligatorio junto con el contador de la llenadora."
                  : "Los envases buenos no pueden superar el total de la llenadora."}
              </p>
            )}
          </div>
          <CampoSabor sabor={corrida.saborNombre} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`paletas-${corrida.id}`}>Paletas</Label>
            <Input id={`paletas-${corrida.id}`} type="number" min={0} placeholder="Paletas" value={paletas} onChange={(e) => setPaletas(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`resto-${corrida.id}`}>Cajas sueltas</Label>
            <Input
              id={`resto-${corrida.id}`}
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
            Total: <span className="font-medium text-foreground">{previa.cajas.toLocaleString("es-CO")} cajas</span>,{" "}
            <span className="font-medium text-foreground">{previa.litros.toLocaleString("es-CO")} L</span>.
          </p>
        )}

        {previa.mermaPct !== null && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              previa.nivel === "danger"
                ? "border-danger/40 bg-danger-soft text-danger-foreground"
                : previa.nivel === "warn"
                  ? "border-warning/40 bg-warning-soft text-warning-foreground"
                  : "border-success/35 bg-success-soft text-success-foreground",
            )}
          >
            {requiereJustificacion && <AlertTriangle className="size-4 shrink-0" />}
            {previa.mermaProvisional && !modoCorreccion ? "Merma provisional (contra el contador de referencia)" : "Merma estimada"}:{" "}
            <span className="font-semibold">{previa.mermaPct}%</span>
            {requiereJustificacion ? ` — supera el ${LIMITE_MERMA_PCT}%, requiere justificación.` : ` (límite ${LIMITE_MERMA_PCT}%)`}
          </div>
        )}

        {requiereJustificacion && (
          <Textarea placeholder="Justificación de la merma..." value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
        )}

        {puedeElegirProximoEstado && (
          <div className="flex flex-col gap-1.5">
            <Label>¿Qué pasa con esta línea?</Label>
            <div className="flex gap-2">
              <OpcionProximoEstado activa={proximoEstado === "TERMINO_SABOR"} onClick={() => setProximoEstado("TERMINO_SABOR")}>
                Terminar
              </OpcionProximoEstado>
              <OpcionProximoEstado activa={proximoEstado === "CONTINUA"} onClick={() => setProximoEstado("CONTINUA")}>
                Entregar línea (sigue el próximo turno)
              </OpcionProximoEstado>
            </div>
          </div>
        )}

        {faltaPt && (
          <p className="text-sm text-warning-foreground">
            Para cerrar la corrida hay que cargar el Producto Terminado. Si no produjo nada, pon 0 paletas y 0 cajas.
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
            {contadorGuardado && " El contador ya quedó guardado: no lo vuelvas a escribir, toca el botón de nuevo para guardar el resto."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="self-start" onClick={guardar} disabled={!valido || enviando}>
            {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />}
            {textoBoton}
          </Button>
          {modoCorreccion && (
            <Button size="sm" variant="ghost" onClick={onCancelarCorreccion} disabled={enviando}>
              Cancelar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CampoSabor({ sabor }: { sabor: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>Sabor</Label>
      <p className="flex h-9 items-center text-sm text-foreground">{sabor ?? "—"}</p>
    </div>
  )
}

function OpcionProximoEstado({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors",
        activa ? "border-primary bg-primary/10 text-primary" : "border-foreground/25 text-foreground hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  )
}
