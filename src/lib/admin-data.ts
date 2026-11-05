import "server-only"

import { cache } from "react"

import type { Plan } from "@/engine/accounts"
import { registroAbiertoPlataforma } from "@/engine/admin/ajustes"
import type { Rol } from "@/engine/empresas"
import { supabaseAdmin } from "@/engine/supabase-admin"
import { exigirAdmin } from "@/lib/admin"
import { pasoDe, type ConsumoDia, type Grupo } from "@/lib/consumo-data"
import { DISPLAY_TIMEZONE } from "@/lib/format"
import { costoUsd } from "@/lib/precios-claude"

/**
 * Lo que ve el panel de administracion. Mira todas las empresas, asi que todo
 * pasa por `exigirAdmin` antes de leer nada.
 *
 * El consumo y las metricas salen de funciones `admin_*` de Postgres, que ya
 * vienen sumadas; ninguna devuelve un secreto.
 */

export const DIAS_PANEL = 30

/** El limite de archivos del plan de Supabase. `ALMACENAMIENTO_LIMITE_MB` lo cambia al subir de plan. */
export const LIMITE_ALMACENAMIENTO = (Number(process.env.ALMACENAMIENTO_LIMITE_MB) || 1024) * 1024 * 1024

const DIA_MS = 86_400_000

export type EstadoClaude = "suscripcion" | "api" | "sin-conectar"

export type EmpresaPanel = {
  id: string
  name: string
  slug: string
  plan: Plan
  creada: string
  suspendidaEn: string | null
  suspensionMotivo: string | null
  miembros: number
  tokens: number
  usd: number
  /** Los tokens de los 30 dias anteriores, para comparar. */
  tokensAntes: number
  llamadas: number
  piezas: number
  publicadas: number
  programadas: number
  bytes: number
  ultimaActividad: string | null
  claude: EstadoClaude
  claudeDesde: string | null
  /** Claude rechazo la conexion en las ultimas 24 horas. */
  claudeConErrores: boolean
  serper: boolean
  instagram: boolean
  facebook: boolean
  linkedin: boolean
  fallos24: number
  grupos: Record<Grupo, number>
  dias: ConsumoDia[]
}

export type EmpresaDeUsuario = { accountId: string; nombre: string; rol: Rol; suspendida: boolean }

export type EstadoUsuario = "activo" | "pendiente" | "bloqueado"

export type UsuarioPanel = {
  id: string
  email: string
  alta: string
  ultimoIngreso: string | null
  estado: EstadoUsuario
  esAdmin: boolean
  adminDesde: string | null
  empresas: EmpresaDeUsuario[]
}

export type PasoPanel = {
  clave: string
  etiqueta: string
  modelo: string
  llamadas: number
  tokens: number
  usd: number
  /** Parte de la entrada que salio de cache, de 0 a 100. */
  cache: number
}

export type TipoFila = "plan" | "acceso" | "bloqueo" | "plataforma" | "sistema"

export type FilaActividad = {
  id: string
  at: string
  actor: string
  tipo: TipoFila
  accion: string
  sobre: string
  accountId: string | null
  detalle: string | null
  motivo: string | null
}

export type Atencion = {
  nivel: "urgente" | "revisar"
  quien: string
  texto: string
  href: string
}

export type Panel = {
  empresas: EmpresaPanel[]
  usuarios: UsuarioPanel[]
  dias: ConsumoDia[]
  pasos: PasoPanel[]
  actividad: FilaActividad[]
  atencion: Atencion[]
  totales: {
    tokens: number
    usd: number
    llamadas: number
    hoy: number
    hoyUsd: number
    semana: number
    semanaUsd: number
    cache: number
    piezas: number
    publicadas: number
    bytes: number
  }
  registroAbierto: boolean
}

type FilaConsumo = {
  account_id: string
  dia: string
  paso: string
  modelo: string
  llamadas: number
  entrada: number
  salida: number
  de_cache: number
  cache_escrita: number
}

type FilaMetricas = {
  account_id: string
  piezas_30: number
  publicadas_30: number
  programadas: number
  ultima_actividad: string | null
  claude: "api" | "suscripcion" | null
  claude_desde: string | null
  serper: boolean
  instagram: boolean
  facebook: boolean
  linkedin: boolean
}

type FilaFallo = { at: string; account_id: string; origen: string; error: string | null }

type UsuarioAuth = {
  id: string
  email?: string
  created_at: string
  last_sign_in_at?: string | null
  email_confirmed_at?: string | null
  invited_at?: string | null
  banned_until?: string | null
}

