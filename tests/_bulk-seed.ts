import * as dotenv from 'dotenv'
import path from 'path'
import { randomUUID } from 'crypto'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CLINIC = '11111111-1111-1111-1111-111111111111'
const firstNames = ['Maria','Ana','João','Pedro','Camila','Bruno','Fernanda','Ricardo','Juliana','Marcos','Patrícia','Rafael','Larissa','Gustavo','Beatriz','Thiago','Aline','Rodrigo','Vanessa','Felipe','Débora','Leandro','Priscila','André','Carolina','Vinícius','Tatiane','Eduardo','Renata','Diego','Sabrina','Márcio','Letícia','Rogério','Bianca','Sérgio','Natália','Fábio','Cristina','Alexandre']
const lastNames = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Rodrigues','Almeida','Nascimento','Carvalho','Araújo','Ribeiro','Gomes','Martins','Rocha','Barbosa','Mendes','Freitas','Cardoso']
const dogNames = ['Thor','Bela','Mel','Rex','Luna','Nina','Zeus','Amora','Bob','Lola','Toby','Maggie','Fred','Pretinha','Simba','Frida','Max','Cacau','Théo','Meg']
const catNames = ['Frajola','Mimi','Chico','Nala','Salem','Amora','Tom','Jujuba','Otto','Pandora','Gato','Tigresa','Romeu','Aurora','Bidu']
const dogBreeds = ['SRD','Labrador','Poodle','Shih Tzu','Golden Retriever','Yorkshire','Bulldog Francês','Pinscher','Beagle','Pastor Alemão','Lhasa Apso','Border Collie']
const catBreeds = ['SRD','Siamês','Persa','Angorá','Maine Coon','British Shorthair']
const genders = ['male','female']

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length] }
function cpf(n: number) { const s = String(100000000 + n).padStart(9,'0'); return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${String((n*7)%90+10)}` }
function phone(n: number) { return `16${String(980000000 + n).slice(0,9)}` }

async function main() {
  const { createAdminClient } = await import('./helpers/supabase-test-client')
  const admin = createAdminClient()
  const N = Number(process.env.N_TUTORS || 40)

  const tutors: any[] = []
  const pets: any[] = []
  for (let i = 0; i < N; i++) {
    const tid = randomUUID()
    const nome = `${pick(firstNames, i)} ${pick(lastNames, i*3+1)}`
    tutors.push({ id: tid, clinic_id: CLINIC, name: nome, cpf: cpf(i+1), email: `tutor${i+1}@exemplo.com`, phone: phone(i+1) })
    const nPets = 1 + (i % 3 === 0 ? 1 : 0) // ~1.33 pets por tutor
    for (let p = 0; p < nPets; p++) {
      const isCat = (i + p) % 3 === 0
      pets.push({
        id: randomUUID(), clinic_id: CLINIC, tutor_id: tid,
        name: isCat ? pick(catNames, i+p) : pick(dogNames, i+p),
        species: isCat ? 'cat' : 'dog',
        breed: isCat ? pick(catBreeds, i+p) : pick(dogBreeds, i+p),
        gender: pick(genders, i+p),
        neutered: (i+p) % 2 === 0,
      })
    }
  }

  // insere em lotes
  for (let i = 0; i < tutors.length; i += 100) {
    const { error } = await admin.from('tutors').upsert(tutors.slice(i, i+100))
    if (error) { console.log('tutors erro:', error.message); process.exit(1) }
  }
  for (let i = 0; i < pets.length; i += 100) {
    const { error } = await admin.from('patients').upsert(pets.slice(i, i+100))
    if (error) { console.log('patients erro:', error.message); process.exit(1) }
  }
  const { count: tc } = await admin.from('tutors').select('*', { count: 'exact', head: true }).eq('clinic_id', CLINIC)
  const { count: pc } = await admin.from('patients').select('*', { count: 'exact', head: true }).eq('clinic_id', CLINIC)
  console.log(`OK — inseridos ${tutors.length} tutores e ${pets.length} pets. Totais na clínica: tutores=${tc}, pets=${pc}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1) })
