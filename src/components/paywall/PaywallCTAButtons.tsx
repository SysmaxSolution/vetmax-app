'use client'

import { MessageCircle, Mail } from 'lucide-react'

export default function PaywallCTAButtons({ feature }: { feature: string }) {
  const waText = encodeURIComponent(
    `Olá! Sou cliente do SysVetMax e tenho interesse em contratar o módulo *${feature}*. Poderia me informar sobre os planos disponíveis?`
  )
  const emailSubject = encodeURIComponent(`Interesse no módulo ${feature} — SysVetMax`)
  const emailBody    = encodeURIComponent(
    `Olá,\n\nSou cliente do SysVetMax e gostaria de saber mais sobre o módulo "${feature}".\n\nAguardo retorno.\n`
  )

  return (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
      {/* WhatsApp — CTA principal */}
      <a
        href={`https://wa.me/5516997023340?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-green-200/60 hover:shadow-xl hover:shadow-green-300/50 active:scale-[0.98]"
      >
        <MessageCircle className="w-4 h-4" />
        Falar pelo WhatsApp
      </a>

      {/* Email — CTA secundário */}
      <a
        href={`mailto:contato@sysmaxsolutions.com?subject=${emailSubject}&body=${emailBody}`}
        className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-6 py-3 rounded-xl transition-all hover:border-slate-300 active:scale-[0.98]"
      >
        <Mail className="w-4 h-4 text-slate-500" />
        Enviar e-mail
      </a>
    </div>
  )
}
