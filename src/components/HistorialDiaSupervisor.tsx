import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obtenerHistorialDia, type AccionDia } from "@/lib/historialDia"

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/*
 * Qué hizo cada supervisor en el día: una fila colapsada por
 * supervisor (nombre + cantidad de acciones), que se abre al hacer
 * clic para ver sus acciones apiladas por hora — así no se muestran
 * todas de un golpe.
 */
export function HistorialDiaSupervisor({ areaCodigo }: { areaCodigo: string }) {
  const [fecha, setFecha] = useState(hoyLocal)
  const [acciones, setAcciones] = useState<AccionDia[]>([])
  const [cargando, setCargando] = useState(true)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  useEffect(() => {
    setCargando(true)
    setAbiertos(new Set())
    obtenerHistorialDia(areaCodigo, fecha).then((lista) => {
      setAcciones(lista)
      setCargando(false)
    })
  }, [areaCodigo, fecha])

  function alternar(usuario: string) {
    setAbiertos((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(usuario)) nuevo.delete(usuario)
      else nuevo.add(usuario)
      return nuevo
    })
  }

  const supervisores = [...new Set(acciones.map((a) => a.supervisorUsuario))].map((usuario) => ({
    usuario,
    nombre: acciones.find((a) => a.supervisorUsuario === usuario)?.supervisorNombre ?? usuario,
    acciones: acciones.filter((a) => a.supervisorUsuario === usuario).sort((a, b) => a.hora.localeCompare(b.hora)),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          Historial del día por supervisor
        </CardTitle>
        <CardDescription>Qué hizo cada supervisor, por hora — haz clic en un nombre para ver el detalle.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" />
        </div>

        {cargando ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : supervisores.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin acciones registradas ese día.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {supervisores.map((s) => {
              const abierto = abiertos.has(s.usuario)
              return (
                <div key={s.usuario} className="rounded-lg border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                    onClick={() => alternar(s.usuario)}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      {abierto ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                      {s.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.acciones.length} acci{s.acciones.length === 1 ? "ón" : "ones"}
                    </span>
                  </button>

                  {abierto && (
                    <div className="flex flex-col gap-1.5 border-t border-border p-3">
                      {s.acciones.map((a, i) => (
                        <div key={i} className="rounded-md border border-border/70 bg-muted/30 px-2 py-1.5 text-xs">
                          <p className="font-medium text-foreground">
                            {a.hora.slice(0, 5)} · {a.seccion}
                          </p>
                          <p className="text-muted-foreground">{a.detalle}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
