# Futuro local

Notas de exploración (2026-10-19). **No hay nada implementado**: es lo que se
entendió al comparar Hancel con `pomelli chimbo` (Content HB) y las preguntas que
salieron. Sirve para retomar la decisión.

---

## La idea

Que el análisis y la generación de posts los haga el **CLI de Claude** (`claude -p`)
con el mínimo de harness, usando la sesión ya iniciada en el computador, y no el
token `sk-ant-oat01` pegado en la base (que se ha revocado dos veces). Y, si se
quiere, que todo corra en local.

## Cómo lo hace pomelli (referencia)

- **Datos:** SQLite (`data/app.db`, Prisma) y carpetas por marca. Nada de nube.
- **Una puerta al modelo:** `generate(role, prompt, input, zodSchema)` en
  `packages/llm/generate.ts`. Valida con Zod y reintenta con el error como feedback.
- **CLI sin harness** (`packages/llm/providers/cli.ts`):
  `claude -p --output-format json --model <m> --max-turns 1 --tools ""`
  `--system-prompt-file prompts/x.md --setting-sources "" --strict-mcp-config`
  `--disable-slash-commands --no-session-persistence --max-budget-usd <n>`
  - El prompt entra por stdin; la respuesta sale en el campo `result`.
  - cwd limpio (sin `CLAUDE.md`). Modelo siempre explícito.
  - Costo medido por ellos: ~70k tokens de entrada con herramientas, ~3k con
    `--tools ""`, ~860 en modo mínimo.
- **Cola y worker:** tabla `Job` + `worker/index.ts` (sondea cada 2 s): reintentos
  con espera, tope diario de llamadas/USD, pausa y reanuda, un solo worker por
  carpeta de datos, y `Job.result.paid` para no pagar dos veces.
- Es de **una sola persona**, escucha en 127.0.0.1.

## Cómo está Hancel hoy

- `llamarClaude` (`src/engine/claude/messages.ts`) hace `fetch` a la Messages API
  con el token OAuth de la suscripción y le inyecta "You are Claude Code…".
  Lo llaman 16 sitios, **todos por esa función**: es el punto único de cambio.
- Corre en Vercel (límite 60 s, de ahí `PRESUPUESTO_POR_TICK = 1`), disparado por
  `pg_cron`/`pg_net` desde Postgres.
- Postgres con arrays, jsonb, índices parciales y `for update skip locked`;
  ~375 consultas estilo supabase-js. Reescribir a SQLite sería enorme.

## Plan por fases (propuesto)

1. **IA por el CLI.** Cambiar el cuerpo de `llamarClaude` (`LLM_PROVIDER=cli|api`)
   para llamar a `claude -p` con los flags de arriba. Misma firma → los 16 sitios
   no cambian. Con tope diario y cwd temporal. Pendientes de mapear:
   `buscarWeb` (→ `--tools WebSearch` y más turnos) e imágenes por URL (→ bajarlas
   y leerlas con `Read`). Funciona aunque la base siga en InsForge.
2. **Base local.** Postgres + PostgREST en Docker (no SQLite): el adaptador de
   `supabase-admin.ts` hablaría directo con PostgREST y las consultas y el esquema
   quedan igual. Hace falta un `schema.sql` que corra desde cero (el actual no),
   storage en carpeta servido por `/api/archivo`, y entrar sin login en 127.0.0.1.
3. **Worker local** que reemplaza a `pg_cron`: llama a los `/api/*/tick` con
   `INGEST_SECRET`, sin el límite de 60 s. Los triggers de `pg_net` sobran.

Sigue siendo externo (necesita internet y llaves): Serper, Pexels, Buffer, LinkedIn
y Composio (texto de noticias, Canva, Meta).

## Preguntas y respuestas

**¿Si apago el computador, todo deja de funcionar?** Sí, en modo 100% local: no se
extrae, analiza, genera ni publica a las horas programadas.
- *Sin verificar:* si al volver a encender se recupera una hora de publicación
  perdida.
- *Sin verificar:* Instagram/Facebook salen por Buffer y el esquema tiene `due_at` y
  estado `programada`; si Buffer guarda esos posts en su cola, los ya entregados
  saldrían con el computador apagado. LinkedIn (API directa) no. Revisar
  `studio/publicar.ts` y `publish/meta.ts`.

**¿Lo generado solo existe en mi computador?** Depende de la base:
- Base local → solo tú (127.0.0.1), salvo un túnel (cloudflared está instalado) y
  entonces el computador debe estar prendido.
- Base en la nube → el equipo lo ve desde cualquier lado; el computador solo genera.
- Pomelli es de un usuario; Hancel ya tiene cuentas, miembros y roles.

**¿Se puede usar el CLI con la app desplegada en Vercel?** No directamente: no hay
`claude` ni sesión en las funciones, el disco no es persistente, hay límites de
60–300 s y la sesión es un login personal. Sí con un híbrido:

```
Vercel (dashboard)  ──►  Base en la nube  ◄──  Máquina con el CLI (worker)
```

Es el patrón buzón que Hancel ya tiene (`jobs_angle`, `jobs_linkedin`,
`jobs_instagram`), con el worker local en el papel que hacía la rutina en la nube.
Costos: un solo ejecutor (apagar los crons de Vercel para los pasos de IA), los
botones "generar ahora" del dashboard tendrían que encolar y esperar al worker, y el
worker necesita una máquina prendida con la sesión abierta. En un servidor/VPS la
sesión correría desde IP de datacenter (el riesgo de revocación de
`MIGRACION-IA-CLAUDE.md`).

## Recomendación

Híbrido: dashboard en Vercel + base en la nube (para que el equipo entre), un worker
con el CLI en un computador de Plogy que quede prendido, y la ruta por API key como
respaldo cuando el worker esté caído. El modo 100% local queda para pruebas.

## Decisiones abiertas

1. ¿El worker corre en un portátil o hay un computador que pueda quedar prendido
   siempre?
2. ¿Empezar por la fase 1 (CLI sobre la base actual) o ir directo a base local?
3. ¿La ejecución automática con la suscripción está cubierta por sus términos?
   (No lo sé; conviene confirmarlo.) ¿Se deja API key de respaldo?
4. ¿Local solo hasta dejar los posts listos para revisar, o también publica desde
   el computador?

## Estado de la máquina (2026-10-19)

- Claude Code 2.1.286, sesión iniciada (claude.ai).
- Docker 29.7.2 instalado; el daemon no respondió (abrir Docker Desktop).
