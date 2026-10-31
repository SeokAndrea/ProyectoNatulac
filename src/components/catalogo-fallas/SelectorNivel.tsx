import { Input } from "@/components/ui/input"
import { errorSufijo, normalizarSufijo, sugerirSufijo } from "@/lib/catalogoFallas/codigo"
import { etiquetaClase, selectClase } from "./estilos"
import { NUEVO, type NivelNuevo } from "./nivelNuevo"

/**
 * Un nivel del formulario «Agregar»: elegir uno que existe o «+ Nuevo…», que
 * pide nombre y sufijo (sugerido a partir del nombre). Si el nivel de arriba es
 * nuevo, este solo puede ser nuevo.
 */
export function SelectorNivel({
  id,
  etiqueta,
  que,
  opciones,
  valor,
  onCambiar,
  nuevo,
  onNuevo,
  ocupados,
  soloNuevo,
  deshabilitado,
}: {
  id: string
  etiqueta: string
  que: string
  opciones: { id: string; nombre: string; sufijo: string }[]
  valor: string
  onCambiar: (v: string) => void
  nuevo: NivelNuevo
  onNuevo: (n: NivelNuevo) => void
  ocupados: string[]
  soloNuevo: boolean
  deshabilitado?: boolean
}) {
  const esNuevo = soloNuevo || valor === NUEVO
  const sugerido = sugerirSufijo(nuevo.nombre, ocupados)
  const error = nuevo.sufijo && errorSufijo(nuevo.sufijo, ocupados)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className={etiquetaClase} htmlFor={id}>
        {etiqueta}
        <select id={id} className={selectClase} value={esNuevo ? NUEVO : valor} disabled={deshabilitado || soloNuevo} onChange={(e) => onCambiar(e.target.value)}>
          {!soloNuevo && opciones.length === 0 && <option value="">Sin {que}s todavía</option>}
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre} · {o.sufijo}
            </option>
          ))}
          <option value={NUEVO}>+ Nuevo {que}…</option>
        </select>
      </label>
      {esNuevo && (
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
          <Input
            aria-label={`Nombre del ${que} nuevo`}
            placeholder={`Nombre del ${que}`}
            value={nuevo.nombre}
            disabled={deshabilitado}
            onChange={(e) => onNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <Input
            aria-label={`Sufijo del ${que} nuevo`}
            aria-invalid={!!error}
            placeholder={sugerido || "Sufijo"}
            value={nuevo.sufijo}
            disabled={deshabilitado}
            className="num uppercase"
            onChange={(e) => onNuevo({ ...nuevo, sufijo: normalizarSufijo(e.target.value) })}
          />
          {error && <p className="col-span-2 text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}
