import { PostgrestClient } from "@supabase/postgrest-js"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * El cliente del motor, ahora contra InsForge.
 *
 * El codigo sigue hablando el dialecto de supabase-js (`.from().select()`,
 * `.rpc()`, `.storage`, `.auth.admin`) y este modulo lo traduce:
 *
 *   - Base de datos: InsForge expone PostgREST tal cual bajo
 *     `/api/database/records/{tabla}` y `/api/database/rpc/{fn}`, asi que se usa
 *     el mismo PostgrestClient de supabase-js con un fetch que reescribe la ruta.
 *     Las inserciones van siempre en arreglo (InsForge lo exige).
 *   - Storage: subir, url publica, listar y borrar sobre `/api/storage`.
 *   - auth.admin: los tres metodos que usa `empresas.ts`.
 *
 * Usa la API key del proyecto (acceso total): solo en el servidor. No importa
 * "server-only" porque el motor tambien corre fuera de Next (`npm run ingest`).
 *
 * NUNCA importar este modulo desde un Client Component.
 */
let cached: SupabaseClient | null = null

function credenciales() {
  const url = process.env.INSFORGE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL
  const key = process.env.INSFORGE_API_KEY
  if (!url || !key) {
    throw new Error("Faltan INSFORGE_URL y/o INSFORGE_API_KEY. Copia .env.example a .env.local.")
  }
  return { url: url.replace(/\/$/, ""), key }
}

/** fetch de PostgREST -> rutas de InsForge. */
function fetchInsforge(base: string, key: string): typeof fetch {
  return async (input, init) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const ruta = u.pathname.replace(/^\/+/, "")
    const rpc = /^rpc\/(.+)$/.exec(ruta)
    const destino = `${base}${rpc ? `/api/database/rpc/${rpc[1]}` : `/api/database/records/${ruta}`}${u.search}`
    const headers = new Headers(init?.headers)
    headers.set("Authorization", `Bearer ${key}`)
    let body = init?.body
    if (!rpc && (init?.method ?? "GET").toUpperCase() === "POST" && typeof body === "string" && body.trimStart().startsWith("{")) {
      body = `[${body}]`
    }
    return fetch(destino, { ...init, headers, body })
  }
}

type Resultado<T> = { data: T; error: { message: string } | null }

async function pedir(base: string, key: string, ruta: string, init: RequestInit = {}): Promise<Resultado<unknown>> {
  try {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${key}`)
    const r = await fetch(`${base}${ruta}`, { ...init, headers })
    const texto = await r.text()
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = texto
    }
    if (!r.ok) {
      const m = (json as { message?: string; error?: string } | null)?.message ?? (json as { error?: string } | null)?.error ?? `HTTP ${r.status}`
      return { data: null, error: { message: String(m) } }
    }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
  }
}

/** La URL publica de la app, desde la que se sirven los archivos del bucket. */
const urlApp = () => (process.env.APP_URL ?? "https://app.hancel.xyz").replace(/\/$/, "")

/** La ruta de un objeto con cada tramo codificado, pero con sus "/". */
const rutaObjeto = (ruta: string) => ruta.split("/").map(encodeURIComponent).join("/")

function storage(base: string, key: string) {
  return {
    from(bucket: string) {
      return {
        async upload(ruta: string, cuerpo: Buffer | Uint8Array | ArrayBuffer | Blob, opciones?: { contentType?: string; upsert?: boolean }) {
          const tipo = opciones?.contentType ?? "application/octet-stream"
          const blob = cuerpo instanceof Blob ? cuerpo : new Blob([cuerpo as BlobPart], { type: tipo })
          const form = new FormData()
          form.append("file", blob, ruta.split("/").pop() || "archivo")
          const r = await pedir(base, key, `/api/storage/buckets/${bucket}/objects/${rutaObjeto(ruta)}`, { method: "PUT", body: form })
          return { data: r.error ? null : { path: ruta }, error: r.error }
        },
        getPublicUrl(ruta: string) {
          // Servido por la app (app/api/archivo): el storage responde con una
          // redireccion que Canva no sigue, y los .html no los da como pagina.
          return { data: { publicUrl: `${urlApp()}/api/archivo/${rutaObjeto(ruta)}` } }
        },
        async list(prefijo = "", opciones?: { limit?: number }) {
          const p = prefijo ? `${prefijo.replace(/\/$/, "")}/` : ""
          const q = new URLSearchParams({ prefix: p, limit: String(opciones?.limit ?? 1000) })
          const r = await pedir(base, key, `/api/storage/buckets/${bucket}/objects?${q}`)
          if (r.error) return { data: null, error: r.error }
          const d = r.data as { data?: { key: string }[]; objects?: { key: string }[] } | { key: string }[]
          const objetos = Array.isArray(d) ? d : (d.data ?? d.objects ?? [])
          return { data: objetos.map((o) => ({ name: o.key.slice(p.length) })).filter((o) => o.name && !o.name.includes("/")), error: null }
        },
        async remove(rutas: string[]) {
          const errores: string[] = []
          for (const ruta of rutas) {
            const r = await pedir(base, key, `/api/storage/buckets/${bucket}/objects/${rutaObjeto(ruta)}`, { method: "DELETE" })
            if (r.error) errores.push(r.error.message)
          }
          return { data: null, error: errores.length ? { message: errores.join("; ") } : null }
        },
      }
    },
  }
}

type UsuarioIF = { id: string; email: string }

function authAdmin(base: string, key: string) {
  return {
    admin: {
      async getUserById(id: string) {
        const r = await pedir(base, key, `/api/auth/users/${id}`)
        const u = (r.data as { user?: UsuarioIF } & UsuarioIF | null) ?? null
        return { data: { user: u ? (u.user ?? u) : null }, error: r.error }
      },
      async listUsers({ page = 1, perPage = 1000 }: { page?: number; perPage?: number } = {}) {
        const r = await pedir(base, key, `/api/auth/users?offset=${(page - 1) * perPage}&limit=${perPage}`)
        const d = r.data as { data?: UsuarioIF[]; users?: UsuarioIF[] } | UsuarioIF[] | null
        const users = Array.isArray(d) ? d : (d?.data ?? d?.users ?? [])
        return { data: { users }, error: r.error }
      },
      async createUser({ email, password }: { email: string; password: string; email_confirm?: boolean }) {
        const r = await pedir(base, key, `/api/auth/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
        const u = (r.data as { user?: UsuarioIF } | null)?.user ?? null
        return { data: { user: u }, error: r.error ?? (u ? null : { message: "InsForge no devolvio el usuario" }) }
      },
    },
  }
}

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const { url, key } = credenciales()
  const db = new PostgrestClient("http://insforge.local", { fetch: fetchInsforge(url, key) })
  cached = {
    from: (tabla: string) => db.from(tabla),
    rpc: (fn: string, args?: object, opciones?: object) => db.rpc(fn, args, opciones),
    storage: storage(url, key),
    auth: authAdmin(url, key),
  } as unknown as SupabaseClient
  return cached
}
