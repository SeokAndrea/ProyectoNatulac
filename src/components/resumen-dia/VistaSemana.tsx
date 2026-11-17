import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { CajasPorGrupo } from "@/components/resumen-dia/CajasPorGrupo"
import { CajasPorSabor } from "@/components/resumen-dia/CajasPorSabor"
import { DiasDeLaSemana } from "@/components/resumen-dia/DiasDeLaSemana"
import { LineasDelDia } from "@/components/resumen-dia/LineasDelDia"
import { ParadasDelDia } from "@/components/resumen-dia/ParadasDelDia"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import {
  cajasPorSaborYDia,
  cargarResumenSemana,
  gruposDeSemana,
  lineasDeSemana,
  paradasDeSemana,
  resumenPorDia,
  type DatosSemana,
} from "@/lib/resumenSemana"

/** Vista Semana del Resumen Diario (lunes a domingo, sin actas). Ver src/lib/resumenSemana.ts. */
export function VistaSemana({
  usuario,
  area,
  lunes,
  hoy,
  esAnalista,
  lineas,
  presentaciones,
  nombreLinea,
  onVerDia,
}: {
  usuario: string
  area: string
  lunes: string
  hoy: string
  esAnalista: boolean
  lineas: LineaLive[]
  presentaciones: PresentacionLive[]
  nombreLinea: (codigo: string) => string
  onVerDia: (fecha: string) => void
}) {
  const [datos, setDatos] = useState<DatosSemana | null>(null)

  useEffect(() => {
    if (!usuario) return
    let vivo = true
    cargarResumenSemana(usuario, area, lunes, hoy).then((d) => vivo && setDatos(d))
    return () => {
      vivo = false
    }
  }, [usuario, area, lunes, hoy])
  const vigente = datos?.lunes === lunes ? datos : null

  const calculado = useMemo(() => {
    if (!vigente) return null
    return {
      porDia: resumenPorDia(vigente.dias, hoy),
      cajas: cajasPorSaborYDia(vigente.dias),
      lineas: lineasDeSemana(lineas, vigente.dias, presentaciones),
      paradas: paradasDeSemana(vigente.dias),
      grupos: gruposDeSemana(vigente.dias),
    }
  }, [vigente, hoy, lineas, presentaciones])

  if (!vigente || !calculado) {
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <>
      {vigente.errores.length > 0 && (
        <p className="text-sm text-destructive" role="alert">
          No se pudieron cargar algunos días: {vigente.errores.join(" · ")}
        </p>
      )}
      <DiasDeLaSemana dias={calculado.porDia} onVerDia={onVerDia} />
      {/* A todo el ancho: 7 días + el total no entran en media columna. */}
      <CajasPorSabor filas={calculado.cajas} etiquetas={vigente.dias.map((d) => d.etiqueta)} semana />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <LineasDelDia lineas={calculado.lineas} semana />
        <ParadasDelDia paradas={calculado.paradas} nombreLinea={nombreLinea} semana />
      </div>
      {esAnalista && <CajasPorGrupo grupos={calculado.grupos} />}
    </>
  )
}
