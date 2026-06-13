import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Acordo de Processamento de Dados (DPA) — SysVetMax',
  description: 'Contrato de processamento de dados entre a Clínica (Controladora) e a Sysmax (Operadora), conforme arts. 37–39 e 46–48 da LGPD.',
}

export default function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Acordo de Processamento de Dados (DPA)</h1>
      <p className="text-sm text-slate-500 mb-2">Versão 1.0 · Vigência a partir de 13 de junho de 2026</p>
      <p className="text-sm text-slate-500 mb-8">
        Este DPA é parte integrante dos Termos de Uso e rege o processamento de dados pessoais realizado pela
        Sysmax em nome da Clínica, nos termos dos arts. 37, 39, 42, 46 e 48 da Lei 13.709/2018 (LGPD).
      </p>

      <Section title="Cláusula 1 — Definições">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>"Controladora"</strong>: a Clínica veterinária ou profissional autônomo que determina as finalidades e os meios do tratamento de dados pessoais de Tutores e colaboradores.</li>
          <li><strong>"Operadora"</strong>: Sysmax Solutions Desenvolvimento de Software Ltda., que realiza o tratamento em nome e por instrução da Controladora.</li>
          <li><strong>"Dados Pessoais"</strong>: qualquer informação relacionada a pessoa natural identificada ou identificável, conforme art. 5.º, I, da LGPD.</li>
          <li><strong>"Dados Pessoais Sensíveis"</strong>: dados de saúde dos Tutores (quando aplicável) e informações de saúde dos animais que possam identificar seu responsável.</li>
          <li><strong>"Suboperador"</strong>: terceiro que processa Dados Pessoais por instrução da Operadora.</li>
          <li><strong>"Incidente de Segurança"</strong>: acesso não autorizado, destruição, perda, alteração, comunicação ou qualquer forma inadequada de tratamento de Dados Pessoais.</li>
        </ul>
      </Section>

      <Section title="Cláusula 2 — Objeto e Instrução Documentada">
        <p>
          A Operadora realizará o tratamento dos Dados Pessoais <strong>exclusivamente</strong> para as finalidades
          determinadas pela Controladora por meio dos recursos da plataforma SysVetMax e, quando necessário, por
          instrução escrita enviada ao e-mail{' '}
          <a href="mailto:privacidade@sysmaxsolutions.com" className="text-indigo-600 underline">
            privacidade@sysmaxsolutions.com
          </a>.
        </p>
        <p className="mt-2">
          A Operadora não tratará os dados para finalidade diversa das instruídas, salvo obrigação legal ou
          determinação de autoridade competente, caso em que notificará a Controladora previamente (quando
          juridicamente possível).
        </p>
      </Section>

      <Section title="Cláusula 3 — Categorias de Dados e Operações">
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Categoria</th>
              <th className="border border-slate-200 p-2 text-left">Operações</th>
              <th className="border border-slate-200 p-2 text-left">Titulares</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Identificação e contato', 'Armazenamento, acesso, exibição', 'Tutores, Colaboradores'],
              ['Dados de saúde animal + histórico clínico', 'Armazenamento, acesso, geração de laudos', 'Tutores (via animal)'],
              ['Dados financeiros (pagamentos)', 'Armazenamento, cálculo, NFS-e', 'Tutores, Clínica'],
              ['Logs de autenticação e uso', 'Coleta, armazenamento, monitoramento', 'Colaboradores'],
              ['Comunicações WhatsApp', 'Transmissão via API terceira (Meta)', 'Tutores (c/ consentimento)'],
            ].map(([cat, ops, tit]) => (
              <tr key={cat}>
                <td className="border border-slate-200 p-2">{cat}</td>
                <td className="border border-slate-200 p-2">{ops}</td>
                <td className="border border-slate-200 p-2">{tit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Cláusula 4 — Medidas Técnicas e Organizacionais (art. 46, LGPD)">
        <p>A Operadora implementa e mantém, no mínimo:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Criptografia em trânsito (TLS 1.3) e em repouso (AES-256) para todos os Dados Pessoais;</li>
          <li>Isolamento lógico por clínica (<em>multi-tenancy</em> com <em>Row Level Security</em>);</li>
          <li>Controle de acesso baseado em função com princípio do menor privilégio;</li>
          <li>Autenticação de dois fatores disponível para todos os Usuários;</li>
          <li>Backups automáticos com retenção mínima de 30 dias e teste de restauração trimestral;</li>
          <li>Monitoramento de anomalias com alertas de segurança em tempo real;</li>
          <li>Programa de resposta a incidentes documentado e testado anualmente;</li>
          <li>Revisão periódica de acessos privilegiados com trilha de auditoria imutável.</li>
        </ol>
      </Section>

      <Section title="Cláusula 5 — Suboperadores Autorizados">
        <p>
          A Controladora autoriza, desde já, o uso dos seguintes suboperadores para as finalidades indicadas:
        </p>
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Suboperador</th>
              <th className="border border-slate-200 p-2 text-left">Finalidade</th>
              <th className="border border-slate-200 p-2 text-left">País</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Supabase Inc.', 'Banco de dados e autenticação', 'EUA (SCC)'],
              ['Vercel Inc.', 'Hospedagem e CDN', 'EUA/Europa'],
              ['Anthropic PBC', 'IA — processamento de linguagem', 'EUA (dados minimizados)'],
              ['Meta (Evolution API)', 'Envio de mensagens WhatsApp', 'EUA/Brasil'],
              ['Focus NFe (Acras)', 'Emissão de NFS-e', 'Brasil'],
            ].map(([sub, fin, pais]) => (
              <tr key={sub}>
                <td className="border border-slate-200 p-2">{sub}</td>
                <td className="border border-slate-200 p-2">{fin}</td>
                <td className="border border-slate-200 p-2">{pais}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">
          Toda alteração de suboperadores que possa afetar a proteção dos Dados Pessoais será comunicada à
          Controladora com antecedência mínima de 30 dias, facultando-lhe a rescisão sem ônus.
        </p>
      </Section>

      <Section title="Cláusula 6 — Assistência ao Exercício de Direitos (art. 18, LGPD)">
        <p>
          A Operadora auxiliará a Controladora no atendimento de solicitações dos Titulares, fornecendo em até
          10 dias úteis: (i) confirmação de tratamento; (ii) exportação dos dados em formato estruturado (JSON/CSV);
          (iii) execução de correções ou exclusões determinadas pela Controladora, respeitados os prazos mínimos
          de retenção legal.
        </p>
      </Section>

      <Section title="Cláusula 7 — Incidentes de Segurança (art. 48, LGPD)">
        <p>Em caso de Incidente de Segurança confirmado:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>A Operadora notificará a Controladora em até <strong>72 horas</strong> após a ciência do evento, pelo e-mail cadastrado pela Clínica e pelo canal de suporte;</li>
          <li>A notificação incluirá: natureza do incidente, categorias e estimativa de registros afetados, possíveis consequências e medidas adotadas ou planejadas;</li>
          <li>A Controladora é responsável por comunicar o incidente à ANPD e aos Titulares, quando exigido por lei;</li>
          <li>A Operadora fornecerá toda a cooperação necessária para a investigação e mitigação.</li>
        </ol>
      </Section>

      <Section title="Cláusula 8 — Auditoria e Conformidade">
        <p>
          A Operadora fornecerá, mediante solicitação da Controladora com antecedência de 30 dias:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Relatório de impacto à proteção de dados (RIPD) ou evidências equivalentes;</li>
          <li>Certificados ou relatórios de auditoria de terceiros (SOC 2, ISO 27001) quando disponíveis;</li>
          <li>Respostas a questionários de segurança fundamentados.</li>
        </ul>
        <p className="mt-2">
          Auditorias presenciais ou por ferramentas de varredura nos sistemas da Operadora dependem de acordo
          prévio, a fim de preservar a segurança e a confidencialidade de outros clientes.
        </p>
      </Section>

      <Section title="Cláusula 9 — Retenção, Devolução e Exclusão de Dados">
        <p>
          Após o encerramento da relação contratual:
        </p>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Os dados ficam disponíveis para exportação pela Controladora por <strong>30 dias corridos</strong>;</li>
          <li>Findo esse prazo, a Operadora excluirá ou anonimizará os dados, exceto os sujeitos a retenção legal obrigatória (prontuários CFMV, dados fiscais);</li>
          <li>A Controladora receberá confirmação escrita da conclusão da exclusão em até 15 dias após o encerramento;</li>
          <li>Os dados retidos por obrigação legal serão excluídos tão logo cessem os prazos aplicáveis.</li>
        </ol>
      </Section>

      <Section title="Cláusula 10 — Responsabilidade">
        <p>
          A Operadora responderá pelos danos causados aos Titulares decorrentes de tratamento realizado em
          desconformidade com as instruções da Controladora ou com a LGPD, nos termos do art. 42, §1.º, II.
          A Controladora responderá pelos danos decorrentes de instruções ilegais que tenha fornecido.
        </p>
      </Section>

      <Section title="Cláusula 11 — Vigência e Revisão">
        <p>
          Este DPA entra em vigor com a aceitação dos Termos de Uso e permanece vigente enquanto durar a relação
          contratual. Revisões materiais serão comunicadas com antecedência mínima de 30 dias.
        </p>
      </Section>

      <p className="mt-10 text-xs text-slate-400">
        Sysmax Solutions · São Paulo, SP · DPO: privacidade@sysmaxsolutions.com · Versão 1.0 · 2026-06-13
      </p>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-700 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}
