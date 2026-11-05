# Panel de administración

El panel de toda la plataforma vive en `/admin`. Lo ven solo las personas de la tabla
`platform_admins`. Ser owner de una empresa no da acceso: quien no es administrador
recibe un 404, igual que una ruta que no existe.

## Puesta en marcha

El orden importa, porque el código nuevo lee `accounts.suspendida_en` al cargar
cualquier cuenta. Desplegar antes de migrar tumba el Studio.

1. Aplicar `supabase/migraciones/2026-11-05-panel-admin.sql` en Supabase. Es aditiva y
   no cambia nada de lo que corre: se puede aplicar antes de desplegar.
2. Nombrarse primer administrador, una sola vez, en el editor SQL:

   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'TU_CORREO';
   ```

3. Desplegar. Aparece "Administración" al final de la barra lateral.

Los siguientes administradores se nombran desde `/admin/accesos`.

## Qué cierra además del panel

- **El plan ya no lo cambia el cliente.** Antes un owner podía subirse a Advance desde
  Configuración y cualquier usuario podía crear una empresa en Advance. Ahora solo lo
  cambia un administrador; toda empresa nueva creada desde el Studio nace en Basic.
- **Las acciones Advance comprueban el plan** (`idDeCuentaAdvance`), no solo sus páginas.
  `capas/actions.ts` queda fuera a propósito: lo usa Marca, que es de Basic.

## Cómo funciona

**Empresa suspendida.** Nadie entra (`cuentaActual` manda a `/suspendida`, que no muestra
el motivo) y los motores la saltan: los ticks por `todasLasCuentas`, y el chat y las
campañas de video en sus colas de Postgres (`chat_despachar`, `vc2_claim`), y los
buzones de contenido en `procesarBuzon`. Nada se borra, y lo que estaba en cola sigue al
reactivarla. Lo único que puede terminar después de suspender es lo que ya estaba
haciéndose en ese instante; no empieza nada nuevo.

**Usuario bloqueado.** Se le pone un bloqueo en Supabase Auth y se borran sus sesiones.
`usuarioActual` y el proxy lo rechazan aunque su token siga vigente. Sus empresas siguen
funcionando.

**Consumo.** Los tokens salen de `pipeline_events` (`claude.uso`). Los dólares se calculan
con `src/lib/precios-claude.ts`, a precio de API: una empresa con suscripción de Claude
paga una cuota fija, así que para ella el número dice cuánto valdría su uso, no cuánto
paga. Cuando Anthropic cambie precios, se actualiza ese archivo. No incluye búsquedas web,
Serper, Gemini, Composio ni Apify, que no dejan registro de gasto.

**Actividad.** `admin_actividad` no se puede editar ni borrar: lo impide un trigger.
Anotan los administradores, los owners al mover miembros y el registro de cuentas. La
pantalla le suma los fallos de las colas, que se leen en vivo con `admin_fallos`.

**Almacenamiento.** El límite es 1 GB (Supabase gratis). Al subir de plan, poner
`ALMACENAMIENTO_LIMITE_MB`. Avisa desde el 80 %.

## Para deshacer

Los pasos están en la cabecera de la migración.
