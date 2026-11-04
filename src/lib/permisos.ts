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
  { codigo: "RESUMEN_VER", nombre: "Ver el Resumen Diario" },
  { codigo: "PERSONAL_GESTIONAR", nombre: "Gestionar personal" },
  { codigo: "PROGRAMACION_EDITAR", nombre: "Editar Programación" },
  { codigo: "CATALOGO_PARADAS_VER", nombre: "Ver Catálogo de Paradas" },
  { codigo: "CATALOGO_PARADAS", nombre: "Editar Catálogo de Paradas" },
  { codigo: "EDICION_DATOS", nombre: "Edición de Datos" },
  { codigo: "CALCULADORAS", nombre: "Calculadoras" },
  { codigo: "ESQUEMA_TURNOS", nombre: "Cambiar esquema de turnos (3x8 / 12x12) y día extraordinario" },
  { codigo: "LOTE_LIBERAR", nombre: "Analizar y liberar lotes (Calidad)" },
  { codigo: "CALIDAD_PARAMETROS", nombre: "Editar parámetros de Calidad (Brix y acidez por sabor)" },
  { codigo: "SIF_GESTIONAR", nombre: "Gestionar solicitudes de intervención de falla" },
  { codigo: "SIF_CONFIGURAR", nombre: "Configurar las SIF (frecuencia)" },
  { codigo: "INVENTARIO_CARGAR", nombre: "Cargar el Inventario diario" },
  { codigo: "ESTRUCTURA_GESTIONAR", nombre: "Gestionar áreas, puestos y permisos" },
  { codigo: "LECTURAS_SI", nombre: "Cargar lecturas de Servicios Industriales" },
  { codigo: "CODIGOS_MTTO_EDITAR", nombre: "Editar los códigos de Mantenimiento" },
  { codigo: "REPORTES_PARADAS_VER", nombre: "Ver los reportes de paradas" },
  { codigo: "ROBOT_TAVIL_CARGAR", nombre: "Cargar paletas del Robot Tavil" },
] as const

export type Permiso = (typeof PERMISOS)[number]["codigo"]

/**
 * Permisos de tema PERSONAS y ADMINISTRACION (tabla permisos.tema). Un puesto
 * con todos los permisos que no es el de Super Administrador (el Probador)
 * no los tiene: espejo de tiene_permiso() en la migración 20261114290000.
 */
export const PERMISOS_DE_ADMINISTRACION: readonly Permiso[] = ["PERSONAL_GESTIONAR", "ESTRUCTURA_GESTIONAR"]

export function esPermisoDeAdministracion(permiso: Permiso): boolean {
  return PERMISOS_DE_ADMINISTRACION.includes(permiso)
}

/** ¿La sesión tiene este permiso? Super Administrador siempre (los de administración, solo en su puesto). */
export function puede(session: Session | null, permiso: Permiso): boolean {
  if (!session) return false
  if (session.rol === "SUPERADMINISTRADOR") {
    const puestoSuperAdmin = !session.puestoCodigo || session.puestoCodigo === "SUPERADMINISTRADOR"
    if (puestoSuperAdmin || !esPermisoDeAdministracion(permiso)) return true
  }
  return (session.permisos ?? []).includes(permiso)
}
