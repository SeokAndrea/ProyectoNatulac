import { AuditoriaTurnos } from "@/components/AuditoriaTurnos"
import { RegistroCambios } from "@/components/RegistroCambios"
import { SeccionColapsable } from "@/components/SeccionColapsable"
import { CAMBIOS_DEMO, LINEAS_DEMO, PRESENTACIONES_DEMO, TURNOS_DEMO } from "@/lib/auditoriaDemoFixture"

/*
 * Preview sin login ni base de datos (ruta /auditoria-demo) de la
 * vista reworkeada de Auditoría, con datos de prueba. La página real
 * es src/pages/apps/Historial.tsx; esto sirve para iterar el diseño
 * de <AuditoriaTurnos> sin depender de Supabase. Se puede borrar.
 */
export default function AuditoriaDemo() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 bg-background px-4 py-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-warning-foreground uppercase">Preview con datos de prueba</p>
        <h1 className="text-xl font-semibold text-foreground">Auditoría — vista reworkeada</h1>
        <p className="text-sm text-muted-foreground">
          Filtro de fecha · solapa por turno · fecha · supervisor · línea de tiempo por hora. El buscador acepta
          supervisor, sabor, lote o cualquier texto.
        </p>
      </div>

      <AuditoriaTurnos turnos={TURNOS_DEMO} lineas={LINEAS_DEMO} presentaciones={PRESENTACIONES_DEMO} />

      <SeccionColapsable
        titulo="Registro de cambios (auditoría)"
        descripcion="Toda mutación (crear / editar / borrar): cuándo, qué se tocó y quién. El antes/después detrás de «ver valores»."
      >
        <RegistroCambios registros={CAMBIOS_DEMO} />
      </SeccionColapsable>
    </div>
  )
}
