import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AREAS, CARGOS, TIPOS_AREA, cargosDeArea, nombrePorCodigo, type AreaCodigo, type CargoCodigo, type RolCodigo } from "@/lib/catalogos"

/*
 * Selectores de Área, Área de origen, Rol y Cargo: los mismos en el alta,
 * en la edición y en los filtros de Personal. Rol = qué puede hacer
 * (permisos). Cargo = solo el título que se muestra.
 */

export type AreaOpcion = (typeof AREAS)[number]
export type RolOpcion = { codigo: string; nombre: string }

/** Sentinel de "sin área de origen" / "sin cargo" (el value de un SelectItem no puede ser cadena vacía). */
const NINGUNO = "__ninguno__"

/** Las áreas en dos grupos: Producción y Servicios de apoyo. */
export function ItemsAreas({ areas, prefijo = "" }: { areas: readonly AreaOpcion[]; prefijo?: string }) {
  return TIPOS_AREA.map(({ tipo, nombre }) => {
    const delTipo = areas.filter((a) => a.tipo === tipo)
    if (delTipo.length === 0) return null
    return (
      <SelectGroup key={tipo}>
        <SelectLabel>{nombre}</SelectLabel>
        {delTipo.map((a) => (
          <SelectItem key={a.codigo} value={a.codigo}>
            {prefijo}
            {a.nombre}
          </SelectItem>
        ))}
      </SelectGroup>
    )
  })
}

export function SelectArea({
  value,
  onChange,
  areas,
  disabled,
  className,
}: {
  value: AreaCodigo | ""
  onChange: (area: AreaCodigo) => void
  areas: readonly AreaOpcion[]
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AreaCodigo)} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Área" />
      </SelectTrigger>
      <SelectContent>
        <ItemsAreas areas={areas} />
      </SelectContent>
    </Select>
  )
}

/** Solo para reemplazos temporales entre áreas: de dónde es la persona en realidad. Ofrece todas las áreas. */
export function SelectAreaOrigen({
  value,
  onChange,
  className,
  placeholder = "Área de origen",
}: {
  value: AreaCodigo | ""
  onChange: (area: AreaCodigo | "") => void
  className?: string
  placeholder?: string
}) {
  return (
    <Select value={value || NINGUNO} onValueChange={(v) => onChange(v === NINGUNO ? "" : (v as AreaCodigo))}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUNO}>Sin área de origen</SelectItem>
        <ItemsAreas areas={AREAS} prefijo="De " />
      </SelectContent>
    </Select>
  )
}

export function SelectRol({
  value,
  onChange,
  roles,
  className,
}: {
  value: RolCodigo | ""
  onChange: (rol: RolCodigo) => void
  roles: readonly RolOpcion[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as RolCodigo)}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Rol (qué puede hacer)" />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.codigo} value={r.codigo}>
            {r.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Solo los cargos del área elegida. Si la persona ya tiene otro cargo, se sigue mostrando para no perderlo. */
export function SelectCargo({
  value,
  onChange,
  area,
  className,
}: {
  value: CargoCodigo | ""
  onChange: (cargo: CargoCodigo | "") => void
  area: AreaCodigo | ""
  className?: string
}) {
  const opciones: { codigo: string; nombre: string }[] = [...cargosDeArea(area)]
  if (value && !opciones.some((c) => c.codigo === value)) opciones.push({ codigo: value, nombre: nombrePorCodigo(CARGOS, value) })
  return (
    <Select value={value || NINGUNO} onValueChange={(v) => onChange(v === NINGUNO ? "" : (v as CargoCodigo))}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Cargo (título, opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUNO}>Sin cargo</SelectItem>
        {opciones.map((c) => (
          <SelectItem key={c.codigo} value={c.codigo}>
            {c.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
