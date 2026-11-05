// Prueba PostgreSQL aislada: VC_PGLITE_ROOT apunta a una instalación temporal de @electric-sql/pglite.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
const require=createRequire(resolve(process.env.VC_PGLITE_ROOT||process.cwd(),"package.json"))
const {PGlite}=require("@electric-sql/pglite")
test("migración y cola vc2 en PostgreSQL aislado, sin alterar datos previos",async t=>{
 const db=await PGlite.create()
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table public.accounts(id uuid primary key,name text);
 create table public.raw_news(id integer primary key,body text);
 insert into public.raw_news values(1,'contenido existente intacto');
 create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create schema net;create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as 'select 1::bigint';
 create schema cron;create table cron.job(jobname text);create function cron.schedule(text,text,text)returns bigint language sql as 'select 1::bigint';`)
 const migration=readFileSync(new URL("../supabase/migraciones/2026-11-04-vc2-campanas-video.sql",import.meta.url),"utf8")
 await db.exec(migration);await db.exec(migration)
 const a=randomUUID(),other=randomUUID(),c=randomUUID(),p=randomUUID()
 await db.query("insert into accounts values ($1,'Plogy'),($2,'Otra')",[a,other])
 const config={maxRuns:2}, payload={id:p,phase:"extract",script:null,status:"queued"}
 const create=()=>db.query("select vc2_create($1,$2,$3::jsonb,'{}'::jsonb,$4::jsonb)",[c,a,JSON.stringify(config),JSON.stringify([payload])])
 await t.test("crear dos veces no duplica piezas ni trabajos",async()=>{await create();await create();assert.equal((await db.query("select count(*)::int as n from vc2_pieces")).rows[0].n,1);assert.equal((await db.query("select count(*)::int as n from vc2_jobs")).rows[0].n,1)})
 await t.test("el mismo id no permite apropiarse de una campaña ajena",async()=>{await assert.rejects(db.query("select vc2_create($1,$2,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb)",[c,other]));assert.equal((await db.query("select account_id from vc2_campaigns where id=$1",[c])).rows[0].account_id,a)})
 await t.test("anon y authenticated no leen las tablas nuevas",async()=>{await db.exec("set role authenticated");await assert.rejects(db.query("select * from vc2_campaigns"));await db.exec("reset role;set role anon");await assert.rejects(db.query("select vc2_claim(null)"));await db.exec("reset role")})
 const claim=async()=> (await db.query("select * from vc2_claim($1)",[a])).rows[0]
 let job=await claim()
 await t.test("solo un dueño puede reclamar y confirmar un trabajo",async()=>{
  assert.ok(job.lease);assert.equal(await claim(),undefined)
  const bad=await db.query("select vc2_commit($1,$2,0,$3::jsonb,'extract','queued',0) as ok",[job.id,randomUUID(),JSON.stringify(payload)])
  assert.equal(bad.rows[0].ok,false)
 })
 await t.test("consultar una corrida larga no agota los reintentos",async()=>{
  let revision=0
  for(let i=0;i<6;i++){
   const r=await db.query("select vc2_commit($1,$2,$3,$4::jsonb,'extract','queued',0) as ok",[job.id,job.lease,revision,JSON.stringify(payload)])
   assert.equal(r.rows[0].ok,true);revision++;job=await claim();assert.ok(job)
   assert.equal(job.attempts,1)
  }
  await db.query("select vc2_commit($1,$2,$3,$4::jsonb,'write','held',0)",[job.id,job.lease,revision,JSON.stringify({...payload,phase:"write"})])
 })
 await t.test("presupuesto de corridas es atómico y limitado",async()=>{
  for(const expected of [true,true,false])assert.equal((await db.query("select vc2_reserve_run($1,$2) as ok",[c,a])).rows[0].ok,expected)
  assert.equal((await db.query("select vc2_reserve_run($1,$2) as ok",[c,other])).rows[0].ok,false)
 })
 await t.test("edición comprueba cuenta y versión; conserva la versión previa",async()=>{
  const row=(await db.query("select * from vc2_pieces where id=$1",[p])).rows[0]
  const s={...payload,phase:"review",script:{title:"primera"},status:"queued"}
  assert.equal((await db.query("select vc2_edit($1,$2,$3,$4::jsonb,'review',false) as ok",[p,other,row.revision,JSON.stringify(s)])).rows[0].ok,false)
  assert.equal((await db.query("select vc2_edit($1,$2,$3,$4::jsonb,'review',false) as ok",[p,a,row.revision,JSON.stringify(s)])).rows[0].ok,true)
  assert.equal((await db.query("select vc2_edit($1,$2,$3,$4::jsonb,'review',false) as ok",[p,a,row.revision,JSON.stringify(s)])).rows[0].ok,false)
  const changed={...s,script:{title:"segunda"}}
  assert.equal((await db.query("select vc2_edit($1,$2,$3,$4::jsonb,'review',true) as ok",[p,a,row.revision+1,JSON.stringify(changed)])).rows[0].ok,true)
  assert.equal((await db.query("select count(*)::int as n from vc2_versions")).rows[0].n,1)
 })
 await t.test("contexto no cambia durante un trabajo activo; pausa impide reclamar",async()=>{
  job=await claim();assert.ok(job)
  assert.equal((await db.query("select vc2_context($1,$2,$3::jsonb) as ok",[c,a,JSON.stringify({maxRuns:2,offer:"nueva"})])).rows[0].ok,false)
  await db.query("update vc2_campaigns set paused=true where id=$1",[c])
  const row=(await db.query("select * from vc2_pieces where id=$1",[p])).rows[0]
  assert.equal((await db.query("select vc2_commit($1,$2,$3,$4::jsonb,'done','done',0) as ok",[job.id,job.lease,row.revision,JSON.stringify({...row.payload,status:"ready"})])).rows[0].ok,false)
  assert.equal(await claim(),undefined)
  await db.query("update vc2_campaigns set paused=false where id=$1",[c])
  assert.equal((await db.query("select vc2_context($1,$2,$3::jsonb) as ok",[c,a,JSON.stringify({maxRuns:2,offer:"nueva"})])).rows[0].ok,true)
 })
 await t.test("el contenido previo y sus permisos no se modificaron",async()=>{
  assert.deepEqual((await db.query("select * from raw_news")).rows,[{id:1,body:"contenido existente intacto"}])
  assert.equal((await db.query("select count(*)::int as n from information_schema.tables where table_schema='public' and table_name like 'vc2_%'")).rows[0].n,6)
 })
 }finally{await db.close()}
})
