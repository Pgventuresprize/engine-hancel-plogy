# Campañas de video dentro de Plogy

Entrada: `/campanas-video`. Usa el mismo DashboardShell, autenticación, cuenta activa,
configuración de zona horaria y perfil/ejemplos de marca del producto.

## Restricción de integración

Esta entrega solo añade archivos. No cambia ningún archivo existente de Engine Hancel:
ni rutas, navegación global, carruseles, chat, calendario, dependencias, configuración,
secretos ni trabajos previos. La nueva pantalla enlaza los módulos existentes.
Por esa restricción, el chat anterior y el menú lateral anterior no reciben botones
ni herramientas nuevas; el pedido de videos se escribe dentro de esta pantalla.
La planificación y los estados de producción nuevos viven aquí, con acceso al
tablero y calendario anteriores. Los videos históricos conservan su circuito.

No se hizo un merge de dos aplicaciones completas. Se portaron y reformaron las
responsabilidades útiles del proyecto `content-orchestrator-plogy-v2`:
descubrimiento con Apify, normalización de métricas, transcripción y contratos
editoriales. Referencia de procedencia: commit
`825f0af3337303595be49299fe6912532db5fbf6`.
No se incorporaron su servidor, autenticación ni almacenamiento.

## Recorrido

1. Pedido libre o formulario: varios temas y pesos, fechas, cantidad de videos base,
   porcentajes, audiencia, oferta, CTA, material real y canales.
2. Reparto determinista por restos mayores. Diez videos 60/20/20 producen seis
   réplicas, dos adaptaciones y dos originales. Los captions no suman videos.
3. Réplica → descubrimiento/selección → extracción → escritura fiel → revisión
   de fidelidad y evidencia. Una referencia elegida evita los filtros de popularidad.
   La dificultad de producción jamás es criterio de descarte.
4. Adaptación/noticia → investigación existente de carruseles (Composio y lectura
   de citas, reutilizadas sin modificar) → dossier → escritura → revisión.
5. Original → tres conceptos ordenados por especificidad, interés y oferta →
   escritura del primero, con elección manual alternativa → revisión de conversión.
6. Cada pieza contiene libreto, planos y tiempos, instrucciones de producción,
   captions por canal, evidencia, traducción y cambios cuando corresponden.
7. La revisión combina validaciones deterministas con una llamada editorial
   independiente. Admite una corrección automática; una edición manual se revisa
   sin sobrescribirla. Las versiones se conservan al cambiar el libreto.

No existe un score que prometa viralidad. La revisión comprueba el contrato editorial;
la viralidad/conversión efectiva requiere resultados de publicaciones reales.

## Descubrimiento y extracción

- TikTok: `clockworks/tiktok-scraper`, búsqueda de videos, 30 resultados.
- Instagram: `apify/instagram-hashtag-scraper`, keywordSearch + reels, 30 resultados.
- La consulta usa nombre y enfoque del tema, máximo 180 caracteres.
- Filtro inicial de referencias descubiertas: 60.000 vistas, 1.000 likes, hasta
  90 días cuando existe fecha. Deduplicación por URL, exclusión de anuncios y
  carruseles detectados; selección temática desde el texto disponible.
- Métricas faltantes permanecen null. Se preservan comentarios, compartidos y fechas.
  Estos umbrales están declarados en `references.ts`; no se venden como prueba de
  viralidad ni como rendimiento relativo al tamaño de la cuenta.
- Selección explícita: sin umbrales y sin filtro de facilidad. Una cobertura
  insuficiente queda visible y no cambia automáticamente la mezcla.
- TikTok: primero subtítulos públicos con `automation-lab/tiktok-transcript-scraper`.
  Si falla o no hay voz, segundo extractor Clockworks con transcripción de audio y
  descripción visual. Instagram usa `instagram-reel-scraper` con includeTranscript.
- Sin voz recuperable se conserva la referencia y se pide transcripción, sin
  inventar fragmentos. Se puede pegar el texto para continuar sin otra corrida.
- La descripción visual solo se considera observada si el proveedor la devolvió;
  las demás instrucciones visuales son propuestas de producción, no una afirmación
  de haber visto el video completo.
- Caché por cuenta/actor/entrada: búsquedas en ventanas de 24 h, transcripciones
  en ventanas de 30 días. Se guardan IDs de corridas y resultados. Una respuesta
  incierta al iniciar no se relanza automáticamente para evitar doble gasto.

## Activación

1. Desplegar los archivos nuevos en el proyecto existente.
2. Aplicar una vez, mediante el SQL Editor o el flujo habitual de migraciones,
   `supabase/migraciones/2026-11-04-vc2-campanas-video.sql` sobre el mismo Supabase.
   Es transaccional y repetible. Solo crea tablas/funciones/índices `vc2_*` y un
   cron propio; lee `accounts`, Vault y las conexiones existentes sin cambiarlos.
