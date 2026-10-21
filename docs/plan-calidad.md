# Plan — Calidad libera los lotes

Creado 2026-09-28. Estado: **hecho, activo solo en el Área de Pruebas.** La planta todavía no decidió si Calidad
va a liberar en Aséptico.

## Qué hace

- El supervisor prepara el tanque. Calidad registra **Brix, acidez (%) y conformidad** en la pantalla **Calidad**.
- Conforme: el mismo registro libera el lote (tanque Liberado). No conforme: observación obligatoria; el
  supervisor ajusta y Calidad vuelve a analizar. Se guardan todos los análisis.
- Rol **Analista de Calidad** y permiso **Analizar y liberar lotes** (`LOTE_LIBERAR`): lo traen Calidad y Jefe de
  Producción; se puede dar a otra persona desde Personal.
- Interruptor por área `areas.calidad_libera`. Apagado: el supervisor libera como siempre.

Migración `20261086090000_calidad_libera_lotes.sql`. Ensayo: `scripts/ensayo-20261086-calidad.sql`.

## Para aplicarlo (Pruebas)

1. Supabase → SQL Editor: pegar `scripts/ensayo-20261086-calidad.sql`. Debe terminar en «ENSAYO OK».
2. `npx supabase db push`.

## Para habilitarlo en Aséptico (cuando se decida)

1. Aplicar `20261095090000_calidad_bloquea_editar_tanque_listo.sql`: con Calidad encendida, "Editar" /
   "Corregir" del tanque ya no deja poner Listo o Con Restos un lote nuevo (antes lo liberaba sin análisis).
2. Usuarios de Calidad en el área **Calidad** (no Pruebas). Calidad cubre los 3 turnos (confirmado 2026-10-01).
3. Rangos de Brix y acidez cargados para todos los sabores (sin rango, el análisis nunca es conforme).
4. Encender el interruptor en un cambio de turno, con Calidad presente: **Edición de Datos → "Calidad libera
   los lotes (Aséptico)"** (solo lo ve el dueño; migración 20261096, queda en Auditoría). Equivale a:
   ```sql
   update areas set calidad_libera = true where codigo = 'ASEPTICO';
   ```

## Rangos por sabor y Supervisor de Calidad (2026-09-29, migración 20261088)

- El análisis es **sensorial** (conforme / no conforme), **Brix** y **acidez**.
- Cada sabor tiene un mínimo y un máximo de Brix y de acidez (tabla `calidad_parametros`). El resultado es
  conforme solo si el sensorial es conforme y los dos valores están dentro del rango (bordes incluidos). El
  análisis **siempre se guarda, con su hora**; si no es conforme (fuera de rango, sensorial no conforme o sabor
  sin rango cargado) queda registrado y **no se libera**. La observación solo es obligatoria si el sensorial no
  es conforme.
- Cada análisis guarda el rango vigente, por si después se reformula.
- Dos cuentas: **aCalidad** (rol Analista de Calidad: analiza y libera) y **sCalidad** (rol Supervisor de
  Calidad: además edita los rangos, permiso `CALIDAD_PARAMETROS`). Se crean desde Personal.
- Los rangos se cargan en Calidad → Parámetros por sabor. Ensayo: `scripts/ensayo-20261088-calidad-rangos.sql`.

## Área Calidad (2026-09-29, migración 20261089)

- Calidad es un área **de apoyo**, como Servicios Industriales y Mantenimiento: no abre turnos, mira el turno
  abierto de **Aséptico** y ve sus tanques En Preparación.
- En el área Calidad solo se puede elegir Analista o Supervisor de Calidad; esos roles solo van en Calidad o en
  Pruebas (trigger `trg_rol_area_calidad` + filtro en Personal).
- Crear aCalidad / sCalidad en **Pruebas** para probar; pasarlos al área **Calidad** cuando se quiera arrancar en
  Aséptico (desde ahí ya analizan y liberan los lotes reales). Ensayo: `scripts/ensayo-20261089-area-calidad.sql`.

## Pendiente

- Mostrar los análisis en el Acta.
