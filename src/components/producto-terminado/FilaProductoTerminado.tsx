import { useState } from "react"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { Corrida } from "@/lib/produccion/tipos"
import { deltaEnvases, tanqueDeCorrida } from "./calculosPT"
import { FormCargaPT } from "./FormCargaPT"
import { MedirTanqueTrasCierre } from "./MedirTanqueTrasCierre"
import type { AccionesPT } from "./tipos"
import { VistaCorridaCerrada, VistaCorridaPausada } from "./VistasCorrida"

/**
 * Una corrida en Producto Terminado. Elige qué mostrar: medir el tanque
 * recién cerrado, la línea parada, la corrida ya cerrada (solo lectura,
 * salvo "Editar un error") o el formulario de carga.
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
  /** Corrida en pausa (parada reversible): no se puede cargar producto terminado hasta reanudarla. */
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

  if (estaPausada && !editandoError) {
    return (
      <VistaCorridaPausada
        corrida={corrida}
        nombreLinea={nombreLinea}
        presentacionNombre={presentacionNombre}
        registro={registro}
        onEditar={() => setEditandoError(true)}
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

  return (
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
}
