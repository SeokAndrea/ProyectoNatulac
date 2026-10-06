import { useState } from "react"
import { Loader2, Plus, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
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
const nuevaFilaMP = (): FilaMateriaPrima => ({ clave: siguienteClave++, saborId: "", pulpa: "", kits: "" })
const nuevaFilaEmpaque = (): FilaEmpaque => ({ clave: siguienteClave++, codigo: "", cantidad: "" })

/**
 * Inventario de la mañana / de la tarde: en cada sección se elige el
 * sabor o el material de una lista y se escribe lo contado. Solo se
 * guardan las filas completas; lo que no se cuenta queda como estaba.
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
  const [filasMP, setFilasMP] = useState<FilaMateriaPrima[]>(() => [nuevaFilaMP()])
  const [filasEmpaque, setFilasEmpaque] = useState<FilaEmpaque[]>(() => [nuevaFilaEmpaque()])
  const { enviando, error, ejecutar } = useAccion()

  const conteos = conteosDelBorrador(filasMP, filasEmpaque)
  const hayErrores = filasMP.some((f) => errorFilaMateriaPrima(f) !== null) || filasEmpaque.some((f) => errorFilaEmpaque(f) !== null)
  const saboresUsados = new Set(filasMP.map((f) => f.saborId).filter(Boolean))
  const empaqueUsado = new Set(filasEmpaque.map((f) => f.codigo).filter(Boolean))

  async function guardar() {
    if (conteos.length === 0 || hayErrores) return
    if (await ejecutar(() => api.registrar(usuario, momento, conteos, area))) onGuardado()
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Inventario de la {NOMBRE_MOMENTO[momento]}</h2>

      <section className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Materia prima</h3>
        {filasMP.map((f) => (
          <FilaMateriaPrimaInput
            key={f.clave}
            fila={f}
            sabores={sabores}
            usados={saboresUsados}
            onCambiar={(nueva) => setFilasMP((fs) => fs.map((x) => (x.clave === f.clave ? nueva : x)))}
            onQuitar={() => setFilasMP((fs) => fs.filter((x) => x.clave !== f.clave))}
          />
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setFilasMP((fs) => [...fs, nuevaFilaMP()])}>
          <Plus className="size-3.5" />
          Agregar sabor
        </Button>
      </section>

      <section className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Material de empaque</h3>
        {filasEmpaque.map((f) => (
          <FilaEmpaqueInput
            key={f.clave}
            fila={f}
            empaque={empaque}
            usados={empaqueUsado}
            onCambiar={(nueva) => setFilasEmpaque((fs) => fs.map((x) => (x.clave === f.clave ? nueva : x)))}
            onQuitar={() => setFilasEmpaque((fs) => fs.filter((x) => x.clave !== f.clave))}
          />
        ))}
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setFilasEmpaque((fs) => [...fs, nuevaFilaEmpaque()])}>
          <Plus className="size-3.5" />
          Agregar material
        </Button>
      </section>

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
