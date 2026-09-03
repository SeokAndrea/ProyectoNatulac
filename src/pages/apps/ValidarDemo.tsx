import { useState } from "react"
import { ValidarLista } from "@/components/ValidarLista"
import { FILAS_VALIDACION_DEMO } from "@/lib/validacionDemoFixture"
import type { FilaValidacion, OverridesValidacion } from "@/lib/validacion"

/*
 * Preview sin login ni base (ruta /validar-demo) del módulo VALIDAR.
 * Los botones Sí / Editar funcionan contra estado local para ver el
 * diseño y editar en vivo. La página real es Validar.tsx (pendiente).
 * Se borra al conectar los RPC. Ver plan-validar-produccion.md.
 */
export default function ValidarDemo() {
  const [filas, setFilas] = useState<FilaValidacion[]>(FILAS_VALIDACION_DEMO)

  function confirmar(id: string) {
    setFilas((fs) =>
      fs.map((f) =>
        f.turnoLineaId === id
          ? { ...f, estado: "CONFIRMADO", overrides: null, validadoPorNombre: "Daniela (demo)", validadoEn: new Date().toISOString() }
          : f,
      ),
    )
  }

  function editar(id: string, ov: OverridesValidacion) {
    setFilas((fs) =>
      fs.map((f) =>
        f.turnoLineaId === id
          ? { ...f, estado: "EDITADO", overrides: ov, validadoPorNombre: "Daniela (demo)", validadoEn: new Date().toISOString() }
          : f,
      ),
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 bg-background px-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">Preview con datos de prueba</p>
        <h1 className="text-xl font-semibold text-foreground">Validar — producción</h1>
        <p className="text-sm text-muted-foreground">
          Una fila por corrida (turno · línea · lote) de los turnos cerrados. Daniela marca <b>Sí</b> (el dato del
          supervisor es el bueno) o <b>Editar</b> (lo corrige). Solo lo validado alimenta los KPIs.
        </p>
      </div>

      <ValidarLista filas={filas} onConfirmar={confirmar} onEditar={editar} presetInicial="DIAS_7" />
    </div>
  )
}
