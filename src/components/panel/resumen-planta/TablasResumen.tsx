import { CheckCircle2, UserRound, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { nombreGrupo } from "@/lib/catalogos"
import { badgeVariantPorNivel, horasTurno, mermaAgregada, MERMA_WARN_DESDE, nivelMerma, type FilaEstadistica } from "@/lib/estadisticas"

/** Litros, horas y merma real por grupo de turno. */
export function TablaPorGrupo({ filas }: { filas: FilaEstadistica[] }) {
  const grupos = [...new Set(filas.map((f) => f.grupo))]
    .map((grupo) => {
      const filasGrupo = filas.filter((f) => f.grupo === grupo)
      return {
        grupo,
        merma: mermaAgregada(filasGrupo) ?? 0,
        litros: filasGrupo.reduce((a, f) => a + f.litrosProducidos, 0),
        horas: filasGrupo.reduce((a, f) => a + (horasTurno(f) ?? 0), 0),
      }
    })
    .sort((a, b) => nombreGrupo(a.grupo).localeCompare(nombreGrupo(b.grupo)))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Users className="size-4 text-primary" />
          Por Grupo
        </CardTitle>
        <CardDescription className="mt-1 text-xs">Litros, horas y merma real por grupo de turno.</CardDescription>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wide">Grupo</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Litros</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Horas</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Merma real</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.map((g) => (
              <TableRow key={g.grupo}>
                <TableCell className="font-medium">{nombreGrupo(g.grupo)}</TableCell>
                <TableCell className="num text-right">{g.litros.toLocaleString("es-CO")}</TableCell>
                <TableCell className="num text-right">{Math.round(g.horas)} h</TableCell>
                <TableCell className="text-right">
                  <Badge variant={badgeVariantPorNivel[nivelMerma(g.merma)]}>{g.merma.toFixed(1)}%</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** Litros producidos y merma real por supervisor. */
export function TablaPorSupervisor({ filas }: { filas: FilaEstadistica[] }) {
  const supervisores = [...new Set(filas.map((f) => f.supervisorUsuario))]
    .map((usuario) => {
      const filasSup = filas.filter((f) => f.supervisorUsuario === usuario)
      return {
        usuario,
        nombre: filasSup[0]?.supervisorNombre ?? usuario,
        merma: mermaAgregada(filasSup) ?? 0,
        litros: filasSup.reduce((a, f) => a + f.litrosProducidos, 0),
      }
    })
    .sort((a, b) => b.litros - a.litros)

  const maxLitros = Math.max(1, ...supervisores.map((s) => s.litros))

  return (
    <Card className="shadow-panel gap-0 overflow-hidden border-border py-0">
      <div className="border-b border-border/70 bg-surface px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserRound className="size-4 text-primary" />
          Por Supervisor
        </CardTitle>
        <CardDescription className="mt-1 text-xs">Litros producidos y merma real por supervisor.</CardDescription>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wide">Supervisor</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Litros</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-wide">Merma real</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supervisores.map((s) => (
              <TableRow key={s.usuario}>
                <TableCell className="font-medium">{s.nombre}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(s.litros / maxLitros) * 100}%` }} />
                    </div>
                    <span className="num text-xs font-semibold">{s.litros.toLocaleString("es-CO")}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={badgeVariantPorNivel[nivelMerma(s.merma)]}>
                    {s.merma <= MERMA_WARN_DESDE && <CheckCircle2 className="size-3" />}
                    {s.merma.toFixed(1)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
