import { useId, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AREAS, CARGOS, LARGO_CARGO, TIPOS_AREA, cargoDeTexto, cargosDeArea, nombrePorCodigo, type AreaCodigo, type RolCodigo } from "@/lib/catalogos"

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

/**
 * El cargo se escribe (dueña, 2026-10-28): es solo el título, no decide nada,
 * y Mantenimiento o Servicios Industriales no tenían cargos en la lista. Los
 * del área salen de sugerencia; si escriben uno de ellos se guarda su código.
 */
export function InputCargo({
  value,
  onChange,
  area,
  className,
}: {
  /** Código de la lista o texto libre; "" = sin cargo. */
  value: string
  onChange: (cargo: string) => void
  area: AreaCodigo | ""
  className?: string
}) {
  const id = useId()
  const [texto, setTexto] = useState(() => (value ? nombrePorCodigo(CARGOS, value) : ""))
  return (
    <>
      <Input
        list={id}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          onChange(cargoDeTexto(e.target.value))
        }}
        maxLength={LARGO_CARGO}
        placeholder="Cargo (opcional)"
        aria-label="Cargo"
        className={className}
      />
      <datalist id={id}>
        {cargosDeArea(area).map((c) => (
          <option key={c.codigo} value={c.nombre} />
        ))}
      </datalist>
    </>
  )
}
