import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { guardarFalla } from "@/lib/catalogoFallas/api"
import type { FallaCatalogo } from "@/lib/catalogoFallas/tipos"
import { NOMBRE_CLASE, type ClaseParada } from "@/lib/paradas"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"
import { OPCIONES_CLASE } from "./opciones"
import { Segmentado } from "./Segmentado"

/** Columnas de la tabla de fallas: Código | Falla | Clase (en el teléfono el código va debajo del nombre). */
export const COLUMNAS_FALLAS = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_9rem]"

/** Una falla de la tabla. Quien edita toca la fila y la cambia ahí mismo. */
export function FilaFalla({ falla, usuario, editable, onGuardado }: { falla: FallaCatalogo; usuario: string; editable: boolean; onGuardado: () => Promise<void> }) {
  const [editando, setEditando] = useState(false)

  if (editando) {
    return (
      <EditorFalla
        falla={falla}
        usuario={usuario}
        onListo={async (guardado) => {
          if (guardado) await onGuardado()
          setEditando(false)
        }}
      />
    )
  }

  const celdas = (
    <>
      <span className="num col-start-1 row-start-2 text-xs text-muted-foreground sm:row-start-1 sm:text-sm">{falla.codigo}</span>
      <span className={cn("col-start-1 row-start-1 text-sm text-foreground sm:col-start-2", !falla.activo && "line-through")}>{falla.nombre}</span>
      <span className="col-start-2 row-span-2 row-start-1 self-center text-right text-sm text-muted-foreground sm:col-start-3 sm:row-span-1 sm:text-left">
        {!falla.activo ? "Inactiva" : falla.clase === "NO_PROGRAMADA" ? <span className="hidden sm:inline">{NOMBRE_CLASE.NO_PROGRAMADA}</span> : NOMBRE_CLASE[falla.clase]}
      </span>
    </>
  )
  const clase = cn(COLUMNAS_FALLAS, "w-full items-baseline gap-x-3 px-3 py-2 text-left", !falla.activo && "opacity-60")

  return editable ? (
    <button type="button" className={cn(clase, "outline-none hover:bg-muted focus-visible:bg-muted pointer-coarse:py-2.5")} onClick={() => setEditando(true)}>
      {celdas}
    </button>
  ) : (
    <div className={clase}>{celdas}</div>
  )
}

function EditorFalla({ falla, usuario, onListo }: { falla: FallaCatalogo; usuario: string; onListo: (guardado: boolean) => Promise<void> }) {
  const [nombre, setNombre] = useState(falla.nombre)
  const [clase, setClase] = useState<ClaseParada>(falla.clase)
  const { enviando, error, ejecutar } = useAccion()

  async function guardar(activo: boolean) {
    if (await ejecutar(() => guardarFalla(usuario, { id: falla.id, nombre, clase, activo }))) await onListo(true)
  }

  return (
    <div className="flex flex-col gap-2 bg-muted px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:gap-3">
        <span className="num text-sm text-muted-foreground">{falla.codigo}</span>
        <Input
          aria-label="Nombre de la falla"
          autoFocus
          value={nombre}
          disabled={enviando}
          className="bg-card"
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nombre.trim()) void guardar(falla.activo)
            if (e.key === "Escape") void onListo(false)
          }}
        />
      </div>
      <Segmentado etiqueta="Clase de la falla" opciones={OPCIONES_CLASE} valor={clase} onCambiar={setClase} deshabilitado={enviando} />
      <MensajeError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={enviando} onClick={() => void onListo(false)}>
          Cancelar
        </Button>
        <Button variant="outline" disabled={enviando} onClick={() => void guardar(!falla.activo)}>
          {falla.activo ? "Desactivar" : "Activar"}
        </Button>
        <Button disabled={enviando || nombre.trim() === ""} onClick={() => void guardar(falla.activo)}>
          Guardar
        </Button>
      </div>
    </div>
  )
}
