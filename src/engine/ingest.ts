import { expirarPendientesViejas } from "./content/expiry"
import { DIAS_DE_FRESCURA, esVieja } from "./content/frescura"
import { DEDUPE_FETCH_LIMIT, type SearchSpec } from "./config"
import { findDuplicateIds, type DedupeCandidate } from "./dedupe"
import { EventRecorder, type EventSink } from "./events"
import { dedupeByLink, toRows, type RawNewsInsert } from "./normalize"
import { searchNews } from "./serper"
import { supabaseAdmin } from "./supabase-admin"
import { getActiveSearches } from "./taxonomy"

export type SearchOutcome = {
  niche: string
  label: string
  /** Resultados devueltos por Serper tras filtrar los que no tienen link/titulo. */
  found: number
  error?: string
}

export type IngestionSummary = {
  runId: string | null
  startedAt: string
  endedAt: string
  durationMs: number
  searches: SearchOutcome[]
  /** Filas candidatas tras unir las busquedas y colapsar links repetidos. */
  candidates: number
  /** Filas realmente nuevas en la base (las repetidas las ignora el UNIQUE). */
  inserted: number
  /** Filas borradas por hablar del mismo hecho que otra del mismo dia. */
  duplicatesRemoved: number
  failedSearches: number
}

export type DryRunSummary = {
  startedAt: string
  durationMs: number
  searches: SearchOutcome[]
  candidates: number
  wouldInsert: number
  alreadyKnown: number
  failedSearches: number
}

export type RunOptions = {
  /** La cuenta para la que se ingiere. Cada una tiene su taxonomia y su corpus. */
  accountId: string
  signal?: AbortSignal
  /** Recibe cada evento en el momento en que ocurre (vista en vivo). */
  onEvent?: EventSink
}

