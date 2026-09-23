import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RegistroParadas, type LineaDelDia } from "@/components/RegistroParadas"
import { listarParadas, LINEAS_PARADAS, registrarParada, type DatosRegistroParada, type Parada } from "@/lib/paradas"
import { useAuth } from "@/lib/auth"
import { useSesionTurno } from "@/lib/sesionTurno"
import { fechaLocal } from "@/lib/turno"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { presentacionesPorLineaLive, useCatalogosLive } from "@/lib/catalogosLive"

/*
 * Registro de Paradas — el supervisor elige la LÍNEA (la parada nunca es
 * del lote) y carga las paradas PROGRAMADA (catálogo) y el TIEMPO OCIOSO
 * (texto libre); NO PROGRAMADA es solo lectura, llega del Sheet de
 * Mantenimiento. Cada línea se muestra con el lote/sabor que tiene
 * corriendo ahora (mismo dato que Producción al activar) — solo contexto
 * para reconocerla, no cambia que la parada se guarda por línea. La vista
 * vive en <RegistroParadas> (compartida con el preview /paradas-demo, que
 * arma sus propias líneas genéricas sin login).
 * Las paradas se guardan en el turno propio de la sesión (registrar_parada)
 * y la lista es la de ese turno; sin turno en curso no se puede registrar.
 * Guardar una parada NO detiene la línea en Líneas: son registros
 * independientes. El lote/sabor de contexto es real (useProduccion, turno
 * propio de la sesión). LINEA_T1/T2/T3 (Pruebas) vs. LINEA_1/2/3 (Producción) no
 * comparten código — se matchea por POSICIÓN contra LINEAS_PARADAS, mismo
 * criterio que PanelParadas.tsx.
 */
export default function Paradas() {
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  const { session } = useAuth()
  const { turnoId } = useSesionTurno()
  const prod = useProduccion()
  const { lineas: lineasReales, presentaciones, velocidades } = useCatalogosLive()

  const recargar = useCallback(async () => {
    if (!turnoId) return setParadas([])
    const hoy = fechaLocal(new Date())
    setParadas(await listarParadas({ desde: hoy, hasta: hoy, turnoId }))
  }, [turnoId])

  useEffect(() => {
    void recargar()
  }, [recargar])

  async function onRegistrar(datos: Omit<DatosRegistroParada, "turnoId">): Promise<string | null> {
    if (!turnoId) return "Inicia un turno para registrar paradas."
    if (!session) return "Tu sesión expiró. Vuelve a entrar."
    const r = await registrarParada(session.username, { ...datos, turnoId }, "Registrar Paradas")
    if (!r.ok) return r.error
    await recargar()
    return null
  }

  const lineasHoy: LineaDelDia[] = LINEAS_PARADAS.map((l, i) => {
    const lineaReal = lineasReales[i]
    const corrida = lineaReal ? prod.corridas.find((c) => c.linea === lineaReal.codigo && c.activa) : undefined
    const mlDisponibles = lineaReal ? presentacionesPorLineaLive(velocidades, lineaReal.codigo) : []
    return {
      lineaCodigo: l.codigo,
      lineaNombre: lineaReal?.nombre ?? l.nombre,
      loteTexto: corrida?.lote ?? null,
      saborNombre: corrida?.saborNombre ?? null,
      activa: corrida != null,
      presentacionMl: corrida ? Number(corrida.presentacion) || null : null,
      // Las presentaciones que de verdad corren en esta línea (catálogo de velocidades) — el
      // supervisor elige entre ellas, no se confía a ciegas en la presentación de la corrida activa.
      presentacionesDisponibles: mlDisponibles
        .map((codigo) => presentaciones.find((p) => p.codigo === codigo))
        .filter((p): p is NonNullable<typeof p> => p != null && p.activo)
        .map((p) => ({ ml: p.volumenMl, nombre: p.nombre }))
        .sort((a, b) => a.ml - b.ml),
    }
  })

  return (
    <AppShell title="Registrar Paradas" description="Paradas programadas y tiempo ocioso, por línea">
      <div className="mx-auto w-full max-w-3xl">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <RegistroParadas paradas={paradas} lineasHoy={lineasHoy} onRegistrar={onRegistrar} area={session?.area ?? null} />
        )}
      </div>
    </AppShell>
  )
}
