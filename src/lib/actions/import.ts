'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type CsvRow = {
  tutor_name: string
  tutor_cpf?: string
  tutor_phone: string
  tutor_email?: string
  pet_name: string
  pet_species: string
  pet_breed?: string
  pet_weight?: string
}

// Função Auxiliar para Máscara de Telefone (Brasil)
function formatPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
  }
  return phone // Retorna original se não bater o padrão
}

export async function importTutorsAndPets(rows: CsvRow[]): Promise<{ success: boolean; imported: number } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sessão expirada.' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (!profile?.clinic_id) return { error: 'Clínica não encontrada.' }

    const clinicId = profile.clinic_id
    let importedCount = 0

    for (const row of rows) {
      const tutorName = String(row.tutor_name || '').trim()
      const petName = String(row.pet_name || '').trim()
      if (!tutorName || !petName) continue

      // Formatação do Telefone com Máscara
      const tutorPhone = formatPhone(String(row.tutor_phone || '').trim())
      const tutorCpf = String(row.tutor_cpf || '').trim() || `PF-${Math.floor(Math.random() * 900000)}`
      
      let tutorId = null

      // 1. Garantir o Tutor (Verifica por CPF ou Telefone)
      const { data: existingTutor } = await admin
        .from('tutors')
        .select('id')
        .eq('clinic_id', clinicId)
        .or(`cpf.eq.${tutorCpf},phone.eq.${tutorPhone}`)
        .maybeSingle()

      if (existingTutor) {
        tutorId = existingTutor.id
      } else {
        const { data: newTutor, error: tErr } = await admin
          .from('tutors')
          .insert({
            clinic_id: clinicId,
            name: tutorName,
            cpf: tutorCpf,
            phone: tutorPhone || null,
            email: row.tutor_email || null
          })
          .select('id')
          .single()

        if (tErr) continue
        tutorId = newTutor.id
      }

      // 2. Inserção do Pet (Com Prevenção de Duplicidade Manual)
      if (tutorId) {
        // CHECAGEM DE DUPLICIDADE: Este Pet já existe para este Tutor?
        const { data: existingPet } = await admin
          .from('patients')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('tutor_id', tutorId)
          .eq('name', petName)
          .maybeSingle()

        if (existingPet) {
          console.log(`Pet ${petName} já cadastrado para este tutor. Pulando...`)
          continue
        }

        // Tradução de Espécie para o Schema
        const rawSpecies = (row.pet_species || '').toLowerCase()
        let speciesFormatted = 'dog'
        if (rawSpecies.includes('gat')) speciesFormatted = 'cat'
        else if (rawSpecies.includes('pass') || rawSpecies.includes('ave')) speciesFormatted = 'bird'

        const { error: pErr } = await admin
          .from('patients')
          .insert({
            clinic_id: clinicId,
            tutor_id: tutorId,
            name: petName,
            species: speciesFormatted,
            breed: row.pet_breed || 'SRD',
            gender: 'unknown',
            behavior_tags: [],
            notes: row.pet_weight ? `Peso importado: ${row.pet_weight}kg` : null
          })

        if (!pErr) {
          importedCount++
        }
      }
    }

    revalidatePath('/dashboard/patients')
    return { success: true, imported: importedCount }

  } catch (err: any) {
    return { error: 'Erro: ' + err.message }
  }
}