const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Ler .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key) env[key.trim()] = valueParts.join('=').trim();
  }
});

const dbUrl = env.DATABASE_URL;

async function fixAppointmentsRLS() {
  const client = new Client({ connectionString: dbUrl });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase\n');

    // 1. Dropar policies antigas
    console.log('🗑️  Removendo 4 policies antigas...');
    const dropSql = `
      DROP POLICY IF EXISTS "appointments_clinic_select" ON appointments;
      DROP POLICY IF EXISTS "appointments_clinic_insert" ON appointments;
      DROP POLICY IF EXISTS "appointments_clinic_update" ON appointments;
      DROP POLICY IF EXISTS "appointments_clinic_delete" ON appointments;
    `;
    
    for (const stmt of dropSql.split(';').filter(s => s.trim())) {
      await client.query(stmt);
    }
    console.log('✅ Políticas antigas removidas\n');

    // 2. Criar nova policy consolidada
    console.log('📝 Criando nova policy consolidada...');
    const createPolicySql = `
      CREATE POLICY "appointments_isolate_by_clinic"
        ON appointments FOR ALL
        TO authenticated
        USING (
          clinic_id = (
            SELECT clinic_id FROM public.profiles 
            WHERE id = auth.uid() 
            LIMIT 1
          )
        )
        WITH CHECK (
          clinic_id = (
            SELECT clinic_id FROM public.profiles 
            WHERE id = auth.uid() 
            LIMIT 1
          )
        );
    `;
    
    await client.query(createPolicySql);
    console.log('✅ Nova policy criada\n');

    // 3. Verificar policies
    console.log('📊 Verificando policies ativas...');
    const policiesResult = await client.query(`
      SELECT policyname 
      FROM pg_policies 
      WHERE tablename = 'appointments' AND schemaname = 'public'
      ORDER BY policyname;
    `);
    
    console.log('📋 Policies na tabela appointments:');
    if (policiesResult.rows.length === 0) {
      console.log('   ❌ NENHUMA POLICY ENCONTRADA!');
    } else {
      policiesResult.rows.forEach(row => {
        console.log(`   ✅ ${row.policyname}`);
      });
    }
    console.log();

    // 4. Agendamentos totais
    console.log('📌 Total de agendamentos por clínica:');
    const appointmentsByClinicResult = await client.query(`
      SELECT 
        clinic_id,
        COUNT(*) as total,
        COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as ativos
      FROM appointments
      GROUP BY clinic_id
      ORDER BY total DESC;
    `);
    
    if (appointmentsByClinicResult.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento no sistema');
    } else {
      appointmentsByClinicResult.rows.forEach(row => {
        console.log(`   • Clinic: ${row.clinic_id.substring(0, 8)}... | Total: ${row.total} | Ativos: ${row.ativos}`);
      });
    }
    console.log();

    // 5. Clínicas
    console.log('🏥 Clínicas no sistema:');
    const clinicsResult = await client.query('SELECT id, name FROM clinics ORDER BY name;');
    if (clinicsResult.rows.length === 0) {
      console.log('   ℹ️  Nenhuma clínica');
    } else {
      clinicsResult.rows.forEach(row => {
        console.log(`   • ${row.name} (ID: ${row.id.substring(0, 8)}...)`);
      });
    }
    console.log();

    // 6. Profiles/Usuários
    console.log('👥 Usuários no sistema:');
    const profilesResult = await client.query(`
      SELECT id, clinic_id, full_name, role FROM profiles ORDER BY full_name;
    `);
    if (profilesResult.rows.length === 0) {
      console.log('   ℹ️  Nenhum usuário');
    } else {
      profilesResult.rows.forEach(row => {
        console.log(`   • ${row.full_name} (${row.role}) - Clinic: ${row.clinic_id ? row.clinic_id.substring(0, 8) + '...' : 'SEM CLÍNICA'}`);
      });
    }
    console.log();

    console.log('═'.repeat(70));
    console.log('✅ RLS CORRIGIDO!');
    console.log('═'.repeat(70));
    console.log('\n🎯 Próximas etapas:');
    console.log('   1. No browser, fazer refresh (Ctrl+F5)');
    console.log('   2. Abrir o calendário');
    console.log('   3. O badge "Hoje [ X ] Agendamentos" deve mostrar APENAS');
    console.log('      agendamentos da SUA clínica');
    console.log('\n');

  } catch (err) {
    console.error('❌ ERRO ao executar fix:');
    console.error('   ', err.message);
    if (err.detail) console.error('   Detalhe:', err.detail);
    if (err.hint) console.error('   Dica:', err.hint);
  } finally {
    await client.end();
  }
}

fixAppointmentsRLS();
