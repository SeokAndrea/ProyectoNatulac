import { useEffect, useRef, useState } from "react"
import { Info, Loader2, Minus, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CabeceraFila } from "@/components/producto-terminado/CabeceraFila"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { CorridaRobot, LineaRobot } from "@/lib/robotTavil"
import { fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"

/** Espera tras la última tecla antes de guardar el Resto. */
const ESPERA_RESTO_MS = 1200

export interface AccionesRobot {
  sumar: (linea: string) => Promise<boolean>
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
            onClick={() => con(() => acciones.sumar(linea.lineaCodigo))}
          >
            <Plus className="size-8" />
          </Button>
        </div>
        {!entregada && (
          <p className="num text-center text-sm text-muted-foreground">Última paleta: {hora(corrida.ultimaPaletaEn) ?? "—"}</p>
        )}

        <CampoResto
          key={corrida.id}
          lineaCodigo={linea.lineaCodigo}
          valor={corrida.resto}
          habilitado={restoHabilitado}
          guardar={acciones.guardarResto}
        />
      </CardContent>
    </Card>
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
