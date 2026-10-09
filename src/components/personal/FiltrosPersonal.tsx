import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CARGOS } from "@/lib/catalogos"
import { FILTROS_INICIALES, hayFiltrosActivos, type Filtros } from "./filtros"
import { ItemsAreas, type AreaOpcion, type RolOpcion } from "./SelectoresPuesto"

/** Búsqueda y filtros de la lista de Personal. Solo del lado del cliente: quién ve a quién lo decide Postgres. */
export function FiltrosPersonal({
  filtros,
  onCambio,
  areas,
  roles,
}: {
  filtros: Filtros
  onCambio: (f: Filtros) => void
  areas: readonly AreaOpcion[]
  roles: readonly RolOpcion[]
}) {
  const cambiar = (parcial: Partial<Filtros>) => onCambio({ ...filtros, ...parcial })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, usuario o cédula"
          value={filtros.busqueda}
          onChange={(e) => cambiar({ busqueda: e.target.value })}
          className="h-8 pl-8"
        />
      </div>
      {areas.length > 1 && (
        <Select value={filtros.area} onValueChange={(v) => cambiar({ area: v as Filtros["area"] })}>
          <SelectTrigger className="h-8 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas las áreas</SelectItem>
            <ItemsAreas areas={areas} />
          </SelectContent>
        </Select>
      )}
      <Select value={filtros.rol} onValueChange={(v) => cambiar({ rol: v as Filtros["rol"] })}>
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODOS">Todos los roles</SelectItem>
          {roles.map((r) => (
            <SelectItem key={r.codigo} value={r.codigo}>
              {r.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={filtros.cargo} onValueChange={(v) => cambiar({ cargo: v as Filtros["cargo"] })}>
        <SelectTrigger className="h-8 w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODOS">Todos los cargos</SelectItem>
          {CARGOS.map((c) => (
            <SelectItem key={c.codigo} value={c.codigo}>
              {c.nombre}
            </SelectItem>
          ))}
          <SelectItem value="SIN_CARGO">Sin cargo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filtros.estado} onValueChange={(v) => cambiar({ estado: v as Filtros["estado"] })}>
        <SelectTrigger className="h-8 w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TODOS">Todos</SelectItem>
          <SelectItem value="ACTIVOS">Activos</SelectItem>
          <SelectItem value="INACTIVOS">Inactivos</SelectItem>
        </SelectContent>
      </Select>
      {hayFiltrosActivos(filtros) && (
        <Button variant="ghost" size="sm" onClick={() => onCambio(FILTROS_INICIALES)}>
          Limpiar filtros
        </Button>
      )}
    </div>
  )
}
