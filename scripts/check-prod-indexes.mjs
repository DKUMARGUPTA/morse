// Verify the 4 new indexes + RateLimit table on the production Supabase DB.
// Reads DATABASE_URL from Vercel env API; never prints the connection string.
import { Client } from 'pg'

const VTOKEN = process.env.VT
const PROJECT = 'prj_kg6echyCB6mbHXTSa48hdsBPb2jX'

const res = await fetch(`https://api.vercel.com/v9/projects/${PROJECT}/env?decrypt=true`, {
  headers: { Authorization: `Bearer ${VTOKEN}` },
})
const envs = await res.json()
console.log('env api keys:', envs.error ? JSON.stringify(envs.error) : 'ok, count=' + (Array.isArray(envs) ? envs.length : '(not array)'))
const list = Array.isArray(envs) ? envs : (envs.envs || [])
const e = list.find((x) => x.key === 'DATABASE_URL')
if (!e) {
  console.error('DATABASE_URL not found in Vercel env; keys present:', list.map((x) => x.key).join(', '))
  process.exit(1)
}
console.log('DATABASE_URL found, targets:', e.target.join(','))

const url = e.value
const u = new URL(url)
u.searchParams.delete('sslmode')
const client = new Client({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const idx = await client.query(
  `select indexname, indexdef from pg_indexes
   where tablename in ('Block','Invitation','Report','RateLimit','Message','ConversationMember')
   order by tablename, indexname`
)
console.log('--- INDEXES ---')
for (const r of idx.rows) console.log(`${r.indexname}\n    ${r.indexdef}`)

const tbl = await client.query(
  `select column_name, data_type from information_schema.columns
   where table_name = 'RateLimit' order by ordinal_position`
)
console.log('--- RateLimit columns ---')
for (const r of tbl.rows) console.log(`${r.column_name} ${r.data_type}`)

const counts = await client.query(
  `select 'User' t, count(*) from "User"
   union all select 'Message', count(*) from "Message"
   union all select 'RateLimit', count(*) from "RateLimit"
   union all select 'PushSubscription', count(*) from "PushSubscription"`
)
console.log('--- ROW COUNTS ---')
for (const r of counts.rows) console.log(`${r.t}: ${r.count}`)

await client.end()
console.log('PROD-DB CHECK DONE')
