import { Loader2, RadioTower } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AREAS, TURNO_TIPOS, type AreaCodigo } from "@/lib/catalogos"

/** Pruebas y las áreas de apoyo nunca tienen un turno propio: no tiene sentido elegirlas en el filtro de área del Panel. */
const AREAS_SELECCIONABLES = AREAS.filter((a) => a.tipo === "PRODUCCION" && a.codigo !== "PRUEBAS")

/** Área (si puede elegirla), tipo de turno, fecha y "Ver en vivo". Cambiar turno o fecha busca ese turno. */
export function FiltrosPanel({
  puedeElegirArea,
  areaFiltro,
  turnoTipo,
  fecha,
  cargando,
  onArea,
  onTurnoTipo,
  onFecha,
  onEnVivo,
}: {
  puedeElegirArea: boolean
  areaFiltro: AreaCodigo | "TODAS"
  turnoTipo: string
  fecha: string
  cargando: boolean
  onArea: (area: AreaCodigo | "TODAS") => void
  onTurnoTipo: (turnoTipo: string) => void
  onFecha: (fecha: string) => void
  onEnVivo: () => void
}) {
  return (
    <Card className="border-border bg-surface shadow-sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        {puedeElegirArea && (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">Área</span>
            <Select value={areaFiltro} onValueChange={(v) => onArea(v as AreaCodigo | "TODAS")}>
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREAS_SELECCIONABLES.map((a) => (
                  <SelectItem key={a.codigo} value={a.codigo}>
                    {a.nombre}
                  </SelectItem>
                ))}
                <SelectItem value="TODAS">Todas las áreas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Turno</span>
          <Select value={turnoTipo} onValueChange={onTurnoTipo}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TURNO_TIPOS.filter((t) => t.codigo !== "12X12").map((t) => (
                <SelectItem key={t.codigo} value={t.codigo}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Fecha</span>
          <Input type="date" value={fecha} onChange={(e) => onFecha(e.target.value)} className="w-[160px]" />
        </div>

        <Button variant="outline" size="sm" onClick={onEnVivo} disabled={cargando}>
          {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <RadioTower className="size-3.5" />}
          Ver en vivo
        </Button>
      </CardContent>
    </Card>
  )
}
