const { Client } = require('pg');

const dbUrl = 'postgresql://postgres:Vetmax@2026@db.yivjuhurcadxtllmkkqd.supabase.co:5432/postgres';
const petcareClinicId = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6';

async function debug() {
  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase\n');

    // 1. Quantos agendamentos na PetCare?
    console.log('═'.repeat(70));
    console.log('1️⃣  AGENDAMENTOS NA PETCARE');
    console.log('═'.repeat(70));
    const petcareCountResult = await client.query(`
      SELECT COUNT(*) as total_petcare
      FROM appointments
      WHERE clinic_id = $1::uuid;
    `, [petcareClinicId]);
    console.log(`   Total de agendamentos: ${petcareCountResult.rows[0].total_petcare}\n`);

    // 2. Agendamentos por data na PetCare
    console.log('═'.repeat(70));
    console.log('2️⃣  AGENDAMENTOS POR DATA NA PETCARE');
    console.log('═'.repeat(70));
    const petcareByDateResult = await client.query(`
      SELECT
        DATE(appointment_datetime) as data,
        COUNT(*) as total
      FROM appointments
      WHERE clinic_id = $1::uuid
      GROUP BY DATE(appointment_datetime)
      ORDER BY data DESC;
    `, [petcareClinicId]);

    if (petcareByDateResult.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento\n');
    } else {
      petcareByDateResult.rows.forEach(row => {
        console.log(`   ${row.data}: ${row.total} agendamento(s)`);
      });
      console.log();
    }

    // 3. Agendamentos para hoje na PetCare
    console.log('═'.repeat(70));
    console.log('3️⃣  AGENDAMENTOS PARA 2026-04-16 NA PETCARE');
    console.log('═'.repeat(70));
    const petcareTodayResult = await client.query(`
      SELECT COUNT(*) as agendamentos_petcare_hoje
      FROM appointments
      WHERE clinic_id = $1::uuid
      AND DATE(appointment_datetime) = '2026-04-16';
    `, [petcareClinicId]);
    console.log(`   Total: ${petcareTodayResult.rows[0].agendamentos_petcare_hoje}\n`);

    // 4. Usuários da PetCare
    console.log('═'.repeat(70));
    console.log('4️⃣  USUÁRIOS DA PETCARE');
    console.log('═'.repeat(70));
    const petcareUsersResult = await client.query(`
      SELECT id, full_name, role
      FROM profiles
      WHERE clinic_id = $1::uuid;
    `, [petcareClinicId]);

    if (petcareUsersResult.rows.length === 0) {
      console.log('   ℹ️  Nenhum usuário\n');
    } else {
      petcareUsersResult.rows.forEach(row => {
        console.log(`   • ${row.full_name} (${row.role}) - ID: ${row.id.substring(0, 8)}...`);
      });
      console.log();
    }

    // 5. Qual clínica possui os agendamentos de 2026-04-16?
    console.log('═'.repeat(70));
    console.log('5️⃣  QUAL CLÍNICA POSSUI 3 AGENDAMENTOS EM 2026-04-16?');
    console.log('═'.repeat(70));
    const clinicsWith3Result = await client.query(`
      SELECT
        clinic_id,
        COUNT(*) as total
      FROM appointments
      WHERE DATE(appointment_datetime) = '2026-04-16'
      GROUP BY clinic_id
      ORDER BY total DESC;
    `);

    if (clinicsWith3Result.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento para 2026-04-16\n');
    } else {
      clinicsWith3Result.rows.forEach(row => {
        console.log(`   Clinic: ${row.clinic_id} → ${row.total} agendamento(s)`);
      });
      console.log();
    }

    // 6. Informações das clínicas
    console.log('═'.repeat(70));
    console.log('6️⃣  INFORMAÇÕES DAS CLÍNICAS COM AGENDAMENTOS');
    console.log('═'.repeat(70));
    const clinicsResult = await client.query(`
      SELECT DISTINCT
        c.id,
        c.name,
        COUNT(a.id) as total_agendamentos
      FROM clinics c
      LEFT JOIN appointments a ON c.id = a.clinic_id
      GROUP BY c.id, c.name
      ORDER BY total_agendamentos DESC;
    `);

    clinicsResult.rows.forEach(row => {
      console.log(`   • ${row.name}`);
      console.log(`     ID: ${row.id}`);
      console.log(`     Agendamentos: ${row.total_agendamentos}\n`);
    });

    console.log('═'.repeat(70));
    console.log('🎯 CONCLUSÃO');
    console.log('═'.repeat(70));

    const petcareTotal = petcareCountResult.rows[0].total_petcare;
    const clinicWith3 = clinicsWith3Result.rows.find(r => r.total === 3);

    if (petcareTotal === 0) {
      console.log('✅ PetCare está VAZIA (como esperado - é nova)');
      if (clinicWith3) {
        console.log(`❌ Os 3 agendamentos de 2026-04-16 pertencem a OUTRA clínica: ${clinicWith3.clinic_id}`);
        console.log(`\n🔴 PROBLEMA IDENTIFICADO:`);
        console.log(`   A query getMonthAppointmentCounts() está retornando agendamentos`);
        console.log(`   da clínica ERRADA ou não está filtrando por clinic_id corretamente!`);
      }
    } else {
      console.log(`❌ PetCare tem ${petcareTotal} agendamentos - deveria estar vazia!`);
      console.log(`   Agendamentos foram criados com clinic_id errado!`);
    }

    console.log('\n');

  } catch (err) {
    console.error('❌ ERRO:', err.message);
    if (err.detail) console.error('Detalhe:', err.detail);
  } finally {
    await client.end();
  }
}

debug();
