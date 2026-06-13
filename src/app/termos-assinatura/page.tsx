import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Assinatura e Pagamento — SysVetMax',
  description: 'Termos de assinatura, planos, faturamento, cancelamento, SLA e tratamento de dados financeiros da plataforma SysVetMax.',
}

export default function TermosAssinaturaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-800">
      <h1 className="text-3xl font-bold mb-2">Termos de Assinatura e Pagamento — SysVetMax</h1>
      <p className="text-sm text-slate-500 mb-1">Versão 1.0 · Vigência a partir de 13 de julho de 2026 (30 dias de vacatio legis para contratos existentes)</p>
      <p className="text-sm text-slate-500 mb-8">financeiro@sysmaxsolutions.com.br · juridico@sysmaxsolutions.com.br</p>

      <div className="bg-slate-50 border border-slate-200 rounded p-4 text-sm text-slate-700 mb-8 space-y-2">
        <p className="font-semibold">Resumo executivo — em linguagem simples</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>(a) Você escolhe um plano e paga mensalmente ou anualmente;</li>
          <li>(b) Se o pagamento falhar, você tem 7 dias para regularizar antes de o acesso ser suspenso;</li>
          <li>(c) Você pode cancelar a qualquer momento pelo painel — o acesso continua até o fim do ciclo pago;</li>
          <li>(d) Após o cancelamento, seus dados ficam disponíveis para exportação por 30 dias e em backup por 90 dias;</li>
          <li>(e) Se o sistema ficar fora do ar além do limite contratado, você recebe crédito na próxima fatura;</li>
          <li>(f) Seus dados pessoais são protegidos pela LGPD e você pode exercer seus direitos pelo canal de privacidade;</li>
          <li>(g) Eventuais disputas devem ser encaminhadas primeiro ao nosso canal interno antes de qualquer contestação junto ao banco ou operadora de cartão.</li>
        </ul>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800 mb-8">
        <p>
          <strong>LEIA ATENTAMENTE.</strong> Ao clicar em "Assinar Plano", "Confirmar Pagamento" ou qualquer botão equivalente de contratação na plataforma SysVetMax, o CONTRATANTE declara ter lido, compreendido e aceito integralmente os presentes Termos de Assinatura e Pagamento ("Termos"), os Termos de Uso Geral e a Política de Privacidade e DPA disponíveis em https://sysvetmax.sysmaxsolutions.com.br/legal. O aceite eletrônico ("clickwrap") é registrado de forma imutável com data, hora, endereço IP e identificador de sessão, constituindo prova jurídica válida nos termos da Lei 14.063/2020 e MP 2.200-2/2001.
        </p>
      </div>

      <Section title="1. Definições">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Termo</th>
              <th className="border border-slate-200 p-2 text-left">Significado</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Sysmax / Fornecedor', 'Sysmax Solutions, pessoa jurídica de direito privado, desenvolvedora e operadora da plataforma SysVetMax.'],
              ['Contratante / Cliente', 'A clínica veterinária, hospital veterinário, consultório, profissional autônomo ou pessoa física que contrata o acesso à plataforma SysVetMax.'],
              ['Plataforma / SysVetMax', 'Sistema de gestão veterinária SaaS (Software as a Service) multi-tenant disponibilizado via internet em https://sysvetmax.sysmaxsolutions.com.br.'],
              ['Assinatura', 'Licença de uso não-exclusiva, intransferível e revogável da Plataforma, concedida ao Contratante mediante pagamento recorrente, conforme o Plano contratado.'],
              ['Plano', 'Conjunto de funcionalidades, limites de uso e valor mensal ou anual descritos na Seção 2 (Free, Premium, Enterprise ou Especializado).'],
              ['Módulo', 'Funcionalidade ou conjunto de funcionalidades da Plataforma que pode ser incluída em determinado Plano ou contratada como Adicional.'],
              ['Ciclo de Faturamento', 'Período de referência da cobrança: mensal (30 dias corridos) ou anual (12 meses), conforme a periodicidade escolhida pelo Contratante na contratação.'],
              ['Data de Cobrança', 'Dia do mês (ou do ano) em que a fatura é gerada e a tentativa de débito é realizada, correspondente ao aniversário da data de ativação da Assinatura.'],
              ['Período de Carência', 'Período de 7 (sete) dias corridos após a falha de pagamento durante o qual a Assinatura permanece ativa e são realizadas novas tentativas de cobrança.'],
              ['Crédito de Serviço', 'Compensação em forma de desconto na próxima fatura, concedida em caso de descumprimento do SLA, nos termos da Seção 12. Não constitui reembolso em dinheiro, salvo na hipótese de indisponibilidade total prevista na Seção 12.2.'],
              ['Uptime', 'Percentual de tempo em que a Plataforma está disponível e funcional para o Contratante em determinado mês calendário, excluídas as hipóteses de exclusão da Seção 12.3.'],
              ['Chargeback', 'Contestação de cobrança iniciada pelo Contratante junto à operadora do cartão de crédito ou débito ou ao banco emissor, sem prévio esgotamento do procedimento interno de disputa previsto na Seção 11.3.'],
              ['DPA', 'Adendo de Processamento de Dados (Data Processing Agreement), instrumento contratual complementar que disciplina o tratamento de dados pessoais conforme a LGPD, incorporado a estes Termos por referência.'],
              ['Contrato', 'Conjunto formado pelos presentes Termos, pelos Termos de Uso Geral, pela Política de Privacidade e DPA, e pelo Formulário de Pedido (se existente), todos aceitos pelo Contratante.'],
            ].map(([termo, sig]) => (
              <tr key={termo}>
                <td className="border border-slate-200 p-2 font-medium align-top w-44">{termo}</td>
                <td className="border border-slate-200 p-2">{sig}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="2. Planos e Preços">
        <h3 className="font-semibold text-slate-800 mb-2">2.1 Tabela de Planos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-200 p-2 text-left">Característica</th>
                <th className="border border-slate-200 p-2 text-left">Free</th>
                <th className="border border-slate-200 p-2 text-left">Premium</th>
                <th className="border border-slate-200 p-2 text-left">Enterprise</th>
                <th className="border border-slate-200 p-2 text-left">Especializado</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Valor mensal', 'R$ 0,00', 'R$ 99,00', 'R$ 299,00', 'Sob consulta'],
                ['Usuários', 'Até 3', 'Até 10', 'Ilimitados', 'Ilimitados'],
                ['Documentos/mês', 'Até 3', 'Até 10', 'Ilimitados', 'Ilimitados'],
                ['Prontuário eletrônico', 'Sim', 'Sim', 'Sim', 'Sim'],
                ['Módulo Recepção', 'Sim', 'Sim', 'Sim', 'Sim'],
                ['Módulo Triagem', 'Sim', 'Sim', 'Sim', 'Sim'],
                ['Módulo Veterinário', 'Sim', 'Sim', 'Sim', 'Sim'],
                ['Módulo Caixa/PDV', 'Limitado', 'Sim', 'Sim', 'Sim'],
                ['Módulo Financeiro', 'Não', 'Sim', 'Sim', 'Sim'],
                ['Módulo Internação', 'Não', 'Sim', 'Sim', 'Sim'],
                ['Módulo Centro Cirúrgico', 'Não', 'Não', 'Sim', 'Sim'],
                ['Módulo Faturamento/NFS-e', 'Não', 'Adicional', 'Sim', 'Sim'],
                ['Chat Interno', 'Não', 'Sim', 'Sim', 'Sim'],
                ['Integrações WhatsApp (Agente IA)', 'Não', 'Adicional', 'Sim', 'Sim'],
                ['Suporte', 'Comunidade', 'E-mail (48h)', 'E-mail prioritário + WhatsApp (8h)', 'Dedicado (SLA customizado)'],
                ['SLA de Uptime', 'Sem garantia', '99,5%', '99,5%', 'Negociável (contrato individualizado)'],
              ].map(([car, free, prem, ent, esp]) => (
                <tr key={car}>
                  <td className="border border-slate-200 p-2 font-medium">{car}</td>
                  <td className="border border-slate-200 p-2">{free}</td>
                  <td className="border border-slate-200 p-2">{prem}</td>
                  <td className="border border-slate-200 p-2">{ent}</td>
                  <td className="border border-slate-200 p-2">{esp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Os valores acima são os preços de tabela vigentes na data de publicação. A Sysmax poderá criar novos Planos ou descontinuar Planos existentes para novos contratos, sem prejuízo dos contratos em vigor.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.2 Módulos Adicionais</h3>
        <p>O Contratante pode contratar Módulos Adicionais avulsos, disponíveis conforme o catálogo publicado em https://sysvetmax.sysmaxsolutions.com.br/pricing. O cancelamento do Plano implica automaticamente o cancelamento de todos os Módulos Adicionais, sem reembolso do valor pago no ciclo corrente.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.3 Desconto para Ciclo Anual</h3>
        <p>O Contratante que optar pelo Ciclo de Faturamento anual (pagamento único por 12 meses) faz jus a desconto conforme percentual exibido na página de contratação no momento da escolha. O valor correspondente ao ciclo anual é pago integralmente no momento da ativação ou renovação da Assinatura, não sendo fracionado.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">2.4 Reajuste Anual</h3>
        <p>Os preços ficam fixos durante o primeiro ano contratual (12 meses). A partir do segundo ano, a Sysmax poderá reajustar os preços anualmente com base na variação acumulada do <strong>IPCA</strong> apurado pelo IBGE nos 12 meses anteriores à data de reajuste, ou em percentual inferior.</p>
        <p className="mt-1">O reajuste será comunicado ao Contratante com antecedência mínima de <strong>30 (trinta) dias corridos</strong> da próxima Data de Cobrança, por e-mail cadastrado na conta. Caso o Contratante não concorde com o reajuste, poderá cancelar a Assinatura nos termos da Seção 7 antes da data de vigência do novo preço, sem cobrança da diferença.</p>
      </Section>

      <Section title="3. Contratação e Ativação">
        <h3 className="font-semibold text-slate-800 mb-2">3.1 Processo de Contratação</h3>
        <p>A Assinatura é contratada exclusivamente de forma eletrônica. O processo é composto pelas seguintes etapas:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Criação de conta e cadastro da clínica;</li>
          <li>Seleção do Plano e Ciclo de Faturamento;</li>
          <li>Fornecimento dos dados de pagamento;</li>
          <li>Leitura e aceite expresso destes Termos, dos Termos de Uso Geral e do DPA, mediante checkbox específico ("Li e aceito os Termos");</li>
          <li>Confirmação do pedido pelo Contratante;</li>
          <li>Processamento do pagamento pelo adquirente;</li>
          <li>Ativação automática da Assinatura mediante confirmação do pagamento.</li>
        </ol>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.2 Dados de Identificação</h3>
        <p>O Contratante declara, sob as penas da lei, que as informações cadastrais fornecidas (razão social, CNPJ/CPF, endereço, e-mail, dados de faturamento) são verdadeiras, atualizadas e completas. A Sysmax não se responsabiliza por falhas de cobrança ou entrega decorrentes de dados cadastrais incorretos ou desatualizados.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.3 Confirmação do Aceite</h3>
        <p>O aceite eletrônico é registrado de forma imutável com: identificador único da aceitação, clinic_id e user_id, versão do documento aceito, hash do documento, data e hora do aceite (UTC), endereço IP, user-agent do navegador e método de aceite ("clickwrap_checkbox"). Esse registro constitui evidência para fins de disputas administrativas e judiciais.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">3.4 Representação Legal</h3>
        <p>O Contratante que aceitar estes Termos em nome de pessoa jurídica declara ter poderes de representação suficientes para vincular a empresa ao Contrato. A Sysmax poderá exigir, a qualquer tempo, comprovação de tais poderes.</p>
      </Section>

      <Section title="4. Meios de Pagamento">
        <h3 className="font-semibold text-slate-800 mb-2">4.1 Formas Aceitas</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Cartão de crédito</strong> (Visa, Mastercard, Elo, American Express, Hipercard) — débito automático a cada Ciclo de Faturamento;</li>
          <li><strong>Cartão de débito</strong> (quando suportado pelo adquirente para pagamentos recorrentes);</li>
          <li><strong>PIX</strong> — disponível exclusivamente para o Ciclo Anual ou para pagamentos de fatura em atraso; não disponível para assinaturas mensais recorrentes;</li>
          <li><strong>Boleto bancário</strong> — disponível exclusivamente para o Ciclo Anual ou para contratos Enterprise e Especializado com faturamento em nota fiscal.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">Contratos Free não exigem meio de pagamento cadastrado.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">4.2 Atualização dos Dados de Pagamento</h3>
        <p>O Contratante é o único responsável por manter os dados do meio de pagamento atualizados no painel da conta. A falha de pagamento decorrente de dados desatualizados não exime o Contratante das obrigações de pagamento e sujeita a Assinatura às regras da Seção 5.2.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">4.3 Processamento e Segurança</h3>
        <p>O processamento de pagamentos é realizado por adquirente terceiro. Os dados de cartão não são armazenados diretamente pela Sysmax. O Contratante reconhece que a segurança das transações está sujeita às políticas de segurança do adquirente contratado.</p>
      </Section>

      <Section title="5. Faturamento e Cobranças">
        <h3 className="font-semibold text-slate-800 mb-2">5.1 Data de Cobrança</h3>
        <p>A primeira cobrança é realizada no momento da ativação da Assinatura. As cobranças subsequentes ocorrem na mesma data-aniversário de cada mês (ciclo mensal) ou no mesmo dia-mês do ano seguinte (ciclo anual). Quando a data-aniversário cair em dia não útil ou em data inexistente no mês (ex.: dia 31 em meses com 30 dias), a cobrança será antecipada para o último dia útil anterior.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">5.2 Falha de Pagamento — Retry, Suspensão e Cancelamento</h3>
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Evento</th>
              <th className="border border-slate-200 p-2 text-left">Prazo</th>
              <th className="border border-slate-200 p-2 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Falha inicial', 'Dia 0', 'Notificação automática por e-mail ao Contratante'],
              ['1ª retentativa', 'Dia 2', 'Nova tentativa de débito automática'],
              ['2ª retentativa', 'Dia 4', 'Nova tentativa de débito automática'],
              ['3ª retentativa', 'Dia 7', 'Nova tentativa de débito automática'],
              ['Suspensão', 'Dia 8', 'Acesso à Plataforma suspenso (modo leitura); dados preservados'],
              ['Cancelamento', 'Dia 30', 'Rescisão automática do Contrato por inadimplência'],
            ].map(([ev, prazo, acao]) => (
              <tr key={ev}>
                <td className="border border-slate-200 p-2 font-medium">{ev}</td>
                <td className="border border-slate-200 p-2">{prazo}</td>
                <td className="border border-slate-200 p-2">{acao}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">5.3 Período de Carência</h3>
        <p>O Período de Carência de 7 (sete) dias corridos após a falha inicial destina-se exclusivamente à regularização do pagamento pelo Contratante. Não implica novação, concessão de prazo adicional ou qualquer desconto sobre o valor devido.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">5.4 Emissão de Nota Fiscal de Serviços Eletrônica (NFS-e)</h3>
        <p>A Sysmax emitirá NFS-e para cada cobrança efetivamente liquidada, no prazo de até 5 (cinco) dias úteis após a confirmação do pagamento. A NFS-e será enviada automaticamente ao e-mail de faturamento cadastrado na conta e ficará disponível para download no painel da conta.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">5.5 Upgrade e Downgrade de Plano</h3>
        <p><strong>No upgrade imediato:</strong> o valor adicional é calculado pro rata pelo período restante do ciclo corrente e cobrado imediatamente; as novas funcionalidades ficam disponíveis em até 1 (uma) hora após a confirmação do pagamento adicional.</p>
        <p className="mt-1"><strong>No downgrade:</strong> as funcionalidades do plano atual permanecem disponíveis até o último dia do ciclo corrente já pago; o novo valor (inferior) é cobrado apenas na próxima renovação. Não há reembolso pro rata pela diferença de valor no ciclo corrente em que o downgrade é solicitado.</p>
        <p className="mt-1"><strong>Módulos Adicionais incompatíveis com o novo Plano</strong> são cancelados no momento do downgrade, sem reembolso proporcional pelo saldo do ciclo. O Contratante será informado previamente, com confirmação explícita exigida antes da efetivação do downgrade.</p>
      </Section>

      <Section title="6. Renovação Automática">
        <h3 className="font-semibold text-slate-800 mb-2">6.1 Regra Geral</h3>
        <p>A Assinatura renova-se automaticamente ao término de cada Ciclo de Faturamento, pelo mesmo Plano, Módulos Adicionais e periodicidade vigentes, salvo cancelamento tempestivo pelo Contratante nos termos da Seção 7 ou alteração comunicada pela Sysmax nos termos da Seção 2.4.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">6.2 Aviso Prévio de Renovação</h3>
        <p>A Sysmax enviará notificação de renovação iminente ao e-mail cadastrado do Contratante com antecedência mínima de:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>15 (quinze) dias corridos</strong> antes de cada renovação mensal;</li>
          <li><strong>45 (quarenta e cinco) dias corridos</strong> antes de cada renovação anual.</li>
        </ul>
        <p className="mt-1">A notificação informará o valor da renovação, a data prevista de cobrança e o link direto para cancelamento.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">6.3 Procedimento de Cancelamento para Não-Renovação</h3>
        <p>Para cancelar a Assinatura antes da renovação automática, o Contratante deve:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-1">
          <li>Acessar o painel da conta em https://sysvetmax.sysmaxsolutions.com.br/dashboard/billing;</li>
          <li>Clicar em "Cancelar Assinatura";</li>
          <li>Confirmar o cancelamento e o motivo (opcional);</li>
          <li>Receber confirmação por e-mail com número de protocolo.</li>
        </ol>
        <p className="mt-1">O cancelamento deve ser realizado com antecedência mínima de <strong>24 (vinte e quatro) horas</strong> antes da Data de Cobrança de renovação para ter efeito no ciclo corrente.</p>
      </Section>

      <Section title="7. Cancelamento pelo Cliente">
        <h3 className="font-semibold text-slate-800 mb-2">7.1 Procedimento</h3>
        <p>O Contratante pode cancelar a Assinatura a qualquer momento pelo painel da conta (Seção 6.3) ou por e-mail para financeiro@sysmaxsolutions.com.br com o assunto "CANCELAMENTO — [nome da clínica/CNPJ]". Solicitações por e-mail são processadas em até 2 (dois) dias úteis.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">7.2 Efeitos do Cancelamento</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>O acesso à Plataforma permanece ativo até o último dia do Ciclo de Faturamento já pago, inclusive;</li>
          <li>Não há reembolso proporcional por dias não utilizados dentro do Ciclo corrente já pago, exceto nas hipóteses da Seção 8 (Direito de Arrependimento) e da Seção 11.2;</li>
          <li>Todos os Módulos Adicionais são cancelados conjuntamente;</li>
          <li>Após o encerramento do acesso, inicia-se o prazo de exportação de dados descrito na Seção 7.3.</li>
        </ul>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">7.3 Exportação de Dados Pós-Cancelamento</h3>
        <p>Após o cancelamento, a Sysmax manterá os dados do Contratante disponíveis para exportação por <strong>30 (trinta) dias corridos</strong> ("Janela de Exportação"). Os dados poderão ser exportados nos formatos JSON e CSV.</p>
        <p className="mt-2"><strong>Período de backup estendido:</strong> independentemente da Janela de Exportação de 30 dias, a Sysmax garantirá que os dados do Contratante não serão eliminados dos backups antes de <strong>90 (noventa) dias corridos</strong> após o cancelamento. Ao término dos 90 dias, os backups são eliminados com segurança e o <strong>Atestado de Eliminação</strong> é emitido automaticamente por e-mail ao endereço cadastrado na conta.</p>
        <p className="mt-2">A Sysmax poderá reter dados pelo prazo mínimo exigido por obrigação legal (ex.: obrigações fiscais e contábeis por 5 anos), mesmo após a eliminação dos dados operacionais.</p>
      </Section>

      <Section title="8. Direito de Arrependimento">
        <h3 className="font-semibold text-slate-800 mb-2">8.1 Aplicabilidade (Contratante Pessoa Física ou Microempresário Vulnerável — CDC Art. 49)</h3>
        <p>Quando o Contratante for pessoa física consumidora ou microempresário que demonstre vulnerabilidade técnica, econômica ou informacional, e a contratação tiver ocorrido exclusivamente por meio eletrônico (à distância), aplica-se o art. 49 do CDC, que garante o direito de arrependimento no prazo de <strong>7 (sete) dias corridos</strong> a contar da data de ativação da Assinatura, com reembolso integral do valor pago.</p>
        <p className="mt-2">Para exercer o direito de arrependimento, o Contratante deve enviar solicitação por escrito para financeiro@sysmaxsolutions.com.br com o assunto "ARREPENDIMENTO — [nome/CPF]" dentro do prazo legal. O reembolso integral será processado em até <strong>10 (dez) dias corridos</strong> após a confirmação.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">8.2 Contratos B2B entre Pessoas Jurídicas</h3>
        <p>Para contratos firmados entre pessoas jurídicas (ME, EPP, Ltda., SA ou equivalentes), o CDC em regra não se aplica. Esses contratos são regidos pelo Código Civil, especialmente pelos arts. 421 (função social), 421-A (presunção de paridade e autonomia da vontade) e 422 (boa-fé objetiva).</p>
        <p className="mt-2"><strong>O Contratante PJ declara expressamente, ao aceitar estes Termos:</strong></p>
        <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 mt-1">
          "Estou contratando na qualidade de pessoa jurídica, ciente de que esta declaração constitui elemento probatório da natureza empresarial do contrato, sem prejuízo da análise judicial de vulnerabilidade concreta caso venha a ser demonstrada. Tive acesso prévio ao inteiro teor destes Termos antes do aceite."
        </blockquote>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">8.3 Posição Cautelar para MEI e Pequena Clínica</h3>
        <p>Em atenção à jurisprudência do STJ (teoria finalista mitigada), a Sysmax adota cautelarmente os seguintes padrões aplicáveis a todos os Contratantes:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Notificação prévia de renovação (Seção 6.2);</li>
          <li>Canal de contestação interna antes do chargeback (Seção 11.3);</li>
          <li>Procedimento de cancelamento simplificado pelo painel (Seção 7.1);</li>
          <li>Portabilidade de dados garantida (Seção 7.3).</li>
        </ul>
      </Section>

      <Section title="9. Suspensão por Inadimplência">
        <h3 className="font-semibold text-slate-800 mb-2">9.1 Processo de Suspensão</h3>
        <p>Após o esgotamento do Período de Carência sem regularização do pagamento (Seção 5.2), a Sysmax poderá suspender o acesso do Contratante à Plataforma. Durante a suspensão:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>O Contratante terá acesso em modo leitura apenas, sem possibilidade de criação ou edição de registros;</li>
          <li>Os dados permanecem íntegros e preservados;</li>
          <li>Não há geração de novos débitos além do valor original em atraso.</li>
        </ul>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">9.2 Reativação</h3>
        <p>A Assinatura é reativada automaticamente no prazo de até 2 (duas) horas úteis após a confirmação do pagamento integral do valor em atraso (principal + encargos).</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">9.3 Encargos por Atraso</h3>
        <p>Sobre o valor em atraso incidem:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>Multa moratória:</strong> 2% (dois por cento) sobre o valor devido;</li>
          <li><strong>Juros moratórios:</strong> 1% (um por cento) ao mês, calculados pro rata die;</li>
          <li><strong>Correção monetária:</strong> pelo IPCA acumulado do período de inadimplência.</li>
        </ul>
      </Section>

      <Section title="10. Cancelamento pela Sysmax">
        <h3 className="font-semibold text-slate-800 mb-2">10.1 Cancelamento por Justa Causa</h3>
        <p>A Sysmax poderá cancelar a Assinatura imediatamente, sem aviso prévio, nas seguintes hipóteses:</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li>Inadimplência definitiva após 30 (trinta) dias do término do Período de Carência;</li>
          <li>Uso da Plataforma em violação aos Termos de Uso Geral (ex.: tentativa de acesso não autorizado, uso para atividades ilegais, violação de propriedade intelectual);</li>
          <li>Fornecimento de informações cadastrais falsas ou fraudulentas;</li>
          <li>Realização de Chargeback indevido, nos termos da Seção 11.4;</li>
          <li>Determinação judicial, administrativa (ex.: ANPD) ou regulatória;</li>
          <li>Força maior que impossibilite a prestação do serviço por prazo superior a 30 (trinta) dias.</li>
        </ol>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">10.2 Cancelamento Sem Causa</h3>
        <p>A Sysmax poderá cancelar a Assinatura sem causa mediante aviso prévio de <strong>30 (trinta) dias corridos</strong> por e-mail ao Contratante. Nessa hipótese, a Sysmax reembolsará o valor proporcional aos dias restantes do Ciclo de Faturamento pago e não fruído, e a Janela de Exportação de dados será de 30 (trinta) dias após o cancelamento efetivo.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">10.3 Continuidade em Caso de Encerramento da Sysmax</h3>
        <p>Na hipótese de encerramento das atividades da Sysmax, a Sysmax garantirá ao Contratante:</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li><strong>Notificação</strong> com antecedência mínima de 90 (noventa) dias, sempre que circunstâncias operacionais permitirem;</li>
          <li><strong>Acesso pleno à Plataforma</strong> por no mínimo 90 (noventa) dias após o anúncio do encerramento;</li>
          <li><strong>Exportação completa dos dados</strong> em formato aberto (JSON e CSV) sem custo adicional;</li>
          <li><strong>Reembolso proporcional</strong> dos valores pagos pelo ciclo ou período não fruído após o encerramento efetivo;</li>
          <li><strong>Custódia de backup</strong> criptografado dos dados de todos os Contratantes por período mínimo de 90 (noventa) dias após o encerramento definitivo.</li>
        </ol>
      </Section>

      <Section title="11. Reembolsos e Estornos">
        <h3 className="font-semibold text-slate-800 mb-2">11.1 Política Geral — Sem Reembolso de Período Fruído</h3>
        <p>A Sysmax adota política de não-reembolso por período já fruído. O acesso à Plataforma e suas funcionalidades constitui a prestação integral do serviço contratado, e cada dia de acesso efetivado é considerado serviço entregue.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">11.2 Exceções à Política de Não-Reembolso</h3>
        <p>São admitidos reembolsos apenas nas seguintes hipóteses, mediante análise e aprovação pela Sysmax:</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li><strong>Direito de arrependimento</strong> exercido tempestivamente, conforme Seção 8.1;</li>
          <li><strong>Erro técnico comprovado da Sysmax</strong> que tenha tornado o serviço completamente indisponível por período superior ao SLA garantido (Seção 12), sem aplicação das exclusões da Seção 12.3;</li>
          <li><strong>Cobrança duplicada</strong> ou em valor divergente do contratado, devidamente comprovada;</li>
          <li><strong>Cancelamento sem causa pela Sysmax</strong>, conforme Seção 10.2;</li>
          <li><strong>Indisponibilidade total</strong> (uptime = 0%) no mês, conforme Seção 12.2, quando o Contratante optar por reembolso em dinheiro em vez de Crédito de Serviço.</li>
        </ol>
        <p className="mt-2">O reembolso, quando admitido, será processado em até <strong>10 (dez) dias úteis</strong> após aprovação, pelo mesmo meio de pagamento original.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">11.3 Formulário de Contestação de Cobrança (Disputa Interna)</h3>
        <p>Antes de iniciar qualquer contestação junto à operadora do cartão ou banco emissor (Chargeback), o Contratante <strong>deve</strong> esgotar o procedimento interno de disputa da Sysmax:</p>
        <ol className="list-decimal pl-5 space-y-1 mt-1">
          <li>Abrir contestação pelo painel da conta em https://sysvetmax.sysmaxsolutions.com.br/dashboard/billing/disputes, ou enviar e-mail para financeiro@sysmaxsolutions.com.br com o assunto "CONTESTAÇÃO DE COBRANÇA — [número da fatura]";</li>
          <li>Descrever o motivo da contestação e anexar evidências;</li>
          <li>A Sysmax responderá em até <strong>5 (cinco) dias úteis</strong> com a posição fundamentada;</li>
          <li>Se o Contratante discordar da resposta, poderá escalar para juridico@sysmaxsolutions.com.br para mediação;</li>
          <li>Somente após o término deste procedimento interno, sem acordo, o Contratante poderá recorrer à sua operadora de cartão.</li>
        </ol>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">11.4 Consequências do Chargeback Indevido</h3>
        <p>O Chargeback iniciado sem o prévio esgotamento do procedimento da Seção 11.3, ou baseado em alegação comprovadamente falsa, constitui:</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li><strong>Inadimplência contratual</strong>, gerando multa de R$ 500,00 (quinhentos reais) por evento, além dos encargos da Seção 9.3 sobre o valor disputado (Código Civil, art. 408), valor esse que poderá ser revisto pelo juízo nos termos do art. 413 do Código Civil caso seja considerado desproporcional em relação ao dano efetivo;</li>
          <li><strong>Fundamento para rescisão imediata</strong> da Assinatura por justa causa (Seção 10.1.d), sem direito a reembolso;</li>
          <li>O Contratante poderá ser responsabilizado pelas perdas e danos efetivamente causados à Sysmax — incluindo tarifas de chargeback cobradas pelo adquirente, custos operacionais de resposta e honorários advocatícios —, nos termos dos arts. 186 e 927 do Código Civil.</li>
        </ol>
      </Section>

      <Section title="12. SLA e Créditos de Serviço">
        <h3 className="font-semibold text-slate-800 mb-2">12.1 Uptime Garantido</h3>
        <p>Para os Planos Premium e Enterprise, a Sysmax garante <strong>Uptime mínimo de 99,5% por mês calendário</strong>, equivalente a no máximo aproximadamente 3 (três) horas e 39 (trinta e nove) minutos de indisponibilidade acumulada por mês. O Plano Free não possui garantia de SLA.</p>
        <p className="mt-1">O Uptime é medido pelo sistema interno de monitoramento da Sysmax, acessível em https://status.sysmaxsolutions.com.br (quando disponível).</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">12.2 Cálculo de Créditos de Serviço</h3>
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Uptime Real do Mês</th>
              <th className="border border-slate-200 p-2 text-left">Crédito sobre a mensalidade do mês afetado</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['99,0% a < 99,5%', '5%'],
              ['95,0% a < 99,0%', '15%'],
              ['90,0% a < 95,0%', '25%'],
              ['< 90,0%', '50%'],
              ['0% (indisponibilidade total no mês)', '100% (reembolso integral do mês)'],
            ].map(([uptime, credito]) => (
              <tr key={uptime}>
                <td className="border border-slate-200 p-2">{uptime}</td>
                <td className="border border-slate-200 p-2 font-medium">{credito}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-500">
          Os Créditos de Serviço são aplicados automaticamente na próxima fatura. Para solicitar Crédito de Serviço, o Contratante deve registrar a solicitação em https://sysvetmax.sysmaxsolutions.com.br/dashboard/billing/sla até <strong>30 (trinta) dias</strong> após o mês calendário afetado.
        </p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">12.3 Exclusões do SLA e Limites de Manutenção Programada</h3>
        <p>Não são computadas como indisponibilidade para fins de cálculo do SLA:</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li><strong>Manutenções programadas</strong> comunicadas com antecedência mínima de 48 (quarenta e oito) horas, <strong>desde que não excedam 4 (quatro) horas por evento isolado nem 8 (oito) horas acumuladas por mês calendário</strong>. Manutenções que ultrapassem esses limites serão integralmente computadas como indisponibilidade a partir do momento em que o limite for excedido;</li>
          <li><strong>Falhas de infraestrutura do Contratante</strong> (internet, dispositivo, rede interna, provedores locais);</li>
          <li><strong>Ataques cibernéticos</strong> (DDoS, ransomware, brute force) de origem externa, enquanto a Sysmax adota medidas mitigatórias — limitado a 72 (setenta e duas) horas; após esse prazo, o tempo de indisponibilidade volta a ser computado normalmente;</li>
          <li><strong>Força maior e caso fortuito</strong> (art. 393 do Código Civil), incluindo desastres naturais, guerras, pandemias;</li>
          <li><strong>Indisponibilidade de infraestrutura de terceiros</strong> indispensável (ex.: Supabase, Vercel, provedores de DNS), desde que a Sysmax não tenha contribuído para o incidente e adote medidas mitigatórias em até 4 (quatro) horas;</li>
          <li><strong>Erros causados por uso inadequado</strong> da Plataforma pelo Contratante, incluindo integrações não homologadas pela Sysmax.</li>
        </ol>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">12.4 SLA de Módulos Adicionais</h3>
        <p>Módulos Adicionais (como o Agente IA WhatsApp e integrações com terceiros) possuem SLA próprio descrito na documentação técnica de cada módulo. A indisponibilidade de Módulos Adicionais <strong>não é computada no SLA geral da Plataforma</strong> (Seção 12.1), salvo quando a falha decorrer comprovadamente de infraestrutura core da Sysmax.</p>
      </Section>

      <Section title="13. Dados Financeiros e LGPD">
        <h3 className="font-semibold text-slate-800 mb-2">13.1 Dados Coletados para Fins de Pagamento</h3>
        <p>Para a gestão da Assinatura e cobrança, a Sysmax coleta e trata os seguintes dados pessoais do Contratante ou de seu representante legal:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Nome completo e CPF/CNPJ;</li>
          <li>E-mail e telefone de contato;</li>
          <li>Endereço de faturamento;</li>
          <li>Dados parciais do meio de pagamento (últimos 4 dígitos do cartão, bandeira, data de validade — os dados completos são tratados exclusivamente pelo adquirente);</li>
          <li>Histórico de cobranças, pagamentos e reembolsos;</li>
          <li>Logs de acesso associados à conta para fins de defesa contra chargebacks.</li>
        </ul>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.2 Base Legal</h3>
        <p>O tratamento de dados financeiros é fundamentado no art. 7.º, inciso V da LGPD — necessário para a <strong>execução de contrato</strong> do qual o titular é parte. Dados de log para defesa contra chargebacks têm base no art. 7.º, inciso VI (exercício regular de direitos em processo judicial, administrativo ou arbitral).</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.3 Retenção de Dados Financeiros</h3>
        <p>Os dados financeiros (faturas, histórico de pagamentos, registros contábeis) são retidos pelo prazo mínimo de <strong>5 (cinco) anos</strong>, em cumprimento às obrigações da legislação tributária brasileira. Logs de acesso para defesa contra chargebacks são retidos por <strong>12 (doze) meses</strong>.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.4 Compartilhamento com Suboperadores Financeiros</h3>
        <table className="w-full text-xs border-collapse mt-2">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-200 p-2 text-left">Subprocessador</th>
              <th className="border border-slate-200 p-2 text-left">Finalidade</th>
              <th className="border border-slate-200 p-2 text-left">País / Localização dos Dados</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Supabase', 'Banco de dados relacional, autenticação e armazenamento', 'Brasil (AWS São Paulo — sa-east-1)'],
              ['Vercel', 'Hospedagem, CDN e edge compute', 'EUA — Cláusulas Contratuais Padrão (CCP) vigentes'],
              ['Evolution API', 'Integração WhatsApp (Módulo Agente IA)', 'Brasil'],
              ['Processadora de Pagamentos', 'Cobrança recorrente, tokenização de cartões', 'Brasil / conforme contrato com adquirente'],
            ].map(([sub, fin, pais]) => (
              <tr key={sub}>
                <td className="border border-slate-200 p-2 font-medium">{sub}</td>
                <td className="border border-slate-200 p-2">{fin}</td>
                <td className="border border-slate-200 p-2">{pais}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.5 Transferência Internacional de Dados Financeiros</h3>
        <p>Caso dados financeiros sejam processados por suboperadores localizados fora do Brasil, a Sysmax adota os mecanismos de transferência internacional previstos nos arts. 33-36 da LGPD e na Resolução CD/ANPD n.º 19/2024 (Cláusulas Contratuais Padrão — CCP), aplicáveis desde 23/08/2025.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.6 Direitos dos Titulares</h3>
        <p>O Contratante pode exercer os direitos previstos no art. 18 da LGPD (confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, revogação de consentimento e oposição) mediante solicitação ao canal de privacidade: privacidade@sysmaxsolutions.com.br. Prazo de resposta: <strong>15 (quinze) dias úteis</strong>, prorrogável por igual período mediante justificativa.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.7 Notificação de Incidentes de Segurança</h3>
        <p>Em caso de incidente de segurança, a Sysmax adotará as seguintes medidas (art. 48 da LGPD e Res. CD/ANPD n.º 15/2024):</p>
        <ol className="list-[lower-alpha] pl-5 space-y-1 mt-1">
          <li><strong>Contenção imediata</strong> do incidente e avaliação do escopo e gravidade, no prazo máximo de 24 horas após a ciência;</li>
          <li><strong>Notificação à ANPD</strong> no prazo de <strong>72 (setenta e duas) horas</strong> após a ciência do incidente, mediante relatório contendo: natureza dos dados afetados, quantidade aproximada de titulares, categorias de dados comprometidos, medidas técnicas e organizacionais adotadas e canal de contato do Encarregado de Dados;</li>
          <li><strong>Notificação ao Contratante</strong> (como Controlador dos dados de seus pacientes e colaboradores) no mesmo prazo de 72 horas, por e-mail cadastrado na conta;</li>
          <li><strong>Comunicação pública</strong> em https://status.sysmaxsolutions.com.br quando o incidente afetar múltiplos Contratantes simultaneamente;</li>
          <li><strong>Relatório final</strong> do incidente disponibilizado ao Contratante em até 30 (trinta) dias após a contenção.</li>
        </ol>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">13.8 Dados de Uso para Analytics e Inteligência Artificial</h3>
        <p>A Sysmax poderá coletar dados agregados e anonimizados de uso da Plataforma para fins de melhoria do produto e analytics internos. <strong>Garantias irrenunciáveis:</strong></p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>Dados identificados de Contratantes ou de seus pacientes, tutores e colaboradores <strong>nunca serão utilizados para treino, fine-tuning ou avaliação de modelos de inteligência artificial de terceiros</strong> sem consentimento expresso e específico do Contratante;</li>
          <li>O Contratante tem o direito de opor-se ao uso de seus dados para analytics sem prejuízo à continuidade da Assinatura;</li>
          <li>O uso do Módulo Agente IA implica o processamento de conversas pelo modelo de linguagem contratado pela Sysmax, conforme descrito no DPA.</li>
        </ul>
      </Section>

      <Section title="14. Disposições Gerais">
        <h3 className="font-semibold text-slate-800 mb-2">14.1 Natureza Jurídica — Contrato B2B</h3>
        <p>Estes Termos constituem contrato empresarial paritário entre a Sysmax e o Contratante PJ, regido pelo Código Civil brasileiro, especialmente pelos arts. 421 (função social do contrato), 421-A (presunção de paridade, autonomia da vontade e alocação de riscos em contratos empresariais) e 422 (boa-fé objetiva).</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.2 Limitação de Responsabilidade</h3>
        <p>Em nenhuma hipótese a responsabilidade total acumulada da Sysmax perante o Contratante excederá o valor equivalente às <strong>12 (doze) mensalidades do Plano vigente</strong> pagas pelo Contratante nos 12 meses anteriores ao evento gerador da responsabilidade (art. 421-A do Código Civil).</p>
        <p className="mt-1">A Sysmax não responde por danos indiretos, lucros cessantes, perda de receita ou danos a terceiros decorrentes do uso da Plataforma pelo Contratante.</p>
        <p className="mt-1"><strong>Nenhuma limitação deste contrato se aplica a:</strong> (i) dolo ou culpa grave da Sysmax; (ii) violações de confidencialidade dolosas; (iii) multas e sanções administrativas aplicadas diretamente pela ANPD à Sysmax em razão de infrações à LGPD cometidas por ato próprio da Sysmax na qualidade de Operadora.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.3 Eleição de Foro e Mediação</h3>
        <p>Eventuais conflitos decorrentes destes Termos poderão ser submetidos, de forma <strong>facultativa e preferencial</strong>, à mediação extrajudicial perante câmara de mediação a ser designada de comum acordo pelas partes, com prazo máximo de 30 (trinta) dias para conclusão. <strong>A mediação não é condição de procedibilidade ao ajuizamento de ação judicial</strong>, preservando o direito de acesso à jurisdição (CF, art. 5.º, XXXV) para ambas as partes.</p>
        <p className="mt-1"><strong>Exceção — Contratante PF ou MEI vulnerável:</strong> o foro competente será o do <strong>domicílio do Contratante</strong>, em conformidade com o art. 63, §3.º do CPC (Lei 14.879/2024).</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.4 Lei Aplicável</h3>
        <p>Estes Termos são regidos exclusivamente pela legislação brasileira, aplicando-se supletivamente o Código Civil (Lei 10.406/2002), a Lei 13.709/2018 (LGPD), a Lei 14.063/2020 e demais normas pertinentes.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.5 Alterações dos Termos</h3>
        <p>A Sysmax poderá alterar estes Termos a qualquer tempo, com as seguintes salvaguardas:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li><strong>Mudanças não materiais</strong> (correções de texto, esclarecimentos): efetivadas com aviso por e-mail e publicação da nova versão em https://sysvetmax.sysmaxsolutions.com.br/legal/changelog;</li>
          <li><strong>Mudanças materiais</strong> (alteração de preços, direitos, responsabilidades): comunicadas com antecedência mínima de <strong>30 (trinta) dias corridos</strong> por e-mail ao Contratante;</li>
          <li>Mudanças desfavoráveis ao titular de dados pessoais exigem novo consentimento expresso, nos termos do art. 8.º, §6.º da LGPD.</li>
        </ul>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.6 Tolerância e Renúncia</h3>
        <p>A tolerância da Sysmax quanto ao descumprimento de qualquer disposição destes Termos não constituirá renúncia, novação ou modificação do direito correspondente.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.7 Separabilidade</h3>
        <p>Se qualquer cláusula destes Termos for declarada nula, inválida ou inexequível por decisão judicial ou administrativa transitada em julgado, as demais cláusulas permanecerão em pleno vigor e efeito.</p>

        <h3 className="font-semibold text-slate-800 mt-4 mb-2">14.8 Integralidade do Contrato</h3>
        <p>Estes Termos, juntamente com os Termos de Uso Geral, a Política de Privacidade e o DPA — todos disponíveis em https://sysvetmax.sysmaxsolutions.com.br/legal — constituem o acordo integral entre as partes e substituem quaisquer entendimentos anteriores sobre o objeto aqui tratado.</p>
      </Section>

      <div className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-400 space-y-1">
        <p><strong>Sysmax Solutions</strong></p>
        <p>E-mail financeiro: financeiro@sysmaxsolutions.com.br · E-mail jurídico: juridico@sysmaxsolutions.com.br</p>
        <p>Canal de privacidade (LGPD): privacidade@sysmaxsolutions.com.br</p>
        <p>Website: https://sysvetmax.sysmaxsolutions.com.br</p>
        <p className="mt-2">Versão v1.0 · 13 de junho de 2026 · Vigência a partir de 2026-07-13 (30 dias de vacatio legis para contratos existentes).</p>
      </div>
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
