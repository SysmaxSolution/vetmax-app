'use client'

/**
 * CanvaFontsScope — escopo tipográfico do motor de layouts.
 *
 *  - Embute as Google Fonts padrão via next/font (self-hosted no build da
 *    Vercel, zero request externo em runtime) e expõe cada uma como
 *    `--canva-font-<slug>` — consumida por fontFamilyCss() nos renderers.
 *  - Injeta @font-face das fontes enviadas pela clínica (bucket clinic-fonts).
 *  - Publica a lista de fontes da clínica num contexto para o PropertiesPanel.
 *
 * Quando `clinicFonts` não é passado, busca via listClinicFonts() no mount
 * (uso em modais client-side). Páginas server-side passam a lista pronta.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Inter, Roboto, Open_Sans, Lato, Montserrat, Merriweather } from 'next/font/google'
import type { ClinicFontFace } from '@/lib/canva/fonts'
import { buildClinicFontFaceCss } from '@/lib/canva/fonts'
import { listClinicFonts } from '@/lib/actions/clinic-fonts'

const inter        = Inter({ subsets: ['latin'], variable: '--canva-font-inter', display: 'block' })
const roboto       = Roboto({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--canva-font-roboto', display: 'block' })
const openSans     = Open_Sans({ subsets: ['latin'], variable: '--canva-font-open-sans', display: 'block' })
const lato         = Lato({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--canva-font-lato', display: 'block' })
const montserrat   = Montserrat({ subsets: ['latin'], variable: '--canva-font-montserrat', display: 'block' })
const merriweather = Merriweather({ subsets: ['latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--canva-font-merriweather', display: 'block' })

/** Classe que define todas as CSS vars das fontes padrão. */
export const CANVA_FONT_VARS_CLASS = [
  inter.variable, roboto.variable, openSans.variable,
  lato.variable, montserrat.variable, merriweather.variable,
].join(' ')

interface CanvaFontsContextValue {
  clinicFonts: ClinicFontFace[]
  loading: boolean
  /** Recarrega a lista (após upload/remoção). */
  refresh: () => Promise<void>
}

const CanvaFontsContext = createContext<CanvaFontsContextValue>({
  clinicFonts: [], loading: false, refresh: async () => undefined,
})

export function useCanvaFonts(): CanvaFontsContextValue {
  return useContext(CanvaFontsContext)
}

interface Props {
  children: ReactNode
  /** Lista pronta (server-side). Se omitida, busca no mount. */
  clinicFonts?: ClinicFontFace[]
  className?: string
  style?: React.CSSProperties
}

export default function CanvaFontsScope({ children, clinicFonts: given, className, style }: Props) {
  const [fetched, setFetched] = useState<ClinicFontFace[]>([])
  const [loading, setLoading] = useState(!given)

  const refresh = useMemo(() => async () => {
    setLoading(true)
    try { setFetched(await listClinicFonts()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (given) return
    let alive = true
    listClinicFonts()
      .then(list => { if (alive) setFetched(list) })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [given])

  const clinicFonts = given ?? fetched
  const css = useMemo(() => buildClinicFontFaceCss(clinicFonts), [clinicFonts])
  const value = useMemo<CanvaFontsContextValue>(
    () => ({ clinicFonts, loading, refresh }),
    [clinicFonts, loading, refresh],
  )

  return (
    <CanvaFontsContext.Provider value={value}>
      {css && <style data-canva-fonts="" dangerouslySetInnerHTML={{ __html: css }} />}
      <div className={`${CANVA_FONT_VARS_CLASS}${className ? ` ${className}` : ''}`} style={style}>
        {children}
      </div>
    </CanvaFontsContext.Provider>
  )
}
