import type { VistaVivaTanque } from "@/lib/preparacion/plc"
import { cifra } from "./constantes"

/**
 * Lo que el PLC hace ahora en el tanque (del bridge, no se guarda): agua de
 * la fórmula, lo que entró con una barra que marca el 80 % (ahí termina la
 * primera carga de agua), los kits y el ajuste en curso. No nombra las fases:
 * esas las ve el operador en la HMI.
 */
export function PlcEnVivo({ vivo }: { vivo: VistaVivaTanque }) {
  const formula = vivo.aguaFormulaL
  const entraron = vivo.litrosAgua
  const avance = formula && formula > 0 && entraron != null ? Math.min(100, (entraron / formula) * 100) : null
  const caudal = vivo.llenando && vivo.caudalLMin != null && vivo.caudalLMin > 0 ? ` · ${Math.round(vivo.caudalLMin)} L/min` : ""

  return (
    <div className="flex flex-col gap-1 rounded-md border border-info/30 bg-info-soft/40 p-2 text-xs text-foreground">
      {formula != null && <p>Agua de la fórmula: {cifra(formula)} L</p>}
      {entraron != null && <p className="num">{`Entraron ${cifra(Math.round(entraron))} L${caudal}`}</p>}
      {avance != null && (
        <div className="relative mt-3 h-2 rounded-full bg-muted" aria-label="Avance del agua de la fórmula">
          <div className="h-full rounded-full bg-info transition-[width] duration-1000 ease-linear" style={{ width: `${avance}%` }} />
          <div className="absolute -top-1 bottom-[-4px] w-px bg-foreground/60" style={{ left: "80%" }} />
          <span className="absolute -top-3.5 -translate-x-1/2 text-[10px] leading-none text-muted-foreground" style={{ left: "80%" }}>
            80 %
          </span>
        </div>
      )}
      {vivo.kits != null && <p className="font-medium">Kits: {cifra(vivo.kits)}</p>}
      {vivo.ajusteL != null && (
        <p className="font-medium">{`Ajuste de agua en curso: +${cifra(vivo.ajusteL)} L (entraron ${cifra(Math.round(vivo.litrosAjuste ?? 0))} L)`}</p>
      )}
    </div>
  )
}
