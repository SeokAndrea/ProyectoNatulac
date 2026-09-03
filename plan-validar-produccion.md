# Plan — Módulo VALIDAR + candado de edición de Producto Terminado

Arrancado 2026-09-03. Tres cosas relacionadas: (1) el PT del supervisor se congela 1 h después
de cargado, (2) se oculta "producto retenido", (3) módulo nuevo VALIDAR (SUPERADMINISTRADOR) que
fija los valores buenos que van a alimentar el dashboard de KPIs.

**Estado — implementado 2026-09-03** (sin aplicar migraciones todavía):
- Candado 1 h: migración `20261004` (`registrar_producto_terminado` + guarda por `p_auditar`).
- Producto retenido: sacado de la UI de `ProductoTerminado.tsx` (columnas de la base se quedan).
- VALIDAR: migración `20261005` (tabla `validacion_produccion` + `listar_validacion_produccion`
  / `confirmar_produccion` / `editar_produccion_validada` / `tanques_de_turnos`), `src/lib/validacion.ts`
  con los wrappers, `src/pages/apps/Validar.tsx` (página real), ruta `/validar` + tarjeta del hub
  (`ListChecks`, solo SUPERADMINISTRADOR). El diseño lo comparte `<ValidarLista>` con `/validar-demo`.
- **Falta:** `supabase db push` + probar en `:4035`; el helper `produccion_efectiva_kpi(...)` para
  el dashboard futuro; borrar `/validar-demo` cuando esté validado.

---

## 1. Candado: el supervisor no edita Producto Terminado después de 1 h

**Decisión:** aplica **solo al supervisor**; el ADMINISTRADOR_AREA puede seguir corrigiendo. El
reloj arranca en `producto_terminado.created_at` (cuando se cargó ese PT).

**Cómo:** dentro de `registrar_producto_terminado()` (re-emitir, migración nueva). El
discriminador es `p_auditar`: el camino directo del supervisor pasa `p_auditar = true` (default);
la corrección de admin (`corregir_producto_terminado_auditoria`) pasa `p_auditar = false`.

```
if coalesce(p_auditar, true)          -- camino del supervisor
   and v_habia_pt                     -- ya existía (es edición, no alta)
   and not v_aditivo                  -- no es entrega parcial
   and now() - <created_at> > interval '1 hour'
then
  raise exception 'Ya no se puede cambiar este Producto Terminado (pasó más de 1 hora desde
    que se cargó). Un administrador puede corregirlo, o se valida desde el módulo Validar.';
end if;
```

- Primera carga = INSERT (sin `on conflict`) → no entra al guard.
- Entregas parciales → exentas (`v_aditivo`).

---

## 2. Ocultar "producto retenido"

