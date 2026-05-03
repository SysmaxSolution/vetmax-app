#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Ler .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#') && line.includes('=')) {
    const [key, ...valueParts] = line.split('=');
    if (key) env[key.trim()] = valueParts.join('=').trim();
  }
});

const DATABASE_URL = env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada em .env.local');
  process.exit(1);
}

const petcareClinicId = '021c9c22-0f9a-4492-bebb-e9bb1c08a3b6';

async function debug() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('\n✅ Conectado ao Supabase com sucesso!\n');

    // 1. Quantos agendamentos na PetCare?
    console.log('═'.repeat(80));
    console.log('1️⃣  QUANTOS AGENDAMENTOS NA PETCARE?');
    console.log('═'.repeat(80));
    const result1 = await client.query(`
      SELECT COUNT(*) as total_agendamentos_petcare
      FROM appointments
      WHERE clinic_id = $1::uuid;
    `, [petcareClinicId]);
    const petcareTotal = result1.rows[0].total_agendamentos_petcare;
    console.log(`   Total: ${petcareTotal}\n`);

    // 2. Agendamentos por data na PetCare
    console.log('═'.repeat(80));
    console.log('2️⃣  AGENDAMENTOS POR DATA NA PETCARE');
    console.log('═'.repeat(80));
    const result2 = await client.query(`
      SELECT
        DATE(appointment_datetime) as data,
        COUNT(*) as total
      FROM appointments
      WHERE clinic_id = $1::uuid
      GROUP BY DATE(appointment_datetime)
      ORDER BY data DESC;
    `, [petcareClinicId]);

    if (result2.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento\n');
    } else {
      result2.rows.forEach(row => {
        console.log(`   📅 ${row.data}: ${row.total} agendamento(s)`);
      });
      console.log();
    }

    // 3. Agendamentos para hoje na PetCare
    console.log('═'.repeat(80));
    console.log('3️⃣  AGENDAMENTOS PARA 2026-04-16 NA PETCARE');
    console.log('═'.repeat(80));
    const result3 = await client.query(`
      SELECT COUNT(*) as agendamentos_petcare_hoje
      FROM appointments
      WHERE clinic_id = $1::uuid
      AND DATE(appointment_datetime) = '2026-04-16';
    `, [petcareClinicId]);
    console.log(`   Total: ${result3.rows[0].agendamentos_petcare_hoje}\n`);

    // 4. Usuários da PetCare
    console.log('═'.repeat(80));
    console.log('4️⃣  USUÁRIOS DA PETCARE');
    console.log('═'.repeat(80));
    const result4 = await client.query(`
      SELECT id, full_name, role
      FROM profiles
      WHERE clinic_id = $1::uuid;
    `, [petcareClinicId]);

    if (result4.rows.length === 0) {
      console.log('   ℹ️  Nenhum usuário\n');
    } else {
      result4.rows.forEach(row => {
        console.log(`   👤 ${row.full_name} (${row.role})`);
        console.log(`      ID: ${row.id}\n`);
      });
    }

    // 5. **CRÍTICA** - Qual clínica tem os 3 agendamentos de 2026-04-16?
    console.log('═'.repeat(80));
    console.log('5️⃣  🔴 CRÍTICA: QUAL CLÍNICA TEM OS AGENDAMENTOS DE 2026-04-16?');
    console.log('═'.repeat(80));
    const result5 = await client.query(`
      SELECT
        clinic_id,
        COUNT(*) as total_agendamentos
      FROM appointments
      WHERE DATE(appointment_datetime) = '2026-04-16'
      GROUP BY clinic_id
      ORDER BY total_agendamentos DESC;
    `);

    if (result5.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento para 2026-04-16\n');
    } else {
      result5.rows.forEach(row => {
        const match = row.clinic_id === petcareClinicId;
        const icon = match ? '✅' : '❌';
        console.log(`   ${icon} Clinic: ${row.clinic_id}`);
        console.log(`      Total: ${row.total_agendamentos} agendamento(s)`);
        if (!match) {
          console.log(`      ⚠️  NÃO É A PETCARE!\n`);
        } else {
          console.log(`      ✅ É A PETCARE\n`);
        }
      });
    }

    // 6. Todas as clínicas e seus agendamentos
    console.log('═'.repeat(80));
    console.log('6️⃣  RESUMO: TODAS AS CLÍNICAS E SEUS AGENDAMENTOS');
    console.log('═'.repeat(80));
    const result6 = await client.query(`
      SELECT
        c.id,
        c.name,
        COUNT(a.id) as total_agendamentos,
        COUNT(CASE WHEN DATE(a.appointment_datetime) = '2026-04-16' THEN 1 END) as agendamentos_hoje
      FROM clinics c
      LEFT JOIN appointments a ON c.id = a.clinic_id
      GROUP BY c.id, c.name
      ORDER BY total_agendamentos DESC;
    `);

    result6.rows.forEach(row => {
      const isPetCare = row.id === petcareClinicId;
      const icon = isPetCare ? '⭐' : '  ';
      console.log(`   ${icon} ${row.name}`);
      console.log(`      ID: ${row.id}`);
      console.log(`      Total agendamentos: ${row.total_agendamentos}`);
      console.log(`      Agendamentos em 2026-04-16: ${row.agendamentos_hoje}\n`);
    });

    // 7. Detalhes dos agendamentos de 2026-04-16
    console.log('═'.repeat(80));
    console.log('7️⃣  DETALHES DOS AGENDAMENTOS DE 2026-04-16');
    console.log('═'.repeat(80));
    const result7 = await client.query(`
      SELECT
        a.id,
        c.name as clinic_name,
        a.clinic_id,
        a.appointment_datetime,
        a.status,
        a.reason
      FROM appointments a
      LEFT JOIN clinics c ON a.clinic_id = c.id
      WHERE DATE(a.appointment_datetime) = '2026-04-16'
      ORDER BY a.appointment_datetime;
    `);

    if (result7.rows.length === 0) {
      console.log('   ℹ️  Nenhum agendamento\n');
    } else {
      result7.rows.forEach(row => {
        console.log(`   📌 Agendamento: ${row.id.substring(0, 8)}...`);
        console.log(`      Clínica: ${row.clinic_name}`);
        console.log(`      Data/Hora: ${row.appointment_datetime}`);
        console.log(`      Status: ${row.status}`);
        console.log(`      Razão: ${row.reason}\n`);
      });
    }

    // CONCLUSÃO
    console.log('═'.repeat(80));
    console.log('🎯 CONCLUSÃO');
    console.log('═'.repeat(80));

    if (petcareTotal === 0) {
      console.log('✅ PetCare está VAZIA (correto - é nova)\n');
      const clinicWith3 = result5.rows.find(r => r.total_agendamentos === 3);
      if (clinicWith3 && clinicWith3.clinic_id !== petcareClinicId) {
        console.log(`❌ Os 3 agendamentos de 2026-04-16 pertencem a OUTRA clínica!`);
        console.log(`   Clinic ID: ${clinicWith3.clinic_id}\n`);
        console.log('🔴 PROBLEMA: Vazamento de agendamentos entre clínicas');
        console.log('   A função getMonthAppointmentCounts() está retornando dados errados!\n');
      }
    } else {
      console.log(`❌ PROBLEMA: PetCare tem ${petcareTotal} agendamentos!`);
      console.log('   Ela deveria estar vazia (é nova)\n');
    }

    console.log('═'.repeat(80));
    console.log('\n');

  } catch (err) {
    console.error('\n❌ ERRO ao conectar/executar:');
    console.error(`   ${err.message}\n`);
    if (err.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Não conseguiu conectar ao Supabase remoto');
    }
  } finally {
    await client.end();
  }
}

debug();