const vacio = (): Record<Grupo, number> => ({ analisis: 0, guion: 0, diseno: 0, otros: 0 })

/** Un error de autenticacion de Claude, sea cual sea el motor que lo cuente. */
const ES_ERROR_DE_CLAUDE = /\b401\b|authentication|invalid.*(token|api key|x-api-key)|token.*(vencid|inv[aá]lid|expir)/i

const diaEn = (fecha: Date) => fecha.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIMEZONE })

async function usuariosDeAuth(): Promise<UsuarioAuth[]> {
  const todos: UsuarioAuth[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`)
    todos.push(...(data.users as UsuarioAuth[]))
    if (data.users.length < 1000) break
  }
  return todos
}

async function consumo(desde: Date): Promise<FilaConsumo[]> {
  const filas: FilaConsumo[] = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabaseAdmin()
      .rpc("admin_consumo", { p_desde: desde.toISOString(), p_zona: DISPLAY_TIMEZONE })
      .range(pagina * 1000, pagina * 1000 + 999)
    if (error) throw new Error(`No se pudo leer el consumo: ${error.message}`)
    filas.push(...((data ?? []) as FilaConsumo[]))
    if ((data ?? []).length < 1000) break
  }
  return filas
}

function diasVacios(): ConsumoDia[] {
  const dias: ConsumoDia[] = []
  for (let i = DIAS_PANEL - 1; i >= 0; i--) dias.push({ dia: diaEn(new Date(Date.now() - i * DIA_MS)), ...vacio() })
  return dias
}

/** Todo lo del panel. Se arma una vez por peticion aunque varias partes lo pidan. */
export const cargarPanel = cache(async (): Promise<Panel> => {
  await exigirAdmin()
  const supabase = supabaseAdmin()
  const ahora = Date.now()

  const [cuentas, miembros, admins, usuariosAuth, filasConsumo, metricas, archivos, fallos, bitacora, registroAbierto] = await Promise.all([
    supabase.from("accounts").select("id, name, slug, plan, created_at, suspendida_en, suspension_motivo").order("created_at"),
    supabase.from("account_members").select("account_id, user_id, role"),
    supabase.from("platform_admins").select("user_id, created_at"),
    usuariosDeAuth(),
    consumo(new Date(ahora - 2 * DIAS_PANEL * DIA_MS)),
    supabase.rpc("admin_metricas_empresas"),
    supabase.rpc("admin_almacenamiento"),
    supabase.rpc("admin_fallos", { p_desde: new Date(ahora - DIAS_PANEL * DIA_MS).toISOString(), p_limite: 200 }),
    supabase.from("admin_actividad").select("id, at, actor, tipo, accion, sobre, account_id, detalle, motivo").order("at", { ascending: false }).limit(500),
    registroAbiertoPlataforma(),
  ])
  for (const r of [cuentas, miembros, admins, metricas, fallos, bitacora]) {
    if (r.error) throw new Error(`No se pudo leer el panel: ${r.error.message}`)
  }

  const filasCuentas = (cuentas.data ?? []) as {
    id: string
    name: string
    slug: string
    plan: Plan
    created_at: string
    suspendida_en: string | null
    suspension_motivo: string | null
  }[]
  const filasMiembros = (miembros.data ?? []) as { account_id: string; user_id: string; role: Rol }[]
  const filasAdmins = (admins.data ?? []) as { user_id: string; created_at: string }[]
  const porMetricas = new Map(((metricas.data ?? []) as FilaMetricas[]).map((m) => [m.account_id, m]))
  // Sin acceso a los archivos el panel sigue funcionando: solo esa cifra sale en cero.
  const filasArchivos = (archivos.error ? [] : (archivos.data ?? [])) as { account_id: string | null; bytes: number }[]
  const porArchivos = new Map(filasArchivos.map((a) => [a.account_id, Number(a.bytes)]))
  const filasFallos = (fallos.data ?? []) as FilaFallo[]
  const nombres = new Map(filasCuentas.map((c) => [c.id, c.name]))

  // ---- Consumo
  const hoy = diaEn(new Date(ahora))
  const dias30 = new Set(diasVacios().map((d) => d.dia))
  const dias7 = new Set(diasVacios().slice(-7).map((d) => d.dia))
  const diasTotal = new Map(diasVacios().map((d) => [d.dia, d]))
  const pasos = new Map<string, PasoPanel & { entrada: number; deCache: number }>()
  const porEmpresa = new Map<string, { tokens: number; usd: number; antes: number; llamadas: number; grupos: Record<Grupo, number>; dias: Map<string, ConsumoDia> }>()
  const empresaDe = (id: string) => {
    let e = porEmpresa.get(id)
    if (!e) {
      e = { tokens: 0, usd: 0, antes: 0, llamadas: 0, grupos: vacio(), dias: new Map(diasVacios().map((d) => [d.dia, d])) }
      porEmpresa.set(id, e)
    }
    return e
  }
  const t = { tokens: 0, usd: 0, llamadas: 0, hoy: 0, hoyUsd: 0, semana: 0, semanaUsd: 0, entrada: 0, deCache: 0 }

  for (const f of filasConsumo) {
    const entrada = Number(f.entrada)
    const salida = Number(f.salida)
    const deCache = Number(f.de_cache)
    const tokens = entrada + salida
    const e = empresaDe(f.account_id)
    if (!dias30.has(f.dia)) {
      e.antes += tokens
      continue
    }
    const usd = costoUsd({ modelo: f.modelo, entrada, salida, deCache, cacheEscrita: Number(f.cache_escrita) })
    const { etiqueta, grupo } = pasoDe(f.paso || null)
    const llamadas = Number(f.llamadas)

    e.tokens += tokens
    e.usd += usd
    e.llamadas += llamadas
    e.grupos[grupo] += tokens
    const delDia = e.dias.get(f.dia)
    if (delDia) delDia[grupo] += tokens
    const delDiaTotal = diasTotal.get(f.dia)
    if (delDiaTotal) delDiaTotal[grupo] += tokens

    t.tokens += tokens
    t.usd += usd
    t.llamadas += llamadas
    t.entrada += entrada
    t.deCache += deCache
    if (f.dia === hoy) {
      t.hoy += tokens
      t.hoyUsd += usd
    }
    if (dias7.has(f.dia)) {
      t.semana += tokens
      t.semanaUsd += usd
    }

    const modelo = f.modelo.replace(/^claude-/, "")
    const clave = `${f.paso}|${modelo}`
    const p = pasos.get(clave) ?? { clave, etiqueta, modelo, llamadas: 0, tokens: 0, usd: 0, cache: 0, entrada: 0, deCache: 0 }
    p.llamadas += llamadas
    p.tokens += tokens
    p.usd += usd
    p.entrada += entrada
    p.deCache += deCache
    pasos.set(clave, p)
  }

  // ---- Empresas
  const empresas: EmpresaPanel[] = filasCuentas.map((c) => {
    const m = porMetricas.get(c.id)
    const e = empresaDe(c.id)
    const fallosDe = filasFallos.filter((f) => f.account_id === c.id && new Date(f.at).getTime() >= ahora - DIA_MS)
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      plan: c.plan,
      creada: c.created_at,
      suspendidaEn: c.suspendida_en,
      suspensionMotivo: c.suspension_motivo,
      miembros: filasMiembros.filter((f) => f.account_id === c.id).length,
      tokens: e.tokens,
      usd: e.usd,
      tokensAntes: e.antes,
      llamadas: e.llamadas,
      piezas: Number(m?.piezas_30 ?? 0),
      publicadas: Number(m?.publicadas_30 ?? 0),
      programadas: Number(m?.programadas ?? 0),
      bytes: porArchivos.get(c.id) ?? 0,
      ultimaActividad: m?.ultima_actividad ?? null,
      claude: m?.claude ?? "sin-conectar",
      claudeDesde: m?.claude_desde ?? null,
      claudeConErrores: fallosDe.some((f) => ES_ERROR_DE_CLAUDE.test(f.error ?? "")),
      serper: Boolean(m?.serper),
      instagram: Boolean(m?.instagram),
      facebook: Boolean(m?.facebook),
      linkedin: Boolean(m?.linkedin),
      fallos24: fallosDe.length,
      grupos: e.grupos,
      dias: [...e.dias.values()],
    }
  })

  // ---- Usuarios
  const adminDe = new Map(filasAdmins.map((a) => [a.user_id, a.created_at]))
  const usuarios: UsuarioPanel[] = usuariosAuth
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(sin correo)",
      alta: u.created_at,
      ultimoIngreso: u.last_sign_in_at ?? null,
      estado: (u.banned_until && new Date(u.banned_until).getTime() > ahora ? "bloqueado" : u.email_confirmed_at ? "activo" : "pendiente") as EstadoUsuario,
      esAdmin: adminDe.has(u.id),
      adminDesde: adminDe.get(u.id) ?? null,
      empresas: filasMiembros
        .filter((f) => f.user_id === u.id)
        .map((f) => {
          const c = filasCuentas.find((x) => x.id === f.account_id)
          return { accountId: f.account_id, nombre: c?.name ?? "(sin nombre)", rol: f.role, suspendida: Boolean(c?.suspendida_en) }
        }),
    }))
    .sort((a, b) => a.email.localeCompare(b.email))

  // ---- Actividad: lo que hicieron las personas y lo que fallo solo.
  const actividad: FilaActividad[] = [
    ...((bitacora.data ?? []) as { id: number; at: string; actor: string; tipo: TipoFila; accion: string; sobre: string; account_id: string | null; detalle: string | null; motivo: string | null }[]).map((a) => ({
      id: `a${a.id}`,
      at: a.at,
      actor: a.actor,
      tipo: a.tipo,
      accion: a.accion,
      sobre: a.sobre,
      accountId: a.account_id,
      detalle: a.detalle,
      motivo: a.motivo,
    })),
    ...filasFallos.map((f, i) => ({
      id: `f${i}`,
      at: f.at,
      actor: "Sistema",
      tipo: "sistema" as const,
      accion: `Falló: ${f.origen}`,
      sobre: nombres.get(f.account_id) ?? "(empresa borrada)",
      accountId: f.account_id,
      detalle: f.error,
      motivo: null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  // ---- Lo que requiere atencion. Una empresa suspendida ya esta atendida.
  const bytes = filasArchivos.reduce((n, a) => n + Number(a.bytes), 0)
  const atencion: Atencion[] = []
  const activas = empresas.filter((e) => !e.suspendidaEn)
  for (const e of activas.filter((x) => x.claudeConErrores)) {
    atencion.push({ nivel: "urgente", quien: e.name, texto: "Claude rechazó su conexión. La generación puede estar detenida.", href: `/admin/empresas/${e.id}` })
  }
  for (const e of activas.filter((x) => x.fallos24 > 0 && !x.claudeConErrores)) {
    atencion.push({ nivel: "revisar", quien: e.name, texto: e.fallos24 === 1 ? "Un trabajo falló en 24 horas." : `${e.fallos24} trabajos fallaron en 24 horas.`, href: `/admin/empresas/${e.id}` })
  }
  for (const e of activas.filter((x) => x.claude === "sin-conectar")) {
    atencion.push({ nivel: "revisar", quien: e.name, texto: "Todavía no conecta Claude.", href: `/admin/empresas/${e.id}` })
  }
  for (const u of usuariosAuth) {
    const invitada = u.invited_at ?? u.created_at
    const dias = Math.floor((ahora - new Date(invitada).getTime()) / DIA_MS)
    if (!u.email_confirmed_at && dias >= 7) {
      atencion.push({ nivel: "revisar", quien: u.email ?? "(sin correo)", texto: `Invitación sin abrir hace ${dias} días.`, href: `/admin/usuarios?u=${u.id}` })
    }
  }
  if (bytes >= LIMITE_ALMACENAMIENTO * 0.8) {
    atencion.push({ nivel: bytes >= LIMITE_ALMACENAMIENTO * 0.95 ? "urgente" : "revisar", quien: "Almacenamiento", texto: `Va en ${Math.round((bytes / LIMITE_ALMACENAMIENTO) * 100)} % del límite.`, href: "/admin/empresas" })
  }
  atencion.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "urgente" ? -1 : 1))

  return {
    empresas,
    usuarios,
    dias: [...diasTotal.values()],
    pasos: [...pasos.values()]
      .map(({ entrada, deCache, ...p }) => ({ ...p, cache: entrada ? Math.round((deCache / entrada) * 100) : 0 }))
      .sort((a, b) => b.tokens - a.tokens),
    actividad,
    atencion,
    totales: {
      tokens: t.tokens,
      usd: t.usd,
      llamadas: t.llamadas,
      hoy: t.hoy,
      hoyUsd: t.hoyUsd,
      semana: t.semana,
      semanaUsd: t.semanaUsd,
      cache: t.entrada ? Math.round((t.deCache / t.entrada) * 100) : 0,
      piezas: empresas.reduce((n, e) => n + e.piezas, 0),
      publicadas: empresas.reduce((n, e) => n + e.publicadas, 0),
      bytes,
    },
    registroAbierto,
  }
})

/** Tamaños legibles: 412 MB, 1,2 GB. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("es-CO", { maximumFractionDigits: 2 })} GB`
  if (mb >= 1) return `${Math.round(mb)} MB`
  return bytes > 0 ? "<1 MB" : "0 MB"
}
