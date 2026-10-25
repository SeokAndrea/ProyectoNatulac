import { CintaEstadoLinea } from "@/components/CintaEstadoLinea"
import { LineaVisual } from "@/components/LineaVisual"
import type { LineaCodigo } from "@/lib/catalogos"
import { colorSabor } from "@/lib/coloresSabor"
import type { Corrida } from "@/lib/produccion/tipos"
import type { AspectoLinea } from "./estadoLinea"

/** La animación de la línea (cinta o visual), la misma en la tarjeta de siempre y en el Modo Paradas. */
export function AnimacionLinea({ lineaCodigo, lineaTurno, aspecto }: { lineaCodigo: LineaCodigo; lineaTurno: Corrida | null; aspecto: AspectoLinea }) {
  return aspecto.cinta ? (
    <CintaEstadoLinea
      estado={aspecto.cinta}
      saborNombre={lineaTurno?.saborNombre}
      presentacion={lineaTurno?.presentacion}
      escala={1.8}
      className="w-full"
    />
  ) : (
    <LineaVisual
      numeroLinea={Number(lineaCodigo.replace("LINEA_", "")) || 0}
      estado={aspecto.visual}
      color={colorSabor(lineaTurno?.saborNombre ?? null)}
      square
      saborNombre={lineaTurno?.saborNombre ?? null}
      presentacion={lineaTurno?.presentacion ?? null}
    />
  )
}
