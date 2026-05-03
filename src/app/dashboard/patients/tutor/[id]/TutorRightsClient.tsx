'use client'

/**
 * TutorRightsClient — componente de interface do dashboard LGPD do tutor
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, Eye, Trash2, Clock, FileText, ChevronLeft,
  MessageCircle, AlertCircle, CheckCircle2, User, PawPrint,
} from 'lucide-react'
import { requestDeletion, type DataAccessEntry, type RetentionPolicy } from '@/lib/actions/compliance'
import { Toast } from '@/components/ui/toast'

interface Tutor {
  id:                string
  name:              string
  email:             string | null
  phone:             string | null
  cpf:               string | null
  whatsapp_consent:  boolean | null
  created_at:        string
}

interface Pet {
  id:      string
  name:    string
  species: string
  breed:   string | null
}

interface Props {
  tutor:             Tutor
  pets:              Pet[]
  accessEntries:     DataAccessEntry[]
  retentionPolicies: RetentionPolicy[]
  userRole:          string
}

const RETENTION_LABELS: Record<string, string> = {
  medical_records: 'Prontuários Médicos',
  personal_data:   'Dados Pessoais',
  financial:       'Dados Financeiros',
  audit_logs:      'Logs de Auditoria',
  whatsapp:        'Notificações WhatsApp',
  consent_history: 'Histórico de Consentimento',
}

const LEGAL_BASIS_LABELS: Record<string, string> = {
  obrigacao_legal: 'Obrigação Legal (CFMV)',
  contrato:        'Execução de Contrato',
  consentimento:   'Consentimento (LGPD Art. 7, I)',
  interesse_legit: 'Interesse Legítimo',
}

const ACCESS_TYPE_LABELS: Record<string, string> = {
  read:   'Leitura',
  write:  'Escrita',
  export: 'Exportação',
  delete: 'Exclusão',
  share:  'Compartilhamento',
}

export default function TutorRightsClient({
  tutor, pets, accessEntries, retentionPolicies, userRole,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'access' | 'retention' | 'delete'>('overview')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Estado do formulário de exclusão
  const [delNotes, setDelNotes] = useState('')
  const [submittingDel, setSubmittingDel] = useState(false)
  const [delSubmitted, setDelSubmitted] = useState(false)

  const canRequestDeletion = ['admin', 'owner', 'manager'].includes(userRole)

  const handleDeletionRequest = async () => {
    if (!canRequestDeletion) return
    setSubmittingDel(true)
    const result = await requestDeletion({
      tutorId:        tutor.id,
      requesterName:  tutor.name,
      requesterEmail: tutor.email ?? '',
      notes:          delNotes.trim() || undefined,
    })
    setSubmittingDel(false)
    if ('error' in result) {
      setToast({ type: 'error', message: result.error })
      return
    }
    setDelSubmitted(true)
    setToast({ type: 'success', message: 'Solicitação de exclusão registrada.' })
  }

  const TABS = [
    { id: 'overview',  label: 'Visão Geral',      icon: User },
    { id: 'access',    label: 'Acessos',           icon: Eye },
    { id: 'retention', label: 'Retenção',          icon: Clock },
    { id: 'delete',    label: 'Solicitação',       icon: Trash2 },
  ] as const

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-3 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 flex-shrink-0">
              <ShieldCheck className="h-6 w-6 text-teal-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-slate-900">{tutor.name}</h1>
              <p className="text-xs text-slate-500">
                Direitos LGPD (Art. 18) · Cadastrado em {new Date(tutor.created_at).toLocaleDateString('pt-BR')}
              </p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {pets.map(p => (
                  <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    <PawPrint className="h-3 w-3" />{p.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <MessageCircle className={`h-4 w-4 ${tutor.whatsapp_consent ? 'text-teal-500' : 'text-slate-300'}`} />
              <span className="text-xs text-slate-500">
                WhatsApp {tutor.whatsapp_consent ? 'habilitado' : 'desabilitado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="max-w-4xl mx-auto flex gap-1">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  isActive
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* ── Visão Geral ── */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Info pessoal */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-4">Dados Pessoais</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Nome</dt>
                  <dd className="font-medium text-slate-900">{tutor.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">CPF</dt>
                  <dd className="font-medium text-slate-900">{tutor.cpf ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">E-mail</dt>
                  <dd className="font-medium text-slate-900">{tutor.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Telefone</dt>
                  <dd className="font-medium text-slate-900">{tutor.phone ?? '—'}</dd>
                </div>
              </dl>
            </div>

            {/* Resumo direitos LGPD */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-4">Direitos LGPD Disponíveis (Art. 18)</h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: 'Confirmação e Acesso', desc: 'Ver dados pessoais coletados', art: 'I e II', tab: 'access' as const },
                  { title: 'Correção', desc: 'Atualizar dados incompletos ou incorretos', art: 'III', tab: null },
                  { title: 'Eliminação', desc: 'Solicitar exclusão dos dados', art: 'IV', tab: 'delete' as const },
                  { title: 'Transparência', desc: 'Informações sobre uso e compartilhamento', art: 'V', tab: 'retention' as const },
                ].map(item => (
                  <div
                    key={item.art}
                    className={`rounded-lg border p-3 ${item.tab ? 'cursor-pointer hover:border-teal-400 transition-colors' : 'opacity-60'} border-slate-200`}
                    onClick={() => item.tab && setActiveTab(item.tab)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                      <span className="flex-shrink-0 text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded-full">
                        Art. {item.art}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Logs de Acesso ── */}
        {activeTab === 'access' && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Histórico de Acessos aos Dados</h2>
              <p className="text-xs text-slate-500 mt-0.5">LGPD Art. 18, I e II — confirmação e acesso</p>
            </div>
            {accessEntries.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                Nenhum acesso registrado.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {accessEntries.map((entry, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 flex-shrink-0 mt-0.5">
                      <FileText className="h-3.5 w-3.5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-800">
                          {ACCESS_TYPE_LABELS[entry.access_type] ?? entry.access_type}
                        </span>
                        <span className="text-[10px] text-slate-500">{entry.entity_type}</span>
                        {entry.accessed_by_role && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                            {entry.accessed_by_role}
                          </span>
                        )}
                      </div>
                      {entry.purpose && (
                        <p className="text-[10px] text-slate-500 mt-0.5">{entry.purpose}</p>
                      )}
                    </div>
                    <time className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                      {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Políticas de Retenção ── */}
        {activeTab === 'retention' && (
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Políticas de Retenção de Dados</h2>
              <p className="text-xs text-slate-500 mt-0.5">LGPD Art. 18, V — transparência sobre prazo de retenção</p>
            </div>
            {retentionPolicies.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                Nenhuma política configurada.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {retentionPolicies.map(p => (
                  <div key={p.data_type} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {RETENTION_LABELS[p.data_type] ?? p.data_type}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {LEGAL_BASIS_LABELS[p.legal_basis] ?? p.legal_basis}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-center">
                        <p className="text-lg font-bold text-teal-700">{p.retention_years}</p>
                        <p className="text-[10px] text-slate-500">anos</p>
                      </div>
                      {p.auto_anonymize && (
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          Auto-anonimização
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Solicitação de Exclusão ── */}
        {activeTab === 'delete' && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-3 mb-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Solicitação de Eliminação de Dados</h2>
                <p className="text-xs text-slate-500 mt-0.5">LGPD Art. 18, IV — direito de eliminação</p>
              </div>
            </div>

            {delSubmitted ? (
              <div className="rounded-xl bg-green-50 border border-green-200 px-5 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-green-800">Solicitação registrada com sucesso.</p>
                <p className="text-xs text-green-600 mt-1">
                  A clínica tem 15 dias para responder conforme LGPD Art. 18.
                </p>
              </div>
            ) : !canRequestDeletion ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-6 text-center">
                <AlertCircle className="h-7 w-7 text-amber-500 mx-auto mb-2" />
                <p className="text-sm text-amber-800">Apenas administradores podem registrar solicitações de exclusão.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                  <p className="font-semibold">Atenção: dados com retenção obrigatória (CFMV)</p>
                  <p className="mt-0.5">
                    Prontuários médicos devem ser mantidos por 7 anos (CFMV Resolução 1.138/2016).
                    A eliminação será parcial — apenas dados não sujeitos à obrigação legal serão removidos.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notas / Justificativa
                  </label>
                  <textarea
                    rows={3}
                    value={delNotes}
                    onChange={e => setDelNotes(e.target.value)}
                    placeholder="Motivo da solicitação de exclusão (opcional)..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={submittingDel}
                  onClick={handleDeletionRequest}
                  data-testid="tutor-delete-request-btn"
                  className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-red-600 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Registrar Solicitação de Exclusão
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
