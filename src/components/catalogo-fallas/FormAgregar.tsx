import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { agregarAlCatalogo, resumenAgregadas } from "@/lib/catalogoFallas/agregar"
import { componerCodigo, nombresPegados, siguienteNumero } from "@/lib/catalogoFallas/codigo"
import type { CatalogoFallas, TipoEquipo } from "@/lib/catalogoFallas/tipos"
import type { ClaseParada } from "@/lib/paradas"
import { cn } from "@/lib/utils"
import { OPCIONES_CLASE, OPCIONES_TIPO_EQUIPO } from "./opciones"
import { Segmentado } from "./Segmentado"
import { SelectorLineas } from "./SelectorLineas"
import { SelectorNivel } from "./SelectorNivel"
import { etiquetaClase } from "./estilos"
import { faltaNivel, NUEVO, SIN_NUEVO, sufijoFinal } from "./nivelNuevo"

/**
 * «Agregar» del catálogo: en cada nivel se elige uno que existe o se crea uno
 * nuevo, y se escribe la falla. Enter agrega y deja el cursor listo para la
 * siguiente; pegar varias líneas del Excel las agrega todas. Con la falla
 * vacía se crean solo los niveles nuevos.
 */
export function FormAgregar({
  catalogo,
  usuario,
  inicial,
  enfocar,
  onAgregado,
  onUbicacion,
}: {
  catalogo: CatalogoFallas
  usuario: string
  /** Dónde arranca (el subsistema del «+» que se tocó en la tabla). */
  inicial: { equipoId: string; sistemaId: string; subsistemaId: string }
  /** Poner el cursor en «Falla» al aparecer. */
  enfocar?: boolean
  onAgregado: () => Promise<void>
  /** Avisa cada vez que se elige otro equipo, sistema o subsistema: la tabla de abajo muestra esa misma ubicación. */
  onUbicacion?: (u: { equipoId: string; sistemaId: string; subsistemaId: string }) => void
}) {
  const [equipoId, setEquipoId] = useState(inicial.equipoId)
  const [sistemaId, setSistemaId] = useState(inicial.sistemaId)
  const [subsistemaId, setSubsistemaId] = useState(inicial.subsistemaId)
  const [nuevoEquipo, setNuevoEquipo] = useState(SIN_NUEVO)
  const [tipoEquipo, setTipoEquipo] = useState<TipoEquipo>("LINEA")
  const [lineasEquipo, setLineasEquipo] = useState<string[]>([])
  const [nuevoSistema, setNuevoSistema] = useState(SIN_NUEVO)
  const [nuevoSubsistema, setNuevoSubsistema] = useState(SIN_NUEVO)
  const [falla, setFalla] = useState("")
  const [clase, setClase] = useState<ClaseParada>("NO_PROGRAMADA")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; nadaNuevo: boolean } | null>(null)
  const campoFalla = useRef<HTMLInputElement>(null)

  const activos = <T extends { activo: boolean }>(xs: T[]) => xs.filter((x) => x.activo)
  const equipoEsNuevo = equipoId === NUEVO || equipoId === ""
  const sistemaEsNuevo = equipoEsNuevo || sistemaId === NUEVO || sistemaId === ""
  const subsistemaEsNuevo = sistemaEsNuevo || subsistemaId === NUEVO || subsistemaId === ""

  // Lo reservado («Falla nueva», «Equipo no listado») lo maneja el sistema: no se ofrece para agregar.
  const equipos = activos(catalogo.equipos).filter((e) => !e.reservada)
  const sistemas = equipoEsNuevo ? [] : activos(catalogo.sistemas).filter((s) => s.equipoId === equipoId && !s.reservada)
  const subsistemas = sistemaEsNuevo ? [] : activos(catalogo.subsistemas).filter((u) => u.sistemaId === sistemaId && !u.reservada)
  const ocupadosEquipo = catalogo.equipos.map((e) => e.sufijo)
  const ocupadosSistema = equipoEsNuevo ? [] : catalogo.sistemas.filter((s) => s.equipoId === equipoId).map((s) => s.sufijo)
  const ocupadosSubsistema = sistemaEsNuevo ? [] : catalogo.subsistemas.filter((u) => u.sistemaId === sistemaId).map((u) => u.sufijo)

  const sufijos = [
    equipoEsNuevo ? sufijoFinal(nuevoEquipo, ocupadosEquipo) : (catalogo.equipos.find((e) => e.id === equipoId)?.sufijo ?? ""),
    sistemaEsNuevo ? sufijoFinal(nuevoSistema, ocupadosSistema) : (catalogo.sistemas.find((s) => s.id === sistemaId)?.sufijo ?? ""),
    subsistemaEsNuevo ? sufijoFinal(nuevoSubsistema, ocupadosSubsistema) : (catalogo.subsistemas.find((u) => u.id === subsistemaId)?.sufijo ?? ""),
  ]
  const numero = subsistemaEsNuevo ? 1 : siguienteNumero(catalogo.fallas, subsistemaId)

  // Al cambiar un nivel, los de abajo pasan al primero que tenga (o a «nuevo» si no tiene).
  function elegirEquipo(id: string) {
    setEquipoId(id)
    const s = activos(catalogo.sistemas).find((x) => x.equipoId === id && !x.reservada)
    elegirSistema(s?.id ?? NUEVO, id)
  }
  function elegirSistema(id: string, equipo: string = equipoId) {
    setSistemaId(id)
    const u = activos(catalogo.subsistemas).find((x) => x.sistemaId === id && !x.reservada)?.id ?? NUEVO
    setSubsistemaId(u)
    onUbicacion?.({ equipoId: equipo, sistemaId: id, subsistemaId: u })
  }
  function elegirSubsistema(id: string) {
    setSubsistemaId(id)
    onUbicacion?.({ equipoId, sistemaId, subsistemaId: id })
  }

  async function agregar(nombres: string[]) {
    setAviso(null)
    const falta =
      (equipoEsNuevo && faltaNivel(nuevoEquipo, ocupadosEquipo, "equipo")) ||
      (sistemaEsNuevo && faltaNivel(nuevoSistema, ocupadosSistema, "sistema")) ||
      (subsistemaEsNuevo && faltaNivel(nuevoSubsistema, ocupadosSubsistema, "subsistema")) ||
      (nombres.length === 0 && !subsistemaEsNuevo && "Escribe el nombre de la falla.")
    if (falta) return setError(falta)

    setEnviando(true)
    setError(null)
    const r = await agregarAlCatalogo(usuario, {
      equipo: equipoEsNuevo ? { nuevo: { ...nuevoEquipo, sufijo: sufijos[0], tipo: tipoEquipo, lineas: lineasEquipo } } : { id: equipoId },
      sistema: sistemaEsNuevo ? { nuevo: { ...nuevoSistema, sufijo: sufijos[1] } } : { id: sistemaId },
      subsistema: subsistemaEsNuevo ? { nuevo: { ...nuevoSubsistema, sufijo: sufijos[2] } } : { id: subsistemaId },
      fallas: nombres,
      clase,
    })
    // Lo que se creó queda elegido, aunque después algo haya fallado.
    if (r.equipoId) setEquipoId(r.equipoId)
    if (r.sistemaId) setSistemaId(r.sistemaId)
    if (r.subsistemaId) setSubsistemaId(r.subsistemaId)
    if (r.equipoId) setNuevoEquipo(SIN_NUEVO)
    if (r.sistemaId) setNuevoSistema(SIN_NUEVO)
    if (r.subsistemaId) setNuevoSubsistema(SIN_NUEVO)
    onUbicacion?.({ equipoId: r.equipoId ?? equipoId, sistemaId: r.sistemaId ?? sistemaId, subsistemaId: r.subsistemaId ?? subsistemaId })
    await onAgregado()
    setEnviando(false)
    if (r.error) return setError(r.error)
    setFalla("")
    setAviso({ texto: resumenAgregadas(r.agregadas), nadaNuevo: r.agregadas?.creadas.length === 0 })
    campoFalla.current?.focus()
  }

  const botonAgregar = (
    <Button size="lg" disabled={enviando} onClick={() => void agregar(nombresPegados(falla))}>
      <Plus /> {falla.trim() || !subsistemaEsNuevo ? "Agregar" : "Crear sin falla"}
    </Button>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
      <SelectorNivel
        id="cf-equipo"
        etiqueta="Equipo"
        que="equipo"
        opciones={equipos}
        valor={equipoId}
        onCambiar={elegirEquipo}
        nuevo={nuevoEquipo}
        onNuevo={setNuevoEquipo}
        ocupados={ocupadosEquipo}
        soloNuevo={false}
        deshabilitado={enviando}
      />
      <SelectorNivel
        id="cf-sistema"
        etiqueta="Sistema"
        que="sistema"
        opciones={sistemas}
        valor={sistemaId}
        onCambiar={elegirSistema}
        nuevo={nuevoSistema}
        onNuevo={setNuevoSistema}
        ocupados={ocupadosSistema}
        soloNuevo={equipoEsNuevo}
        deshabilitado={enviando}
      />
      <SelectorNivel
        id="cf-subsistema"
        etiqueta="Subsistema"
        que="subsistema"
        opciones={subsistemas}
        valor={subsistemaId}
        onCambiar={elegirSubsistema}
        nuevo={nuevoSubsistema}
        onNuevo={setNuevoSubsistema}
        ocupados={ocupadosSubsistema}
        soloNuevo={sistemaEsNuevo}
        deshabilitado={enviando}
      />
      </div>
      {equipoEsNuevo && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3 md:max-w-md">
          <Segmentado etiqueta="Tipo de equipo" opciones={OPCIONES_TIPO_EQUIPO} valor={tipoEquipo} onCambiar={setTipoEquipo} deshabilitado={enviando} />
          {tipoEquipo === "LINEA" ? (
            <SelectorLineas elegidas={lineasEquipo} onCambiar={setLineasEquipo} deshabilitado={enviando} />
          ) : (
            <p className="text-xs text-muted-foreground">Aparece en todas las líneas.</p>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_auto] md:items-end">
      <label className={etiquetaClase} htmlFor="cf-falla">
        Falla
        <Input
          id="cf-falla"
          ref={campoFalla}
          autoFocus={enfocar}
          value={falla}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Ej. Baja presión"
          disabled={enviando}
          onChange={(e) => setFalla(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            void agregar(nombresPegados(falla))
          }}
          onPaste={(e) => {
            const texto = e.clipboardData.getData("text")
            if (!/\n/.test(texto.trim())) return
            e.preventDefault()
            void agregar(nombresPegados(texto))
          }}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Clase</span>
        <Segmentado etiqueta="Clase de la falla" opciones={OPCIONES_CLASE} valor={clase} onCambiar={setClase} deshabilitado={enviando} />
      </div>
      <div className="hidden md:block">{botonAgregar}</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Va a salir <span className="num font-medium text-foreground">{componerCodigo(sufijos, numero)}</span>. Enter la agrega; si pegas varias líneas del Excel, se agregan todas.
      </p>

      <MensajeError error={error} />
      {aviso && (
        <p
          role="status"
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            aviso.nadaNuevo ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success-foreground",
          )}
        >
          {aviso.texto}
        </p>
      )}

      <div className="md:hidden [&>button]:w-full">{botonAgregar}</div>
    </div>
  )
}
