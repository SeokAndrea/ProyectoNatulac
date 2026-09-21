import { useEffect, useMemo, useState } from "react"
import { FlaskConical, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  calcularConsumoFormula,
  listarFormulas,
  type FamiliaFormula,
  type VarianteFormula,
} from "@/lib/formulaMateriaPrima"

const NOMBRE_FAMILIA: Record<FamiliaFormula, string> = {
  CLASICOS: "Clásicos",
  PREMIUM: "Premium",
  TE: "Té",
}

const NOMBRE_UNIDAD_BASE: Record<VarianteFormula["unidadBase"], string> = {
  tambor: "Nº de tambores",
  kit: "Nº de kits",
}

/*
 * "Voy a preparar 60 tambores de Pera, ¿cuánto pido de cada micro?" —
 * cada insumo (azúcar, ácido cítrico, aroma, etc.) se muestra por
 * separado con su propio valor, no como un total sumado, para armar
 * el pedido real de materia prima.
 */
export default function CalculadoraFormula() {
  const [variantes, setVariantes] = useState<VarianteFormula[]>([])
  const [cargando, setCargando] = useState(true)
  const [familia, setFamilia] = useState<FamiliaFormula | "">("")
  const [varianteId, setVarianteId] = useState("")
  const [cantidad, setCantidad] = useState("")

  useEffect(() => {
    listarFormulas().then((v) => {
      setVariantes(v.filter((x) => x.activo))
      setCargando(false)
    })
  }, [])

  const familiasDisponibles = useMemo(
    () => Array.from(new Set(variantes.map((v) => v.familia))),
    [variantes],
  )
  const variantesDeFamilia = useMemo(
    () => variantes.filter((v) => v.familia === familia),
    [variantes, familia],
  )
  const variante = variantes.find((v) => v.id === varianteId)

  const cantidadNum = Number(cantidad)
  const valido = variante !== undefined && cantidad.trim() !== "" && cantidadNum > 0
  const resultado = valido ? calcularConsumoFormula(variante.insumos, cantidadNum) : null

  return (
    <AppShell title="Calculadora de Fórmula" description="Insumos de materia prima según sabor y cantidad">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Fórmula</CardTitle>
            <CardDescription>Elegir familia, sabor y cantidad a preparar.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cargando ? (
              <div className="flex justify-center py-2 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="familia-formula">Familia</Label>
                  <Select
                    value={familia}
                    onValueChange={(v) => {
                      setFamilia(v as FamiliaFormula)
                      setVarianteId("")
                    }}
                  >
                    <SelectTrigger id="familia-formula" className="w-full">
                      <SelectValue placeholder="Elegir familia" />
                    </SelectTrigger>
                    <SelectContent>
                      {familiasDisponibles.map((f) => (
                        <SelectItem key={f} value={f}>
                          {NOMBRE_FAMILIA[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {familia !== "" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="variante-formula">Sabor</Label>
                    <Select value={varianteId} onValueChange={setVarianteId}>
                      <SelectTrigger id="variante-formula" className="w-full">
                        <SelectValue placeholder="Elegir sabor" />
                      </SelectTrigger>
                      <SelectContent>
                        {variantesDeFamilia.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {variante && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="cantidad-formula">{NOMBRE_UNIDAD_BASE[variante.unidadBase]}</Label>
                    <Input
                      id="cantidad-formula"
                      type="number"
                      inputMode="decimal"
                      placeholder="Ej. 30"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {resultado && (
          <Card>
            <CardHeader>
              <CardTitle>Insumos a pedir</CardTitle>
              <CardDescription>
                {variante?.nombre} · {cantidad} {NOMBRE_UNIDAD_BASE[variante!.unidadBase].toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col divide-y divide-border">
                {resultado.map((r) => (
                  <div key={r.insumo} className="flex items-center gap-2 rounded-lg px-1 py-2.5">
                    <FlaskConical className="size-4 shrink-0 text-primary" />
                    <p className="min-w-0 flex-1 text-sm text-foreground">{r.insumo}</p>
                    <p className="num shrink-0 font-semibold text-foreground">
                      {r.total.toLocaleString("es-CO", { maximumFractionDigits: 3 })} {r.unidad}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
