# Development Standards — Next.js, Componentes, Design System

**Data:** 2026-04-06  
**Framework:** Next.js 16 App Router  
**Styling:** Tailwind CSS v4 (slate palette)

---

## 🏗️ Estrutura de Componentes

**Server Components (padrão):**
- Acessam banco de dados
- Locais: `/src/app/dashboard/**/page.tsx`

**Client Components (com `'use client'`):**
- Interatividade, formulários, modais
- Locais: `/src/components/`

**Proibição:**
- Não misturar Server e Client sem necessidade
- Não importar Server components em Client components

---

## 🎨 Design System (Slate Palette)

**Cores Padrão:**
- Primário: `blue-600` (buttons, active states)
- Fundo: `slate-50` (pages)
- Cards: `bg-white border-slate-200 shadow-sm rounded-xl`
- Texto: `text-slate-900` (primário), `text-slate-600` (secundário)

**Tipografia:**
- Títulos: `text-2xl font-semibold`
- Subtítulos: `text-sm text-slate-500`
- Body: `text-sm text-slate-600`

---

## 📋 Server Actions Pattern

**Arquivo:** `/src/lib/actions/`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'

export async function someAction(data: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) throw new Error('Unauthorized')
  
  // Ação aqui
}
```

---

## ✅ Checklist de novo componente

- [ ] Usa padrão slate palette?
- [ ] Responsivo (mobile-first)?
- [ ] Acessível (labels, alt-text)?
- [ ] Sem código duplicado?
- [ ] TypeScript types definidos?

---

**Última revisão:** 2026-04-06
