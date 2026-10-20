import { useState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MensajeError } from "@/components/MensajeError"
import type { ModoTransferencia, MotivoTransferencia, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { useAccion } from "@/lib/useAccion"
import { TANK_CAPACITY, TANK_MAX_VOLUMEN } from "./constantes"
import type { AccionesTanque } from "./tipos"

const litros = (n: number) => n.toLocaleString("es-CO")

/**
 * Transferir el resto de un tanque a otro (Limpio, o con el mismo sabor).
 * Paso 1 obligatorio: confirmar/corregir el volumen real del ORIGEN (si
 * cambió, se registra con medir_tanque antes de mover). Paso 2: destino,
 * motivo y — si el destino ya tiene lote — qué identidad sobrevive. Se
 * monta al abrir, así que al reabrir empieza de cero.
 */
export function DialogTransferir({
  tanque,
  destinos,
  hayCorridaEnEsteTanque,
  medirTanque,
  transferir,
  onCerrar,
  onTransferido,
}: {
  tanque: TanqueRecepcion
  /** Tanques a los que se puede mandar: Limpio, o Liberado / Con Restos del mismo sabor. */
  destinos: TanqueRecepcion[]
  /** Una corrida activa toma de este tanque: al transferir pasa a tomar del destino (se confirma dos veces). */
  hayCorridaEnEsteTanque: boolean
  medirTanque: AccionesTanque["medirTanque"]
  transferir: AccionesTanque["transferir"]
  onCerrar: () => void
  onTransferido: (destino: 1 | 2 | 3, modo: ModoTransferencia) => void
}) {
  const [origenConfirmado, setOrigenConfirmado] = useState(false)
  const [volOrigenReal, setVolOrigenReal] = useState(String(tanque.volumenL ?? 0))
  const [tanqueDestino, setTanqueDestino] = useState<1 | 2 | 3 | "">("")
  const [modo, setModo] = useState<ModoTransferencia>("LIQUIDO")
  const [motivo, setMotivo] = useState<MotivoTransferencia>("CONSOLIDAR_RESTOS")
  const [confirmandoRedireccion, setConfirmandoRedireccion] = useState(false)
  const { enviando, error, ejecutar } = useAccion()

  const volumenActual = tanque.volumenL ?? 0
  const destinoElegido = destinos.find((t) => t.numeroTanque === tanqueDestino) ?? null
  /** El destino ya tiene su propio lote (Listo o Con Restos) — ahí sí hace falta elegir qué identidad sobrevive. Si está Limpio, los dos modos dan lo mismo. */
  const destinoConLotePropio = destinoElegido !== null && destinoElegido.condicion !== "LIMPIO"
  const volumenResultante = volumenActual + (destinoElegido?.volumenL ?? 0)
  /** El CHECK de base rechaza pasar de TANK_MAX_VOLUMEN — se frena antes con un mensaje claro. */
  const excedeMax = volumenResultante > TANK_MAX_VOLUMEN

  async function confirmarOrigen() {
    const real = Number(volOrigenReal)
    if (!Number.isFinite(real) || real < 0) return
    if (real === volumenActual) {
      setOrigenConfirmado(true)
      return
    }
    if (await ejecutar(() => medirTanque(tanque.numeroTanque, real))) setOrigenConfirmado(true)
  }

  async function enviar() {
    if (tanqueDestino === "" || excedeMax) return
    if (hayCorridaEnEsteTanque && !confirmandoRedireccion) {
      setConfirmandoRedireccion(true)
      return
    }
    if (await ejecutar(() => transferir(tanque.numeroTanque, tanqueDestino, modo, motivo))) onTransferido(tanqueDestino, modo)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir Tanque {tanque.numeroTanque}</DialogTitle>
          {!origenConfirmado && (
            <DialogDescription>
              Antes de mover: mide el Tanque {tanque.numeroTanque} y confirma cuánto tiene de verdad. Se transfiere ese volumen.
            </DialogDescription>
          )}
        </DialogHeader>

        {!origenConfirmado ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                className="h-8 w-24"
                value={volOrigenReal}
                onChange={(e) => setVolOrigenReal(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">L</span>
            </div>
            <MensajeError error={error} />
            <DialogFooter>
              <Button size="sm" disabled={enviando || volOrigenReal.trim() === "" || Number(volOrigenReal) < 0} onClick={confirmarOrigen}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {Number(volOrigenReal) === volumenActual ? "Es correcto, seguir" : "Guardar y seguir"}
              </Button>
              <Button size="sm" variant="ghost" disabled={enviando} onClick={onCerrar}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Manda los <span className="font-medium text-foreground">{litros(volumenActual)} L</span> de {tanque.saborNombre} a otro
              tanque con el mismo sabor — este tanque queda Sucio.
            </p>
            <Select value={String(tanqueDestino)} onValueChange={(v) => setTanqueDestino(Number(v) as 1 | 2 | 3)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tanque destino" />
              </SelectTrigger>
              <SelectContent>
                {destinos.map((t) => (
                  <SelectItem key={t.numeroTanque} value={String(t.numeroTanque)}>
                    {t.condicion === "LIMPIO"
                      ? `Tanque ${t.numeroTanque} · Limpio (mueve el lote entero)`
                      : `Tanque ${t.numeroTanque} · ${t.saborNombre} · ${litros(t.volumenL ?? 0)} L`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Opciones
              pregunta="¿Por qué se transfiere?"
              valor={motivo}
              onCambiar={setMotivo}
              opciones={[
                { valor: "CONSOLIDAR_RESTOS", texto: "Consolidar restos" },
                { valor: "ENRUTAR_MANIFOLD", texto: "No parar la línea" },
              ]}
            />

            {destinoConLotePropio && (
              <>
                <Opciones
                  pregunta="El tanque destino ya tiene su propio lote — ¿qué identidad se queda?"
                  valor={modo}
                  onCambiar={setModo}
                  opciones={[
                    { valor: "LIQUIDO", texto: "Líquido" },
                    { valor: "LOTE", texto: "Lote" },
                  ]}
                />
                <p className="text-[11px] break-words text-muted-foreground">
                  {modo === "LIQUIDO"
                    ? "El líquido se suma al lote que ya tiene el destino."
                    : "Este lote se muda al tanque destino y absorbe lo que el destino ya tenía."}
                </p>
              </>
            )}

            {destinoElegido && (
              <p className="text-xs text-muted-foreground">
                Se transfieren <span className="font-medium text-foreground">{litros(volumenActual)} L</span>. El Tanque{" "}
                {destinoElegido.numeroTanque} queda con ~<span className="font-medium text-foreground">{litros(volumenResultante)} L</span>{" "}
                (calculado — falta medir el tanque).
                {volumenResultante > TANK_CAPACITY && !excedeMax && (
                  <span className="text-warning"> Queda sobre los {litros(TANK_CAPACITY)} L nominales del tanque.</span>
                )}
              </p>
            )}

            {excedeMax && (
              <p className="text-xs text-destructive" role="alert">
                No se puede: el Tanque {destinoElegido?.numeroTanque} quedaría con ~{litros(volumenResultante)} L y el máximo
                permitido es {litros(TANK_MAX_VOLUMEN)} L. Baja primero el tanque destino o transfiere a otro.
              </p>
            )}

            {confirmandoRedireccion && hayCorridaEnEsteTanque && (
              <p className="text-xs text-warning">
                La corrida activa de esta línea va a pasar a tomar del tanque destino al confirmar. ¿Continuar?
              </p>
            )}

            <MensajeError error={error} />

            <DialogFooter>
              <Button size="sm" disabled={tanqueDestino === "" || enviando || excedeMax} onClick={enviar}>
                {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                {confirmandoRedireccion ? "Sí, transferir" : "Transferir"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCerrar} disabled={enviando}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Pregunta con botones excluyentes (el elegido, relleno). */
function Opciones<T extends string>({
  pregunta,
  valor,
  onCambiar,
  opciones,
}: {
  pregunta: string
  valor: T
  onCambiar: (v: T) => void
  opciones: { valor: T; texto: string }[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{pregunta}</p>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <Button key={o.valor} type="button" size="sm" variant={valor === o.valor ? "default" : "outline"} onClick={() => onCambiar(o.valor)}>
            {o.texto}
          </Button>
        ))}
      </div>
    </div>
  )
}
