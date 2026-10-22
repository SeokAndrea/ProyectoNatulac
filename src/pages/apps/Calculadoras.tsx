import { useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { CalculoBobina } from "@/components/calculadoras/CalculoBobina"
import { CalculoConteoPeso } from "@/components/calculadoras/CalculoConteoPeso"
import { CalculoFormula } from "@/components/calculadoras/CalculoFormula"
import { cn } from "@/lib/utils"

/*
 * Las tres calculadoras en una sola pantalla, una a la vez, con un selector
 * deslizante arriba (dueña, 2026-10-21: "todo junto es too much", y en
 * parte se usan en el teléfono). La elegida queda en la URL (?c=bobina),
 * así las rutas viejas (/calculadora-bobina…) redirigen acá.
 */
const CALCULADORAS = [
  { id: "formula", titulo: "Fórmula", descripcion: "Insumos de materia prima según sabor y cantidad", Componente: CalculoFormula },
  { id: "bobina", titulo: "Bobina", descripcion: "Envases restantes según la medida de la bobina", Componente: CalculoBobina },
  { id: "peso", titulo: "Peso", descripcion: "Pitillos y tapas restantes según el peso de la caja", Componente: CalculoConteoPeso },
] as const

export default function Calculadoras() {
  const [params, setParams] = useSearchParams()
  const indice = Math.max(0, CALCULADORAS.findIndex((c) => c.id === params.get("c")))
  const actual = CALCULADORAS[indice]

  return (
    <AppShell title="Calculadoras" description={actual.descripcion}>
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Calculadora" className="relative grid max-w-md grid-cols-3 rounded-xl bg-muted p-1">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-card shadow-sm transition-transform duration-200"
            style={{ transform: `translateX(${indice * 100}%)` }}
          />
          {CALCULADORAS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={i === indice}
              onClick={() => setParams({ c: c.id }, { replace: true })}
              className={cn(
                "relative z-10 h-11 rounded-lg text-sm transition-colors",
                i === indice ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {c.titulo}
            </button>
          ))}
        </div>
        <actual.Componente key={actual.id} />
      </div>
    </AppShell>
  )
}
