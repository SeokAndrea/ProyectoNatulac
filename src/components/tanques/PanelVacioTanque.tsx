import { useState } from "react"
import { ArrowRightLeft, Beaker, Factory, PlugZap, Ruler } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MedirTanqueInline } from "@/components/MedirTanqueInline"
import { LataPixel } from "@/components/pixel/LataPixel"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Sabor } from "@/lib/sabores"
import { conLiquido } from "./estadoTanque"
import { FormEntregarVacio } from "./FormEntregarVacio"
import { FormIniciarPreparacion } from "./FormIniciarPreparacion"
import { FormRecibirDeVacio } from "./FormRecibirDeVacio"
import type { AccionesTanque } from "./tipos"

type Form = "preparar" | "recibir" | "entregar" | "pasar" | "medir" | null

/**
 * Preparación en MODO VACÍO: lo que se puede hacer con un tanque según lo
 * que tiene (migración 20261109490000).
 *   Limpio o Con Restos 0 L → Preparar para Vacío · Recibir de Vacío
 *   Lote de Vacío           → Entregar a Vacío · Pasar a Aséptico · Transferir · Medir
 *   Lote de Aséptico        → Salida a Vacío · Transferir · Medir
 */
export function PanelVacioTanque({
  tanque,
  sabores,
  puedeTransferir,
  areaCodigo,
  usuarioSesion,
  acciones,
  onTransferir,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  puedeTransferir: boolean
  areaCodigo: string | null
  usuarioSesion: string
  acciones: AccionesTanque
  onTransferir: () => void
}) {
  const [form, setForm] = useState<Form>(null)
  const cerrar = () => setForm(null)
  const conProducto = conLiquido(tanque) && (tanque.volumenL ?? 0) > 0
  const vacioDisponible = tanque.condicion === "LIMPIO" || tanque.condicion === "SUCIO"

  if (form === "preparar") {
    return (
      <FormIniciarPreparacion
        numeroTanque={tanque.numeroTanque}
        sabores={sabores}
        volumenRestante={0}
        saborRestanteId={null}
        saborRestanteNombre={null}
        areaCodigo={areaCodigo}
        usuarioSesion={usuarioSesion}
        paraVacio
        onIniciar={async (datos) => {
          const resultado = await acciones.iniciarPreparacion(datos)
          if (resultado.ok) cerrar()
          return resultado
        }}
        onCancelar={cerrar}
      />
    )
  }
  if (form === "recibir") {
    return (
      <FormRecibirDeVacio
        numeroTanque={tanque.numeroTanque}
        sabores={sabores}
        onRecibir={async (datos) => {
          const resultado = await acciones.recibirDeVacio(datos)
          if (resultado.ok) cerrar()
          return resultado
        }}
        onCancelar={cerrar}
      />
    )
  }
  if (form === "entregar") {
    return (
      <FormEntregarVacio
        tanque={tanque}
        onEntregar={(litros) => acciones.entregarAVacio(tanque.numeroTanque, litros)}
        onListo={cerrar}
        onCancelar={cerrar}
      />
    )
  }
  if (form === "pasar") {
    return (
      <MedirTanqueInline
        numeroTanque={tanque.numeroTanque}
        volumenActual={tanque.volumenL}
        descripcion={`Mide el Tanque ${tanque.numeroTanque}. Desde ahora es un lote de Aséptico: estos litros son su 100% para la merma, y una línea lo puede tomar.`}
        notaCero={null}
        guardarTexto="Pasar a Aséptico"
        onMedir={(litros) => acciones.pasarAAseptico(tanque.numeroTanque, litros)}
        onListo={cerrar}
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

  const botonVacio = "border-vacio/50 text-vacio hover:text-vacio"

  return (
    <div className="flex flex-wrap gap-2">
      {vacioDisponible && (
        <>
          <Button size="sm" variant="outline" className={botonVacio} onClick={() => setForm("preparar")}>
            <Beaker className="size-3.5" />
            Preparar para Vacío
          </Button>
          <Button size="sm" variant="outline" className={botonVacio} onClick={() => setForm("recibir")}>
            <PlugZap className="size-3.5" />
            Recibir de Vacío
          </Button>
        </>
      )}
      {conProducto && (
        <Button size="sm" variant="outline" className={botonVacio} onClick={() => setForm("entregar")}>
          <LataPixel saborNombre={tanque.saborNombre} />
          {tanque.paraVacio ? "Entregar a Vacío" : "Salida a Vacío"}
        </Button>
      )}
      {tanque.paraVacio && conLiquido(tanque) && (
        <Button size="sm" variant="outline" className={botonVacio} onClick={() => setForm("pasar")}>
          <Factory className="size-3.5" />
          Pasar a Aséptico
        </Button>
      )}
      {conProducto && puedeTransferir && (
        <Button size="sm" variant="outline" onClick={onTransferir}>
          <ArrowRightLeft className="size-3.5" />
          Transferir
        </Button>
      )}
      {conLiquido(tanque) && (
        <Button size="sm" variant="outline" onClick={() => setForm("medir")}>
          <Ruler className="size-3.5" />
          Medir tanque
        </Button>
      )}
      {!vacioDisponible && !conLiquido(tanque) && (
        <p className="text-xs text-muted-foreground">Nada que hacer para Vacío en este tanque ahora.</p>
      )}
    </div>
  )
}
