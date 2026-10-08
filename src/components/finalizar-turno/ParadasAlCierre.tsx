import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FormCompletarParada } from "@/components/paradas/FormCompletarParada"
import type { LineaLive } from "@/lib/catalogosLive"
import { duracionMin, fmtDuracion, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive } from "@/lib/paradasCatalogo"
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
          paradas.map((p) => {
            const codigo = codigoDeParadaLive(p)
            return (
              <div key={p.id} className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${p.pendiente ? "border-destructive/60 bg-danger-soft/40" : "border-border"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-foreground">
                    {nombreLinea(p.lineaCodigo)}
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      {p.inicio.slice(11, 16)}
                      {" · "}
                      {codigo ? `${codigo} · ` : ""}
                      {p.tipoNombre}
                    </span>
                  </p>
                  {p.pendiente ? <Badge variant="danger">Sin completar</Badge> : <span className="num shrink-0 font-semibold">{fmtDuracion(duracionMin(p))}</span>}
                </div>
                {(p.nota || p.justificacionDesvio) && (
                  <p className="text-xs text-muted-foreground">
                    {[p.nota, p.justificacionDesvio ? "Justificación: " + p.justificacionDesvio : null].filter(Boolean).join(" — ")}
                  </p>
                )}
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
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
