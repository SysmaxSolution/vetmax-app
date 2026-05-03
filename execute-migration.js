const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Ler DATABASE_URL do .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
let databaseUrl = null;

envContent.split('\n').forEach(line => {
  if (line.startsWith('DATABASE_URL=')) {
    databaseUrl = line.replace('DATABASE_URL=', '').trim();
  }
});

if (!databaseUrl) {
  console.error('❌ DATABASE_URL não encontrada em .env.local');
  process.exit(1);
}

console.log('✅ Conectando ao Supabase via DATABASE_URL...');

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase PostgreSQL');

    // Ler o SQL da migration
    const sqlPath = path.join(__dirname, 'supabase/migrations/0007_document_templates.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('\n📝 Executando migration: 0007_document_templates.sql');
    console.log('═'.repeat(50));

    // Executar o SQL completo
    const result = await client.query(sql);
    console.log('✅ Migration executada com sucesso!');

    // Verificar se a tabela foi criada
    console.log('\n📋 Verificando criação da tabela...');
    const checkResult = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates');"
    );

    if (checkResult.rows[0].exists) {
      console.log('✅ Tabela document_templates criada com sucesso!');

      // Listar colunas
      const columnsResult = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'document_templates'
        ORDER BY ordinal_position;
      `);

      console.log('\n📊 Colunas da tabela:');
      columnsResult.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });

      // Verificar RLS
      const rlsResult = await client.query(`
        SELECT * FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'document_templates';
      `);

      if (rlsResult.rows.length > 0 && rlsResult.rows[0].rowsecurity) {
        console.log('\n🔒 RLS (Row Level Security): ✅ Ativado');
      }

      // Verificar índices
      const indexesResult = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'document_templates';
      `);

      console.log('\n📑 Índices criados:');
      indexesResult.rows.forEach(row => {
        console.log(`  - ${row.indexname}`);
      });

      console.log('\n' + '═'.repeat(50));
      console.log('🎉 Migration completada com sucesso!');
      console.log('═'.repeat(50));
    } else {
      console.error('❌ Tabela não foi criada');
      process.exit(1);
    }

    await client.end();
  } catch (error) {
    console.error('\n❌ Erro ao executar migration:');
    console.error('Mensagem:', error.message);
    if (error.detail) console.error('Detalhes:', error.detail);
    if (error.hint) console.error('Dica:', error.hint);
    process.exit(1);
  }
})();
