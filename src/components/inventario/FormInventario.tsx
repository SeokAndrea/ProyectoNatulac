import { useRef, useState } from "react"
import { Loader2, Save, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MensajeError } from "@/components/MensajeError"
import type { AreaInventario, InventarioApi, ItemInventario, Momento } from "@/lib/inventario"
import { useAccion } from "@/lib/useAccion"
import {
  conteosDelBorrador,
  empaqueDe,
  errorFilaEmpaque,
  errorFilaMateriaPrima,
  NOMBRE_MOMENTO,
  saboresDe,
  type FilaEmpaque,
  type FilaMateriaPrima,
} from "./calculosInventario"
import { FilaEmpaqueInput, FilaMateriaPrimaInput } from "./FilasInventario"

let siguienteClave = 1

/** Lo que ofrece el buscador: un sabor (pulpa y kits) o un material de empaque. */
interface Opcion {
  tipo: "SABOR" | "EMPAQUE"
  /** saborId o código del material. */
  id: string
  nombre: string
  detalle: string
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * Inventario de la mañana / de la tarde (dueña, 2026-10-26): un buscador
 * arriba ("dur", "cajas", "tapas") y lo que se toca se agrega a la lista para
 * escribir lo contado. Solo se guardan las filas completas; lo que no se
 * cuenta queda como estaba.
 */
export function FormInventario({
  api,
  usuario,
  area,
  momento,
  items,
  onGuardado,
  onCancelar,
}: {
  api: InventarioApi
  usuario: string
  area: AreaInventario | null
  momento: Momento
  items: ItemInventario[]
  onGuardado: () => void
  onCancelar: () => void
}) {
  const sabores = saboresDe(items)
  const empaque = empaqueDe(items)
  const [filasMP, setFilasMP] = useState<FilaMateriaPrima[]>([])
  const [filasEmpaque, setFilasEmpaque] = useState<FilaEmpaque[]>([])
  /** La fila recién agregada: su primer número toma el foco. */
  const [ultima, setUltima] = useState<number | null>(null)
  const [texto, setTexto] = useState("")
  const [abierto, setAbierto] = useState(false)
  /** El cierre que deja el blur: se cancela si el buscador vuelve a tomar el foco. */
  const cierre = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { enviando, error, ejecutar } = useAccion()

  const conteos = conteosDelBorrador(filasMP, filasEmpaque)
  const hayErrores = filasMP.some((f) => errorFilaMateriaPrima(f) !== null) || filasEmpaque.some((f) => errorFilaEmpaque(f) !== null)
  const saboresUsados = new Set(filasMP.map((f) => f.saborId))
  const empaqueUsado = new Set(filasEmpaque.map((f) => f.codigo))

  const opciones: Opcion[] = [
    ...sabores
      .filter((s) => !saboresUsados.has(s.saborId))
      .map((s) => ({ tipo: "SABOR" as const, id: s.saborId, nombre: s.nombre, detalle: "Pulpa y kits" })),
    ...empaque
      .filter((e) => !empaqueUsado.has(e.empaqueCodigo!))
      .map((e) => ({ tipo: "EMPAQUE" as const, id: e.empaqueCodigo!, nombre: e.nombre, detalle: `Empaque · ${e.unidad}` })),
  ]
  const q = normalizar(texto.trim())
  const encontradas = q ? opciones.filter((o) => normalizar(o.nombre).includes(q)) : opciones

  function agregar(o: Opcion) {
    const clave = siguienteClave++
    if (o.tipo === "SABOR") setFilasMP((fs) => [...fs, { clave, saborId: o.id, pulpa: "", kits: "" }])
    else setFilasEmpaque((fs) => [...fs, { clave, codigo: o.id, cantidad: "" }])
    setUltima(clave)
    setTexto("")
    setAbierto(false)
  }

  async function guardar() {
    if (conteos.length === 0 || hayErrores) return
    if (await ejecutar(() => api.registrar(usuario, momento, conteos, area))) onGuardado()
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Inventario de la {NOMBRE_MOMENTO[momento]}</h2>

      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Buscar sabor o material"
          placeholder="Busca un sabor o un material para agregarlo"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => {
            if (cierre.current) clearTimeout(cierre.current)
            setAbierto(true)
          }}
          onBlur={() => {
            cierre.current = setTimeout(() => setAbierto(false), 150)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && encontradas.length > 0) {
              e.preventDefault()
              agregar(encontradas[0])
            }
            if (e.key === "Escape") setAbierto(false)
          }}
          className="h-10 pl-9 text-base"
        />
        {abierto && (
          <ul role="listbox" aria-label="Para agregar" className="absolute top-full z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card shadow-md">
            {encontradas.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">{opciones.length === 0 ? "Ya está todo en la lista." : "Nada coincide."}</li>
            ) : (
              encontradas.map((o) => (
                <li key={`${o.tipo}:${o.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    // mousedown: que el buscador no pierda el foco antes del clic.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => agregar(o)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                  >
                    <span className="min-w-0 truncate">{o.nombre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{o.detalle}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {filasMP.length === 0 && filasEmpaque.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Busca arriba lo que contaste y escribe la cantidad. Lo que no agregues queda como estaba.
        </p>
      )}

      {filasMP.length > 0 && (
        <section className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Materia prima</h3>
          {filasMP.map((f) => (
            <FilaMateriaPrimaInput
              key={f.clave}
              fila={f}
              sabor={sabores.find((s) => s.saborId === f.saborId)!}
              enfocar={f.clave === ultima}
              onCambiar={(nueva) => setFilasMP((fs) => fs.map((x) => (x.clave === f.clave ? nueva : x)))}
              onQuitar={() => setFilasMP((fs) => fs.filter((x) => x.clave !== f.clave))}
            />
          ))}
        </section>
      )}

      {filasEmpaque.length > 0 && (
        <section className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Material de empaque</h3>
          {filasEmpaque.map((f) => (
            <FilaEmpaqueInput
              key={f.clave}
              fila={f}
              item={empaque.find((e) => e.empaqueCodigo === f.codigo)!}
              enfocar={f.clave === ultima}
              onCambiar={(nueva) => setFilasEmpaque((fs) => fs.map((x) => (x.clave === f.clave ? nueva : x)))}
              onQuitar={() => setFilasEmpaque((fs) => fs.filter((x) => x.clave !== f.clave))}
            />
          ))}
        </section>
      )}

      <MensajeError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={guardar} disabled={conteos.length === 0 || hayErrores || enviando}>
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar inventario de la {NOMBRE_MOMENTO[momento]}
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
