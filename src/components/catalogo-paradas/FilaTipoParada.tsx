import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { esParadaNueva } from "@/lib/catalogoFallas/fallaNueva"
import { codigoDeTipo, fmtDuracion } from "@/lib/paradas"
import { nombreLinea } from "@/lib/paradasEquipos"
import { cambiarActivo, guardarTipo, type TipoParadaEditable } from "@/lib/paradasCatalogo"
import { cn } from "@/lib/utils"

/** Columnas de la tabla de otras paradas: Código | Nombre | Tiempo guía. */
export const COLUMNAS_TIPOS = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9rem_minmax(0,1fr)_8rem]"

/** Una parada del grupo. Quien edita la toca y cambia nombre, tiempo guía o la desactiva. */
export function FilaTipoParada({ tipo, usuario, pagina, editable }: { tipo: TipoParadaEditable; usuario: string; pagina: string; editable: boolean }) {
  const [editando, setEditando] = useState(false)
  if (editando) return <EditorTipo tipo={tipo} usuario={usuario} pagina={pagina} onListo={() => setEditando(false)} />

  // «Solo en…» cuando le falta alguna de las tres líneas de Aséptico (las tres = todas).
  const lineasAseptico = new Set((tipo.lineas ?? []).filter((l) => l.area === "ASEPTICO").map((l) => l.linea))
  const soloEn = tipo.lineas?.length && lineasAseptico.size < 3 ? `Solo ${[...lineasAseptico].sort().map(nombreLinea).join(", ") || "Pruebas"}` : null
  const celdas = (
    <>
      <span className="num col-start-1 row-start-2 text-xs text-muted-foreground sm:row-start-1 sm:text-sm">{tipo.prefijoPlanilla ? codigoDeTipo(tipo) : "—"}</span>
      <span className="col-start-1 row-start-1 flex min-w-0 flex-col sm:col-start-2">
        <span className={cn("text-sm text-foreground", !tipo.activo && "line-through")}>{tipo.nombre}</span>
        {soloEn && <span className="text-xs text-muted-foreground">{soloEn}</span>}
      </span>
      <span className="num col-start-2 row-span-2 row-start-1 self-center text-right text-sm text-muted-foreground sm:col-start-3 sm:row-span-1 sm:text-left">
        {!tipo.activo ? "Inactiva" : tipo.tiempoGuiaMin != null ? fmtDuracion(tipo.tiempoGuiaMin) : ""}
      </span>
    </>
  )
  const clase = cn(COLUMNAS_TIPOS, "w-full items-baseline gap-x-3 px-3 py-2 text-left", !tipo.activo && "opacity-60")
  // Las «Parada nueva · <prefijo>» las maneja el sistema (20261114890000): solo se miran.
  return editable && !esParadaNueva(tipo.codigo) ? (
    <button type="button" className={cn(clase, "outline-none hover:bg-muted focus-visible:bg-muted pointer-coarse:py-2.5")} onClick={() => setEditando(true)}>
      {celdas}
    </button>
  ) : (
    <div className={clase}>{celdas}</div>
  )
}

function EditorTipo({ tipo, usuario, pagina, onListo }: { tipo: TipoParadaEditable; usuario: string; pagina: string; onListo: () => void }) {
  const [nombre, setNombre] = useState(tipo.nombre)
  const [guia, setGuia] = useState(tipo.tiempoGuiaMin != null ? String(tipo.tiempoGuiaMin) : "")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const programada = tipo.familia === "PROGRAMADA"

  async function hacer(accion: () => Promise<string | null>) {
    setEnviando(true)
    setError(null)
    const fallo = await accion()
    setEnviando(false)
    if (fallo) return setError(fallo)
    onListo()
  }
  function guardar() {
    const minutos = guia.trim() === "" ? null : Number(guia.replace(",", "."))
    if (minutos !== null && !(minutos > 0)) return setError("El tiempo guía va en minutos, mayor que 0 (o vacío).")
    void hacer(() => guardarTipo(usuario, { ...tipo, nombre: nombre.replace(/\s+/g, " ").trim(), tiempoGuiaMin: programada ? minutos : null }, tipo.codigo, pagina))
  }

  return (
    <div className="flex flex-col gap-2 bg-muted px-3 py-3">
      <div className={cn("grid gap-2 sm:items-end sm:gap-3", programada ? "sm:grid-cols-[9rem_minmax(0,1fr)_8rem]" : "sm:grid-cols-[9rem_minmax(0,1fr)]")}>
        <span className="num text-sm text-muted-foreground sm:pb-2">{tipo.prefijoPlanilla ? codigoDeTipo(tipo) : "Sin código"}</span>
        <Input
          aria-label="Nombre de la parada"
          autoFocus
          value={nombre}
          disabled={enviando}
          className="bg-card"
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nombre.trim()) guardar()
            if (e.key === "Escape") onListo()
          }}
        />
        {programada && <Input aria-label="Tiempo guía en minutos" inputMode="decimal" placeholder="Guía (min)" value={guia} disabled={enviando} className="bg-card" onChange={(e) => setGuia(e.target.value)} />}
      </div>
      <MensajeError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={enviando} onClick={onListo}>
          Cancelar
        </Button>
        <Button variant="outline" disabled={enviando} onClick={() => void hacer(() => cambiarActivo(usuario, tipo.codigo, !tipo.activo, pagina))}>
          {tipo.activo ? "Desactivar" : "Activar"}
        </Button>
        <Button disabled={enviando || nombre.trim() === ""} onClick={guardar}>
          Guardar
        </Button>
      </div>
    </div>
  )
}
