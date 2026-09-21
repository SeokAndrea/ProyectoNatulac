import { useEffect, useState } from "react"
import { History, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Card, CardContent } from "@/components/ui/card"
import { listarLecturasServiciosIndustriales, type LecturaServiciosIndustriales } from "@/lib/panelProduccion"

/**
 * Historial de lecturas de Servicios Industriales — Nombre, Fecha y
 * Hora de cada carga, con los 3 valores. Es el mismo log que ya
 * alimentaba "Última lectura" en Servicios Industriales
 * (servicios_industriales_lecturas, append-only), solo que acá se ve
 * completo en vez de solo la más reciente.
 */
export default function RegistrosServiciosIndustriales() {
  const [lecturas, setLecturas] = useState<LecturaServiciosIndustriales[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    listarLecturasServiciosIndustriales().then((l) => {
      setLecturas(l)
      setCargando(false)
    })
  }, [])

  return (
    <AppShell title="Registros del Área" description="Historial de Temperatura del Quantum, Agua Osmotizada y Gasoil">
      <div className="mx-auto max-w-3xl">
        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : lecturas.length === 0 ? (
          <EmptyState
            icon={History}
            title="Todavía no hay registros"
            description="En cuanto se cargue una lectura desde Servicios Industriales, va a aparecer acá."
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Nombre</th>
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                    <th className="py-1.5 pr-3 font-medium">Hora</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Quantum</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Agua Osmotizada</th>
                    <th className="py-1.5 text-right font-medium">Gasoil</th>
                  </tr>
                </thead>
                <tbody>
                  {lecturas.map((l, i) => {
                    const fecha = new Date(l.actualizadoEn)
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-3 font-medium text-foreground">{l.actualizadoPorNombre ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {fecha.toLocaleDateString("es-CO", { dateStyle: "short" })}
                        </td>
                        <td className="py-1.5 pr-3 text-muted-foreground">
                          {fecha.toLocaleTimeString("es-CO", { timeStyle: "short" })}
                        </td>
                        <td className="num py-1.5 pr-3 text-right text-foreground">
                          {l.temperaturaQuantum !== null ? `${l.temperaturaQuantum}°C` : "—"}
                        </td>
                        <td className="num py-1.5 pr-3 text-right text-foreground">
                          {l.aguaOsmotizada !== null ? `${l.aguaOsmotizada.toLocaleString("es-CO")} L` : "—"}
                        </td>
                        <td className="num py-1.5 text-right text-foreground">
                          {l.gasoil !== null ? `${l.gasoil.toLocaleString("es-CO")} L` : "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
