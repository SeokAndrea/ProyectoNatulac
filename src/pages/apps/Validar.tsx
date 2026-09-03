import { useEffect, useState } from "react"
import { AppShell } from "@/components/AppShell"
import { ValidarLista } from "@/components/ValidarLista"
import { useAuth } from "@/lib/auth"
import { rangoDePreset, type RangoFecha } from "@/lib/auditoriaVista"
import {
  confirmarProduccion,
  editarProduccionValidada,
  listarValidacionProduccion,
  tanquesDeTurnos,
  type FilaValidacion,
  type OverridesValidacion,
  type TurnoTanques,
} from "@/lib/validacion"

/*
 * Validar (SUPERADMINISTRADOR): revisar cada corrida de los turnos
 * cerrados y marcar SÍ o EDITAR. Solo lo validado alimenta el
 * dashboard de KPIs futuro. La lista y el diseño están en
 * <ValidarLista>; acá se traen los datos y se conectan los RPC.
 * Ver plan-validar-produccion.md.
 */
export default function Validar() {
  const { session } = useAuth()
  const usuario = session?.username ?? ""

  const [rango, setRango] = useState<RangoFecha>(() => rangoDePreset("AYER", ""))
  const [filas, setFilas] = useState<FilaValidacion[]>([])
  const [tanques, setTanques] = useState<Record<string, TurnoTanques>>({})
  const [cargando, setCargando] = useState(true)

  async function cargar(r: RangoFecha) {
    if (!usuario) return
    setCargando(true)
    const lista = await listarValidacionProduccion(usuario, { fechaDesde: r.desde, fechaHasta: r.hasta })
    setFilas(lista)
    const codigos = [...new Set(lista.map((f) => f.turnoCodigo))]
    setTanques(await tanquesDeTurnos(usuario, codigos))
    setCargando(false)
  }

  useEffect(() => {
    cargar(rango)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  function handleRangoChange(r: RangoFecha) {
    if (r.desde === rango.desde && r.hasta === rango.hasta) return
    setRango(r)
    cargar(r)
  }

  async function handleConfirmar(turnoLineaId: string) {
    const res = await confirmarProduccion(usuario, turnoLineaId)
    if (res.ok) await cargar(rango)
  }

  async function handleEditar(turnoLineaId: string, ov: OverridesValidacion) {
    const res = await editarProduccionValidada(usuario, turnoLineaId, ov)
    if (res.ok) await cargar(rango)
  }

  return (
    <AppShell title="Validar" description="Revisar y fijar los datos de producción para los KPIs">
      <div className="mx-auto max-w-3xl">
        <ValidarLista
          filas={filas}
          tanquesPorTurno={tanques}
          cargando={cargando}
          onConfirmar={handleConfirmar}
          onEditar={handleEditar}
          onRangoChange={handleRangoChange}
        />
      </div>
    </AppShell>
  )
}
