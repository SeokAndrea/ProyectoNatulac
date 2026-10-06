import { useState } from "react"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"
import { deltaEnvases, tanqueDeCorrida } from "./calculosPT"
import { FormCargaPT } from "./FormCargaPT"
import { MedirTanqueTrasCierre } from "./MedirTanqueTrasCierre"
import type { AccionesPT } from "./tipos"
import { VistaCorridaCerrada } from "./VistasCorrida"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"

/**
 * Una corrida en Producto Terminado. Elige qué mostrar: medir el tanque
 * recién cerrado, la corrida ya cerrada (solo lectura, salvo "Editar un
 * error") o el formulario de carga. Con la línea parada también se carga
 * (dueña, 2026-10-06): en el corte de turno hay que subir lo producido sin
 * reanudar la línea; si se entrega, llega parada al turno siguiente.
 */
export function FilaProductoTerminado({
  corrida,
  nombreLinea,
  contadorActual,
  contadorBuenosActual,
  presentaciones,
  tanques,
  preparaciones,
  registro,
  acciones,
  soloPT = false,
}: {
  corrida: Corrida
  nombreLinea: string
  contadorActual: number
  /** Suma de Contador 2 (envases buenos) de esta corrida. */
  contadorBuenosActual: number
  presentaciones: PresentacionLive[]
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  registro: ProductoTerminadoRegistro | null
  acciones: AccionesPT
  /** Turno cerrado, dentro de la ventana de gracia (ver TurnoGraciaPT en sesionTurno.tsx) o en corrección: solo Paletas/Cajas sueltas. */
  soloPT?: boolean
}) {
  const [editandoError, setEditandoError] = useState(false)
  /** Tras cerrar una corrida (Terminar / Entregar) se pide medir el tanque de ese lote. */
  const [medicionTanque, setMedicionTanque] = useState<TanqueRecepcion | null>(null)

  const saborId = registro?.saborId ?? corrida.saborId
  /** Ya se decidió el destino de esta corrida (Terminó Corrida o Entregada al siguiente turno) — queda bloqueada salvo "Editar un error". */
  const estaCerrada = (!corrida.activa && !corrida.esperandoCierre) || corrida.entregadaEn !== null
  /** Corrida en pausa (parada reversible): se carga igual, con un aviso. */
  const estaPausada = corrida.pausadaEn !== null && !estaCerrada
  const presentacion = presentaciones.find((p) => p.codigo === corrida.presentacion)
  const presentacionNombre = presentacion?.nombre ?? `${corrida.presentacion} ml`

  // Va antes de la vista "Cerrada" para que el paso no se pierda cuando la corrida ya se cerró.
  if (medicionTanque) {
    return (
      <MedirTanqueTrasCierre
        corrida={corrida}
        nombreLinea={nombreLinea}
        tanque={medicionTanque}
        preparaciones={preparaciones}
        medirTanque={acciones.medirTanque}
        onListo={() => setMedicionTanque(null)}
      />
    )
  }

  if (estaCerrada && !editandoError) {
    return (
      <VistaCorridaCerrada
        corrida={corrida}
        nombreLinea={nombreLinea}
        presentacionNombre={presentacionNombre}
        registro={registro}
        contadorActual={contadorActual}
        deltaEnvases={deltaEnvases(registro, presentacion, contadorBuenosActual)}
        onEditar={() => setEditandoError(true)}
      />
    )
  }

  const form = (
    <FormCargaPT
      corrida={corrida}
      nombreLinea={nombreLinea}
      saborId={saborId}
      presentacion={presentacion}
      contadorActual={contadorActual}
      contadorBuenosActual={contadorBuenosActual}
      registro={registro}
      soloPT={soloPT}
      modoCorreccion={estaCerrada && editandoError}
      puedeElegirProximoEstado={!soloPT && corrida.activa && corrida.entregadaEn === null}
      acciones={acciones}
      onGuardado={(cerrando) => {
        setEditandoError(false)
        if (!cerrando) return
        const tanque = tanqueDeCorrida(tanques, saborId, corrida.lote)
        if (tanque) setMedicionTanque(tanque)
      }}
      onCancelarCorreccion={() => setEditandoError(false)}
    />
  )

  if (!estaPausada) return form
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-lg border border-warning/40 bg-warning-soft/30 px-3 py-2 text-sm text-foreground">
        {nombreLinea} está parada (o en CIP) desde las {horaCortaPlanta(corrida.pausadaEn!, corrida.pausadaEn!.slice(0, 10))}. Carga lo producido hasta ahí; si la
        entregas, sigue igual en el próximo turno.
      </p>
      {form}
    </div>
  )
}
