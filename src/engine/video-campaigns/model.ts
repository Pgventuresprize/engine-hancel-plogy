import { CampaignActionError } from "./action-result"
import { parseModelObject } from "./json-response"
// Contratos exclusivos del módulo aditivo; no cambian tipos del motor existente.
export const MODES = ["replica", "adaptacion", "original"] as const
export type Mode = typeof MODES[number]
export const MODE_LABEL: Record<Mode, string> = { replica: "Réplica", adaptacion: "Adaptación / noticia", original: "Original" }
export const OBJECTIVE: Record<Mode, string> = { replica: "Awareness", adaptacion: "Confianza", original: "Conversión" }
export const CHANNELS = ["instagram", "linkedin", "tiktok"] as const
export type Channel = typeof CHANNELS[number]
export type Topic = { name: string; focus: string; weight: number; references: string[] }
export type Brief = {
  name: string; request: string; topics: Topic[]; count: number; mix: Record<Mode, number>
  start: string; end: string; audience: string; offer: string; cta: string
  channels: Channel[]; duration: number; material: string; maxRuns: number
}
export type Reference = {
  url: string; author: string; platform: "TIKTOK" | "INSTAGRAM"; caption: string
  views: number | null; likes: number | null; comments: number | null; shares: number | null
  publishedAt: string | null; capturedAt: string; selectedByUser: boolean
}
export type Source = { url: string; title: string; text: string }
export type Concept = { title: string; premise: string; tension: string; demonstration: string; payoff: string; conversion: string }
export type Shot = { start: number; end: number; visual: string; voice: string; text: string }
export type Claim = { text: string; kind: "fact" | "hypothesis" | "experience"; source: string; evidence: string }
export type Script = {
  title: string; hook: string; conclusion: string; cta: string; narration: string; shots: Shot[]
  captions: Partial<Record<Channel, string>>; production: string[]; claims: Claim[]
  changes: { original: string; final: string; reason: string }[]; translation: string; pending: string[]
}
export type Finding = { rule: string; level: "block" | "warning"; quote: string; detail: string; fix: string }
export type Review = { findings: Finding[]; decision: "ready" | "revision"; model: string; date: string }
export type Phase = "discover" | "extract" | "research" | "concept" | "write" | "review" | "done"
export type Piece = {
  id: string; campaignId: string; order: number; topic: number; mode: Mode; objective: string
  phase: Phase; date: string; reference: Reference | null; candidates: Reference[]
  transcript: string; language: string; sourceDuration: number | null; runs: { id: string; purpose: string }[]
  sources: Source[]; dossier: string; concepts: Concept[]; script: Script | null; review: Review | null
  status: "queued" | "working" | "revision" | "ready" | "error"; error: string
  edits: boolean; correctionCount: number; model: string; usage: { input: number; output: number }; ctaOverride?: string; instruction?: string
  productionStatus: "guion" | "grabando" | "editando" | "terminado"; videoUrl: string
  discovery?: { query:string; historical:boolean; searched:boolean; forceSearch:boolean; warnings:string[] }
}
export type Campaign = { id: string; account_id: string; config: Brief; brand: Brand; paused: boolean; created_at: string; runs_started?:number }
export type Brand = { name: string; language: string; identity: string; voice: string; avoid: string; rules: string; examples: { text: string; why: string }[] }
export type PieceRow = { id: string; account_id: string; campaign_id: string; revision: number; payload: Piece }
export type CampaignView = Campaign & { pieces: PieceRow[] }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function text(value: unknown, max = 6000): string { return typeof value === "string" ? value.trim().slice(0, max) : "" }
function integer(value: unknown, min: number, max: number, label: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw new CampaignActionError(`${label}: usa un entero entre ${min} y ${max}.`)
  return n
}
export function referenceUrl(value: unknown): string {
  const s = text(value, 1000)
  let u: URL
  try { u = new URL(s) } catch { throw new CampaignActionError("La referencia necesita un enlace completo de TikTok o Instagram.") }
  const h = u.hostname.toLowerCase().replace(/^www\./, "")
  if (u.protocol !== "https:" || u.port || u.username || u.password || !["tiktok.com", "instagram.com"].includes(h)) throw new CampaignActionError("Usa el enlace https canónico del video de TikTok o Instagram.")
  if (h === "tiktok.com" && !/^\/@[^/]+\/video\/\d+\/?$/.test(u.pathname)) throw new CampaignActionError("Usa el enlace completo de TikTok, con /@autor/video/id.")
  if (h === "instagram.com" && !/^\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)) throw new CampaignActionError("Usa el enlace del reel de Instagram.")
  return `https://www.${h}${u.pathname.replace(/\/$/, "")}/`
}
export function validateBrief(input: unknown): Brief {
  if (!input || typeof input !== "object") throw new CampaignActionError("Falta la campaña.")
  const o = input as Record<string, unknown>
  const topics = (Array.isArray(o.topics) ? o.topics : []).map((v): Topic => {
    const t = v as Record<string, unknown>
    const name = text(t.name, 120)
    if (!name) throw new CampaignActionError("Cada tema necesita un nombre.")
    return { name, focus: text(t.focus, 1500), weight: integer(t.weight ?? 1, 1, 100, "Prioridad"), references: [...new Set((Array.isArray(t.references) ? t.references : []).map(referenceUrl))].slice(0, 35) }
  })
  if (!topics.length || topics.length > 20) throw new CampaignActionError("Incluye entre uno y veinte temas.")
  const m = (o.mix ?? {}) as Record<string, unknown>
  const mix = Object.fromEntries(MODES.map(k => [k, integer(m[k], 0, 100, "Porcentaje")])) as Record<Mode, number>
  if (MODES.reduce((n, k) => n + mix[k], 0) !== 100) throw new CampaignActionError("La mezcla debe sumar 100 %.")
  const date = (v: unknown) => {
    const d = text(v, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + "T12:00:00Z")) || new Date(d + "T12:00:00Z").toISOString().slice(0, 10) !== d) throw new CampaignActionError("Revisa las fechas.")
    return d
  }
  const start = date(o.start), end = date(o.end)
  const days = (Date.parse(end) - Date.parse(start)) / 86400000
  if (days < 0 || days > 90) throw new CampaignActionError("El periodo debe durar entre uno y 91 días.")
  const channels = [...new Set((Array.isArray(o.channels) ? o.channels : []).filter((c): c is Channel => CHANNELS.includes(c as Channel)))]
  if (!channels.length) throw new CampaignActionError("Elige al menos un canal.")
  const count = integer(o.count, 1, 35, "Cantidad")
  if(new Set(topics.flatMap(t=>t.references)).size>quotas(count,mix).replica)throw new CampaignActionError("Hay más referencias elegidas que cupos de réplica. Aumenta la cantidad o el porcentaje de réplicas para conservarlas todas.")
  const audience = text(o.audience, 1500)
  if (!audience) throw new CampaignActionError("Indica a quién le hablamos.")
  return { name: text(o.name, 120) || topics.map(t => t.name).join(" · ").slice(0, 120), request: text(o.request, 12000), topics, count, mix, start, end, audience, offer: text(o.offer, 2000), cta: text(o.cta, 1000), channels, duration: integer(o.duration ?? 45, 10, 180, "Duración orientativa"), material: text(o.material, 20000), maxRuns: integer(o.maxRuns ?? 12, 0, 40, "Límite de corridas Apify") }
}
// Restos mayores: conserva el total incluso con pocas piezas y porcentajes fraccionarios.
export function quotas(count: number, mix: Record<Mode, number>): Record<Mode, number> {
  const rows = MODES.map((key, index) => ({ key, index, raw: count * mix[key] / 100, n: Math.floor(count * mix[key] / 100) }))
  let left = count - rows.reduce((s, r) => s + r.n, 0)
  for (const r of [...rows].sort((a, b) => (b.raw - b.n) - (a.raw - a.n) || a.index - b.index)) if (left-- > 0) r.n++
  return Object.fromEntries(rows.map(r => [r.key, r.n])) as Record<Mode, number>
}
export function planPieces(b: Brief, campaignId: string, id: () => string): Piece[] {
  const q = quotas(b.count, b.mix), used = b.topics.map(() => 0), selected = new Set<string>()
  const modes = MODES.flatMap(mode => Array<Mode>(q[mode]).fill(mode))
  const spread: Mode[] = []
  while (modes.length) { for (const mode of MODES) { const i = modes.indexOf(mode); if (i >= 0) spread.push(...modes.splice(i, 1)) } }
  return spread.map((mode, order) => {
    const priority = b.topics.map((t, i) => ({ i, score: used[i] / t.weight })).sort((a, z) => a.score - z.score || a.i - z.i)
    // Las referencias elegidas tienen cupo antes de cualquier descubrimiento,
    // aunque pertenezcan a un tema con menor peso.
    const pendingReference=mode==="replica"?priority.find(({i})=>b.topics[i].references.some(u=>!selected.has(u))):null
    const topic = pendingReference?.i??priority[0].i; used[topic]++
    const url = mode === "replica" ? b.topics[topic].references.find(u => !selected.has(u)) : null
    if (url) selected.add(url)
    const days = Math.round((Date.parse(b.end) - Date.parse(b.start)) / 86400000)
    const date = new Date(Date.parse(b.start + "T12:00:00Z") + Math.floor(order * (days + 1) / b.count) * 86400000).toISOString().slice(0, 10)
    return { id: id(), campaignId, order, topic, mode, objective: OBJECTIVE[mode], phase: mode === "replica" ? url ? "extract" : "discover" : mode === "adaptacion" ? "research" : "concept", date, reference: url ? userReference(url) : null, candidates: [], transcript: "", language: "", sourceDuration: null, runs: [], sources: [], dossier: "", concepts: [], script: null, review: null, status: "queued", error: "", edits: false, correctionCount: 0, model: "", usage: { input: 0, output: 0 }, productionStatus: "guion", videoUrl: "" }
  })
}
export function userReference(url: string): Reference {
  return { url: referenceUrl(url), author: "", platform: new URL(url).hostname.endsWith("tiktok.com") ? "TIKTOK" : "INSTAGRAM", caption: "", views: null, likes: null, comments: null, shares: null, publishedAt: null, capturedAt: new Date().toISOString(), selectedByUser: true }
}
export function parseObject(input: string): Record<string, unknown> {
  return parseModelObject(input)
}
export function parseScript(input: unknown, channels: Channel[]): Script {
  if (!input || typeof input !== "object") throw new CampaignActionError("El modelo no devolvió un libreto.")
  const o = input as Record<string, unknown>
  const required = (k: string, max = 20000) => { const s = text(o[k], max); if (!s) throw new CampaignActionError(`Falta ${k} en el libreto.`); return s }
  const shots = (Array.isArray(o.shots) ? o.shots : []).map((v): Shot => { const s = v as Record<string, unknown>; return { start: Number(s.start), end: Number(s.end), visual: text(s.visual, 3000), voice: text(s.voice, 8000), text: text(s.text, 500) } })
  if (!shots.length || shots.length > 80) throw new CampaignActionError("El libreto necesita planos.")
  if (shots.some(s => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || !s.visual || !s.voice)) throw new CampaignActionError("Hay un plano incompleto o un tiempo inválido.")
  const captions = (o.captions ?? {}) as Record<string, unknown>
  const out: Script = { title: required("title", 200), hook: required("hook", 1000), conclusion: required("conclusion", 2000), cta: text(o.cta, 1000), narration: required("narration"), shots, captions: {}, production: (Array.isArray(o.production) ? o.production : []).map(v => text(v, 3000)).filter(Boolean).slice(0, 60), claims: [], changes: [], translation: text(o.translation, 20000), pending: (Array.isArray(o.pending) ? o.pending : []).map(v => text(v, 1000)).filter(Boolean) }
  for (const channel of channels) { const s = text(captions[channel], 10000); if (!s) throw new CampaignActionError(`Falta el caption de ${channel}.`); out.captions[channel] = s }
  out.claims = (Array.isArray(o.claims) ? o.claims : []).map(v => { const c = v as Record<string, unknown>; return { text: text(c.text, 1500), kind: (["fact", "hypothesis", "experience"].includes(String(c.kind)) ? c.kind : "fact") as Claim["kind"], source: text(c.source, 1000), evidence: text(c.evidence, 3000) } }).filter(c => c.text)
  out.changes = (Array.isArray(o.changes) ? o.changes : []).map(v => { const c = v as Record<string, unknown>; return { original: text(c.original, 8000), final: text(c.final, 8000), reason: text(c.reason, 1000) } })
  return out
}
export function scriptMarkdown(p: Piece, b: Brief): string {
  const s = p.script
  if (!s) return ""
  return [`# ${s.title}`, `${MODE_LABEL[p.mode]} · ${p.objective} · ${b.topics[p.topic].name}`, `Fecha: ${p.date}`, p.reference ? `Referencia: ${p.reference.url}` : "", "## Libreto completo", s.narration, "## Planos", ...s.shots.map(x => `**${x.start}–${x.end} s** · ${x.visual}\n\n${x.voice}\n\nPantalla: ${x.text}`), "## Producción", ...s.production, ...b.channels.flatMap(c => [`## Caption · ${c}`, s.captions[c] || ""]), "## Pendientes", ...s.pending, "## Revisión", ...(p.review?.findings || []).map(f => `- ${f.level}: ${f.detail} → ${f.fix}`)].filter(Boolean).join("\n\n")
}
