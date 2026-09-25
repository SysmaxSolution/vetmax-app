// Fontes de título do Portal do Tutor.
//
// `next/font` resolve a fonte em tempo de BUILD — não dá para escolher a família
// em tempo de execução. Por isso o conjunto é fechado: todas as faces do
// conjunto seguro são declaradas aqui, expostas como variáveis CSS, e o tema da
// clínica apenas APONTA para uma delas (`--pt-heading-font`).
//
// Só a padrão (Fraunces) entra em `preload`. As demais ficam com `preload:false`
// para não fazer o navegador baixar quatro famílias que a clínica não usa.

import { Fraunces, Playfair_Display, Lora, DM_Serif_Display, Inter } from 'next/font/google'

const fraunces = Fraunces({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-pt-fraunces',
  display: 'swap',
})
const playfair = Playfair_Display({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-pt-playfair',
  display: 'swap', preload: false,
})
const lora = Lora({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-pt-lora',
  display: 'swap', preload: false,
})
const dmSerif = DM_Serif_Display({
  subsets: ['latin'], weight: ['400'], variable: '--font-pt-dmserif',
  display: 'swap', preload: false,
})
const inter = Inter({
  subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-pt-inter',
  display: 'swap', preload: false,
})

/**
 * Classe única com TODAS as variáveis de fonte do portal. Vai no elemento raiz
 * do portal; a família efetiva é escolhida por `--pt-heading-font`, que o tema
 * da clínica define.
 */
export const PORTAL_FONT_VARS = [
  fraunces.variable, playfair.variable, lora.variable, dmSerif.variable, inter.variable,
].join(' ')
