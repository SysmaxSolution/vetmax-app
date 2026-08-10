import { readFileSync } from 'fs'
import pg from 'pg'
import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const sql = readFileSync(resolve(__dirname, '../supabase/migrations/0419_awaiting_review_status.sql'), 'utf-8')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error('DATABASE_URL não encontrada'); process.exit(1) }

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('Conectado. Aplicando migration 0419...')
await client.query(sql)
console.log('Migration 0419 aplicada com sucesso.')
await client.end()
