// Los proveedores entregan SRT/VTT o segmentos JSON; el caption nunca sustituye la voz.
export function transcriptText(asset: string): string {
  let value: unknown
  try { value=JSON.parse(asset) } catch { value=null }
  if(value&&typeof value==="object"){
    const o=value as Record<string,unknown>
    if(typeof o.text==="string")return o.text.trim()
    if(typeof o.transcript==="string")return o.transcript.trim()
    const segments=Array.isArray(value)?value:Array.isArray(o.segments)?o.segments:null
    if(segments)return segments.map(x=>typeof x==="string"?x:typeof x?.text==="string"?x.text:"").filter(Boolean).join(" ").trim()
    return ""
  }
  return asset.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!/^\d+$/.test(x)&&!x.includes("-->")&&!/^(WEBVTT|NOTE|STYLE|Kind:|Language:)/.test(x)).map(x=>x.replace(/<[^>]+>/g,"")).join(" ").trim()
}
