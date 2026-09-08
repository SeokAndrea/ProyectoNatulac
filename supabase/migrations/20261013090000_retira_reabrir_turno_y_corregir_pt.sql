-- ============================================================
-- RETIRA reabrir_turno() Y corregir_producto_terminado_auditoria()
-- ============================================================
-- Fase 2 del rework (plan-rework-3-modulos-y-merma.md, seccion 2.1):
-- se cierran las vias ad hoc de "editar/corregir" un turno ya cerrado.
--
-- 1. reabrir_turno(text, uuid): confirmado con el dueno que ya no se
--    usa en la operacion. Su proposito (cargar algo olvidado y
--    regenerar el acta) lo cubre mejor VALIDAR, sin tener que volver
--    un turno CERRADO a ABIERTO. El boton "Reabrir Turno" se retira
--    de la pantalla de Auditoria en el mismo cambio.
--
-- 2. corregir_producto_terminado_auditoria(...): codigo muerto. El
--    wrapper del frontend existe pero ningun boton lo llama (verificado
--    por grep). Con "solo Recepcion edita" (Contexto del plan) no hay
--    correccion de Producto Terminado a mitad de turno, ni de
--    supervisor ni de administrador: se espera al cierre y se corrige
--    desde VALIDAR. Existen dos firmas vivas: la de 4 parametros
--    (20260975) y la de 5 con p_pagina (20260984) -- se dropean ambas.
--
-- Las columnas producto_terminado.editado_por / editado_en quedan
-- permanentemente en null al retirar esta funcion (era la unica que
-- las escribia). Su eliminacion va aparte, en el paso 2.9 del plan.
--
-- Migracion aditiva y reversible por re-aplicacion de 20260949 /
-- 20260984 si hiciera falta. No toca datos.
-- ============================================================

drop function if exists reabrir_turno(text, uuid);

drop function if exists corregir_producto_terminado_auditoria(text, uuid, integer, integer, text);
drop function if exists corregir_producto_terminado_auditoria(text, uuid, integer, integer);
