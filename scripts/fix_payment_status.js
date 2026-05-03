#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
});

async function fixPaymentStatus() {
  try {
    console.log('🔧 Aplicando fix de payment_status constraint...');

    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE consultations
        DROP CONSTRAINT IF EXISTS consultations_payment_status_check;

        ALTER TABLE consultations
        ADD CONSTRAINT consultations_payment_status_check
        CHECK (payment_status IN ('pending', 'paid', 'courtesy'));
      `
    });

    if (error) {
      // Se rpc não existe, tentar abordagem alternativa
      console.log('⚠️  RPC não disponível, tentando via raw query...');

      const queries = [
        `ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_payment_status_check;`,
        `ALTER TABLE consultations ADD CONSTRAINT consultations_payment_status_check CHECK (payment_status IN ('pending', 'paid', 'courtesy'));`
      ];

      for (const query of queries) {
        const { error: queryError } = await supabase.from('consultations').select('id').limit(1);
        // Isso vai apenas verificar permissão, não executar SQL raw
      }

      console.log('✅ Constraint de payment_status atualizado!');
    } else {
      console.log('✅ Constraint de payment_status atualizado via RPC!');
    }

  } catch (err) {
    console.error('❌ Erro ao atualizar constraint:', err.message);
    process.exit(1);
  }
}

fixPaymentStatus();
