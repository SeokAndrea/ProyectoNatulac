import { Fragment, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { reportesDelSheet, type FilaSheet } from "@/lib/sheetMantenimiento"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * Reportes de Mantenimiento tal cual vienen de su Sheet (dueña, 2026-10-08):
 * hora, línea, equipo y código, duración y estado; la falla al tocar la
 * fila. Se leen directo del Sheet. Aparte, «Actualizar desde el Sheet» los
 * guarda como paradas para que sumen en el Panel, la eficiencia y el acta.
 */
type Periodo = "HOY" | "AYER" | "7D"
const PERIODOS: { codigo: Periodo; etiqueta: string }[] = [
  { codigo: "HOY", etiqueta: "Hoy" },
  { codigo: "AYER", etiqueta: "Ayer" },
  { codigo: "7D", etiqueta: "7 días" },
]

const hora = (iso: string) => iso.slice(11, 16)
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
function duracion(inicio: string, fin: string | null, pendiente: boolean): string {
  if (pendiente) return "pendiente"
  if (!fin) return "en curso"
  const min = Math.round((Date.parse(`${fin}Z`) - Date.parse(`${inicio}Z`)) / 60000)
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}` : `${min} min`
}

export function ReportesMantenimiento() {
  const [filas, setFilas] = useState<FilaSheet[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>("HOY")
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    reportesDelSheet().then((r) => (r.ok ? setFilas(r.datos) : setError(r.error)))
  }, [])

  const hoy = fechaPlanta()
  const visibles = useMemo(() => {
    const desde = periodo === "HOY" ? hoy : periodo === "AYER" ? restarDias(hoy, 1) : restarDias(hoy, 6)
    const hasta = periodo === "AYER" ? restarDias(hoy, 1) : hoy
    return (filas ?? [])
      .filter((f) => f.inicio.slice(0, 10) >= desde && f.inicio.slice(0, 10) <= hasta)
      .sort((a, b) => b.inicio.localeCompare(a.inicio))
  }, [filas, periodo, hoy])

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Reportes de Mantenimiento</CardTitle>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <Button key={p.codigo} size="sm" variant={periodo === p.codigo ? "default" : "outline"} onClick={() => setPeriodo(p.codigo)}>
              {p.etiqueta}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : filas === null ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Mantenimiento no reportó nada en Aséptico en este período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Línea</TableHead>
                <TableHead>Equipo · código</TableHead>
                <TableHead className="text-right">Duración</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((f) => (
                <Fragment key={f.id}>
                  <TableRow
                    className={`cursor-pointer ${abierta === f.id ? "border-b-0" : ""}`}
                    onClick={() => setAbierta((a) => (a === f.id ? null : f.id))}
                    aria-expanded={abierta === f.id}
                  >
                    <TableCell className="num whitespace-nowrap">
                      {periodo === "7D" && <span className="text-muted-foreground">{diaMes(f.inicio)} </span>}
                      {hora(f.inicio)}{f.estatus.toUpperCase() === "PENDIENTE" ? "" : `–${f.fin ? hora(f.fin) : "…"}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{f.linea.replace(/^LINEA\s*/i, "L")}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{f.equipo}</span>
                      {f.subsistema && <span className="text-muted-foreground"> · {f.subsistema}</span>}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{duracion(f.inicio, f.fin, f.estatus.toUpperCase() === "PENDIENTE")}</TableCell>
                    <TableCell>
                      {f.estatus.toUpperCase() === "PENDIENTE" ? <Badge variant="warning">Pendiente</Badge> : <Badge variant="muted">Finalizado</Badge>}
                    </TableCell>
                  </TableRow>
                  {abierta === f.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="whitespace-normal pt-0 text-sm text-muted-foreground">
                        {f.falla || "Sin descripción de la falla."}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
