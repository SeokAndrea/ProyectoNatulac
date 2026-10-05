import { useState } from "react"
import { ArrowRightLeft, Beaker, BroomSparkles, Loader2, PackageOpen, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MedirTanqueInline } from "@/components/MedirTanqueInline"
import { MensajeError } from "@/components/MensajeError"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Sabor } from "@/lib/sabores"
import { useAccion } from "@/lib/useAccion"
import { DESVASE_HABILITADO } from "./constantes"
import { conLiquido } from "./estadoTanque"
import { FormIniciarPreparacion } from "./FormIniciarPreparacion"
import type { AccionesTanque } from "./tipos"

/** Formulario abierto en el panel. Uno a la vez. */
type Form = "preparar" | "medir" | "fijar" | null

/**
 * Preparación, tanque que no está En Preparación ni en CIP: Iniciar
 * Preparación, Iniciar CIP, Medir (o Fijar volumen real), Transferir y
 * Desvase. Iniciar CIP y Desvase piden un segundo clic.
 */
export function PanelAccionesTanque({
  tanque,
  sabores,
  loteActivo,
  loteActivoSinCorrida,
  puedeTransferir,
  areaCodigo,
  usuarioSesion,
  acciones,
  onTransferir,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  /** Lote liberado y abierto del tanque. */
  loteActivo: PreparacionRegistro | null
  /**
   * Lote propio de este turno, liberado, pero ninguna corrida tomó de él
   * todavía → todavía es seguro fijar su volumen real (mueve el 100% del
   * lote). Apenas corre una línea, esto pasa a ser "Medir tanque".
   */
  loteActivoSinCorrida: boolean
  /** Hay resto y algún tanque al que mandarlo. */
  puedeTransferir: boolean
  areaCodigo: string | null
  usuarioSesion: string
  acciones: AccionesTanque
  onTransferir: () => void
}) {
  const [form, setForm] = useState<Form>(null)
  const [confirmandoCip, setConfirmandoCip] = useState(false)
  const [confirmandoDesvase, setConfirmandoDesvase] = useState(false)
  const cip = useAccion()
  const desvase = useAccion()
  const cerrar = () => setForm(null)
  const conResto = conLiquido(tanque)
  /** Guardrail #1: el tanque tiene producto sin usar — al preparar encima, se suma solo por default (ver iniciar_preparacion). */
  const tieneResto = conResto && (tanque.volumenL ?? 0) > 0

  async function iniciarCip() {
    if (!confirmandoCip) {
      setConfirmandoCip(true)
      return
    }
    await cip.ejecutar(() =>
      acciones.cambiarCondicion({ numeroTanque: tanque.numeroTanque, condicion: "CIP", saborId: null, volumenL: null, lote: null }),
    )
    setConfirmandoCip(false)
  }

  async function desvasar() {
    if (!confirmandoDesvase) {
      setConfirmandoDesvase(true)
      return
    }
    if (await desvase.ejecutar(() => acciones.desvasar(tanque.numeroTanque))) setConfirmandoDesvase(false)
  }

  function cuerpo() {
    if (form === "preparar") {
      return (
        <FormIniciarPreparacion
          numeroTanque={tanque.numeroTanque}
          sabores={sabores}
          volumenRestante={conResto ? (tanque.volumenL ?? 0) : 0}
          saborRestanteId={conResto ? tanque.saborId : null}
          saborRestanteNombre={conResto ? tanque.saborNombre : null}
          areaCodigo={areaCodigo}
          usuarioSesion={usuarioSesion}
          onIniciar={async (datos) => {
            const resultado = await acciones.iniciarPreparacion(datos)
            if (resultado.ok) cerrar()
            return resultado
          }}
          onCancelar={cerrar}
        />
      )
    }
    if (form === "medir") {
      return (
        <MedirTanqueInline
          numeroTanque={tanque.numeroTanque}
          volumenActual={tanque.volumenL}
          onMedir={(litros) => acciones.medirTanque(tanque.numeroTanque, litros)}
          onListo={cerrar}
          onCancelar={cerrar}
        />
      )
    }
    if (form === "fijar" && loteActivo) {
      return (
        <MedirTanqueInline
          numeroTanque={tanque.numeroTanque}
          volumenActual={loteActivo.volumenPreparadoL}
          descripcion={`Volumen REAL del lote en el Tanque ${tanque.numeroTanque} — es el 100% del lote (mueve el punto de partida de la merma). Solo mientras ninguna línea haya corrido.`}
          notaCero={null}
          guardarTexto="Fijar volumen"
          onMedir={(litros) => acciones.fijarVolumenLote(loteActivo.id, litros)}
          onListo={cerrar}
          onCancelar={cerrar}
        />
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {tieneResto && (
          <p className="text-xs text-muted-foreground">
            Quedan {(tanque.volumenL ?? 0).toLocaleString("es-CO")} L de {tanque.saborNombre} sin usar — al preparar encima, se
            suman solos al lote nuevo. Para otra cosa: Transferir o Desvase.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setForm("preparar")}>
            <Beaker className="size-3.5" />
            {tanque.condicion === "LISTO" ? "Iniciar nueva preparación" : "Iniciar Preparación"}
          </Button>
          <Button size="sm" variant={confirmandoCip ? "destructive" : "outline"} disabled={cip.enviando} onClick={iniciarCip}>
            {cip.enviando ? <Loader2 className="size-3.5 animate-spin" /> : <BroomSparkles className="size-3.5" />}
            {confirmandoCip ? "¿Seguro? Sí, iniciar CIP" : "Iniciar CIP"}
          </Button>
          {confirmandoCip && (
            <Button size="sm" variant="ghost" disabled={cip.enviando} onClick={() => setConfirmandoCip(false)}>
              Cancelar
            </Button>
          )}
          {conResto &&
            (loteActivoSinCorrida ? (
              <Button size="sm" variant="outline" onClick={() => setForm("fijar")}>
                <Ruler className="size-3.5" />
                Fijar volumen real
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setForm("medir")}>
                <Ruler className="size-3.5" />
                Medir tanque
              </Button>
            ))}
          {tieneResto && puedeTransferir && (
            <Button size="sm" variant="outline" onClick={onTransferir}>
              <ArrowRightLeft className="size-3.5" />
              Transferir
            </Button>
          )}
          {DESVASE_HABILITADO && tieneResto && (
            <Button size="sm" variant="outline" onClick={desvasar} disabled={desvase.enviando}>
              {desvase.enviando ? <Loader2 className="size-3.5 animate-spin" /> : <PackageOpen className="size-3.5" />}
              {confirmandoDesvase ? "¿Seguro? Sí, desvasar" : "Desvase"}
            </Button>
          )}
          {DESVASE_HABILITADO && confirmandoDesvase && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmandoDesvase(false)} disabled={desvase.enviando}>
              Cancelar
            </Button>
          )}
        </div>
        <MensajeError error={cip.error} />
      </div>
    )
  }

  return (
    <>
      {cuerpo()}
      <MensajeError error={desvase.error} />
    </>
  )
}