3. Requiere las extensiones existentes pg_net, pg_cron y Vault y los secretos
   `ingest_url` (URL del endpoint /api/ingest de esta aplicación) e
   `ingest_secret`. Deben apuntar a la aplicación desplegada, no a una preview.
   No aplicar si esos prerrequisitos no existen: resolverlos por el procedimiento
   habitual del administrador, sin editar los trabajos del motor anterior.
4. Claude reutiliza la conexión y modelo de cada cuenta. También admite
   ANTHROPIC_API_KEY del servidor si ya está configurada. Noticias reutiliza la
   conexión Composio del motor actual.
5. Conectar Apify desde esta pantalla (se cifra en vc2_settings), o usar APIFY_TOKEN
   del servidor. El cifrado usa VIDEO_CAMPAIGN_ENCRYPTION_KEY si está configurada,
   o INGEST_SECRET existente. No cambia ninguna credencial del motor anterior.
6. Abrir `/campanas-video` con una cuenta Advance y ejecutar un piloto.

Sin migración, solo el módulo nuevo muestra el aviso de activación. No se deben
copiar variables de preview de diseño a producción:
`VIDEO_CAMPAIGNS_PREVIEW=1` solo funciona bajo NODE_ENV=development.

Apify factura por actor, resultados y complementos. El límite de corridas es un
límite de inicios, no un límite monetario: la transcripción y análisis visual pueden
tener cargos por duración. Default 12, configurable entre 0 y 40 por campaña.
Las búsquedas paralelas comparten presupuesto de forma atómica.

## Cola, seguridad y operaciones

Tablas nuevas: vc2_campaigns, vc2_pieces, vc2_jobs, vc2_versions, vc2_sources,
vc2_settings. RLS habilitado, sin lectura/escritura directa para anon/authenticated;
solo server actions con cuenta activa y service_role. Cada operación comprueba
cuenta, versión y pertenencia. Las URLs de referencia son canónicas y HTTPS.

El nuevo endpoint `POST /api/videos/tick/campanas` reutiliza la autorización
del motor, dentro del prefijo que el proxy existente ya admite.
Cada pasada reclama una fase con lease de 360 segundos, máximo dos trabajos activos
por cuenta. pg_net despierta la siguiente pasada y un cron propio recupera cada minuto.
Los sondeos correctos no consumen reintentos de recuperación.
Pausar impide nuevos reclamos y la publicación de resultados de fases en vuelo.
El almacenamiento de cada transición comprueba lease y revisión de forma atómica.

Para desactivar el módulo: pausar sus campañas y, si hace falta, desprogramar
exclusivamente el cron llamado `vc2_campaign_recovery`. Revertir el commit de la
integración quita únicamente archivos nuevos. Conservar las tablas vc2 y sus datos;
no es necesario eliminarlas para recuperar la aplicación anterior.
Nunca desprogramar crons ni modificar tablas del motor existente.

## Verificación

Con Node 24 y las dependencias del lockfile existente:

```powershell
node --import tsx --test scripts/video-campaigns.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/engine/video-campaigns src/components/video-campaigns src/app/campanas-video src/app/api/videos/tick/campanas scripts/video-campaigns.test.ts scripts/video-campaigns-additive.mjs scripts/video-campaigns-storage.test.mjs
npm run build
node scripts/video-campaigns-additive.mjs <SHA-base-anterior-a-la-integracion>
```

La prueba SQL usa PostgreSQL embebido PGlite, instalado fuera del repositorio
para conservar intactos package.json y el lockfile:

```powershell
npm install --prefix <directorio-temporal> --no-audit --no-fund @electric-sql/pglite
$env:VC_PGLITE_ROOT='<directorio-temporal>'
node --test scripts/video-campaigns-storage.test.mjs
```

Cubre migración repetida, permisos, aislamiento, idempotencia, leases, sondeo,
presupuesto, edición, versiones, pausa y conservación de datos previos.
El fixture reemplaza Vault/pg_net/cron con dobles aislados; no prueba esos servicios
reales. El build puede requerir las variables habituales de Supabase para las
páginas existentes. Usar valores ficticios solo prueba compilación, nunca conexión.

Piloto pendiente al disponer del almacenamiento y conexiones reales: varias
temáticas y las tres modalidades; referencia compleja seleccionada, transcripción,
calidad de libreto/captions, guía de ejecución, latencia y consumo de servicios.
Las pruebas sintéticas y de interfaz no sustituyen esa evaluación editorial real.
