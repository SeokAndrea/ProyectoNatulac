# Catálogo de fallas modular (Equipo › Sistema › Subsistema › Falla)

Fecha: 2026-10-31 · Rama: `catalogo-modular` · Maqueta: https://claude.ai/artifact/4pLjWi2cKQX8vNEuwz1WfQ

## Problema

Producción (`paradas_equipos` + `paradas_tipos`, Equipo + Falla) y Mantenimiento
(`mtto_equipos` + `mtto_subsistemas`, códigos del Sheet) tienen dos vocabularios
que no se conocen: la misma falla queda con dos nombres y dos códigos.

## Decisiones (con la dueña)

1. **Un solo árbol** para las fallas MECÁNICAS (familias `EQUIPO` y `EQUIPO_PROCESO`):
   Equipo › Sistema › Subsistema › Falla. Ej.: Compact Flex › Superestructura ›
   Cámara aséptica › Baja presión. Las otras 9 familias (PP, LNPE, OP, S…) siguen
   en `paradas_tipos`; al crear una nueva, el número del código sale solo.
2. **Código** = sufijo equipo + sistema + subsistema + número: `CF-SUP-CAM-01`.
   Los sufijos son **editables** (2–6 letras/números, únicos entre hermanos). Cada
   fila tiene un id fijo; el código **no se guarda**, se arma al leer: los
   reportes viejos muestran siempre el código actual (trazable). El número de
   falla es el siguiente libre del subsistema y nunca se reutiliza.
3. **Clase** de cada falla para la eficiencia: Programada / No programada / Ocioso,
   «No programada» por defecto.
4. **Tipo de equipo**: «De línea» (en ciertas líneas) o «De servicios»
   (generadores, calderas…: aparecen en todas las líneas).
5. **Producción** elige equipo + falla con buscador («Baja presión · Cámara
   aséptica»). Si no está: «No está en la lista» → falla por clasificar.
   **Mantenimiento** al terminar ve sistema/subsistema/falla prellenados y los
   confirma o cambia (o crea la falla). La parada guarda las dos
   (`falla_produccion_id`, `falla_final_id`); reportes, conteos y SIF usan la
   final (la de Producción mientras no hay final).
6. **Agregar**: equipo, sistema, subsistema o falla, solos o juntos. Enter agrega;
   pegar varias líneas del Excel agrega todas (las repetidas se saltan).
7. **Quién edita**: permiso existente `CATALOGO_PARADAS` → rol Jefe de Producción
   + por persona al jefe de Mantenimiento (no existe ese rol) + la dueña.
8. **Códigos del Sheet** (128): quedan como `codigo_sheet` del subsistema, para
   buscar y reconocer.
9. **Nada se borra**, solo se desactiva; todo cambio a la auditoría.
10. **Transición** (recomendación, por confirmar): switch como Modo Vacío.
    (a) se llena el catálogo sin que nadie lo use; (b) se ensaya en Pruebas;
    (c) fecha en planta, **todas las líneas a la vez**. Antes del switch, tabla de
    equivalencias tipo mecánico viejo → falla nueva para que la SIF siga contando.

## Pantallas

- **Catálogo de Paradas** → pestaña nueva «Fallas de equipos»: árbol plegado con
  conteos, buscador (nombre, código o código del Sheet), sufijo editable con aviso
  de impacto, formulario «Agregar». Pensado primero para teléfono.
- **Producción / Mantenimiento**: fase 2 (abajo).
- **Panel de Paradas**: spec propio, después.

## Fases

1. Base (tablas, RPC, permiso) + pestaña «Fallas de equipos». Sin efecto en planta.
2. Buscador de fallas para Producción y «Terminar parada» de Mantenimiento, detrás
   del switch.
3. Switch por área, equivalencias y SIF por falla final.

## Fuera de alcance

Panel de Paradas y orden de la pantalla de permisos: specs propios.
