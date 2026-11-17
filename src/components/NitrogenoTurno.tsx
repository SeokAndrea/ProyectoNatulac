import { useState } from "react"
import { CheckCircle2, Loader2, Pencil } from "lucide-react"
import { MensajeError } from "@/components/MensajeError"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { consumoNitrogeno, errorNitrogeno, leerBombonas, textoBombonas } from "@/lib/nitrogeno"
import { useSesionTurno } from "@/lib/sesionTurno"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"

/*
 * Nitrógeno del turno (migración 20261116290000): bombonas LLENAS al
 * recibir (Comenzar Turno) y al entregar (Finalizar Turno), con las que
 * llegaron en el turno. Consumo = recibidas + llegaron − entregadas.
 * Ver src/lib/nitrogeno.ts.
 */

const ERROR_NUMERO = "Escribe un número entero desde 0."

/** Campo de bombonas: solo dígitos, teclado numérico en el teléfono. */
function CampoBombonas({
  id,
  etiqueta,
  valor,
  onCambio,
  invalido,
}: {
  id: string
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
  invalido?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        maxLength={3}
        value={valor}
        aria-invalid={invalido || undefined}
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, ""))}
        className="num w-28"
      />
    </div>
  )
}

/** Comenzar Turno (revisión de inicio): bombonas llenas con las que se recibe el turno. */
export function NitrogenoAlRecibir() {
  const sesion = useSesionTurno()
  const guardado = sesion.nitrogeno.datos?.inicio ?? null
  const anterior = sesion.nitrogeno.turnoAnterior
  const [editando, setEditando] = useState(guardado === null)
  const [texto, setTexto] = useState(guardado !== null ? String(guardado) : "")
  const accion = useAccion()

  async function guardar() {
    const n = leerBombonas(texto)
    if (n === null) {
      accion.setError(ERROR_NUMERO)
      return
    }
    if (await accion.ejecutar(() => sesion.guardarNitrogeno("INICIO", n))) setEditando(false)
  }

  return (
    <Card className={cn("mx-auto w-full max-w-3xl", guardado === null && "border-warning/60")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Nitrógeno al recibir</CardTitle>
        <CardDescription>
          Cuenta las bombonas de nitrógeno <b>llenas</b> que hay al recibir el turno. Es obligatorio.
          {anterior !== null && ` El turno anterior entregó ${textoBombonas(anterior)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editando ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void guardar()
            }}
          >
            <CampoBombonas id="nitrogeno-inicio" etiqueta="Bombonas llenas" valor={texto} onCambio={setTexto} invalido={!!accion.error} />
            <Button type="submit" disabled={accion.enviando || texto === ""}>
              {accion.enviando && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
            {guardado !== null && (
              <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={accion.enviando}>
                Cancelar
              </Button>
            )}
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-success-foreground" />
              <span className="num">{textoBombonas(guardado ?? 0)}</span> llenas al recibir
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" />
              Corregir
            </Button>
          </div>
        )}
        {anterior !== null && guardado !== null && guardado !== anterior && (
          <p className="text-xs text-warning-foreground">
            No coincide con lo que entregó el turno anterior ({textoBombonas(anterior)}). Revisa el conteo.
          </p>
        )}
        <MensajeError error={accion.error} />
      </CardContent>
    </Card>
  )
}

/**
 * Finalizar Turno: bombonas llenas al entregar y las que llegaron en el turno.
 * Aquí también se corrige (o se carga, si el sistema abrió el turno) lo recibido.
 */
export function NitrogenoAlEntregar({ id }: { id?: string }) {
  const sesion = useSesionTurno()
  const datos = sesion.nitrogeno.datos
  const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n))
  const completo = datos?.inicio != null && datos.fin !== null
  const [editando, setEditando] = useState(!completo)
  const [inicio, setInicio] = useState(texto(datos?.inicio))
  const [llegaron, setLlegaron] = useState(datos ? String(datos.llegaron) : "0")
  const [fin, setFin] = useState(texto(datos?.fin))
  const accion = useAccion()

  const nInicio = leerBombonas(inicio)
  const nLlegaron = llegaron.trim() === "" ? 0 : leerBombonas(llegaron)
  const nFin = leerBombonas(fin)
  // El mismo chequeo que el servidor, en vivo: el caso «recibe 3 y entrega 5».
  const descuadre = nLlegaron === null ? null : errorNitrogeno(nInicio, nLlegaron, nFin)
  const consumoEnVivo = nInicio !== null && nLlegaron !== null && nFin !== null && !descuadre ? nInicio + nLlegaron - nFin : null

  async function guardar() {
    if (nInicio === null || nFin === null || nLlegaron === null) {
      accion.setError(`${ERROR_NUMERO} Completa lo recibido y lo entregado.`)
      return
    }
    if (descuadre) {
      accion.setError(descuadre)
      return
    }
    const ok = await accion.ejecutar(() =>
      sesion.guardarNitrogeno("FIN", nFin, { llegaron: nLlegaron, inicio: nInicio === datos?.inicio ? undefined : nInicio }),
    )
    if (ok) setEditando(false)
  }

  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Nitrógeno</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bombonas <b>llenas</b>. Consumo del turno = recibidas + llegaron − entregadas. Es obligatorio para finalizar.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editando ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void guardar()
            }}
          >
            <div className="flex flex-wrap gap-4">
              <CampoBombonas id="nitrogeno-recibidas" etiqueta="Recibidas" valor={inicio} onCambio={setInicio} />
              <CampoBombonas id="nitrogeno-llegaron" etiqueta="Llegaron en el turno" valor={llegaron} onCambio={setLlegaron} invalido={!!descuadre} />
              <CampoBombonas id="nitrogeno-entregadas" etiqueta="Entregadas (llenas)" valor={fin} onCambio={setFin} invalido={!!descuadre} />
            </div>
            {descuadre ? (
              <p className="text-sm text-destructive" role="alert">
                {descuadre}
              </p>
            ) : (
              consumoEnVivo !== null && (
                <p className="text-sm text-muted-foreground">
                  Consumo del turno: <b className="num text-foreground">{textoBombonas(consumoEnVivo)}</b>
                </p>
              )
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={accion.enviando || !!descuadre || inicio === "" || fin === ""}>
                {accion.enviando && <Loader2 className="size-4 animate-spin" />}
                Guardar nitrógeno
              </Button>
              {completo && (
                <Button type="button" variant="ghost" onClick={() => setEditando(false)} disabled={accion.enviando}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              Recibidas <b className="num">{datos?.inicio ?? "—"}</b>
            </span>
            <span>
              Llegaron <b className="num">{datos?.llegaron ?? 0}</b>
            </span>
            <span>
              Entregadas <b className="num">{datos?.fin ?? "—"}</b>
            </span>
            <span>
              Consumo <b className="num">{consumoNitrogeno(datos) !== null ? textoBombonas(consumoNitrogeno(datos)!) : "—"}</b>
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
              <Pencil className="size-3.5" />
              Corregir
            </Button>
          </div>
        )}
        <MensajeError error={accion.error} />
      </CardContent>
    </Card>
  )
}
