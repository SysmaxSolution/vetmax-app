import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CLINIC_ID = '218e5d8f-b2ff-4fd5-b1c5-886b827ab5ae' // AlmaVet

const { data: clinic } = await admin.from('clinics').select('id, name, business_type, status, active_modules').eq('id', CLINIC_ID).single()
console.log('CLINIC:', clinic)

const { data: sub } = await admin.from('tenant_subscriptions').select('*').eq('clinic_id', CLINIC_ID).maybeSingle()
console.log('\nSUBSCRIPTION:', sub)

const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 500 })
const levi = users.find(u => u.email?.toLowerCase() === 'levipmarques@gmail.com')
const { data: profile } = await admin.from('profiles').select('*').eq('id', levi.id).single()
console.log('\nLEVI PROFILE:', profile)
