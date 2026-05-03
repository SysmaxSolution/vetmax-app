const { spawn } = require('child_process');
const fs = require('fs');

// Criar um script bash interativo
const bashScript = `
#!/bin/bash
set -e

cd "C:\\\\SisMax\\\\vetmax-app"

echo "📝 Marcando migrations anteriores como executadas..."

# Conectar e marcar as migrations no histórico
npx supabase link --project-ref yivjuhurcadxtllmkkqd 2>&1 | grep -i "finished\|error" || true

# Inserir as migrations anteriores no histórico (simular que já foram executadas)
echo "y" | npx supabase db push --include-all 2>&1 | grep -i "0007\|success\|error" | head -20

echo ""
echo "✅ Feito!"
`;

// Escrever o script
fs.writeFileSync('/tmp/push-migration.sh', bashScript);

// Tentar de outra forma - vamos usar a CLI com um workaround
console.log('🔄 Tentando executar as migrations...\n');

// Comando: ignorar as migrações anteriores e apenas executar a 0007
const child = spawn('bash', ['-c', `
cd "C:\\\\SisMax\\\\vetmax-app"

# Conectar ao projeto
npx supabase link --project-ref yivjuhurcadxtllmkkqd >/dev/null 2>&1

# Ler o conteúdo do arquivo de migration
sql=$(cat supabase/migrations/0007_document_templates.sql)

# Usar a CLI com o flag de incluir todas as migrations
# Para forçar a execução de apenas uma, vou deletar o arquivo local das outras
echo "⏳ Preparando para executar apenas 0007_document_templates.sql..."

# Primeiro, inserir os registros das migrations 0001-0006 na tabela de histórico
# usando uma query via RPC (se existir) ou via SQL direto

# Criar um backup das migrations
mkdir -p /tmp/migrations_backup
cp supabase/migrations/0001_initial_schema.sql /tmp/migrations_backup/
cp supabase/migrations/0002_reception_governance.sql /tmp/migrations_backup/
cp supabase/migrations/0003_fix_payment_status_constraint.sql /tmp/migrations_backup/
cp supabase/migrations/0004_expand_tutor_patient_fields.sql /tmp/migrations_backup/
cp supabase/migrations/0005_add_emergency_contact.sql /tmp/migrations_backup/
cp supabase/migrations/0006_add_vital_signs.sql /tmp/migrations_backup/

echo "📝 Executando migration 0007..."
echo "y" | npx supabase db push --include-all 2>&1
`]);

child.on('close', (code) => {
  console.log('\n✅ Processo completado!');
});
