import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { codigoPlanilla } from "@/lib/paradas"
import { useCatalogoParadas } from "@/lib/paradasCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { guardarEquivalencia, listarEquivalencias, type Equivalencia } from "@/lib/sheetMantenimiento"

const selectTipo =
  "h-9 w-full min-w-48 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"

/*
 * Equivalencias de Mantenimiento: cada equipo + subsistema de su Sheet se
 * asocia una vez a un tipo de nuestro catálogo. La app propone uno al
 * actualizar; aquí se confirma o cambia, y se aplica a todas las paradas de
 * ese par (migración 20261108490000).
 */
export function EquivalenciasMantenimiento({ usuario }: { usuario: string }) {
  const catalogo = useCatalogoParadas()
  const equipos = useEquiposParadas()
  const [filas, setFilas] = useState<Equivalencia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [soloPendientes, setSoloPendientes] = useState(true)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await listarEquivalencias(usuario)
    if (!r.ok) return setError(r.error)
    setError(null)
    setFilas(r.datos)
  }, [usuario])
  useEffect(() => {
    cargar()
  }, [cargar])

  // Tipos de falla de equipo, agrupados por equipo para el selector.
  const grupos = useMemo(() => {
    const activos = catalogo.filter((t) => t.activo)
    const porEquipo = new Map<string, typeof activos>()
    for (const t of activos) {
      const clave = t.equipoCodigo ? (equipos.find((e) => e.codigo === t.equipoCodigo)?.nombre ?? t.equipoCodigo) : "Otras paradas"
      porEquipo.set(clave, [...(porEquipo.get(clave) ?? []), t])
    }
    return [...porEquipo.entries()].sort(([a], [b]) => (a === "Otras paradas" ? 1 : b === "Otras paradas" ? -1 : a.localeCompare(b)))
  }, [catalogo, equipos])
  const nombreTipo = (codigo: string | null) => {
    const t = catalogo.find((x) => x.codigo === codigo)
    return t ? `${codigoPlanilla(t, "LINEA_1")} · ${t.nombre}` : null
  }

  const clave = (f: Equivalencia) => `${f.equipo}|${f.subsistema}`
  const q = busqueda.trim().toLowerCase()
  const visibles = (filas ?? []).filter(
    (f) => (!soloPendientes || !f.confirmada) && (!q || `${f.equipo} ${f.subsistema}`.toLowerCase().includes(q)),
  )
  const pendientes = (filas ?? []).filter((f) => !f.confirmada).length

  async function guardar(f: Equivalencia) {
    const tipo = elegidos[clave(f)] ?? f.tipoCodigo
    if (!tipo) return
    setGuardando(clave(f))
    const r = await guardarEquivalencia(usuario, f.equipo, f.subsistema, tipo)
    setGuardando(null)
    if (!r.ok) return setError(r.error)
    await cargar()
  }

  if (filas === null && !error) {
    return (
      <div className="flex justify-center py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Cada equipo y subsistema del Sheet de Mantenimiento se asocia una vez a un tipo de nuestro catálogo. Al confirmar, se aplica a todas sus paradas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar equipo o subsistema…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="h-9 max-w-xs" />
        <Button size="sm" variant={soloPendientes ? "default" : "outline"} onClick={() => setSoloPendientes((v) => !v)}>
          Sin confirmar ({pendientes})
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{soloPendientes ? "No queda ninguna sin confirmar." : "Todavía no hay equivalencias: actualiza desde el Sheet en Registrar Paradas."}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipo · subsistema (Sheet)</TableHead>
              <TableHead className="text-right">Reportes</TableHead>
              <TableHead>Tipo en nuestro catálogo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((f) => {
              const k = clave(f)
              const valor = elegidos[k] ?? f.tipoCodigo ?? ""
              return (
                <TableRow key={k}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{f.equipo}</span>
                    <span className="text-muted-foreground"> · {f.subsistema || "sin subsistema"}</span>
                    {!f.confirmada && (
                      <Badge variant="warning" className="ml-2">
                        {f.tipoCodigo ? "Propuesta" : "Sin tipo"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="num text-right">{f.reportes}</TableCell>
                  <TableCell>
                    <select
                      aria-label={`Tipo para ${f.equipo} ${f.subsistema}`}
                      className={selectTipo}
                      value={valor}
                      onChange={(e) => setElegidos((prev) => ({ ...prev, [k]: e.target.value }))}
                    >
                      <option value="">Elige un tipo…</option>
                      {grupos.map(([grupo, tipos]) => (
                        <optgroup key={grupo} label={grupo}>
                          {tipos.map((t) => (
                            <option key={t.codigo} value={t.codigo}>
                              {nombreTipo(t.codigo)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant={f.confirmada && !elegidos[k] ? "ghost" : "default"} disabled={!valor || guardando === k} onClick={() => guardar(f)}>
                      {guardando === k ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      {f.confirmada && !elegidos[k] ? "Confirmada" : "Confirmar"}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
