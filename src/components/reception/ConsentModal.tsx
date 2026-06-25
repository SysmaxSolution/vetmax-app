'use client'

import { useState } from 'react'
import { Shield, X, FileText, CheckCircle, ExternalLink } from 'lucide-react'
import { CONSENT_VERSION } from '@/lib/consent-version'

interface Props {
  tutorName: string
  onAccept: () => void
  onDecline: () => void
}

const CONSENT_TEXT = `
TERMOS DE CONSENTIMENTO E POLÍTICA DE PRIVACIDADE — SysVetMax

Prezado(a) Tutor(a),

Em cumprimento à Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)
e à Resolução CFMV nº 1.138/2016, informamos:

1. DADOS COLETADOS
   Coletamos: nome completo, CPF, telefone, e-mail, endereço e dados do animal
   (nome, espécie, raça, histórico clínico, vacinas, medicamentos). Durante o
   atendimento, a evolução clínica pode ser registrada por voz e convertida em
   texto (ver item 3).

2. FINALIDADE
   Os dados são utilizados exclusivamente para:
   • Prestação de serviços veterinários
   • Elaboração e arquivamento de prontuários (obrigatório por lei)
   • Comunicações sobre saúde do animal

3. REGISTRO POR VOZ E INTELIGÊNCIA ARTIFICIAL
   Durante o atendimento, o(a) Médico(a) Veterinário(a) poderá registrar a
   evolução clínica por voz. A fala captada pode conter trechos da sua voz e é
   convertida em texto e organizada com auxílio de ferramentas de inteligência
   artificial, com a finalidade exclusiva de preencher o prontuário do animal.
   O conteúdo é tratado de forma confidencial e utilizado apenas para a
   prestação do serviço veterinário. Você pode solicitar que o atendimento NÃO
   seja registrado por voz a qualquer momento, sem prejuízo ao atendimento.

4. RETENÇÃO
   Prontuários médicos são mantidos por no mínimo 7 (sete) anos, conforme
   exige a Resolução CFMV nº 1.138/2016. Dados pessoais acompanham este prazo.

5. SEUS DIREITOS (LGPD Art. 18)
   Você tem direito a: confirmar existência de tratamento, acessar seus dados,
   corrigir dados incompletos, solicitar anonimização, portabilidade e eliminação
   (exceto dados de prontuário, cuja retenção é obrigatória por lei).

6. COMPARTILHAMENTO
   Seus dados NÃO são vendidos. Podem ser compartilhados apenas com:
   • Órgãos reguladores (CFMV, MAPA) quando exigido por lei
   • Convênios veterinários, mediante sua autorização expressa

7. CONTATO DO DPO
   Para exercer seus direitos: privacidade@vetmax.com.br

Ao clicar em "Li e Concordo", você confirma que leu, compreendeu e aceita
os presentes termos.
`

export default function ConsentModal({ tutorName, onAccept, onDecline }: Props) {
  const [hasRead, setHasRead] = useState(false)
  const [accepting, setAccepting] = useState(false)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (isNearBottom) setHasRead(true)
  }

  const handleAccept = async () => {
    setAccepting(true)
    try {
      onAccept()
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-teal-50/50">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2
                id="consent-modal-title"
                className="text-base font-bold text-slate-800"
              >
                Termos de Privacidade
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                LGPD — Lei nº 13.709/2018 · Obrigatório para cadastro
              </p>
            </div>
            <button
              onClick={onDecline}
              className="p-2 hover:bg-slate-200 rounded-full transition-colors flex-shrink-0"
              aria-label="Recusar e fechar"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {tutorName && (
            <div className="mt-3 rounded-xl bg-white border border-teal-200 px-4 py-2.5">
              <p className="text-xs text-slate-600">
                Tutor(a): <span className="font-semibold text-slate-800">{tutorName}</span>
              </p>
            </div>
          )}
        </div>

        {/* Texto dos termos — rolável */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4"
          onScroll={handleScroll}
          data-testid="consent-text-scroll"
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <p className="text-xs text-slate-500 font-medium">
              Role até o final para habilitar o botão de aceite
            </p>
          </div>
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
            {CONSENT_TEXT.trim()}
          </pre>
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 mt-3 text-xs text-teal-600 hover:text-teal-700 underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver Política de Privacidade completa
          </a>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white space-y-3">
          {!hasRead && (
            <p className="text-center text-xs text-amber-600 font-medium bg-amber-50 rounded-lg px-3 py-2">
              Role os termos até o final para prosseguir
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onDecline}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Recusar
            </button>
            <button
              data-testid="btn-consent-accept"
              onClick={handleAccept}
              disabled={!hasRead || accepting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle className="h-4 w-4" />
              {accepting ? 'Registrando...' : 'Li e Concordo'}
            </button>
          </div>

          <p className="text-center text-[10px] text-slate-400">
            Versão {CONSENT_VERSION} · {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
      </div>
    </div>
  )
}

export { CONSENT_VERSION, CONSENT_TEXT }
