import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { escolherModuloInicial, type AcessoDeModulo } from '@/lib/dashboard/modulo-inicial'
import { pathForModule } from '@/config/path-modules'

export const metadata = { title: 'Painel | SysVetMax' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id, is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  // Pouso: primeiro módulo que a clínica tem ativo E que o usuário pode abrir.
  // Antes era um destino fixo por papel (/dashboard/reception para admin), que
  // virava ERR_TOO_MANY_REDIRECTS quando esse módulo estava bloqueado em
  // user_module_access (Animais, 29/10/2026).
  const [{ data: clinic }, { data: acessos }] = await Promise.all([
    admin.from('clinics').select('active_modules').eq('id', profile.clinic_id).single(),
    admin
      .from('user_module_access')
      .select('module_name, enabled')
      .eq('clinic_id', profile.clinic_id)
      .eq('user_id', user.id),
  ])

  const modulo = escolherModuloInicial({
    role:          profile.role,
    isSysmax:      profile.is_sysmax === true,
    clinicModules: (clinic?.active_modules as string[] | null) ?? [],
    acessos:       (acessos ?? []) as AcessoDeModulo[],
  })
  if (modulo) redirect(pathForModule(modulo))

  // Nada liberado: orientar em vez de redirecionar (redirecionar para um
  // módulo bloqueado é exatamente o que gerava o loop).
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Nenhum módulo liberado para o seu usuário</h1>
      <p className="mt-2 text-sm text-slate-600">
        Nesta clínica não há módulo ativo que você possa abrir. Peça ao administrador para liberar
        seus acessos em Gestão → Usuários → Permissões, ou troque de clínica pelo menu.
      </p>
      <form action="/auth/logout" method="post" className="mt-6">
        <button type="submit" className="text-sm font-medium text-teal-700 hover:underline">Sair</button>
      </form>
    </div>
  )
}
