/**
 * PetAvatar — Avatar centralizado para pets em toda a aplicação SysVetMax.
 * Hierarquia de fallback: photo_url → emoji da espécie → inicial da espécie.
 *
 * Estado "in memoriam" (deceased=true):
 *   - Filtro grayscale na imagem/emoji
 *   - Anel lavanda
 *   - AURÉOLA dourada (faixa elíptica) acima do círculo
 *   - ASINHAS fora do círculo, à esquerda e à direita (emoji 🪽 + espelhado)
 */

import { ImageLightbox } from './ImageLightbox'

const SPECIES_EMOJI: Record<string, string> = {
  dog:     '🐕',
  cat:     '🐱',
  bird:    '🐦',
  rabbit:  '🐰',
  rodent:  '🐭',
  reptile: '🦎',
  fish:    '🐠',
  exotic:  '🦜',
}

type SizeCfg = {
  wrapper:   string
  text:      string
  img:       string
  haloTop:   string
  haloW:     string
  haloH:     string
  wingFont:  string
  wingLeft:  string  // distância da borda esquerda (negativa para sair fora do círculo)
  wingRight: string
}

const SIZE_CLASSES: Record<'xs'|'sm'|'md'|'lg', SizeCfg> = {
  xs: { wrapper: 'h-8 w-8',   text: 'text-base', img: 'h-8 w-8',
        haloTop: '-top-1.5',  haloW: 'w-5',  haloH: 'h-1',
        wingFont: 'text-xs',  wingLeft: '-left-3',   wingRight: '-right-3'   },
  sm: { wrapper: 'h-10 w-10', text: 'text-lg',   img: 'h-10 w-10',
        haloTop: '-top-2',    haloW: 'w-6',  haloH: 'h-1.5',
        wingFont: 'text-sm',  wingLeft: '-left-4',   wingRight: '-right-4'   },
  md: { wrapper: 'h-12 w-12', text: 'text-2xl',  img: 'h-12 w-12',
        haloTop: '-top-2',    haloW: 'w-8',  haloH: 'h-1.5',
        wingFont: 'text-base', wingLeft: '-left-5',  wingRight: '-right-5'   },
  lg: { wrapper: 'h-16 w-16', text: 'text-3xl',  img: 'h-16 w-16',
        haloTop: '-top-2.5',  haloW: 'w-10', haloH: 'h-2',
        wingFont: 'text-xl',  wingLeft: '-left-6',   wingRight: '-right-6'   },
}

interface PetAvatarProps {
  name:      string
  species:   string
  photoUrl?: string | null
  size?:     keyof typeof SIZE_CLASSES
  className?: string
  /** Pet falecido — aplica grayscale + asas/auréola. Default false. */
  deceased?: boolean
}

export function PetAvatar({ name, species, photoUrl, size = 'md', className = '', deceased = false }: PetAvatarProps) {
  const s = SIZE_CLASSES[size]
  const emoji = SPECIES_EMOJI[species] ?? '🐾'

  const bgClass    = deceased ? 'bg-violet-50 ring-1 ring-violet-200' : 'bg-slate-100'
  const grayscale  = deceased ? 'grayscale opacity-75' : ''

  return (
    <div
      className={`relative flex-shrink-0 rounded-full flex items-center justify-center ${s.wrapper} ${className}`}
      aria-label={deceased ? `${name} (in memoriam)` : name}
    >
      {/* Círculo principal com foto/emoji */}
      <div className={`overflow-hidden rounded-full flex items-center justify-center ${s.wrapper} ${bgClass} ${grayscale}`}>
        {photoUrl ? (
          deceased ? (
            <img src={photoUrl} alt={name} className={`${s.img} object-cover rounded-full`} />
          ) : (
            <ImageLightbox
              src={photoUrl}
              alt={name}
              className={`${s.img} object-cover rounded-full`}
            />
          )
        ) : (
          <span className={s.text}>{emoji}</span>
        )}
      </div>

      {deceased && (
        <>
          {/* Auréola dourada — faixa elíptica luminosa acima do círculo */}
          <span
            className={`absolute ${s.haloTop} left-1/2 -translate-x-1/2 ${s.haloW} ${s.haloH} rounded-full bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 shadow-[0_0_4px_rgba(251,191,36,0.6)] pointer-events-none`}
            aria-hidden="true"
          />
          {/* Asinha esquerda — emoji 🪽 espelhado horizontalmente, FORA do círculo */}
          <span
            className={`absolute ${s.wingLeft} ${s.wingFont} pointer-events-none select-none drop-shadow-sm`}
            style={{ top: '50%', transform: 'translateY(-50%) scaleX(-1)' }}
            aria-hidden="true"
          >
            🪽
          </span>
          {/* Asinha direita — emoji 🪽 natural, FORA do círculo */}
          <span
            className={`absolute ${s.wingRight} ${s.wingFont} pointer-events-none select-none drop-shadow-sm`}
            style={{ top: '50%', transform: 'translateY(-50%)' }}
            aria-hidden="true"
          >
            🪽
          </span>
        </>
      )}
    </div>
  )
}
