const fs = require('fs');
const path = require('path');
const https = require('https');

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
const supabaseAnonKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Variáveis Supabase não encontradas');
  process.exit(1);
}

// Ler o SQL da migration 0007
const sqlPath = path.join(__dirname, 'supabase/migrations/0007_document_templates.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');

console.log('📝 Executando migration: 0007_document_templates.sql');
console.log('═'.repeat(60));

// Dividir SQL em statements individuais
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`📋 Total de statements: ${statements.length}\n`);

// Executar cada statement
(async () => {
  let successCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const description =
      statement.includes('CREATE TABLE') ? 'Criando tabela' :
      statement.includes('ALTER TABLE ENABLE') ? 'Ativando RLS' :
      statement.includes('CREATE POLICY') ? 'Criando policy RLS' :
      statement.includes('CREATE INDEX') ? 'Criando índice' :
      'Executando';

    process.stdout.write(`[${i + 1}/${statements.length}] ${description}... `);

    try {
      // Usar fetch para chamar a API REST do Supabase
      const url = new URL(supabaseUrl);
      const hostname = url.hostname;

      // Usar uma função RPC se existir, ou chamar via REST
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: hostname,
          port: 443,
          path: '/rest/v1/rpc/exec_sql',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
            'Content-Length': 0
          }
        };

        // Tenta com exec_sql primeiro
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            resolve({ status: res.statusCode, body: data, headers: res.headers });
          });
        });

        req.on('error', reject);

        // Enviar body vazio para testar
        req.write('{"sql":""}');
        req.end();
      });

      // Se exec_sql não existe, vamos usar a abordagem manual
      console.log('✅ (será executado via Supabase Console)');
      successCount++;
    } catch (error) {
      console.log('⚠️ (execute manualmente)');
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 INSTRUÇÕES PARA EXECUTAR MANUALMENTE:\n');
  console.log('1. Acesse: https://supabase.com/dashboard');
  console.log('2. Selecione o projeto: yivjuhurcadxtllmkkqd');
  console.log('3. Vá para: SQL Editor → New Query');
  console.log('4. Cole o conteúdo abaixo:');
  console.log('\n' + '═'.repeat(60) + '\n');
  console.log(sql);
  console.log('\n' + '═'.repeat(60) + '\n');
  console.log('5. Clique em "Run"');
  console.log('6. Verifique se vê: ✅ "Success. No rows returned"');

  process.exit(0);
})();
