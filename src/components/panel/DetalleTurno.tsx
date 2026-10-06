import { SeccionColapsable } from "@/components/SeccionColapsable"
import { TopFallasPanel } from "@/components/TopFallasPanel"
import type { LineaLive } from "@/lib/catalogosLive"
import type { EficienciaTurno } from "@/lib/eficiencia"
import type { Parada } from "@/lib/paradas"
import type { DesvaseLoteRegistro, PreparacionRegistro, TransferenciaRegistro } from "@/lib/preparacion/tipos"
import type { ContadorRegistro, Corrida } from "@/lib/produccion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import type { TurnoActivo } from "@/lib/turno"
import { DesgloseCalculosPanel } from "./DesgloseCalculosPanel"
import { MetaPorLinea } from "./MetaPorLinea"
import { TituloSeccion } from "./PanelCard"

/** "Detalle del turno": Meta por línea, Top Fallas y (en Aséptico y Pruebas) el desglose de cálculo. Todo plegado. */
export function DetalleTurno({
  turno,
  areaEfectiva,
  eficiencia,
  lineas,
  paradas,
  preparaciones,
  corridas,
  productoTerminado,
  contadores,
  transferencias,
  desvases,
}: {
  turno: TurnoActivo
  areaEfectiva: string | null
  eficiencia: EficienciaTurno | null
  lineas: LineaLive[]
  paradas: Parada[]
  preparaciones: PreparacionRegistro[]
  corridas: Corrida[]
  productoTerminado: ProductoTerminadoRegistro[]
  contadores: ContadorRegistro[]
  transferencias: TransferenciaRegistro[]
  desvases: DesvaseLoteRegistro[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <TituloSeccion>Detalle del turno</TituloSeccion>

      <SeccionColapsable
        titulo="Meta por línea"
        descripcion="Meta del turno completo (velocidad elegida × tiempo disponible), avance y eficiencia, por línea. Las paradas Programadas y el Ocioso bajan la meta; las No programadas bajan la eficiencia."
      >
        <MetaPorLinea eficiencia={eficiencia} turnoTipo={turno.turnoTipo} lineas={lineas} />
      </SeccionColapsable>

      <SeccionColapsable titulo="Top Fallas — paradas por línea" descripcion="Downtime del turno por clase (programada / no programada / ociosa) y por línea.">
        <TopFallasPanel paradas={paradas} lineas={lineas} />
      </SeccionColapsable>

      {(areaEfectiva === "PRUEBAS" || areaEfectiva === "ASEPTICO") && (
        <SeccionColapsable
          titulo="Desglose de cálculo"
          descripcion="Números crudos detrás de cada merma y meta — envases, litros y cajas que alimentan cada porcentaje del turno."
        >
          <DesgloseCalculosPanel
            turnoId={turno.id}
            horaInicio={turno.horaInicio}
            estado={turno.estado}
            horaFin={turno.horaFin}
            preparaciones={preparaciones}
            corridas={corridas}
            productoTerminado={productoTerminado}
            contadores={contadores}
            transferencias={transferencias}
            desvases={desvases}
          />
        </SeccionColapsable>
      )}
    </div>
  )
}
