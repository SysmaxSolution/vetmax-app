import type { Metadata } from 'next'
import Link from 'next/link'
import { Shield, ArrowLeft, FileText, Clock, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Política de Privacidade — SysVetMax',
  description: 'Política de Privacidade e tratamento de dados pessoais conforme LGPD (Lei 13.709/2018) e CFMV.',
}

const LAST_UPDATED = '26 de abril de 2026'
const RETENTION_YEARS = 7
const DPO_EMAIL = 'privacidade@vetmax.com.br'

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <Shield className="h-5 w-5 text-teal-600" />
            <span className="text-sm font-bold text-slate-700">SysVetMax — Privacidade</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">

        {/* Title */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Política de Privacidade</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <p className="text-sm text-slate-500">Última atualização: {LAST_UPDATED} · Versão 1.0</p>
              </div>
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-2xl px-6 py-4">
            <p className="text-sm text-teal-800 leading-relaxed">
              Esta política descreve como o <strong>SysVetMax</strong> coleta, usa e protege os dados pessoais
              dos tutores e animais cadastrados, em conformidade com a{' '}
              <strong>Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)</strong> e a{' '}
              <strong>Resolução CFMV nº 1.138/2016</strong>.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-10">

          <Section title="1. Controlador dos Dados" id="controlador">
            <p>
              O controlador dos dados é a <strong>clínica veterinária</strong> que contrata o SysVetMax como
              plataforma de gestão. O SysVetMax atua como <strong>operador de dados</strong>, processando
              informações exclusivamente conforme as instruções do controlador.
            </p>
            <p className="mt-3">
              Dúvidas e solicitações devem ser direcionadas ao <strong>Encarregado de Dados (DPO)</strong>:
            </p>
            <div className="mt-3 flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
              <Mail className="h-4 w-4 text-teal-600 flex-shrink-0" />
              <a href={`mailto:${DPO_EMAIL}`} className="text-sm font-medium text-teal-600 hover:text-teal-700 underline">
                {DPO_EMAIL}
              </a>
            </div>
          </Section>

          <Section title="2. Dados Coletados" id="dados-coletados">
            <p>Coletamos os seguintes dados pessoais:</p>
            <Table
              headers={['Categoria', 'Dados', 'Base Legal (LGPD)']}
              rows={[
                ['Identificação do Tutor', 'Nome, CPF, telefone, e-mail, endereço', 'Art. 7º, II — execução de contrato'],
                ['Dados do Animal', 'Nome, espécie, raça, data de nascimento, sexo, histórico clínico', 'Art. 7º, II — execução de contrato'],
                ['Prontuário Médico', 'Consultas, exames, vacinas, medicamentos, diagnósticos', 'Art. 7º, IX — legítimo interesse + obrigação legal (CFMV)'],
                ['Consentimento', 'Data, IP, versão do termo aceito', 'Art. 7º, I — consentimento'],
                ['Dados de Acesso', 'Logs de autenticação, IP, navegador', 'Art. 7º, II — segurança da informação'],
              ]}
            />
          </Section>

          <Section title="3. Finalidade do Tratamento" id="finalidade">
            <ul className="list-disc list-inside space-y-2 text-slate-700">
              <li>Prestação de serviços veterinários e gestão clínica</li>
              <li>Elaboração, armazenamento e acesso a prontuários médicos (obrigação legal — CFMV)</li>
              <li>Emissão de receituários, laudos e encaminhamentos</li>
              <li>Comunicações sobre saúde do animal (consultas, vacinas, retornos)</li>
              <li>Conformidade com obrigações regulatórias (CFMV, MAPA, ANVISA)</li>
              <li>Auditorias internas e segurança da informação</li>
            </ul>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-800">
                <strong>Importante:</strong> não utilizamos dados pessoais para fins comerciais,
                marketing não solicitado ou compartilhamento com terceiros sem autorização expressa.
              </p>
            </div>
          </Section>

          <Section title="4. Retenção de Dados" id="retencao">
            <p>
              Os dados são retidos pelos prazos mínimos exigidos por lei:
            </p>
            <Table
              headers={['Tipo de Dado', 'Prazo de Retenção', 'Fundamento Legal']}
              rows={[
                ['Prontuários médicos veterinários', `${RETENTION_YEARS} anos mínimo`, 'Resolução CFMV nº 1.138/2016, Art. 14'],
                ['Registros de consentimento LGPD', '5 anos após revogação', 'LGPD Art. 16, II'],
                ['Logs de acesso e segurança', '6 meses', 'Marco Civil da Internet (Lei 12.965/2014)'],
                ['Dados de faturamento e NF', '5 anos', 'Código Tributário Nacional (CTN)'],
                ['Dados de pessoal (CRMV, etc.)', 'Enquanto o vínculo profissional existir', 'CLT e CFM/CFMV'],
              ]}
            />
            <p className="mt-4 text-slate-600">
              Após o término dos prazos legais, os dados são <strong>anonimizados</strong> ou <strong>excluídos</strong>
              de forma segura, impossibilitando a reidentificação.
            </p>
          </Section>

          <Section title="5. Seus Direitos (LGPD Art. 18)" id="direitos">
            <p>Como titular dos dados, você tem direito a:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {[
                { right: 'Confirmação', desc: 'Saber se tratamos seus dados' },
                { right: 'Acesso', desc: 'Obter cópia dos seus dados' },
                { right: 'Correção', desc: 'Corrigir dados incompletos ou desatualizados' },
                { right: 'Anonimização', desc: 'Solicitar anonimização de dados desnecessários' },
                { right: 'Portabilidade', desc: 'Receber seus dados em formato estruturado' },
                { right: 'Revogação', desc: 'Retirar o consentimento a qualquer momento' },
                { right: 'Informação', desc: 'Saber com quem compartilhamos seus dados' },
                { right: 'Oposição', desc: 'Opor-se a tratamento indevido' },
              ].map(({ right, desc }) => (
                <div key={right} className="flex gap-3 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <Shield className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{right}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-sm text-blue-800">
                <strong>Exceção legal:</strong> o direito de eliminação não se aplica a prontuários médicos
                veterinários, cuja retenção é obrigação legal imposta pela Resolução CFMV nº 1.138/2016.
              </p>
            </div>
            <p className="mt-4">
              Para exercer seus direitos, entre em contato com o DPO:{' '}
              <a href={`mailto:${DPO_EMAIL}`} className="text-teal-600 hover:underline font-medium">
                {DPO_EMAIL}
              </a>
            </p>
          </Section>

          <Section title="6. Segurança dos Dados" id="seguranca">
            <p>Adotamos medidas técnicas e organizacionais para proteção dos dados:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-700 mt-3">
              <li>Criptografia em trânsito (TLS 1.3) e em repouso (AES-256)</li>
              <li>Controle de acesso baseado em papéis (RBAC) com isolamento multi-tenant</li>
              <li>Políticas de Row Level Security (RLS) no banco de dados</li>
              <li>Autenticação de dois fatores disponível para todos os usuários</li>
              <li>Logs de auditoria de acessos e alterações</li>
              <li>Backups diários com retenção de 30 dias</li>
            </ul>
          </Section>

          <Section title="7. Compartilhamento e Suboperadores" id="compartilhamento">
            <p>
              Seus dados podem ser processados pelos seguintes <strong>suboperadores</strong>,
              todos com acordos de processamento de dados (DPA) vigentes:
            </p>
            <Table
              headers={['Suboperador', 'Finalidade', 'País']}
              rows={[
                ['Supabase', 'Banco de dados e autenticação', 'Brasil (AWS São Paulo)'],
                ['Anthropic', 'Sugestão de diagnósticos (IA)', 'EUA — DPA assinado'],
                ['Z-API', 'Notificações WhatsApp', 'Brasil'],
                ['Vercel', 'Hospedagem da aplicação', 'EUA — SCCs vigentes'],
              ]}
            />
            <p className="mt-4 text-slate-600">
              Nenhum dado é vendido a terceiros. Compartilhamentos regulatórios (MAPA, ANVISA, CFMV)
              ocorrem apenas quando exigido por lei.
            </p>
          </Section>

          <Section title="8. Cookies e Rastreamento" id="cookies">
            <p>
              Utilizamos apenas cookies <strong>estritamente necessários</strong> para autenticação
              e segurança de sessão. Não utilizamos cookies de rastreamento, publicidade ou analytics
              de terceiros sem consentimento explícito.
            </p>
          </Section>

          <Section title="9. Alterações desta Política" id="alteracoes">
            <p>
              Podemos atualizar esta política periodicamente. Alterações significativas serão
              comunicadas por e-mail e exibidas na plataforma com pelo menos <strong>30 dias de antecedência</strong>.
              O uso continuado após a vigência implica aceite das novas condições.
            </p>
          </Section>

          <Section title="10. Contato e DPO" id="contato">
            <p>
              Para quaisquer questões sobre privacidade, acesso ou eliminação de dados:
            </p>
            <div className="mt-3 bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-2">
              <p className="text-sm"><strong>Encarregado de Dados (DPO):</strong> SysVetMax Privacy Team</p>
              <p className="text-sm">
                <strong>E-mail:</strong>{' '}
                <a href={`mailto:${DPO_EMAIL}`} className="text-teal-600 hover:underline">{DPO_EMAIL}</a>
              </p>
              <p className="text-sm"><strong>Prazo de resposta:</strong> até 15 dias úteis (LGPD Art. 18, §3º)</p>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Você também pode registrar reclamações na{' '}
              <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>:{' '}
              <span className="text-slate-600">www.gov.br/anpd</span>
            </p>
          </Section>

        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-slate-200 text-center">
          <p className="text-xs text-slate-400">
            SysVetMax · Política de Privacidade v1.0 · {LAST_UPDATED}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Em conformidade com LGPD (Lei 13.709/2018) · CFMV Res. 1.138/2016 · Marco Civil da Internet
          </p>
        </footer>

      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">
        {title}
      </h2>
      <div className="text-slate-600 leading-relaxed text-sm space-y-2">
        {children}
      </div>
    </section>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {headers.map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-slate-700 text-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
