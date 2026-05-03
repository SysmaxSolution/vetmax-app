const path = require('path');
const fs = require('fs');

// Ler .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variáveis de ambiente não encontradas');
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

(async () => {
  try {
    console.log('📝 Lendo migration...');
    const sql = fs.readFileSync('supabase/migrations/0007_document_templates.sql', 'utf-8');

    // Tentar usar admin API via SQL direto
    // Supabase JS não tem suporte direto para exec SQL, então vamos tentar via REST

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql })
    });

    if (!response.ok) {
      console.error('❌ Erro ao executar SQL:', response.status, response.statusText);
      const text = await response.text();
      console.error(text);

      // Tenta alternativa: executar via uma função PL/pgSQL que já existe
      console.log('\n⚠️ Tentando abordagem alternativa...');

      // Dividir statements e executar via queries normais
      const statements = sql
        .split(';\n')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`📝 Total de statements: ${statements.length}`);

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        console.log(`Executando statement ${i + 1}/${statements.length}...`);
        // Infelizmente não temos um RPC universal, mas vamos continuar

        if (stmt.includes('CREATE TABLE')) {
          console.log(`✅ [Seria criada tabela]`);
        } else if (stmt.includes('CREATE POLICY')) {
          console.log(`✅ [Seria criada policy]`);
        } else if (stmt.includes('CREATE INDEX')) {
          console.log(`✅ [Seria criado índice]`);
        } else {
          console.log(`✅ [Seria executado]`);
        }
      }

      throw new Error(
        'Não foi possível executar a migration via API. ' +
        'Acesse https://supabase.com/dashboard → SQL Editor e copie/cole o conteúdo de ' +
        'supabase/migrations/0007_document_templates.sql'
      );
    }

    const result = await response.json();
    console.log('✅ Migration executada com sucesso!');
    console.log('Response:', result);

    // Verificar criação
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/document_templates?limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (checkResponse.ok) {
      console.log('✅ Tabela document_templates criada com sucesso!');
    } else {
      console.error('❌ Tabela não foi criada');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('\n📝 SOLUÇÃO MANUAL:');
    console.error('1. Acesse: https://supabase.com/dashboard');
    console.error('2. Selecione o projeto "yivjuhurcadxtllmkkqd"');
    console.error('3. Vá para "SQL Editor"');
    console.error('4. Clique em "New Query"');
    console.error('5. Cole o conteúdo de: supabase/migrations/0007_document_templates.sql');
    console.error('6. Clique em "Run"');
    process.exit(1);
  }
})();
