import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso — SysVetMax',
  description: 'Termos e condições gerais de uso da plataforma SysVetMax.',
}

export default function TermosDeUsoPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
      <p className="text-sm text-slate-500 mb-8">Versão 1.0 · Vigência a partir de 13 de junho de 2026</p>

      <Section title="1. Identificação das Partes">
        <p>
          O presente instrumento regula o uso da plataforma <strong>SysVetMax</strong>, de titularidade de{' '}
          <strong>Sysmax Solutions Desenvolvimento de Software Ltda.</strong> (doravante "<strong>Sysmax</strong>"
          ou "<strong>nós</strong>"), inscrita no CNPJ/MF em processo de regularização, com sede na cidade de São Paulo, Estado de São Paulo,
          endereço eletrônico: <a href="mailto:legal@sysmaxsolutions.com" className="text-indigo-600 underline">legal@sysmaxsolutions.com</a>.
        </p>
        <p className="mt-2">
          "<strong>Usuário</strong>" é toda pessoa física ou jurídica que acessa ou utiliza o SysVetMax na condição de
          Médico Veterinário, Auxiliar Veterinário, Recepcionista, Farmacêutico ou Administrador de clínica.
          "<strong>Clínica</strong>" é a pessoa jurídica (ou profissional autônomo) que contrata a assinatura em nome
          de seus colaboradores.
        </p>
      </Section>

      <Section title="2. Objeto">
        <p>
          O SysVetMax é um sistema de gestão clínica veterinária fornecido em modelo <em>Software as a Service</em>{' '}
          (SaaS), que compreende módulos de: recepção e agendamento, triagem, prontuário eletrônico veterinário,
          farmácia, exames, faturamento, caixa e comunicação por WhatsApp, conforme o plano contratado.
        </p>
      </Section>

      <Section title="3. Aceitação dos Termos">
        <p>
          O acesso e uso da plataforma implicam aceitação integral e irrestrita deste instrumento. Se o Usuário não
          concordar com qualquer disposição, deverá abster-se de utilizar o serviço. A aceitação é formalizada por
          meio de <em>clickwrap</em> no momento do cadastro, com registro de data/hora, versão do documento, endereço
          IP e <em>user-agent</em>, nos termos do art. 107 do Código Civil e do Marco Civil da Internet
          (Lei 12.965/2014, art. 7.º).
        </p>
      </Section>

      <Section title="4. Elegibilidade e Cadastro">
        <ol className="list-decimal pl-5 space-y-1">
          <li>O cadastro de Clínicas é restrito a representantes legais ou procuradores com poderes expressos.</li>
          <li>Médicos Veterinários devem possuir registro ativo no CFMV; Auxiliares, registro no CRMV competente.</li>
          <li>O Usuário é responsável pela veracidade das informações prestadas. Dados falsos ensejam rescisão imediata.</li>
          <li>Uma conta por pessoa física; senhas são pessoais e intransferíveis.</li>
        </ol>
      </Section>

      <Section title="5. Obrigações do Usuário">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Utilizar o SysVetMax exclusivamente para finalidades lícitas e compatíveis com a atividade clínica veterinária.</li>
          <li>Observar o Código de Ética Médico-Veterinária do CFMV e as Resoluções aplicáveis, em especial a Resolução CFMV n.º 1321/2020 (prontuário eletrônico).</li>
          <li>Não compartilhar credenciais de acesso com terceiros não autorizados.</li>
          <li>Não introduzir vírus, <em>malware</em> ou qualquer código malicioso.</li>
          <li>Não realizar engenharia reversa, descompilação ou extração não autorizada do código-fonte.</li>
          <li>Manter cópia de segurança própria de dados considerados críticos, sem prejuízo das redundâncias mantidas pela Sysmax.</li>
          <li>Notificar imediatamente a Sysmax em caso de suspeita de acesso não autorizado à conta.</li>
        </ol>
      </Section>

      <Section title="6. Obrigações da Sysmax">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Disponibilizar o SysVetMax com esforço razoável de continuidade e qualidade, conforme o SLA do plano contratado.</li>
          <li>Implementar medidas técnicas e organizacionais adequadas para a segurança dos dados (art. 46, LGPD).</li>
          <li>Tratar os dados pessoais conforme as instruções documentadas da Clínica, na qualidade de Operadora (art. 37–39, LGPD).</li>
          <li>Notificar incidentes de segurança à Clínica (Controladora) em até 72 horas após a ciência do evento (art. 48, LGPD).</li>
          <li>Fornecer suporte técnico nos horários e canais informados no painel de ajuda.</li>
        </ol>
      </Section>

      <Section title="7. Propriedade Intelectual">
        <p>
          Todo o código-fonte, interface, marca, logotipo, arquitetura de banco de dados e demais elementos do
          SysVetMax são de propriedade exclusiva da Sysmax, protegidos pela Lei 9.279/1996 (Propriedade Industrial),
          Lei 9.610/1998 (Direitos Autorais) e Lei 9.609/1998 (Software). A assinatura confere ao Usuário licença
          de uso não exclusiva, intransferível e revogável, restrita às funcionalidades do plano contratado.
        </p>
        <p className="mt-2">
          Os dados clínicos inseridos pelos Usuários (prontuários, exames, laudos) são de titularidade da Clínica.
          A Sysmax não reivindica propriedade sobre esses dados.
        </p>
      </Section>

      <Section title="8. Disponibilidade e Manutenções">
        <p>
          A Sysmax envidará esforços para manter disponibilidade mensal de 99,5 % no plano Free, 99,8 % no
          Premium e 99,9 % no Enterprise. Janelas de manutenção programadas serão anunciadas com antecedência
          mínima de 48 horas. Indisponibilidades por força maior, falhas em infraestrutura de terceiros (AWS,
          Supabase, Vercel) ou ataques cibernéticos não serão computadas no cálculo de SLA.
        </p>
      </Section>

      <Section title="9. Retenção de Dados Clínicos (CFMV)">
        <p>
          Em atenção à Resolução CFMV n.º 1321/2020, prontuários eletrônicos e laudos são retidos pelo prazo
          mínimo de <strong>5 (cinco) anos</strong> contados da data da última consulta do animal. A exclusão
          física de registros dentro desse prazo é tecnicamente bloqueada pelo sistema. Após o período de
          retenção, a Clínica pode solicitar a exclusão definitiva mediante requisição formal.
        </p>
      </Section>

      <Section title="10. Direitos dos Titulares de Dados (LGPD, art. 18)">
        <p>
          Os Tutores e colaboradores cujos dados pessoais são tratados por meio da plataforma podem exercer,
          a qualquer momento, os seguintes direitos perante a Clínica (Controladora) ou diretamente perante a
          Sysmax (DPO):{' '}
          <a href="mailto:privacidade@sysmaxsolutions.com" className="text-indigo-600 underline">
            privacidade@sysmaxsolutions.com
          </a>:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Confirmação da existência de tratamento e acesso aos dados;</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
          <li>Portabilidade dos dados a outro fornecedor;</li>
          <li>Eliminação dos dados tratados com consentimento;</li>
          <li>Informação sobre compartilhamento com terceiros;</li>
          <li>Revogação do consentimento a qualquer tempo;</li>
          <li>Revisão de decisões automatizadas.</li>
        </ul>
        <p className="mt-2">
          Para detalhes sobre o tratamento de dados, consulte nossa{' '}
          <a href="/privacidade" className="text-indigo-600 underline font-medium">Política de Privacidade</a>{' '}
          e o <a href="/dpa" className="text-indigo-600 underline font-medium">Acordo de Processamento de Dados (DPA)</a>.
          Solicitações são atendidas em até 15 dias úteis.
        </p>
      </Section>

      <Section title="11. Limitação de Responsabilidade">
        <p>
          A Sysmax não se responsabiliza por: (i) danos decorrentes de uso inadequado ou indevido do sistema pelo
          Usuário; (ii) decisões clínicas tomadas com base em informações inseridas incorretamente; (iii) falhas
          de conectividade de Internet de responsabilidade do Usuário; (iv) lucros cessantes ou danos indiretos
          de qualquer natureza. A responsabilidade total da Sysmax fica limitada ao valor das mensalidades pagas
          nos últimos 3 (três) meses.
        </p>
      </Section>

      <Section title="12. Rescisão">
        <p>
          A Clínica pode rescindir a assinatura a qualquer momento pelo painel de configurações ou por e-mail
          a <a href="mailto:cancelamentos@sysmaxsolutions.com" className="text-indigo-600 underline">cancelamentos@sysmaxsolutions.com</a>,
          observada a política de reembolso dos Termos de Assinatura. A Sysmax pode rescindir imediatamente em
          caso de violação deste instrumento, mediante notificação por e-mail ao endereço cadastrado.
        </p>
        <p className="mt-2">
          Após a rescisão, os dados da Clínica ficam disponíveis para exportação por 30 dias, sendo então
          anonimizados ou excluídos, exceto aqueles sujeitos a prazo legal de retenção obrigatória.
        </p>
      </Section>

      <Section title="13. Alterações">
        <p>
          A Sysmax pode alterar estes Termos com aviso de 30 dias por e-mail e notificação no painel. O
          uso continuado após o prazo implica aceitação das novas condições. Alterações motivadas por
          exigência legal ou regulatória podem ter vigência imediata, com comunicação simultânea.
        </p>
      </Section>

      <Section title="14. Foro e Lei Aplicável">
        <p>
          Fica eleito o foro da Comarca de São Paulo, Estado de São Paulo, para dirimir quaisquer controvérsias,
          com renúncia expressa a qualquer outro, por mais privilegiado que seja. Aplica-se a legislação
          brasileira, incluindo, sem limitação: Lei 8.078/1990 (CDC), Lei 12.965/2014 (Marco Civil da Internet),
          Lei 13.709/2018 (LGPD) e Código Civil Brasileiro.
        </p>
      </Section>

      <Section title="15. Disposições Gerais">
        <p>
          A nulidade de qualquer cláusula não afeta as demais. A tolerância em relação a descumprimentos não
          implica novação ou renúncia de direitos. Este instrumento constitui o acordo integral entre as partes
          sobre seu objeto, sobrepondo-se a quaisquer negociações anteriores.
        </p>
      </Section>

      <p className="mt-10 text-xs text-slate-400">
        Sysmax Solutions · São Paulo, SP · legal@sysmaxsolutions.com · Versão 1.0 · 2026-06-13
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