/** Inicio del dia UTC, igual que el `created_at=gte.` que usaba n8n. */
function startOfTodayUtc(now: Date): string {
  return `${now.toISOString().split("T")[0]}T00:00:00.000Z`
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Corre las busquedas en paralelo y las convierte en filas candidatas.
 *
 * Cada busqueda esta aislada: si una falla, las demas siguen y el error queda
 * anotado. Es el comportamiento que tenian las ramas independientes de n8n,
 * pero aqui la falla es visible en vez de silenciosa.
 */
async function collectCandidates(
  accountId: string,
  specs: SearchSpec[],
  recorder: EventRecorder,
  signal?: AbortSignal
): Promise<{ searches: SearchOutcome[]; candidates: RawNewsInsert[] }> {
  if (specs.length === 0) {
    recorder.emit("search.failed", "Sin temas de noticias: no se buscó nada", {
      error: "Esta cuenta no tiene temas activos. Configúralos en la taxonomía del agente de extracción.",
    })
    return { searches: [], candidates: [] }
  }

  // En tandas de 4, no todas de golpe. Serper corta a 5 peticiones por segundo,
  // y un Promise.all sobre las ~70 busquedas de una cuenta las disparaba todas
  // a la vez: la mitad volvia con 429 y esa mitad del contenido no se traia.
  const results = await mapConLimite(specs, 4, async (spec) => {
      recorder.emit("search.started", `${spec.niche} · ${spec.label}`, { q: spec.q })
      try {
        const items = await searchNews(accountId, spec, signal)
        const rows = toRows(spec, items)
        recorder.emit("search.done", `${spec.niche} · ${spec.label}`, {
          found: rows.length,
          niche: spec.niche,
          titles: rows.slice(0, 5).map((row) => row.title),
        })
        return {
          outcome: { niche: spec.niche, label: spec.label, found: rows.length },
          rows,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recorder.emit("search.failed", `${spec.niche} · ${spec.label}`, { error: message })
        return {
          outcome: { niche: spec.niche, label: spec.label, found: 0, error: message },
          rows: [] as RawNewsInsert[],
        }
      }
    }
  )

  const candidates = dedupeByLink(results.flatMap((result) => result.rows))
  recorder.emit("harvest.done", `${candidates.length} candidatas tras unir busquedas`, {
    candidates: candidates.length,
  })

  return { searches: results.map((result) => result.outcome), candidates }
}

/**
 * Etapa 1 completa: abre la corrida, busca, inserta lo nuevo, elimina
 * duplicados del dia, dispara el analisis y cierra la corrida.
 */
export async function runIngestion(options: RunOptions): Promise<IngestionSummary> {
  const supabase = supabaseAdmin()
  const started = new Date()
  const accountId = options.accountId

  const { data: run, error: runError } = await supabase
    .from("pipeline_runs")
    .insert({ account_id: accountId, run_type: "research_engine", status: "running" })
    .select("id")
    .single()

  if (runError) throw new Error(`No se pudo abrir la corrida: ${runError.message}`)
  const runId = run.id as string

  const recorder = new EventRecorder(runId, options.onEvent, accountId)
  recorder.emit("run.started", "Corrida iniciada", { runId })

  try {
    const specs = await getActiveSearches(accountId)
    const { searches, candidates } = await collectCandidates(accountId, specs, recorder, options.signal)

    // `ignoreDuplicates` es un ON CONFLICT DO NOTHING sobre el UNIQUE de `link`,
    // equivalente al Prefer: resolution=ignore-duplicates de n8n. El .select()
    // devuelve solo las filas realmente insertadas, que es como contamos.
    let inserted = 0
    for (const batch of chunk(candidates, 500)) {
      const { data, error } = await supabase
        .from("raw_news")
        .upsert(
          // Lo viejo entra igual a la base, pero marcado: asi queda el rastro de
          // que se trajo y por que no se analizo, en vez de desaparecer.
          batch.map((fila) => ({
            ...fila,
            account_id: accountId,
            ...(esVieja(fila.date_serper) ? { status: "discarded_date" } : {}),
          })),
          { onConflict: "account_id,link", ignoreDuplicates: true }
        )
        .select("id")

      if (error) throw new Error(`Fallo al insertar noticias: ${error.message}`)
      inserted += data?.length ?? 0
    }
    recorder.emit("insert.done", `${inserted} noticias nuevas guardadas`, {
      inserted,
      diasDeFrescura: DIAS_DE_FRESCURA,
    })

    // Se mira el dia completo, no solo esta corrida: la corrida de la tarde debe
    // detectar que repite un hecho que ya trajo la de la manana.
    const { data: todayRows, error: fetchError } = await supabase
      .from("raw_news")
      .select("id, title, niche")
      .eq("account_id", accountId)
      .gte("created_at", startOfTodayUtc(started))
      .order("created_at", { ascending: true })
      .limit(DEDUPE_FETCH_LIMIT)

    if (fetchError) {
      throw new Error(`Fallo al leer las noticias de hoy: ${fetchError.message}`)
    }
    recorder.emit("dedupe.scanned", `${todayRows?.length ?? 0} noticias del dia revisadas`, {
      scanned: todayRows?.length ?? 0,
    })

    const duplicateIds = findDuplicateIds((todayRows ?? []) as DedupeCandidate[])

    let duplicatesRemoved = 0
    for (const batch of chunk(duplicateIds, 100)) {
      const { error } = await supabase.from("raw_news").delete().in("id", batch)
      if (error) throw new Error(`Fallo al borrar duplicados: ${error.message}`)
      duplicatesRemoved += batch.length
    }
    recorder.emit("dedupe.removed", `${duplicatesRemoved} duplicados eliminados`, {
      removed: duplicatesRemoved,
    })

    // --- Analisis ---
    // La ingesta ya no analiza: solo deja las noticias en `pending_analysis` y
    // saca de la cola lo caducado. El analisis lo hace el tick, que pasa cada
    // cinco minutos y las investiga y puntua en tandas cortas con Claude.

    const caducadas = await expirarPendientesViejas(accountId)
    if (caducadas > 0) {
      recorder.emit("dedupe.removed", `${caducadas} pendientes caducadas sacadas de la cola`, {
        expired: caducadas,
      })
    }

    const ended = new Date()
    const { error: completeError } = await supabase
      .from("pipeline_runs")
      .update({
        ended_at: ended.toISOString(),
        status: "completed",
        raw_inserted: inserted,
        duplicates_removed: duplicatesRemoved,
      })
      .eq("id", runId)

    if (completeError) {
      throw new Error(`No se pudo cerrar la corrida: ${completeError.message}`)
    }

    recorder.emit("run.completed", "Corrida completada", {
      inserted,
      duplicatesRemoved,
      durationMs: ended.getTime() - started.getTime(),
    })
    await recorder.flush()

    return {
      runId,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationMs: ended.getTime() - started.getTime(),
      searches,
      candidates: candidates.length,
      inserted,
      duplicatesRemoved,
      failedSearches: searches.filter((search) => search.error).length,
    }
  } catch (error) {
    // n8n dejaba la corrida colgada en "running" para siempre si algo fallaba.
    const message = error instanceof Error ? error.message : String(error)
    recorder.emit("run.failed", "Corrida fallida", { error: message })
    await recorder.flush()

    await supabase
      .from("pipeline_runs")
      .update({
        ended_at: new Date().toISOString(),
        status: "failed",
        error_message: message.slice(0, 2000),
      })
      .eq("id", runId)

    throw error
  }
}

/**
 * Ensayo sin efectos: corre las busquedas de verdad y reporta que pasaria, pero
 * no abre corrida, no inserta y no borra.
 */
export async function dryRunIngestion(
  options: { accountId: string; signal?: AbortSignal; onEvent?: EventSink }
): Promise<DryRunSummary> {
  const supabase = supabaseAdmin()
  const started = new Date()
  const recorder = new EventRecorder(null, options.onEvent)

  recorder.emit("run.started", "Ensayo en seco iniciado")
  const specs = await getActiveSearches(options.accountId)
  const { searches, candidates } = await collectCandidates(options.accountId, specs, recorder, options.signal)

  const known = new Set<string>()
  for (const batch of chunk(candidates.map((row) => row.link), 40)) {
    const { data, error } = await supabase
      .from("raw_news")
      .select("link")
      .eq("account_id", options.accountId)
      .in("link", batch)
    if (error) throw new Error(`Fallo al comprobar links existentes: ${error.message}`)
    for (const row of data ?? []) known.add((row as { link: string }).link)
  }

  const alreadyKnown = candidates.filter((row) => known.has(row.link)).length
  recorder.emit("run.completed", "Ensayo completado (no se escribio nada)", {
    wouldInsert: candidates.length - alreadyKnown,
  })

  return {
    startedAt: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    searches,
    candidates: candidates.length,
    wouldInsert: candidates.length - alreadyKnown,
    alreadyKnown,
    failedSearches: searches.filter((search) => search.error).length,
  }
}


/**
 * Corre `fn` sobre cada item con como mucho `limite` en vuelo a la vez.
 *
 * Un `Promise.all` lanza todo de golpe; esto mantiene una ventana. Sirve para
 * no rebasar el limite de peticiones por segundo de un proveedor sin serializar
 * del todo, que seria mas lento sin necesidad.
 */
async function mapConLimite<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const salida: R[] = new Array(items.length)
  let siguiente = 0

  async function trabajador(): Promise<void> {
    while (siguiente < items.length) {
      const i = siguiente++
      salida[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador))
  return salida
}
