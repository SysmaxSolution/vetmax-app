import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_sysmax')
    .eq('id', user.id)
    .single()

  if (!profile?.is_sysmax) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-slate-800">SysMax</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">Admin</span>
        </div>
        <nav className="ml-6 flex gap-4 text-sm">
          <a href="/admin/feature-requests" className="text-slate-600 hover:text-slate-900 font-medium">
            Requisições de Funcionalidades
          </a>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
