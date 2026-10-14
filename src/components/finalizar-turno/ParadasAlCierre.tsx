import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormCompletarParada } from "@/components/paradas/FormCompletarParada"
import { FilaParada } from "@/components/paradas/ParadasPorTurno"
import type { LineaLive } from "@/lib/catalogosLive"
import { duracionMin, fmtDuracion, type Parada } from "@/lib/paradas"
import { useEquiposParadas } from "@/lib/paradasEquipos"

const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/** Paradas del turno (salen en el acta). Las pendientes se completan aquí mismo. */
export function ParadasAlCierre({
  paradas,
  lineas,
  usuario,
  area,
  presentacionDeLinea,
  onCambio,
}: {
  paradas: Parada[]
  lineas: LineaLive[]
  usuario: string
  area: string
  /** ml de la corrida que corre en esa línea (filtra el catálogo), o null. */
  presentacionDeLinea: (lineaCodigo: string) => number | null
  onCambio: () => void | Promise<void>
}) {
  const equipos = useEquiposParadas()
  const nombreLinea = (codigo: string) => lineas.find((l) => numeroLinea(l.codigo) === numeroLinea(codigo))?.nombre ?? codigo
  const total = paradas.filter((p) => !p.pendiente).reduce((a, p) => a + duracionMin(p), 0)

  return (
    <Card id="seccion-paradas" className="scroll-mt-4">
      <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2 pb-2">
        <CardTitle className="text-base">Paradas del turno</CardTitle>
        {paradas.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {paradas.length} {paradas.length === 1 ? "parada" : "paradas"} · <span className="num">{fmtDuracion(total)}</span>
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No se registró ninguna parada en este turno.</p>
        ) : (
          paradas.map((p) => (
            <FilaParada key={p.id} parada={p} nombreLinea={nombreLinea}>
              {p.pendiente && (
                <FormCompletarParada
                  parada={p}
                  usuario={usuario}
                  area={area}
                  equipos={equipos}
                  presentacionMl={presentacionDeLinea(p.lineaCodigo)}
                  textoBoton="Guardar"
                  pagina="Finalizar Turno"
                  onListo={onCambio}
                />
              )}
            </FilaParada>
          ))
        )}
      </CardContent>
    </Card>
  )
}
