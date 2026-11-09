import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MensajeError } from "@/components/MensajeError"
import type { CargaPlc } from "@/lib/preparacion/plc"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import type { Sabor } from "@/lib/sabores"
import { useAccion } from "@/lib/useAccion"
import { conLiquido, paradasSinPt } from "./estadoTanque"
import { FormConfirmarCargaPlc } from "./FormConfirmarCargaPlc"
import type { AccionesTanque } from "./tipos"

/**
 * Una carga del PLC sin registrar en este tanque (la más antigua de la cola).
 * Decide qué se ve, con las mismas reglas que confirmar_carga_plc en la base:
 *   - el tanque tiene un lote En Preparación → liberarlo primero;
 *   - un lote de Vacío o una línea parada sin PT → resolver eso primero;
 *   - el PLC todavía está con la pulpa → esperar;
 *   - si no, el formulario para elegir sabor y lote.
 * Siempre se puede descartar (por ejemplo, si se registró a mano).
 */
export function PanelCargaPlc({
  tanque,
  carga,
  enCola,
  loteAbierto,
  loteActivo,
  corridasSinPt,
  sabores,
  areaCodigo,
  usuarioSesion,
  calidadLibera,
  modoVacio,
  acciones,
}: {
  tanque: TanqueRecepcion
  carga: CargaPlc
  /** Cuántas cargas sin registrar tiene el tanque (esta incluida). */
  enCola: number
  /** Lote del tanque sin liberar. */
  loteAbierto: PreparacionRegistro | null
  /** Lote liberado y abierto del tanque (el del resto). */
  loteActivo: PreparacionRegistro | null
  /** Corridas de este lote sin PT cargado. */
  corridasSinPt: Corrida[]
  sabores: Sabor[]
  areaCodigo: string | null
  usuarioSesion: string
  calidadLibera: boolean | null
  modoVacio: boolean
  acciones: AccionesTanque
}) {
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  const descarte = useAccion()
  const tieneResto = conLiquido(tanque) && (tanque.volumenL ?? 0) > 0

  function cuerpo() {
    if (tanque.condicion === "EN_PREPARACION" && loteAbierto) {
      return (
        <p className="text-xs font-medium text-foreground">
          {`Libera primero el lote ${loteAbierto.lote ?? ""}: el PLC ya terminó esa preparación. Si esta carga es la misma que registraste a mano, descártala.`}
        </p>
      )
    }
    if (conLiquido(tanque) && tanque.paraVacio) {
      return (
        <p className="text-xs font-medium text-vacio">
          El tanque tiene un lote de Vacío: entrégalo o pásalo a Aséptico primero (en MODO VACÍO).
        </p>
      )
    }
    if (tieneResto && paradasSinPt(corridasSinPt).length > 0) {
      // El botón «Cargar PT» está en los paneles de abajo.
      return (
        <p className="text-xs font-medium text-destructive">
          {`La línea que tomó del Tanque ${tanque.numeroTanque} está parada sin Producto Terminado. Cárgalo primero.`}
        </p>
      )
    }
    if (carga.estado === "EN_CURSO" && !carga.kitsListos) {
      return (
        <p className="text-xs text-muted-foreground">
          El PLC está cargando esta preparación. Cuando termine la pulpa, aquí eliges sabor y lote.
        </p>
      )
    }
    return (
      <FormConfirmarCargaPlc
        // Otra carga (la anterior se registró o se descartó): el formulario arranca de cero.
        key={carga.id}
        carga={carga}
        sabores={sabores}
        resto={
          tieneResto
            ? { litros: tanque.volumenL ?? 0, saborId: tanque.saborId, saborNombre: tanque.saborNombre, lote: loteActivo?.lote ?? tanque.lote }
            : null
        }
        areaCodigo={areaCodigo}
        usuarioSesion={usuarioSesion}
        calidadLibera={calidadLibera}
        modoVacio={modoVacio}
        onConfirmar={acciones.confirmarCargaPlc}
      />
    )
  }

  async function descartar() {
    if (await descarte.ejecutar(() => acciones.descartarCargaPlc(carga.id))) setConfirmandoDescarte(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-info/40 bg-info-soft/20 p-2">
      {enCola > 1 && (
        <p className="text-xs font-medium text-foreground">{`Hay ${enCola} cargas del PLC para este tanque: registra primero esta (la más antigua).`}</p>
      )}
      {cuerpo()}
      {confirmandoDescarte ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background p-2">
          <p className="text-xs text-foreground">¿Descartar esta carga del PLC? No se va a usar para ningún lote.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="destructive" disabled={descarte.enviando} onClick={descartar}>
              {descarte.enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Sí, descartar
            </Button>
            <Button size="sm" variant="ghost" disabled={descarte.enviando} onClick={() => setConfirmandoDescarte(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="self-start text-muted-foreground" onClick={() => setConfirmandoDescarte(true)}>
          <Trash2 className="size-3.5" />
          Descartar carga
        </Button>
      )}
      <MensajeError error={descarte.error} />
    </div>
  )
}
