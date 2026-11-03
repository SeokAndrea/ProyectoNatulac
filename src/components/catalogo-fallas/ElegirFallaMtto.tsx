import { useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { agregarFallas } from "@/lib/catalogoFallas/api"
import { fallaNuevaDeEquipo } from "@/lib/catalogoFallas/fallaNueva"
import { fallasDeLinea, opcionDeFalla, type OpcionFalla } from "@/lib/catalogoFallas/paradas"
import { useCatalogoFallas } from "@/lib/catalogoFallas/useCatalogoFallas"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { etiquetaClase, selectClase } from "./estilos"

/**
 * Mantenimiento al terminar o ponerle código a una falla (catálogo nuevo):
 * Equipo › Sistema › Subsistema › Falla, ya rellenado con lo que eligió
 * Producción. Si cambia algo, se ve lo de Producción al lado. Quien puede
 * editar el catálogo crea la falla ahí mismo si no está.
 */
export function ElegirFallaMtto({
  lineaCodigo,
  fallaProduccionId,
  usuario,
  puedeCrear,
  onCambiar,
}: {
  lineaCodigo: string
  fallaProduccionId: string | null
  usuario: string
  puedeCrear: boolean
  onCambiar: (o: OpcionFalla | null) => void
}) {
  const { catalogo, cargando, recargar } = useCatalogoFallas()
  const { lineasTodas } = useCatalogosLive()
  const lineaId = lineasTodas.find((l) => l.codigo === lineaCodigo)?.id ?? null
  const opciones = useMemo(() => fallasDeLinea(catalogo, lineaId), [catalogo, lineaId])
  const produccion = opcionDeFalla(catalogo, fallaProduccionId)

  const [equipoId, setEquipoId] = useState("")
  const [sistemaId, setSistemaId] = useState("")
  const [subsistemaId, setSubsistemaId] = useState("")
  const [fallaId, setFallaId] = useState("")
  const [nueva, setNueva] = useState("")
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Arranca en la falla de Producción (cuando el catálogo termina de cargar).
  useEffect(() => {
    if (!produccion || fallaId) return
    setEquipoId(produccion.equipo.id)
    setSistemaId(produccion.sistema.id)
    setSubsistemaId(produccion.subsistema.id)
    setFallaId(produccion.falla.id)
    onCambiar(produccion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produccion?.falla.id])

  const unicos = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()]
  // «Equipo no listado» (reservado) va al final.
  const equipos = unicos(opciones.map((o) => o.equipo)).sort((a, b) => Number(!!a.reservada) - Number(!!b.reservada))
  const sistemas = unicos(opciones.filter((o) => o.equipo.id === equipoId).map((o) => o.sistema))
  // Los subsistemas sin fallas también (para crearles la primera).
  const subsistemas = catalogo.subsistemas.filter((u) => u.activo && u.sistemaId === sistemaId)
  const fallas = opciones.filter((o) => o.subsistema.id === subsistemaId)
  const elegida = opciones.find((o) => o.falla.id === fallaId) ?? null
  const cambio = !!produccion && !!elegida && elegida.falla.id !== produccion.falla.id

  function elegirFalla(id: string) {
    setFallaId(id)
    onCambiar(opciones.find((o) => o.falla.id === id) ?? null)
  }
  /** «Falla nueva» (20261114890000): la reservada del equipo elegido, para cuando la falla no está en la lista. */
  function elegirFallaNueva() {
    const nueva = fallaNuevaDeEquipo(opciones, equipoId)
    if (!nueva) return setError("Elige primero el equipo. Si tampoco está, elige «Equipo no listado».")
    setError(null)
    setSistemaId(nueva.sistema.id)
    setSubsistemaId(nueva.subsistema.id)
    setFallaId(nueva.falla.id)
    onCambiar(nueva)
  }
  function cambiarNivel(nivel: "equipo" | "sistema" | "subsistema", id: string) {
    if (nivel === "equipo") {
      setEquipoId(id)
      setSistemaId("")
      setSubsistemaId("")
    } else if (nivel === "sistema") {
      setSistemaId(id)
      setSubsistemaId("")
    } else {
      setSubsistemaId(id)
    }
    // Si en el subsistema nuevo hay una falla con el mismo nombre que la de Producción, va esa.
    const igual = nivel === "subsistema" && produccion ? opciones.find((o) => o.subsistema.id === id && o.falla.nombre === produccion.falla.nombre) : undefined
    elegirFalla(igual?.falla.id ?? "")
  }

  async function crear() {
    if (!nueva.trim() || !subsistemaId) return
    setCreando(true)
    setError(null)
    const r = await agregarFallas(usuario, subsistemaId, [nueva], "NO_PROGRAMADA")
    setCreando(false)
    if (!r.ok) return setError(r.error)
    const creada = r.valor.creadas[0]
    if (!creada) return setError(`«${nueva.trim()}» ya existe en este subsistema: elígela de la lista.`)
    await recargar()
    setNueva("")
    setFallaId(creada.id)
  }
  // Después de crear y recargar, avisa la falla nueva ya con todos sus datos.
  useEffect(() => {
    if (fallaId && elegida && elegida.falla.id === fallaId) onCambiar(elegida)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida?.falla.id])

  if (cargando) return <p className="text-sm text-muted-foreground">Cargando el catálogo…</p>

  const select = (id: string, etiqueta: string, valor: string, lista: { id: string; nombre: string }[], onChange: (v: string) => void, deshabilitado = false) => (
    <label className={etiquetaClase} htmlFor={id}>
      {etiqueta}
      <select id={id} className={selectClase} value={valor} disabled={deshabilitado} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elige…</option>
        {lista.map((x) => (
          <option key={x.id} value={x.id}>
            {x.nombre}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="flex flex-col gap-2">
      {select("mt-equipo", "Equipo", equipoId, equipos, (v) => cambiarNivel("equipo", v))}
      <button
        type="button"
        onClick={elegirFallaNueva}
        className="self-start text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        Falla nueva
      </button>
      {select("mt-sistema", "Sistema", sistemaId, sistemas, (v) => cambiarNivel("sistema", v), !equipoId)}
      {select("mt-subsistema", "Subsistema", subsistemaId, subsistemas, (v) => cambiarNivel("subsistema", v), !sistemaId)}
      {select("mt-falla", "Falla", fallaId, fallas.map((o) => ({ id: o.falla.id, nombre: o.falla.nombre })), elegirFalla, !subsistemaId)}

      {subsistemaId &&
        !subsistemas.find((u) => u.id === subsistemaId)?.reservada &&
        (puedeCrear ? (
          <div className="flex gap-2">
            <Input
              aria-label="Falla nueva en este subsistema"
              placeholder="¿No está? Escríbela"
              value={nueva}
              disabled={creando}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void crear()
                }
              }}
            />
            <Button variant="outline" disabled={creando || !nueva.trim()} onClick={() => void crear()}>
              <Plus /> Crear
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">¿No está? Pídele al jefe que la agregue al catálogo.</p>
        ))}
      <MensajeError error={error} />

      {produccion && (
        <div className={cambio ? "rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground" : "text-xs text-muted-foreground"}>
          <p>
            Según Producción: <span className="font-medium">{produccion.falla.nombre}</span> · {produccion.subsistema.nombre} <span className="num">{produccion.falla.codigo}</span>
          </p>
          {cambio && elegida && (
            <p>
              Según Mantenimiento: <span className="font-medium">{elegida.falla.nombre}</span> · {elegida.subsistema.nombre} <span className="num">{elegida.falla.codigo}</span>. Cuenta la de Mantenimiento.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
