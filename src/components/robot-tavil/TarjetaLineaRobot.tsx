import { useEffect, useRef, useState } from "react"
import { ChevronDown, Info, Loader2, Minus, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MensajeError } from "@/components/MensajeError"
import { CabeceraFila } from "@/components/producto-terminado/CabeceraFila"
import { DialogoPaleta, type DialogoPaletaModo } from "@/components/robot-tavil/DialogoPaleta"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { CorridaRobot, DatosEditarPaleta, DatosNuevaPaleta, LineaRobot } from "@/lib/robotTavil"
import { codigoPresentacion, codigoSabor, numeroTurno, type Paleta } from "@/lib/trazabilidadPaletizado"
import { fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"

/** Espera tras la última tecla antes de guardar el Resto. */
const ESPERA_RESTO_MS = 1200

export interface AccionesRobot {
  /** «+»: crea la paleta con su ticket y conformidad. Devuelve el error o null. */
  crear: (linea: string, d: DatosNuevaPaleta) => Promise<string | null>
  /** Corrige una paleta de la lista. Devuelve el error o null. */
  editar: (paletaId: string, d: DatosEditarPaleta) => Promise<string | null>
  /** Interruptor «Paleta manual» de la línea. Devuelve el error o null. */
  cambiarManual: (linea: string, manual: boolean) => Promise<string | null>
  restar: (linea: string) => Promise<boolean>
  guardarResto: (linea: string, cajas: number) => Promise<boolean>
  iniciar: (linea: string) => Promise<boolean>
}

const hora = (iso: string | null) => (iso ? horaCortaPlanta(iso, fechaPlanta()) : null)

function nombrePresentacion(c: CorridaRobot, presentaciones: PresentacionLive[]): string {
  if (c.presentacionMl === null) return "Sin presentación"
  return presentaciones.find((p) => p.volumenMl === c.presentacionMl)?.nombre ?? `${c.presentacionMl} ml`
}

const cierre = (c: CorridaRobot) => `${c.paletas} ${c.paletas === 1 ? "paleta" : "paletas"} y ${c.resto} cajas sueltas`

function Aviso({ titulo, children, tono = "info" }: { titulo?: string; children: React.ReactNode; tono?: "info" | "ok" }) {
  return (
    <div
      className={
        tono === "ok"
          ? "rounded-lg border border-success/35 bg-success-soft px-3 py-2 text-sm text-success-foreground"
          : "flex gap-2 rounded-lg border border-info/35 bg-info-soft px-3 py-2 text-sm text-info-foreground"
      }
    >
      {tono === "info" && <Info className="mt-0.5 size-4 shrink-0" />}
      <div className="flex min-w-0 flex-col gap-1">
        {titulo && <span className="font-semibold">{titulo}</span>}
        {children}
      </div>
    </div>
  )
}

/**
 * Una línea en la pantalla del Robot Tavil: «−» y «+» grandes para las
 * paletas, el Resto escrito a mano y, según cómo dejó la línea el supervisor,
 * el aviso de corrida terminada, entregada o con un lote nuevo para iniciar.
 */
export function TarjetaLineaRobot({
  linea,
  presentaciones,
  acciones,
}: {
  linea: LineaRobot
  presentaciones: PresentacionLive[]
  acciones: AccionesRobot
}) {
  const { corrida, estado, nueva, anterior } = linea
  const [enviando, setEnviando] = useState(false)
  const [dialogo, setDialogo] = useState<DialogoPaletaModo | null>(null)
  const [confirmarManual, setConfirmarManual] = useState(false)
  const entregada = estado === "ENTREGADA"
  const paletas = entregada ? linea.sinCorrida : corrida.paletas
  const restoHabilitado = linea.puedeSumar && !entregada

  async function con(fn: () => Promise<boolean>) {
    setEnviando(true)
    await fn()
    setEnviando(false)
  }

  const derecha =
    estado === "TERMINADA" ? (
      <Badge variant="success">Corrida terminada</Badge>
    ) : entregada ? (
      <Badge variant="info">Entregada</Badge>
    ) : (
      <Badge variant="muted">{corrida.saborNombre ?? "Sin sabor"}</Badge>
    )

  return (
    <Card>
      <FranjaManual linea={linea} onTocar={() => setConfirmarManual(true)} />
      <CabeceraFila
        nombreLinea={linea.lineaNombre}
        lote={corrida.lote}
        derecha={derecha}
        descripcion={nombrePresentacion(corrida, presentaciones)}
      />
      <CardContent className="flex flex-col gap-3">
        {estado === "TERMINADA" && (
          <Aviso titulo="El supervisor terminó esta corrida">
            <span>Quedó con {cierre(corrida)}. No se puede cargar nada hasta que el supervisor cargue un lote nuevo.</span>
          </Aviso>
        )}
        {entregada && (
          <Aviso titulo="El supervisor entregó la línea al siguiente turno">
            <span>
              La corrida cerró con {cierre(corrida)}. Las paletas que sumes ahora pasan al turno siguiente cuando abra.
            </span>
          </Aviso>
        )}
        {estado === "LOTE_NUEVO" && nueva && (
          <Aviso titulo="El supervisor cargó un lote nuevo en esta línea">
            <span>
              Lote {nueva.lote ?? "sin código"} · {nueva.saborNombre ?? "Sin sabor"} · {nombrePresentacion(nueva, presentaciones)}.{" "}
              {linea.puedeSumar
                ? "Hasta que lo inicies, lo que sumes va al lote actual."
                : `La corrida anterior cerró con ${cierre(corrida)}.`}
            </span>
            <Button size="sm" className="mt-1 self-start" disabled={enviando} onClick={() => con(() => acciones.iniciar(linea.lineaCodigo))}>
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              Iniciar con el lote {nueva.lote ?? "nuevo"}
            </Button>
          </Aviso>
        )}
        {estado === "EN_CURSO" && anterior && (
          <Aviso tono="ok">
            {anterior.entregada
              ? `La línea viene del turno anterior: el lote ${anterior.lote ?? ""} cerró allá con ${cierre(anterior)}. Esta cuenta empieza en cero.`
              : anterior.abierta
                ? `Lote ${corrida.lote ?? ""} en curso. El lote ${anterior.lote ?? ""} sigue abierto con ${cierre(anterior)} hasta que el supervisor lo cierre.`
                : `Lote ${corrida.lote ?? ""} en curso. El lote ${anterior.lote ?? ""} cerró con ${cierre(anterior)}.`}
          </Aviso>
        )}

        <div className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3">
          <Button
            variant="outline"
            className="h-20 text-3xl pointer-coarse:h-20"
            aria-label={`Quitar una paleta de ${linea.lineaNombre}`}
            disabled={!linea.puedeSumar || paletas === 0 || enviando}
            onClick={() => con(() => acciones.restar(linea.lineaCodigo))}
          >
            <Minus className="size-8" />
          </Button>
          <div className="text-center">
            <span className="num block text-5xl font-semibold leading-none" aria-live="polite">
              {paletas}
            </span>
            <span className="text-sm text-muted-foreground">{entregada ? "paletas para el turno siguiente" : "paletas"}</span>
          </div>
          <Button
            className="h-20 text-3xl pointer-coarse:h-20"
            aria-label={`Sumar una paleta a ${linea.lineaNombre}`}
            disabled={!linea.puedeSumar || enviando}
            onClick={() => setDialogo({ tipo: "nueva", linea })}
          >
            <Plus className="size-8" />
          </Button>
        </div>
        {linea.puedeSumar && linea.proximoNumero !== null && (
          <p className="text-center text-sm text-muted-foreground">
            Próxima: <b className="num text-foreground">Nº {linea.proximoNumero}</b>
            {linea.proximoSaborCodigo && ` de ${linea.proximoSaborCodigo}`}
            {linea.proximoPresentacionCodigo && ` ${linea.proximoPresentacionCodigo}`}
            {!entregada && corrida.ultimaPaletaEn && <span className="num"> · última a las {hora(corrida.ultimaPaletaEn)}</span>}
          </p>
        )}

        <CampoResto
          key={corrida.id}
          lineaCodigo={linea.lineaCodigo}
          valor={corrida.resto}
          habilitado={restoHabilitado}
          guardar={acciones.guardarResto}
        />

        <ListaPaletasDia linea={linea} onElegir={(p) => setDialogo({ tipo: "editar", paleta: p })} />
      </CardContent>

      <DialogoPaleta modo={dialogo} onCerrar={() => setDialogo(null)} onCrear={acciones.crear} onEditar={acciones.editar} />
      <ConfirmarManual
        abierto={confirmarManual}
        linea={linea}
        onCerrar={() => setConfirmarManual(false)}
        cambiar={acciones.cambiarManual}
      />
    </Card>
  )
}

/**
 * Interruptor «Paleta manual»: franja delgada pegada al borde superior de la
 * tarjeta, sobre el nombre de la línea. Tocarla pide confirmación.
 */
function FranjaManual({ linea, onTocar }: { linea: LineaRobot; onTocar: () => void }) {
  const on = linea.manual
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Paleta manual en ${linea.lineaNombre}`}
      onClick={onTocar}
      className={cn(
        "-mt-(--card-spacing) flex min-h-8 w-full items-center justify-end gap-2 border-b px-4 py-1 text-xs transition-colors",
        on ? "border-warning/60 bg-warning-soft text-warning-foreground" : "border-border bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      <span className={on ? "font-semibold" : "font-medium"}>
        Paleta manual
        {on && <span className="font-normal"> · las nuevas se guardan como Manual</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
          on ? "bg-warning-foreground" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform",
            on && "translate-x-3",
          )}
        />
      </span>
    </button>
  )
}

function ConfirmarManual({
  abierto,
  linea,
  onCerrar,
  cambiar,
}: {
  abierto: boolean
  linea: LineaRobot
  onCerrar: () => void
  cambiar: (linea: string, manual: boolean) => Promise<string | null>
}) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nuevo = !linea.manual

  async function confirmar() {
    setEnviando(true)
    setError(null)
    const e = await cambiar(linea.lineaCodigo, nuevo)
    setEnviando(false)
    if (e) setError(e)
    else onCerrar()
  }

  return (
    <Dialog
      open={abierto}
      onOpenChange={(a) => {
        if (!a) {
          setError(null)
          onCerrar()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {nuevo ? "¿Encender" : "¿Apagar"} «Paleta manual» en la {linea.lineaNombre}?
          </DialogTitle>
          <DialogDescription>
            {nuevo
              ? "Desde ahora todas las paletas nuevas de esta línea se guardan como Manual (punto 1.2 «Tipo de paletizado» de la hoja)."
              : "Desde ahora las paletas nuevas de esta línea se guardan como Automático."}{" "}
            Las paletas que ya están creadas no cambian.
          </DialogDescription>
        </DialogHeader>
        <MensajeError error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            {nuevo ? "Sí, encender" : "Sí, apagar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Paletas del día de la línea, debajo del Resto. Desplegable: contraída
 * muestra solo la última registrada; extendida, todas. Tocar una fila abre
 * la corrección.
 */
function ListaPaletasDia({ linea, onElegir }: { linea: LineaRobot; onElegir: (p: Paleta) => void }) {
  const [abierta, setAbierta] = useState(false)
  const paletas = linea.paletasDia
  const visibles = abierta ? paletas : paletas.slice(0, 1)
  const id = `paletas-${linea.lineaCodigo}`
  const resumen = `${paletas.length} en el día${linea.anuladasDia ? ` · ${linea.anuladasDia} ${linea.anuladasDia === 1 ? "anulada" : "anuladas"}` : ""}`

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={id}
        disabled={paletas.length < 2}
        onClick={() => setAbierta((a) => !a)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="flex flex-col">
          <span className="font-semibold">Paletas de hoy</span>
          <span className="text-xs text-muted-foreground">
            {resumen}
            {!abierta && paletas.length > 1 && " · se muestra la última"}
          </span>
        </span>
        {paletas.length > 1 && (
          <span className="flex items-center gap-1 text-sm font-semibold text-info-foreground">
            {abierta ? "Contraer" : "Ver todas"}
            <ChevronDown className={cn("size-4 transition-transform", abierta && "rotate-180")} />
          </span>
        )}
      </button>
      {paletas.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Todavía no hay paletas hoy en esta línea.</p>
      ) : (
        <ul id={id} className={cn("flex flex-col overflow-y-auto rounded-lg border border-border", abierta && "max-h-72")}>
          {visibles.map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onElegir(p)}
                className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left hover:bg-muted"
              >
                <span className="num text-center text-lg font-semibold">{p.numero ?? "—"}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="num truncate text-sm font-semibold">{p.ticket ?? "Sin ticket"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {codigoSabor(p)} · {codigoPresentacion(p)} · <span className="num">{hora(p.creadaEn)}</span> · T{numeroTurno(p.turnoTipo)}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {p.tipoPaletizado === "MANUAL" && <Badge variant="warning">Manual</Badge>}
                  {p.conforme ? <Badge variant="success">C</Badge> : <Badge variant="danger">NC</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Resto: se escribe el número y se guarda solo (al dejar de escribir o al salir del campo). */
function CampoResto({
  lineaCodigo,
  valor,
  habilitado,
  guardar,
}: {
  lineaCodigo: string
  valor: number
  habilitado: boolean
  guardar: (linea: string, cajas: number) => Promise<boolean>
}) {
  const [texto, setTexto] = useState(valor ? String(valor) : "")
  const [guardadoA, setGuardadoA] = useState<string | null>(null)
  const editando = useRef(false)
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = `resto-${lineaCodigo}`

  // Lo que llega del servidor manda, salvo mientras se está escribiendo.
  useEffect(() => {
    if (!editando.current) setTexto(valor ? String(valor) : "")
  }, [valor])

  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current)
  }, [])

  async function enviar(t: string) {
    if (espera.current) clearTimeout(espera.current)
    espera.current = null
    const cajas = t === "" ? 0 : Number(t)
    editando.current = false
    if (!Number.isInteger(cajas) || cajas < 0 || cajas === valor) return
    if (await guardar(lineaCodigo, cajas)) setGuardadoA(hora(new Date().toISOString()))
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <Label htmlFor={id}>Resto (cajas sueltas)</Label>
      <Input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="0"
        value={texto}
        disabled={!habilitado}
        onChange={(e) => {
          editando.current = true
          const t = e.target.value
          setTexto(t)
          if (espera.current) clearTimeout(espera.current)
          espera.current = setTimeout(() => void enviar(t), ESPERA_RESTO_MS)
        }}
        onBlur={() => editando.current && void enviar(texto)}
      />
      <p className="text-xs text-muted-foreground">Cajas que quedaron sin formar paleta al terminar el lote.</p>
      {guardadoA && <p className="text-xs text-success-foreground">Guardado {guardadoA}</p>}
    </div>
  )
}
