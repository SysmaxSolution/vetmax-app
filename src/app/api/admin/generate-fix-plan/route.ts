import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAutoFixCycle, clusterizeErrors } from '@/lib/fix-planner'

// POST /api/admin/generate-fix-plan
// Dispara manualmente o gerador de planos de correção.
// Body (opcional):
//   { fingerprints?: string[], min_occurrences?: number, max_clusters?: number }
// Requer role admin ou manager.

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile?.role || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Sem permissão. Requer role admin ou manager.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    fingerprints?:   string[]
    min_occurrences?: number
    max_clusters?:   number
  }

  const result = await runAutoFixCycle({
    fingerprints:   body.fingerprints,
    minOccurrences: body.min_occurrences ?? 1,
    maxClusters:    body.max_clusters    ?? (body.fingerprints?.length ? body.fingerprints.length : 10),
  })

  return NextResponse.json({
    ok:      true,
    created: result.created,
    skipped: result.skipped,
    failed:  result.failed,
    total_clusters_found: result.clusters,
  })
}

// GET /api/admin/generate-fix-plan
// Retorna os clusters elegíveis sem gerar planos (preview).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile?.role || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const url            = new URL(request.url)
  const minOccurrences = parseInt(url.searchParams.get('min_occurrences') ?? '1', 10)

  const clusters = await clusterizeErrors({ minOccurrences })

  return NextResponse.json({
    ok:       true,
    clusters: clusters.map(c => ({
      fingerprint:      c.fingerprint,
      priority:         c.priority,
      module:           c.module,
      path:             c.path,
      error_message:    c.errorMessage.slice(0, 150),
      occurrence_count: c.occurrenceCount,
      affected_logs:    c.affectedLogIds.length,
      first_seen:       c.firstSeen,
      last_seen:        c.lastSeen,
    })),
  })
}
