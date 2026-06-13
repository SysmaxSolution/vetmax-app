import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — SysVetMax',
  description: 'Este documento explica como a Sysmax Solutions trata os dados pessoais de quem usa o SysVetMax, em conformidade com a LGPD.',
}

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Política de Privacidade — SysVetMax</h1>
      <p className="text-sm text-slate-500 mb-1">Versão 1.0 · Vigência a partir de 13 de junho de 2026</p>
      <p className="text-sm text-slate-500 mb-8">Empresa: Sysmax Solutions · privacidade@sysmaxsolutions.com.br</p>

      <div className="bg-slate-50 border border-slate-200 rounded p-4 text-sm text-slate-700 mb-8 space-y-2">
        <p className="font-semibold">Resumo executivo — em linguagem simples</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Se você é uma clínica veterinária</strong> que contratou o SysVetMax: você é a responsável legal pelos dados dos seus clientes e funcionários. Nós somos o "prestador de serviço tecnológico" que protege e processa esses dados segundo suas instruções e esta Política.</li>
          <li><strong>Se você é veterinário, recepcionista ou auxiliar</strong> que usa o sistema no dia a dia: seus dados de login, CRMV e atividade no sistema são necessários para o funcionamento da plataforma e para rastreabilidade clínica exigida pelo CFMV.</li>
          <li><strong>Se você é responsável por um animal</strong> atendido em uma clínica que usa o SysVetMax: seus dados (nome, CPF, telefone, histórico financeiro) são gerenciados pela clínica. Você pode solicitar acesso, correção ou exclusão diretamente a ela.</li>
          <li><strong>Não vendemos dados.</strong> Não usamos seus dados para publicidade própria. Cada clínica vê apenas seus próprios dados — nunca os de outra.</li>
          <li>Em caso de dúvida ou solicitação de direitos: <strong>privacidade@sysmaxsolutions.com.br</strong>.</li>
        </ul>
      </div>

      <Section title="1. Quem Somos e Como nos Contatar">
        <p>
          <strong>Sysmax Solutions</strong> ("Sysmax", "nós") é uma empresa de tecnologia desenvolvedora do <strong>SysVetMax</strong>, sistema de gestão veterinária SaaS (Software como Serviço) disponível em{' '}
          <a href="https://sysvetmax.sysmaxsolutions.com.br" className="text-indigo-600 underline">https://sysvetmax.sysmaxsolutions.com.br</a>.
        </p>
        <table className="w-full text-xs border-collapse mt-3">
          <tbody>
            {[
              ['Razão social', 'Sysmax Solutions'],
              ['CNPJ', '[A ser preenchido antes da publicação]'],
              ['E-mail de privacidade', 'privacidade@sysmaxsolutions.com.br'],
              ['Site institucional', 'https://sysvetmax.sysmaxsolutions.com.br'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="border border-slate-200 p-2 font-medium bg-slate-50 w-40">{k}</td>
                <td className="border border-slate-200 p-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          Para qualquer questão relacionada a dados pessoais — pedidos de acesso, correção, exclusão, portabilidade ou reclamações —, use o canal acima. Respondemos em até <strong>30 (trinta) dias úteis</strong> (prazo aplicável a Agentes de Tratamento de Pequeno Porte, conforme Resolução CD/ANPD n.º 2/2022).
        </p>
      </Section>

      <Section title="2. Papéis na LGPD: Quem é o Controlador e Quem é o Operador">
        <p>A Lei Geral de Proteção de Dados Pessoais (Lei n.º 13.709/2018 — "LGPD") define dois papéis centrais no tratamento de dados:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Controlador:</strong> quem decide <em>por que</em> e <em>como</em> os dados pessoais são tratados.</li>
          <li><strong>Operador:</strong> quem trata os dados pessoais em nome do Controlador, seguindo suas instruções.</li>
        </ul>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Papel</th>
              <th className="border border-slate-200 p-2 text-left">Quem é</th>
              <th className="border border-slate-200 p-2 text-left">Responsabilidade principal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-200 p-2 font-medium">Controladora</td>
              <td className="border border-slate-200 p-2">A Clínica Veterinária contratante</td>
              <td className="border border-slate-200 p-2">Decide quais dados dos responsáveis/tutores e da sua equipe serão cadastrados, para quais fins e por quanto tempo</td>
            </tr>
            <tr>
              <td className="border border-slate-200 p-2 font-medium">Operadora</td>
              <td className="border border-slate-200 p-2">Sysmax Solutions</td>
              <td className="border border-slate-200 p-2">Fornece a plataforma tecnológica e trata os dados exclusivamente conforme as instruções da Clínica e esta Política</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3">
          A relação entre a Clínica e a Sysmax é formalizada pelo <strong>Contrato de Processamento de Dados (DPA — Data Processing Agreement)</strong>, publicado em{' '}
          <a href="https://sysvetmax.sysmaxsolutions.com.br/legal/dpa" className="text-indigo-600 underline">https://sysvetmax.sysmaxsolutions.com.br/legal/dpa</a>{' '}
          e disponível também mediante solicitação ao e-mail privacidade@sysmaxsolutions.com.br.
        </p>
      </Section>

      <Section title="3. Quais Dados Coletamos e por Quê">
        <h3 className="font-semibold text-slate-800 mt-2 mb-2">3.1 Dados dos Usuários do Sistema (Veterinários, Recepcionistas, Auxiliares)</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Dado</th>
              <th className="border border-slate-200 p-2 text-left">Para que serve</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Nome completo', 'Identificação no sistema e nos documentos emitidos (prontuários, receituários, laudos)'],
              ['E-mail profissional', 'Login, notificações, recuperação de senha'],
              ['Número de celular', 'Autenticação em dois fatores (2FA) e alertas críticos'],
              ['Número de registro no CRMV', 'Identificação legal obrigatória em documentos veterinários (Res. CFMV 1321/2020 e 1653/2025)'],
              ['Cargo/função', 'Controle de permissões de acesso (RBAC)'],
              ['IP de acesso e logs de sessão', 'Segurança, auditoria e prevenção a fraudes'],
              ['Foto de perfil', 'Opcional — identificação visual dentro do sistema'],
            ].map(([dado, uso]) => (
              <tr key={dado}>
                <td className="border border-slate-200 p-2 font-medium">{dado}</td>
                <td className="border border-slate-200 p-2">{uso}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          <strong>Nota sobre Receituário de Controle Especial (Receituário Azul):</strong> A emissão de receituário para medicamentos controlados envolve dados do Médico Veterinário (nome, CRMV) e dados do animal/responsável. Esses registros são retidos pelo prazo mínimo de <strong>5 (cinco) anos</strong> conforme exigência da ANVISA, e o fluxo de emissão está restrito a usuários com permissão de MV no sistema.
        </p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.2 Dados dos Responsáveis pelos Animais (Tutores)</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Dado</th>
              <th className="border border-slate-200 p-2 text-left">Para que serve</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Nome completo', 'Identificação do responsável legal pelo animal'],
              ['CPF', 'Identificação fiscal, emissão de notas fiscais (NFS-e), documentos legais'],
              ['Telefone e WhatsApp', 'Comunicação sobre consultas, lembretes, resultados de exames'],
              ['Endereço', 'Dados cadastrais para documentos'],
              ['E-mail', 'Envio de documentos, notificações, comunicação com a Clínica'],
              ['Histórico financeiro', 'Controle financeiro da Clínica, emissão de recibos e notas'],
              ['Dados de cartão de crédito/débito', 'Processados exclusivamente pelo gateway de pagamento — a Sysmax não armazena número de cartão ou CVV'],
            ].map(([dado, uso]) => (
              <tr key={dado}>
                <td className="border border-slate-200 p-2 font-medium">{dado}</td>
                <td className="border border-slate-200 p-2">{uso}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.3 Dados dos Animais (Prontuário Veterinário)</h3>
        <p>
          Os dados clínicos dos animais — peso, temperatura, diagnóstico, medicamentos prescritos, resultados de exames, histórico de vacinas, laudos — <strong>não são dados pessoais</strong> nos termos da LGPD, pois animais não são pessoas naturais.
        </p>
        <p className="mt-2">
          <strong>Exceção importante:</strong> Quando dados do animal, combinados com dados do responsável, permitem identificar indiretamente a saúde ou hábitos do responsável (ex.: doença zoonótica registrada no prontuário), tais informações passam a se enquadrar como <strong>dados pessoais sensíveis</strong> (dado de saúde) do responsável, sendo tratadas com as proteções correspondentes ao Art. 11 da LGPD.
        </p>
        <p className="mt-2">
          O prontuário veterinário está sujeito às regras do CFMV (Res. CFMV 1321/2020, atualizada pela 1653/2025) — retenção mínima de 5 anos, sigilo profissional e integridade dos registros.
        </p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.4 Dados Técnicos (Logs, IP, Dispositivo)</h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Dado técnico</th>
              <th className="border border-slate-200 p-2 text-left">Finalidade</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Endereço IP', 'Segurança, detecção de acesso suspeito, geolocalização aproximada'],
              ['Tipo de dispositivo e navegador', 'Compatibilidade técnica e diagnóstico de erros'],
              ['Logs de atividade', 'Auditoria, rastreabilidade de ações em prontuários e documentos'],
              ['Dados de erro e desempenho', 'Melhoria contínua da plataforma (monitoramento de erros)'],
              ['Cookies de sessão', 'Manutenção do login ativo'],
            ].map(([dado, fin]) => (
              <tr key={dado}>
                <td className="border border-slate-200 p-2 font-medium">{dado}</td>
                <td className="border border-slate-200 p-2">{fin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">Logs de erro são pseudonimizados automaticamente e retidos por no máximo <strong>90 dias</strong> (exceto logs de auditoria clínica — ver Seção 8.4).</p>
      </Section>

      <Section title="4. Bases Legais para Cada Tipo de Tratamento">
        <p>A LGPD exige que cada operação de tratamento de dados pessoais tenha uma base legal válida (Art. 7.º para dados comuns; Art. 11 para dados sensíveis):</p>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Categoria de dado</th>
              <th className="border border-slate-200 p-2 text-left">Base legal principal</th>
              <th className="border border-slate-200 p-2 text-left">Fundamento</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Dados dos usuários do sistema (veterinários, recepcionistas)', 'Execução de contrato (Art. 7.º, V)', 'Necessário para fornecer o acesso ao sistema contratado'],
              ['Dados dos responsáveis pelos animais', 'Execução de contrato (Art. 7.º, V)', 'Necessário para prestação do serviço veterinário pela Clínica'],
              ['Comunicações de marketing pela Clínica ao responsável', 'Consentimento (Art. 7.º, I)', 'Titular deve optar por receber comunicações comerciais'],
              ['Dados técnicos (logs, IP)', 'Legítimo interesse (Art. 7.º, IX)', 'Segurança, auditoria e melhoria legítima do serviço'],
              ['Dados financeiros da Clínica', 'Execução de contrato (Art. 7.º, V) + obrigação legal (Art. 7.º, II)', 'Cobrança e retenção fiscal obrigatória por 5 anos'],
              ['Dados de voz do responsável pelo animal (transcrição)', 'Consentimento (Art. 7.º, I)', 'Coleta de áudio de terceiro exige consentimento expresso antes do início da gravação'],
              ['Dados de voz dos profissionais da Clínica (transcrição)', 'Legítimo interesse da Clínica (Art. 7.º, IX)', 'Geração de registros clínicos precisos; Clínica responsável por informar funcionários'],
              ['Cumprimento de obrigação legal (ex.: prontuário CFMV)', 'Obrigação legal (Art. 7.º, II)', 'Res. CFMV 1321/2020 e 1653/2025 exigem registros clínicos'],
              ['Dados de saúde do responsável identificados indiretamente', 'Consentimento específico e destacado (Art. 11, I) ou tutela da saúde (Art. 11, II, f)', 'Dado sensível — exige base legal própria do Art. 11'],
              ['Monitoramento de atividade de funcionários (logs)', 'Legítimo interesse da Clínica (Art. 7.º, IX)', 'Segurança operacional e rastreabilidade clínica exigida pelo CFMV'],
              ['Notificação de incidentes à ANPD', 'Obrigação legal (Art. 7.º, II)', 'Art. 48 LGPD + Res. CD/ANPD 15/2024'],
            ].map(([cat, base, fund]) => (
              <tr key={cat}>
                <td className="border border-slate-200 p-2">{cat}</td>
                <td className="border border-slate-200 p-2">{base}</td>
                <td className="border border-slate-200 p-2">{fund}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="5. Como Usamos os Dados (Finalidades Específicas)">
        <p>A Sysmax, na condição de Operadora, usa os dados pessoais <strong>exclusivamente</strong> para as seguintes finalidades:</p>
        <ol className="list-decimal pl-5 space-y-2 mt-3">
          <li><strong>Fornecer e operar o SysVetMax:</strong> autenticação de usuários, armazenamento de prontuários, geração de documentos (receituários, laudos, encaminhamentos, Receituário de Controle Especial), controle financeiro, módulos de triagem, internação, cirurgia e farmácia.</li>
          <li><strong>Comunicação com a Clínica e seus usuários:</strong> suporte técnico, notificações do sistema (alertas de internação, lembretes de vacina), atualizações de funcionalidades.</li>
          <li>
            <strong>Agente de WhatsApp (IA) e Módulo de Transcrição de Voz:</strong>
            <p className="mt-1">Quando a Clínica habilita o assistente de WhatsApp, dados mínimos do responsável e do contexto do atendimento são enviados ao modelo de linguagem (Anthropic) para gerar respostas automáticas. Nunca enviamos CPF, dados financeiros completos ou informações sensíveis a este serviço.</p>
            <p className="mt-1">Quando o Módulo de Transcrição de Voz estiver ativo, os dados de voz de <strong>todos os presentes na consulta</strong> são coletados para geração da nota clínica. O áudio bruto é eliminado imediatamente após a transcrição. Apenas o texto resultante é armazenado no prontuário.</p>
            <p className="mt-1"><strong>Decisões automatizadas da IA:</strong> O Agente de WhatsApp e os módulos de triagem automatizada geram sugestões e rascunhos que <strong>sempre requerem revisão e aprovação de profissional habilitado</strong> antes de produção de efeitos. Nenhuma decisão que afete juridicamente o titular é tomada exclusivamente por algoritmo (Art. 20, LGPD).</p>
          </li>
          <li><strong>Faturamento e cobrança:</strong> gestão da assinatura do plano contratado pela Clínica.</li>
          <li><strong>Segurança e prevenção a fraudes:</strong> detecção de acessos anômalos, auditoria de ações em prontuários, proteção da integridade dos dados.</li>
          <li><strong>Melhoria do produto:</strong> análise de métricas de uso <strong>agregadas e anonimizadas</strong> para aprimorar a plataforma. <strong>Nunca</strong> usamos dados pessoais individualizáveis para esta finalidade.</li>
          <li><strong>Conformidade legal:</strong> atendimento a solicitações de autoridades competentes (ANPD, CRMV, Receita Federal, ordem judicial).</li>
        </ol>
        <p className="mt-3 font-semibold">O que não fazemos:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Não vendemos dados pessoais a terceiros.</li>
          <li>Não usamos dados de responsáveis ou animais para publicidade própria da Sysmax.</li>
          <li>Não compartilhamos dados entre clínicas (isolamento multi-tenant garantido por <code className="bg-slate-100 px-1 rounded">clinic_id</code> em todas as tabelas).</li>
          <li>Não permitimos que suboperadores usem dados pessoais tratados em nome das Clínicas para treinamento ou ajuste fino de modelos de inteligência artificial.</li>
        </ul>
      </Section>

      <Section title="6. Com Quem Compartilhamos os Dados (Suboperadores)">
        <p>Para fornecer o SysVetMax, utilizamos os seguintes suboperadores:</p>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Suboperador</th>
              <th className="border border-slate-200 p-2 text-left">País-sede</th>
              <th className="border border-slate-200 p-2 text-left">Finalidade</th>
              <th className="border border-slate-200 p-2 text-left">Certificação/Garantia</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Supabase Inc.', 'EUA', 'Banco de dados, autenticação de usuários, armazenamento de arquivos', 'SOC 2 Type II; DPA disponível em supabase.com/privacy'],
              ['Anthropic PBC', 'EUA', 'Processamento de linguagem natural para o Agente de WhatsApp IA e transcrição de voz', 'DPA disponível em anthropic.com; cláusula expressa proibindo uso de dados para treinamento de modelos'],
              ['Evolution API', 'Brasil', 'Integração com WhatsApp Business para envio de mensagens automáticas', 'Servidor hospedado na infraestrutura da própria Clínica ou em servidor dedicado'],
              ['Vercel Inc.', 'EUA', 'Hospedagem da aplicação web (frontend e backend serverless)', 'SOC 2 Type II; DPA disponível em vercel.com/legal/privacy-policy'],
              ['Gateway de Pagamento', 'Brasil/EUA', 'Processamento de pagamentos da assinatura da Clínica', 'PCI-DSS Level 1; dados de cartão nunca armazenados pela Sysmax'],
            ].map(([sub, pais, fin, cert]) => (
              <tr key={sub}>
                <td className="border border-slate-200 p-2 font-medium">{sub}</td>
                <td className="border border-slate-200 p-2">{pais}</td>
                <td className="border border-slate-200 p-2">{fin}</td>
                <td className="border border-slate-200 p-2">{cert}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          <strong>Proibição de uso para treino de IA pelos suboperadores:</strong> Todos os contratos com suboperadores incluem cláusula expressa proibindo o uso dos dados pessoais processados em nome das Clínicas para: (a) treinamento ou ajuste fino de modelos de inteligência artificial; (b) benchmarking público; (c) transferência a terceiros não autorizados.
        </p>
        <p className="mt-2">
          Caso adicionemos novos suboperadores que ampliem o escopo de tratamento de dados, notificaremos as Clínicas com <strong>30 dias de antecedência</strong>. A lista completa e atualizada está sempre disponível em{' '}
          <a href="https://sysvetmax.sysmaxsolutions.com.br/legal/suboperadores" className="text-indigo-600 underline">https://sysvetmax.sysmaxsolutions.com.br/legal/suboperadores</a>.
        </p>
      </Section>

      <Section title="7. Transferência Internacional de Dados">
        <p>
          Alguns de nossos suboperadores (Supabase, Vercel, Anthropic) têm sede ou infraestrutura nos <strong>Estados Unidos</strong> e em outros países fora do Brasil.
        </p>
        <p className="mt-2">
          As transferências internacionais de dados pessoais são realizadas exclusivamente por meio de <strong>Cláusulas Contratuais Padrão (SCC) aprovadas pela ANPD</strong>, nos termos da Resolução CD/ANPD n.º 19/2024 (vigente desde 23 de agosto de 2025).
        </p>
        <p className="mt-2"><strong>Nossa abordagem por suboperador:</strong></p>
        <ul className="list-disc pl-5 space-y-2 mt-1">
          <li><strong>Supabase:</strong> Priorizamos a utilização da região <strong>sa-east-1 (São Paulo, Brasil)</strong> para armazenamento dos dados das Clínicas brasileiras, evitando a transferência internacional dos dados do prontuário e do responsável.</li>
          <li><strong>Vercel:</strong> O código da aplicação é executado em Edge Network global. Dados em trânsito são protegidos por TLS 1.3.</li>
          <li><strong>Anthropic:</strong> Dados enviados ao modelo de linguagem são processados em servidores nos EUA. Aplicamos SCC e minimização de dados: nunca enviamos CPF, dados financeiros ou outros dados sensíveis a este serviço. A Clínica pode <strong>desabilitar o Agente de IA</strong> nas configurações, zerando essa transferência.</li>
        </ul>
      </Section>

      <Section title="8. Por Quanto Tempo Guardamos os Dados">
        <p className="font-semibold mb-2">8.1 Prontuários Veterinários</p>
        <p><strong>Prazo mínimo:</strong> 5 (cinco) anos contados a partir do <strong>último atendimento</strong> registrado no prontuário. <strong>Base:</strong> Resolução CFMV n.º 1321/2020, mantida pela 1653/2025.</p>
        <p className="mt-2">Após o encerramento do contrato, os prontuários permanecem acessíveis para exportação por <strong>90 dias</strong>. Após este prazo, os dados são eliminados de forma segura, salvo se a Clínica solicitar extensão mediante justificativa legal.</p>

        <p className="font-semibold mt-4 mb-2">8.2 Dados Financeiros</p>
        <p><strong>Prazo:</strong> 5 (cinco) anos, contados do encerramento do exercício fiscal em que a transação ocorreu. <strong>Base:</strong> Legislação fiscal brasileira (Lei n.º 5.172/1966 — CTN).</p>

        <p className="font-semibold mt-4 mb-2">8.3 Dados de Contato dos Responsáveis pelos Animais</p>
        <p><strong>Prazo:</strong> Enquanto a conta da Clínica estiver ativa + 90 dias após encerramento do contrato (para exportação). A Clínica pode excluir dados de responsáveis individuais a qualquer momento, desde que respeitadas as obrigações de prontuário do CFMV.</p>

        <p className="font-semibold mt-4 mb-2">8.4 Dados dos Usuários do Sistema (Funcionários da Clínica)</p>
        <p><strong>Prazo geral:</strong> Enquanto a conta do usuário estiver ativa.</p>
        <p className="mt-1"><strong>Exceção para logs de auditoria clínica:</strong> Os registros de log que identifiquem o <strong>autor</strong> de criação, alteração ou exclusão em prontuários veterinários — incluindo nome completo e número de CRMV — são retidos pelo prazo <strong>mínimo de 5 (cinco) anos</strong> contados do último atendimento registrado, em cumprimento ao Art. 8.º da Resolução CFMV n.º 1321/2020.</p>
        <p className="mt-1">Logs de autenticação, navegação e preferências de interface são anonimizados após <strong>90 dias</strong> da desativação do usuário.</p>

        <p className="font-semibold mt-4 mb-2">8.5 Logs Técnicos e de Segurança</p>
        <p><strong>Prazo:</strong> 90 (noventa) dias, com pseudonimização automática após 30 dias. Exceção: logs que identifiquem ação em prontuário clínico seguem o prazo da Seção 8.4.</p>

        <p className="font-semibold mt-4 mb-2">8.6 Gravações de Voz (Módulo de Transcrição)</p>
        <p>O áudio bruto capturado para transcrição é <strong>eliminado imediatamente</strong> após a geração do texto transcrito. Apenas o texto resultante (nota clínica) é armazenado no prontuário.</p>

        <p className="font-semibold mt-4 mb-2">8.7 Dados de Receituário de Controle Especial</p>
        <p>Retidos por <strong>5 (cinco) anos</strong>, conforme exigência da SCTIE/ANVISA.</p>
      </Section>

      <Section title="9. Segurança dos Dados">
        <p className="font-semibold mb-2">9.1 Medidas Técnicas</p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Medida</th>
              <th className="border border-slate-200 p-2 text-left">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Criptografia em trânsito', 'TLS 1.3 em todas as comunicações entre o navegador/app e os servidores'],
              ['Criptografia em repouso', 'AES-256 para dados armazenados no banco de dados e arquivos (Supabase)'],
              ['Isolamento multi-tenant', 'Cada Clínica acessa apenas seus próprios dados, garantido por clinic_id em todas as tabelas e por Row Level Security (RLS) no banco de dados'],
              ['Controle de acesso baseado em função (RBAC)', 'Veterinários, recepcionistas e auxiliares têm permissões diferentes; acesso mínimo necessário'],
              ['Autenticação segura', 'Suporte a autenticação em dois fatores (2FA); senhas armazenadas com hash bcrypt'],
              ['Logs de auditoria', 'Todas as ações em prontuários, documentos e dados sensíveis são registradas com usuário, data/hora e IP'],
              ['Backups automáticos', 'Backups diários criptografados com retenção de 30 dias'],
              ['Plantão de segurança', 'Monitoramento 24/7 para detecção e triagem de incidentes — necessário para cumprimento do prazo de 72 horas da Res. CD/ANPD n.º 15/2024'],
            ].map(([medida, det]) => (
              <tr key={medida}>
                <td className="border border-slate-200 p-2 font-medium">{medida}</td>
                <td className="border border-slate-200 p-2">{det}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="font-semibold mt-4 mb-2">9.2 Medidas Organizacionais</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Acesso aos sistemas de produção restrito a colaboradores com necessidade comprovada.</li>
          <li>Política interna de segurança da informação com revisão anual.</li>
          <li>Contratos de confidencialidade assinados por todos os colaboradores e suboperadores.</li>
          <li>Plano de resposta a incidentes documentado (ver Seção 13).</li>
          <li>Avaliação de Impacto à Proteção de Dados (RIPD) realizada para tratamento de dados sensíveis e transferência internacional para processamento por IA, conforme Art. 38 da LGPD.</li>
        </ul>

        <p className="font-semibold mt-4 mb-2">9.3 Responsabilidades da Clínica</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Manter senhas seguras e não compartilhá-las entre funcionários.</li>
          <li>Revogar acessos de funcionários desligados imediatamente.</li>
          <li>Usar redes seguras para acessar o sistema.</li>
          <li>Notificar a Sysmax imediatamente caso suspeite de acesso não autorizado.</li>
        </ul>
      </Section>

      <Section title="10. Direitos dos Titulares (Art. 18 da LGPD)">
        <p>A LGPD garante a toda pessoa física cujos dados são tratados ("titular") os seguintes direitos:</p>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Direito</th>
              <th className="border border-slate-200 p-2 text-left">O que significa</th>
              <th className="border border-slate-200 p-2 text-left">Como exercer</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Confirmação e acesso', 'Saber se seus dados são tratados e receber cópia deles', 'Solicitar à Clínica onde é atendido'],
              ['Correção', 'Corrigir dados incompletos, inexatos ou desatualizados', 'Solicitar à Clínica; ela corrige no sistema'],
              ['Anonimização, bloqueio ou eliminação', 'Dados desnecessários, excessivos ou tratados em desconformidade', 'Solicitar à Clínica ou à Sysmax'],
              ['Portabilidade', 'Receber seus dados em formato estruturado (JSON/CSV)', 'Solicitar à Clínica; prazo: 15 dias corridos'],
              ['Eliminação de dados com consentimento', 'Apagar dados cuja base legal era o consentimento', 'Solicitar à Clínica; dados de prontuário com obrigação CFMV não podem ser eliminados antes de 5 anos'],
              ['Informação sobre compartilhamento', 'Saber com quais empresas seus dados são compartilhados', 'Esta Política (Seção 6) e o site /legal/suboperadores'],
              ['Revogação de consentimento', 'Revogar consentimentos dados anteriormente', 'Solicitar à Clínica; não afeta tratamentos já realizados'],
              ['Revisão de decisões automatizadas', 'Questionar decisões tomadas somente por algoritmos', 'O SysVetMax não toma decisões automatizadas que afetem juridicamente o titular'],
              ['Oposição ao tratamento', 'Opor-se a tratamentos em desconformidade', 'Contatar a Clínica ou a Sysmax diretamente'],
              ['Reclamação à ANPD', 'Registrar reclamação na Autoridade Nacional de Proteção de Dados', 'Acesse gov.br/anpd'],
            ].map(([dir, sig, como]) => (
              <tr key={dir}>
                <td className="border border-slate-200 p-2 font-medium">{dir}</td>
                <td className="border border-slate-200 p-2">{sig}</td>
                <td className="border border-slate-200 p-2">{como}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          <strong>Canal de solicitação:</strong> Os titulares devem, em primeiro lugar, contatar a <strong>Clínica</strong> (Controladora). Caso a Clínica não responda ou o titular precise de suporte técnico, pode contatar a Sysmax pelo e-mail{' '}
          <a href="mailto:privacidade@sysmaxsolutions.com.br" className="text-indigo-600 underline">privacidade@sysmaxsolutions.com.br</a>.
        </p>
      </Section>

      <Section title="11. Cookies e Tecnologias de Rastreamento">
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Tipo de cookie</th>
              <th className="border border-slate-200 p-2 text-left">Finalidade</th>
              <th className="border border-slate-200 p-2 text-left">Duração</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Cookie de sessão', 'Manter o usuário autenticado enquanto usa o sistema', 'Sessão (expira ao fechar o navegador)'],
              ['Cookie de preferências', 'Lembrar configurações de interface (tema, idioma)', '1 ano'],
              ['Cookie de segurança (CSRF)', 'Proteção contra ataques de falsificação de requisição', 'Sessão'],
              ['Análise de desempenho', 'Métricas agregadas de uso (sem identificação individual)', '30 dias'],
            ].map(([tipo, fin, dur]) => (
              <tr key={tipo}>
                <td className="border border-slate-200 p-2 font-medium">{tipo}</td>
                <td className="border border-slate-200 p-2">{fin}</td>
                <td className="border border-slate-200 p-2">{dur}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2"><strong>Não usamos</strong> cookies de publicidade, rastreamento entre sites ou pixels de redes sociais.</p>
      </Section>

      <Section title="12. Dados de Menores de Idade">
        <p>O SysVetMax pode processar, em caráter excepcional, dados de <strong>responsáveis pelos animais que sejam menores de 18 anos</strong>.</p>
        <p className="mt-2">Nesses casos:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>A Clínica deve obter <strong>consentimento específico dos pais ou responsáveis legais</strong> antes de cadastrar um menor como titular dos dados (Art. 14 LGPD).</li>
          <li>Dados de menores não devem ser usados para comunicações de marketing.</li>
          <li>Caso a Sysmax identifique dados de menores coletados sem a devida autorização, comunicará a Clínica para regularização.</li>
        </ul>
      </Section>

      <Section title="13. Incidentes de Segurança — Como Notificamos">
        <p>Em caso de incidente de segurança que envolva dados pessoais, seguimos o seguinte procedimento (Art. 48 da LGPD e Res. CD/ANPD n.º 15/2024):</p>
        <table className="w-full text-xs border-collapse mt-3">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Prazo</th>
              <th className="border border-slate-200 p-2 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Até 72 horas corridas (incidente de ALTA GRAVIDADE)', 'A Sysmax envia notificação PRELIMINAR à(s) Clínica(s) afetada(s) por e-mail E a Clínica notifica a ANPD'],
              ['Até 7 dias corridos (incidente de BAIXA GRAVIDADE)', 'A Sysmax notifica a(s) Clínica(s) afetada(s) com relatório completo'],
              ['Até 30 dias após notificação preliminar', 'Relatório complementar completo enviado à ANPD'],
              ['Prazo definido com a ANPD', 'A Clínica decide, com suporte da Sysmax, se e como notificar os titulares afetados'],
            ].map(([prazo, acao]) => (
              <tr key={prazo}>
                <td className="border border-slate-200 p-2 font-medium">{prazo}</td>
                <td className="border border-slate-200 p-2">{acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">O prazo de <strong>72 horas é corrido</strong> (não útil) e conta da <strong>ciência</strong> do incidente, não da sua ocorrência. A Sysmax mantém plantão de segurança 24/7.</p>
      </Section>

      <Section title="14. Encarregado de Dados (DPO)">
        <p>
          A Sysmax Solutions enquadra-se como <strong>Agente de Tratamento de Pequeno Porte (ATPP)</strong> nos termos da Resolução CD/ANPD n.º 2/2022, o que dispensa a nomeação formal de um DPO (Art. 41, §2.º, I, da LGPD). Em substituição, mantemos canal direto e funcional para todas as demandas de privacidade:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>E-mail:</strong> privacidade@sysmaxsolutions.com.br</li>
          <li><strong>Prazo de resposta:</strong> até 30 dias úteis</li>
          <li><strong>Horário de atendimento:</strong> Segunda a sexta-feira, das 9h às 18h (horário de Brasília)</li>
        </ul>
        <p className="mt-2">
          Caso o faturamento ou o volume de dados tratados pela Sysmax supere os limites da Res. CD/ANPD n.º 2/2022, a Sysmax se compromete a nomear DPO formal no prazo de 90 dias e a atualizar este documento.
        </p>
      </Section>

      <Section title="15. Alterações desta Política">
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Tipo de mudança</th>
              <th className="border border-slate-200 p-2 text-left">Como notificamos</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Mudanças materiais (ex.: novo suboperador, nova finalidade de uso)', 'E-mail para o administrador da Clínica com 30 dias de antecedência + aviso no painel do sistema'],
              ['Mudanças não materiais (ex.: correção de texto, formatação)', 'Aviso no painel + atualização da data de "Última atualização"'],
              ['Mudanças desfavoráveis ao titular', 'Além do e-mail com 30 dias, exigimos aceite expresso antes da entrada em vigor (Art. 8.º, §6.º, LGPD)'],
            ].map(([tipo, como]) => (
              <tr key={tipo}>
                <td className="border border-slate-200 p-2 font-medium">{tipo}</td>
                <td className="border border-slate-200 p-2">{como}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">
          O histórico de versões está disponível em{' '}
          <a href="https://sysvetmax.sysmaxsolutions.com.br/legal/changelog" className="text-indigo-600 underline">https://sysvetmax.sysmaxsolutions.com.br/legal/changelog</a>.
        </p>
      </Section>

      <Section title="16. Sobrevivência das Obrigações Pós-Término Contratual">
        <p>
          As obrigações de confidencialidade, segurança de dados, cooperação em incidentes e cumprimento de prazos de retenção estabelecidas nesta Política <strong>sobrevivem ao término ou rescisão do contrato</strong> entre a Clínica e a Sysmax pelo período necessário ao cumprimento das obrigações legais aplicáveis, incluindo:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>O prazo mínimo de <strong>5 (cinco) anos</strong> do prontuário veterinário (Res. CFMV 1321/2020);</li>
          <li>O prazo de <strong>5 (cinco) anos</strong> para dados financeiros (legislação fiscal);</li>
          <li>Qualquer prazo adicional determinado por autoridade competente (ANPD, CRMV, Receita Federal).</li>
        </ul>
      </Section>

      <Section title="17. Lei Aplicável, Foro e Limitação de Responsabilidade">
        <p className="font-semibold mb-1">17.1 Lei Aplicável</p>
        <p>
          Esta Política de Privacidade é regida exclusivamente pelas leis da República Federativa do Brasil, incluindo a Lei n.º 13.709/2018 (LGPD), o Código de Defesa do Consumidor (Lei n.º 8.078/1990) quando aplicável, e a legislação veterinária pertinente (Res. CFMV 1321/2020 e 1653/2025).
        </p>
        <p className="font-semibold mt-3 mb-1">17.2 Limitação de Responsabilidade</p>
        <p>
          A responsabilidade total da Sysmax por danos comprovadamente decorrentes de falhas no tratamento de dados pessoais realizados pela plataforma SysVetMax é limitada ao valor efetivamente pago pela Clínica contratante nos <strong>12 (doze) meses</strong> imediatamente anteriores ao evento danoso.
        </p>
        <p className="mt-2">Essa limitação <strong>NÃO se aplica</strong> em casos de dolo ou culpa grave comprovada da Sysmax, violações que a Sysmax tenha sido notificada e deixado de corrigir em prazo razoável, ou descumprimento da Res. CD/ANPD n.º 15/2024 em incidentes de alta gravidade.</p>
      </Section>

      <Section title="18. Contato e Canal LGPD">
        <p>Para qualquer dúvida, solicitação ou reclamação relacionada a esta Política de Privacidade:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>E-mail principal:</strong> privacidade@sysmaxsolutions.com.br</li>
          <li><strong>Assunto sugerido:</strong> [LGPD] — seguido do tipo de solicitação</li>
          <li><strong>Site:</strong> <a href="https://sysvetmax.sysmaxsolutions.com.br/legal/privacidade" className="text-indigo-600 underline">https://sysvetmax.sysmaxsolutions.com.br/legal/privacidade</a></li>
        </ul>
        <p className="mt-3">
          <strong>Autoridade de supervisão:</strong> Caso não fique satisfeito com nossa resposta, você pode registrar reclamação na <strong>Autoridade Nacional de Proteção de Dados (ANPD)</strong>:{' '}
          <a href="https://www.gov.br/anpd" className="text-indigo-600 underline">gov.br/anpd</a>{' '}
          · ouvidoria@anpd.gov.br
        </p>
      </Section>

      <p className="mt-10 text-xs text-slate-400">
        Política de Privacidade redigida em conformidade com a Lei n.º 13.709/2018 (LGPD), Res. CD/ANPD n.º 2/2022 (ATPP), Res. CD/ANPD n.º 15/2024 (incidentes), Res. CD/ANPD n.º 19/2024 (transferência internacional), Res. CFMV n.º 1321/2020 e 1653/2025.
        {' '}Versão v1.0 · 13 de junho de 2026 · Próxima revisão programada: junho de 2027.
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