Los campos `producto_retenido` / `cajas_retenidas` no hacen nada hoy (no afectan litros / merma /
acta). Se **ocultan de la interfaz** ([ProductoTerminado.tsx](src/pages/apps/ProductoTerminado.tsx#L837)):
el checkbox "¿Hay producto retenido?" y el input de cajas retenidas. Las columnas de la base
**se quedan** (dato histórico); el RPC sigue recibiendo `false` / `null` por default.

---

## 3. Módulo VALIDAR (SUPERADMINISTRADOR)

### Decisiones (2026-09-03)

- **Granularidad:** una fila por **turno + línea + lote** — en la práctica = una fila por
  `turno_linea` (cada corrida tiene un solo `lote_id`; si la línea "continuó al siguiente lote"
  son 2 `turno_lineas` = 2 filas). **Clave: `turno_linea_id`.**
- **Qué edita Daniela:** todo — paletas, cajas sueltas, contador (`envases_llenadora`), litros
  consumidos, **el lote**, y puede **pisar los % de merma** a mano si el cálculo no le cierra
  (por default se recalculan de los valores duros).
- **Cuándo:** solo turnos **CERRADOS**, y solo desde el **02/09/2026** en adelante (lo
  anterior no se revisa — piso fijo en `listar_validacion_produccion`).
- **KPIs:** una corrida `PENDIENTE` (sin validar) **NO cuenta** para KPIs. Entra recién cuando
  Daniela hace SÍ o EDITAR.
- **Alcance:** todas las áreas menos Pruebas (igual que Auditoría).
- Nunca se toca el `producto_terminado` original del supervisor — la validación vive en su
  propia tabla. El "valor efectivo" = el de Daniela si validó (`coalesce`), y solo existe si validó.

### Qué muestra cada fila

Turno (código, fecha) · supervisor · área · línea · sabor · **lote** · presentación, y en columnas
el valor del **supervisor** vs. el de **Daniela** (si editó):

| | supervisor | Daniela (si EDITÓ) |
| --- | --- | --- |
| Cajas (paletas + sueltas → total) | ✓ | editable |
| Contador (`envases_llenadora`) | ✓ | editable |
| Litros consumidos (llenadora × volumen) | ✓ | editable |
| Litros producidos (cajas × L/caja) | calculado | recalculado |
| Merma de envases % | calculado | recalculado o pisado a mano |
| Merma de semielaborado % | calculado | recalculado o pisado a mano |

Estado por fila: `PENDIENTE` · `CONFIRMADO` · `EDITADO`. Botones **Sí** / **Editar** (form inline).
Re-validar: sí, Daniela puede volver a cambiar una fila ya validada.

### Modelo de datos

Tabla `validacion_produccion` (todos los overrides nullables — null = usar el del supervisor):

| campo | |
| --- | --- |
| `turno_linea_id` (uuid, PK) | la corrida validada |
| `turno_id` (uuid) | filtro por rango |
| `estado` (text) | `CONFIRMADO` \| `EDITADO` (sin fila = `PENDIENTE`) |
| `paletas`, `cajas_sueltas` (int, null) | |
| `envases_llenadora` (int, null) | |
| `litros_consumidos` (numeric, null) | |
| `lote` (text, null) | lote corregido (etiqueta) |
| `merma_envases_pct`, `merma_semielaborado_pct` (numeric, null) | % pisado a mano |
| `nota` (text, null) | motivo del EDITAR |
| `validado_por` (uuid), `validado_en` (timestamptz) | |

### RPCs (todas `security definer`, solo `SUPERADMINISTRADOR`)

- `listar_validacion_produccion(p_usuario, p_fecha_desde, p_fecha_hasta)` — una fila por
  `turno_linea` de turnos **CERRADOS** del rango (áreas ≠ Pruebas) que tengan PT o contador:
  valores del supervisor (calculados) + estado + overrides de Daniela.
- `confirmar_produccion(p_usuario, p_turno_linea_id)` — SÍ (estado `CONFIRMADO`, sin overrides).
- `editar_produccion_validada(p_usuario, p_turno_linea_id, p_paletas, p_cajas_sueltas,
  p_envases_llenadora, p_litros_consumidos, p_lote, p_merma_envases_pct,
  p_merma_semielaborado_pct, p_nota)` — EDITAR (guarda los no-null).
- `produccion_efectiva_kpi(p_fecha_desde, p_fecha_hasta)` — para el dashboard futuro: una fila
  por corrida **validada** (PENDIENTE excluido), con `coalesce(validacion.x, supervisor.x)`.

### Frontend

- `src/lib/validacion.ts` — tipos + wrappers.
- `src/components/ValidarLista.tsx` — la lista (recibe filas + callbacks). **La reusa el preview.**
- `src/pages/apps/Validar.tsx` — página real: filtro de fecha + `<ValidarLista>` conectada a los RPC.
- Ruta `/validar` + tarjeta en el hub (`rolesPermitidos: ["SUPERADMINISTRADOR"]`).

### Preview antes de implementar (pedido del usuario)

Igual que se hizo con Auditoría: `src/pages/apps/ValidarDemo.tsx` + `src/lib/validacionDemoFixture.ts`
+ ruta `/validar-demo`, sin login ni base. Renderiza `<ValidarLista>` con datos falsos y los
botones **Sí** / **Editar** funcionando contra estado local, para ver el diseño y editar en vivo
antes de tocar la base. Se borra al conectar la página real.
