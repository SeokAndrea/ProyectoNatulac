import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import { etiquetaClase } from "@/components/catalogo-fallas/estilos"
import { codigoDeTipo } from "@/lib/paradas"
import { guardarTipo, type TipoParadaEditable } from "@/lib/paradasCatalogo"
import { codigoMuestra, parecidas, siguienteSecuencia, tipoNuevo, type GrupoParadas } from "@/lib/otrasParadas"
import { cn } from "@/lib/utils"

/**
 * Agregar una parada que no es de equipo: se elige el grupo (PP, LNPE, OP…),
 * se escribe el nombre y el código sale solo. Avisa si ya hay una parecida.
 * Queda en el mismo grupo para seguir agregando (Enter).
 */
export function FormNuevaParada({ grupos, todos, usuario, pagina }: { grupos: GrupoParadas[]; todos: TipoParadaEditable[]; usuario: string; pagina: string }) {
  const [clave, setClave] = useState<string | null>(null)
  const [nombre, setNombre] = useState("")
  const [guia, setGuia] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const campoNombre = useRef<HTMLInputElement>(null)

  const grupo = grupos.find((g) => g.clave === clave) ?? null
  const similares = nombre.trim().length >= 3 ? parecidas(nombre, todos) : []

  async function agregar() {
    if (!grupo) return setError("Elige el tipo de parada.")
    if (!nombre.trim()) return setError("Escribe el nombre de la parada.")
    const minutos = guia.trim() === "" ? null : Number(guia.replace(",", "."))
    if (minutos !== null && !(minutos > 0)) return setError("El tiempo guía va en minutos, mayor que 0 (o vacío).")
    const tipo = tipoNuevo(grupo, nombre, minutos, todos)
    setEnviando(true)
    setError(null)
    setAviso(null)
    const fallo = await guardarTipo(usuario, tipo, undefined, pagina)
    setEnviando(false)
    if (fallo) return setError(fallo)
    setAviso(`Agregada: ${tipo.prefijoPlanilla ? codigoDeTipo(tipo) : "sin código"} ${tipo.nombre}`)
    setNombre("")
    setGuia("")
    campoNombre.current?.focus()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Tipo</span>
        <div role="radiogroup" aria-label="Tipo de parada" className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {grupos.map((g) => (
            <button
              key={g.clave}
              type="button"
              role="radio"
              aria-checked={clave === g.clave}
              disabled={enviando}
              onClick={() => {
                setClave(g.clave)
                setError(null)
                setAviso(null)
                campoNombre.current?.focus()
              }}
              className={cn(
                "flex min-w-0 flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                clave === g.clave ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted",
              )}
            >
              <span className="w-full text-sm font-medium">{g.nombre}</span>
              <span className={cn("text-xs", clave === g.clave ? "text-primary-foreground" : "text-muted-foreground")}>{g.cuenta}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-3", grupo?.familia === "PROGRAMADA" ? "md:grid-cols-[minmax(0,1fr)_9rem_auto]" : "md:grid-cols-[minmax(0,1fr)_auto]", "md:items-end")}>
        <label className={etiquetaClase} htmlFor="op-nombre">
          Nombre
          <Input
            id="op-nombre"
            ref={campoNombre}
            value={nombre}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="Ej. Sin paletas"
            disabled={enviando}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              void agregar()
            }}
          />
        </label>
        {grupo?.familia === "PROGRAMADA" && (
          <label className={etiquetaClase} htmlFor="op-guia">
            Tiempo guía (min)
            <Input id="op-guia" inputMode="decimal" placeholder="Sin guía" value={guia} disabled={enviando} onChange={(e) => setGuia(e.target.value)} />
          </label>
        )}
        <Button size="lg" disabled={enviando} onClick={() => void agregar()}>
          <Plus /> Agregar
        </Button>
      </div>

      {grupo && (
        <p className="text-xs text-muted-foreground">
          Va a salir <span className="num font-medium text-foreground">{codigoMuestra(grupo, siguienteSecuencia(grupo))}</span>
          {grupo.prefijo && grupo.conLinea ? " en la Línea 1 (en las otras cambia el número de línea)" : ""}. {grupo.cuenta}.
        </p>
      )}
      {similares.length > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
          Ya existe parecida:{" "}
          {similares.map((t, i) => (
            <span key={t.codigo}>
              {i > 0 && ", "}
              {t.nombre}
              {t.prefijoPlanilla && <span className="num"> · {codigoDeTipo(t)}</span>}
            </span>
          ))}
          . Revisa que no sea la misma.
        </p>
      )}
      <MensajeError error={error} />
      {aviso && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {aviso}
        </p>
      )}
    </div>
  )
}
