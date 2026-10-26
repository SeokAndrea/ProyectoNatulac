# Paradas y Mantenimiento: estado al 2026-10-26

Para retomar en otra sesión. Nada de esto está desplegado ni probado en Pruebas.

## Ramas (todas en GitHub)

| Rama | Sale de | Qué tiene | Migraciones | Destino |
|---|---|---|---|---|
| `paradas-lectura-clara` | `main` | Arreglo: una parada que anota Producción salía «de Mantenimiento» (20261112150000, corrige también las ya guardadas). Y cambios de pantalla: Líneas sin «Parada»/«Paradas» en las tarjetas (todo en Modo Paradas: Parada, Continuar, Detener línea, Cubrir, «Anotar»); Status con opciones claras («Está parada, pero sigue con este lote» / «Ya no sigue con este lote» / «Está en CIP»); Sheet de Mantenimiento apagado (`SHEET_MANTENIMIENTO_ACTIVO = false` en `src/lib/sheetMantenimiento.ts`); merma por línea igual en Panel, acta (2.1) y Finalizar Turno; atajos Líneas ↔ Producto Terminado | 20261112150000 | **Producción hoy** |
| `inventario-integrado` | `main` | Inventario diario, Analista edita fórmulas/insumos/empaque, correo de Mantenimiento en Ajustes, Indicadores desde el Resumen Diario | 20261112190000, 20261112290000, 20261112390000, 20261112490000 | Después, aparte |
| `paradas-modo-unico` | `inventario-integrado` | Lo de `paradas-lectura-clara` + «No sé / es una falla» al parar, página `/mantenimiento` (clasificar / terminar fallas), interruptor «Mantenimiento termina las fallas» en Ajustes de planta, puente con el Sheet, aviso en Validar jornada | 20261112590000 (no aplicada en ningún lado: todavía se puede editar) | **Después**, cuando Mantenimiento use la app |

## Producción hoy: `paradas-lectura-clara`

Decisión de la dueña: por ahora Producción inicia **y termina** sus paradas; nada brusco.

1. Probar en Pruebas (ver memoria `deploy_servidor_pruebas`): Líneas → Modo Paradas (parar, continuar, detener), Status al inicio de turno (opciones nuevas), Registrar Paradas sin botón del Sheet, acta con la misma merma que el Panel, y que una parada anotada por un supervisor ya no salga «de Mantenimiento».
2. Unir a `main` y desplegar (WinSCP + `docker compose`) **y aplicar la migración 20261112150000**. Es la única. Además de arreglar `anotar_parada`, pasa a MANUAL las paradas ya guardadas como MANTENIMIENTO por alguien que no es de Mantenimiento (solo esa marca; deja en Auditoría cuántas). Probada en PGlite sobre la cadena de `main` (9 chequeos).
3. Después de desplegar: en Registrar Paradas, revisar si quedaron paradas **del Sheet abiertas** (en curso). Ya no se van a cerrar solas; ciérralas a mano o seguirán sumando tiempo.

## Después: `paradas-modo-unico`

- Cuando `paradas-lectura-clara` esté en `main`, unir `main` a esta rama (así trae también 20261112150000). Van a chocar los mismos archivos de Líneas (casi iguales) y `src/lib/sheetMantenimiento.ts`: aquí el Sheet sigue activo con el puente; decidir si se deja apagado (entonces el puente sobra).
- Modelo acordado: **Producción inicia, Mantenimiento finaliza**, con interruptor por área como «Calidad libera» (`areas.mantenimiento_finaliza`): apagado en Aséptico, encendido en Pruebas. Encendido: el supervisor no puede darle Continuar a una falla; Mantenimiento la termina desde `/mantenimiento` (`finalizar_falla`) y la línea sigue sola. Detener línea / CIP dejan la falla abierta para Mantenimiento.
- La migración se probó en PGlite con toda la cadena (41 chequeos). El arnés estaba en el scratchpad y se perdió; para rehacerlo: `@electric-sql/pglite@0.3.7`, roles `anon/authenticated/service_role/authenticator`, esquemas `auth/storage/extensions/cron` con stubs, quitar `create extension`, `set check_function_bodies = off` (20261104090000 referencia una columna ya borrada).
- Sin decidir: quién decide al final de quién es cada parada. No cubierto: si el reporte del Sheet llega antes de que el supervisor pare la línea, no se juntan.

## Merma -32% (acta) vs -4% (Panel), turno A20261026_T1G2

El acta (2.1) y Finalizar Turno promediaban el % de cada corrida; el Panel suma los envases de todas. Ya usan la misma cuenta (`mermaLineaTurno`) en las dos ramas de paradas. **No se pudo ver el dato real** (la base de planta no responde desde fuera de la VPN): con la VPN, revisar las corridas de ese turno (contador vs PT); una merma negativa dice que el PT tiene más envases que el contador en alguna corrida.
