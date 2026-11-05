import type { Brief, Finding, Piece, Script } from "./model"
import { isCtaPolicy } from "./runtime-policy"
const normalized = (s: string) => s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
export function technicalReview(s: Script, p: Piece, b: Brief): Finding[] {
  const out: Finding[] = []
  const block = (rule: string, quote: string, detail: string, fix: string) => out.push({ rule, level: "block", quote, detail, fix })
  let end = 0
  for (const shot of s.shots) {
    if (Math.abs(shot.start - end) > 0.15) block("timeline", `${shot.start}–${shot.end}`, "Los tiempos tienen huecos o solapamientos.", "Encadena los planos desde cero sin huecos ni solapamientos.")
    const words = shot.voice.split(/\s+/).length
    if (words / (shot.end - shot.start) > 3.5) block("voice_time", shot.voice, "La voz no cabe de forma natural en este plano.", "Ajusta el tiempo o distribuye la voz sin eliminar ideas de una réplica.")
    end = shot.end
  }
  const joined = s.shots.map(x => x.voice).join(" ")
  if (normalized(joined) !== normalized(s.narration)) block("narration", "", "La narración y la voz de los planos no coinciden.", "Conserva exactamente la misma voz en ambas representaciones.")
  if (!normalized(s.shots[0]?.voice || "").includes(normalized(s.hook))) block("hook", s.hook, "El hook no aparece en la apertura.", "Pon el hook al inicio de la voz.")
  const all = [s.narration, ...Object.values(s.captions), ...s.production].join("\n")
  if (s.pending.length || /\[(?:POR CONFIRMAR|PENDIENTE|TODO|FALTA)[^\]]*\]/i.test(all)) block("pending", "", "Hay datos o material pendientes.", "Mantén la pieza en borrador hasta resolver los pendientes.")
  if (b.cta && !isCtaPolicy(b.cta) && normalized(s.cta) !== normalized(b.cta)) block("cta_changed", s.cta, "Se cambió el CTA explícito.", "Conserva el CTA indicado por la persona.")
  if (s.cta && !normalized(s.narration).includes(normalized(s.cta))) block("cta_missing", s.cta, "El CTA no aparece en la narración.", "Incluye el CTA sin añadir acciones contradictorias.")
  for (const channel of b.channels) if (!s.captions[channel]?.trim()) block("caption", channel, "Falta un caption solicitado.", "Escribe la variante de ese canal.")
  if (p.mode === "replica" && (!p.reference || !p.transcript.trim())) block("source", "", "Falta el original recuperado.", "Completa la extracción; no inventes el fragmento.")
  if (p.mode === "original" && !b.offer.trim()) block("offer", "", "No está definida la oferta o siguiente paso de conversión.", "Define la oferta o acción antes de cerrar la pieza.")
  if (p.mode !== "replica") {
    const filler=["revisa tu caso","segun lo que necesites","tenga sentido para tu negocio","hay varias opciones"].filter(x=>normalized(s.narration).includes(x))
    if(filler.length>=2)block("generic_argument",filler.join("; "),"El desarrollo acumula consejos genéricos sin una situación o demostración concreta.","Reescribe el argumento desde una escena, mecanismo o evidencia específica del tema.")
    for (const phrase of ["lleva tu negocio al siguiente nivel", "imagina un mundo", "el futuro ya llego", "en un mundo donde"]) if (normalized(all).includes(phrase)) block("generic_language", phrase, "Se usa una fórmula genérica de publicidad.", "Sustituye la fórmula por una situación, prueba o consecuencia específica.")
  }
  if(p.mode==="replica"&&p.sourceDuration&&end>p.sourceDuration*1.6&&s.narration.split(/\s+/).length/end<0.8)block("timeline",String(end),"Los tiempos alargan considerablemente el referente sin voz o material que lo justifique.","Ajusta los tiempos conservando el libreto y la ejecución elegidos.")
  // El plazo del referente se conserva; no se bloquea por dificultad ni por ser más largo.
  if (p.mode !== "replica" && end > b.duration * 1.25) block("duration", String(end), "La secuencia supera la duración orientativa de la campaña.", "Ajusta los tiempos manteniendo el argumento.")
  const sourceUrls = new Set(p.sources.map(x => x.url))
  const availableEvidence=normalized([b.material,p.transcript,p.dossier,...p.sources.map(x=>x.text)].join(" "))
  for (const c of s.claims) if (c.kind !== "hypothesis" && (!c.evidence || (c.source && !sourceUrls.has(c.source) && c.source !== p.reference?.url && c.source !== "material_usuario"))) block("claim_evidence", c.text, "Una afirmación no está vinculada al material disponible.", "Atribuye la evidencia real o formula una hipótesis explícita.")
  for (const c of s.claims) if(c.kind!=="hypothesis"&&c.evidence&&!availableEvidence.includes(normalized(c.evidence)))block("claim_evidence",c.text,"El fragmento de evidencia no aparece en los insumos.","Cita el fragmento real, conserva sus condiciones o plantea una hipótesis explícita.")
  return out
}
export function parseEditorialReview(value: unknown): Finding[] {
  const o = value as { findings?: unknown[] } | null
  if (!o || !Array.isArray(o.findings)) throw new Error("La revisión editorial no devolvió hallazgos verificables.")
  return o.findings.map(v => { const f = v as Record<string, unknown>; if (typeof f.detail !== "string" || typeof f.fix !== "string" || typeof f.rule !== "string" || !["block", "warning"].includes(String(f.level))) throw new Error("El revisor devolvió un hallazgo incompleto."); return { rule: f.rule.slice(0, 100), level: f.level as Finding["level"], quote: typeof f.quote === "string" ? f.quote.slice(0, 1000) : "", detail: f.detail.slice(0, 2000), fix: f.fix.slice(0, 2000) } })
}
