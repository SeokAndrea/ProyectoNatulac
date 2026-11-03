import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { contarParadas, guardarEquipo, guardarSistema, guardarSubsistema } from "@/lib/catalogoFallas/api"
import { errorSufijo, normalizarSufijo } from "@/lib/catalogoFallas/codigo"
import type { NivelCatalogo, TipoEquipo } from "@/lib/catalogoFallas/tipos"
import { useAccion } from "@/lib/useAccion"
import { BotonQuitar } from "./BotonQuitar"
import { OPCIONES_TIPO_EQUIPO } from "./opciones"
import { Segmentado } from "./Segmentado"
import { SelectorLineas } from "./SelectorLineas"
import { etiquetaClase } from "./estilos"

export interface ItemNivel {
  id: string
  sufijo: string
  nombre: string
  activo: boolean
  codigoSheet?: string | null
  tipo?: TipoEquipo
  lineas?: string[]
}

const QUE: Record<NivelCatalogo, string> = { EQUIPO: "equipo", SISTEMA: "sistema", SUBSISTEMA: "subsistema" }

/**
 * Editar un equipo, sistema o subsistema: sufijo, nombre (y el código del
 * Sheet o las líneas, según el nivel). Antes de guardar un sufijo nuevo avisa
 * cuántos códigos de falla y cuántas paradas lo van a mostrar.
 */
export function EditorNivel({
  nivel,
  item,
  ocupados,
  fallasAfectadas,
  usuario,
  onListo,
}: {
  nivel: NivelCatalogo
  item: ItemNivel
  /** Sufijos de sus hermanos (sin el suyo). */
  ocupados: string[]
  fallasAfectadas: number
  usuario: string
  onListo: (guardado: boolean) => Promise<void> | void
}) {
  const [sufijo, setSufijo] = useState(item.sufijo)
  const [nombre, setNombre] = useState(item.nombre)
  const [codigoSheet, setCodigoSheet] = useState(item.codigoSheet ?? "")
  const [tipo, setTipo] = useState<TipoEquipo>(item.tipo ?? "LINEA")
  const [lineas, setLineas] = useState<string[]>(item.lineas ?? [])
  const [paradas, setParadas] = useState<number | null>(null)
  const { enviando, error, ejecutar } = useAccion()

  const cambiaSufijo = sufijo !== item.sufijo
  const errorDelSufijo = errorSufijo(sufijo, ocupados)

  useEffect(() => {
    let vigente = true
    void contarParadas(nivel, item.id).then((n) => vigente && setParadas(n))
    return () => {
      vigente = false
    }
  }, [nivel, item.id])

  async function guardar(activo: boolean) {
    const base = { id: item.id, sufijo, nombre, activo }
    const ok = await ejecutar(() =>
      nivel === "EQUIPO"
        ? guardarEquipo(usuario, { ...base, tipo, lineas })
        : nivel === "SISTEMA"
          ? guardarSistema(usuario, { ...base, equipoId: null })
          : guardarSubsistema(usuario, { ...base, sistemaId: null, codigoSheet: codigoSheet || null }),
    )
    if (ok) await onListo(true)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
        <label className={etiquetaClase}>
          Sufijo
          <Input value={sufijo} aria-invalid={!!errorDelSufijo} className="num uppercase" disabled={enviando} onChange={(e) => setSufijo(normalizarSufijo(e.target.value))} />
        </label>
        <label className={etiquetaClase}>
          Nombre del {QUE[nivel]}
          <Input value={nombre} disabled={enviando} onChange={(e) => setNombre(e.target.value)} />
        </label>
      </div>
      {errorDelSufijo && <p className="text-xs text-destructive">{errorDelSufijo}</p>}

      {nivel === "SUBSISTEMA" && (
        <label className={etiquetaClase}>
          Código del Sheet (referencia)
          <Input value={codigoSheet} className="num uppercase" placeholder="Ej. A3CF-ASE-01" disabled={enviando} onChange={(e) => setCodigoSheet(e.target.value.toUpperCase())} />
        </label>
      )}
      {nivel === "EQUIPO" && (
        <div className="flex flex-col gap-2">
          <Segmentado etiqueta="Tipo de equipo" opciones={OPCIONES_TIPO_EQUIPO} valor={tipo} onCambiar={setTipo} deshabilitado={enviando} />
          {tipo === "LINEA" ? <SelectorLineas elegidas={lineas} onCambiar={setLineas} deshabilitado={enviando} /> : <p className="text-xs text-muted-foreground">Aparece en todas las líneas.</p>}
        </div>
      )}

      {cambiaSufijo && !errorDelSufijo && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          Cambian <span className="num font-medium">{fallasAfectadas}</span> {fallasAfectadas === 1 ? "código de falla" : "códigos de falla"}
          {paradas !== null && (
            <>
              {" "}
              y se ve en <span className="num font-medium">{paradas}</span> {paradas === 1 ? "parada registrada" : "paradas registradas"}
            </>
          )}
          . Queda en la auditoría.
        </p>
      )}
      <MensajeError error={error} />

      {/* Quitar de verdad solo si nunca se usó (equipos y sistemas siguen solo con Desactivar). */}
      {nivel === "SUBSISTEMA" && <BotonQuitar nivel="SUBSISTEMA" id={item.id} usuario={usuario} onQuitado={() => onListo(true)} />}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={enviando} onClick={() => void onListo(false)}>
          Cancelar
        </Button>
        <Button variant="outline" disabled={enviando || !!errorDelSufijo} onClick={() => void guardar(!item.activo)}>
          {item.activo ? "Desactivar" : "Activar"}
        </Button>
        <Button disabled={enviando || !!errorDelSufijo || nombre.trim() === ""} onClick={() => void guardar(item.activo)}>
          Guardar
        </Button>
      </div>
    </div>
  )
}
