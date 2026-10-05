import type { Session } from "@/lib/auth"

/*
 * Permisos: acciones concretas. Cada rol trae un paquete por defecto y
 * cada persona puede tener permisos extra (ver Personal). Espejo de la
 * tabla "permisos" de supabase/migrations/20261078090000_roles_y_permisos.sql.
 * El servidor valida lo mismo con tiene_permiso(); aquí solo se usa para
 * mostrar u ocultar.
 */
export const PERMISOS = [
  { codigo: "TURNO_ASUMIR", nombre: "Asumir turno" },
  { codigo: "TURNO_CARGAR", nombre: "Cargar Preparación, Líneas y Producto Terminado" },
  { codigo: "PARADAS_REGISTRAR", nombre: "Registrar paradas" },
  { codigo: "PARADAS_MANTENIMIENTO", nombre: "Registrar paradas de Mantenimiento" },
  { codigo: "TURNO_CORREGIR", nombre: "Corregir turno cerrado" },
  { codigo: "AUDITORIA_VER", nombre: "Ver Auditoría" },
  { codigo: "VALIDAR", nombre: "Validar producción" },
  { codigo: "PERSONAL_GESTIONAR", nombre: "Gestionar personal" },
  { codigo: "PROGRAMACION_EDITAR", nombre: "Editar Programación" },
  { codigo: "CATALOGO_PARADAS", nombre: "Editar Catálogo de Paradas" },
  { codigo: "EDICION_DATOS", nombre: "Edición de Datos" },
  { codigo: "CALCULADORAS", nombre: "Calculadoras" },
  { codigo: "ESQUEMA_TURNOS", nombre: "Cambiar esquema de turnos (3x8 / 12x12)" },
  { codigo: "LOTE_LIBERAR", nombre: "Analizar y liberar lotes (Calidad)" },
  { codigo: "CALIDAD_PARAMETROS", nombre: "Editar parámetros de Calidad (Brix y acidez por sabor)" },
  { codigo: "INVENTARIO_CARGAR", nombre: "Cargar el Inventario diario" },
] as const

export type Permiso = (typeof PERMISOS)[number]["codigo"]

/** ¿La sesión tiene este permiso? Super Administrador siempre. */
export function puede(session: Session | null, permiso: Permiso): boolean {
  if (!session) return false
  if (session.rol === "SUPERADMINISTRADOR") return true
  return (session.permisos ?? []).includes(permiso)
}
