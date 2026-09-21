import { useEffect, useState } from "react"
import { Loader2, Scale } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { calcularUnidadesPorPeso, listarTiposConteoPeso, type TipoConteoPeso } from "@/lib/conteoPeso"

/*
 * Cuántos pitillos o tapas quedan en una caja, a partir de su peso —
 * mismo espíritu que la Calculadora de Bobina, pero con balanza en
 * vez de regla.
 */
export default function CalculadoraConteoPeso() {
  const [tipos, setTipos] = useState<TipoConteoPeso[]>([])
  const [cargando, setCargando] = useState(true)
  const [tipoId, setTipoId] = useState("")
  const [peso, setPeso] = useState("")

  useEffect(() => {
    listarTiposConteoPeso().then((t) => {
      setTipos(t.filter((x) => x.activo))
      setCargando(false)
    })
  }, [])

  const tipo = tipos.find((t) => t.id === tipoId)
  const pesoNum = Number(peso)
  const valido = tipo !== undefined && peso.trim() !== "" && pesoNum > 0
  const resultado = valido ? calcularUnidadesPorPeso(pesoNum, tipo) : null

  return (
    <AppShell title="Calculadora de Conteo por Peso" description="Pitillos y tapas restantes según el peso de la caja">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Pesar caja</CardTitle>
            <CardDescription>Peso actual de la caja, con lo que le queda adentro.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tipo-conteo">Tipo</Label>
              {cargando ? (
                <div className="flex justify-center py-2 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <Select value={tipoId} onValueChange={setTipoId}>
                  <SelectTrigger id="tipo-conteo" className="w-full">
                    <SelectValue placeholder="Elegir tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="peso-conteo">Peso actual (kg)</Label>
              <Input
                id="peso-conteo"
                type="number"
                inputMode="decimal"
                placeholder="Ej. 9.22"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
              <Scale className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Unidades restantes</p>
                <p className="num font-semibold text-foreground">{resultado !== null ? resultado.toLocaleString("es-CO") : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
