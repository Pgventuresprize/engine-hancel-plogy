// Ejecutar antes de push/merge: node scripts/video-campaigns-additive.mjs [base]
import { execFileSync } from "node:child_process"
const base=process.argv[2]||"origin/main"
const run=(args)=>execFileSync("git",args,{encoding:"utf8"}).trim()
const changed=run(["diff","--name-status",base,"--"])
const untracked=run(["ls-files","--others","--exclude-standard"])
const allowed=/^(src\/(engine|components)\/video-campaigns\/|src\/app\/campanas-video\/|src\/app\/api\/videos\/tick\/campanas\/|supabase\/migraciones\/2026-11-04-vc2-campanas-video.sql$|scripts\/video-campaigns[^/]*$|docs\/video-campaigns\/)/
const entries=changed.split("\n").filter(Boolean).map(x=>{const [status,path]=x.split("\t");return {status,path}})
for(const path of untracked.split("\n").filter(Boolean))entries.push({status:"A",path})
const violations=entries.filter(x=>x.status!=="A"||!allowed.test(x.path))
if(violations.length){console.error("Integración rechazada: hay modificaciones o rutas fuera del módulo.",violations);process.exit(1)}
console.log(`Integración aditiva verificada: ${entries.length} archivos nuevos, cero archivos existentes modificados frente a ${base}.`)
