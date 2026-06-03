/**
 * PetAvatar — Avatar centralizado para pets em toda a aplicação SysVetMax.
 * Hierarquia de fallback: photo_url → emoji da espécie → inicial da espécie.
 *
 * Estado "in memoriam" (deceased=true):
 *   - Filtro grayscale na imagem/emoji
 *   - Anel lavanda (em vez de slate)
 *   - AURÉOLA dourada acima da foto (faixa elíptica com gradiente)
 *   - ASINHAS espelhadas nas laterais (esquerda/direita)
 *
 * Decisão de UX: o tratamento é sensível e silencioso — sem texto explicativo
 * no avatar (esse contexto fica em badges/labels do componente pai).
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

const SIZE_CLASSES = {
  xs:  { wrapper: 'h-8 w-8',   text: 'text-base', img: 'h-8 w-8',   halo: '-top-1.5 w-5 h-1',    wing: 'text-xs   -left-2 -right-2' },
  sm:  { wrapper: 'h-10 w-10', text: 'text-lg',   img: 'h-10 w-10', halo: '-top-2 w-6 h-1.5',    wing: 'text-sm   -left-2.5 -right-2.5' },
  md:  { wrapper: 'h-12 w-12', text: 'text-2xl',  img: 'h-12 w-12', halo: '-top-2 w-8 h-1.5',    wing: 'text-base -left-3 -right-3' },
  lg:  { wrapper: 'h-16 w-16', text: 'text-3xl',  img: 'h-16 w-16', halo: '-top-2.5 w-10 h-2',   wing: 'text-xl   -left-4 -right-4' },
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
          {/* Auréola dourada — faixa elíptica luminosa em cima da cabeça */}
          <span
            className={`absolute ${s.halo} left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-200 shadow-[0_0_4px_rgba(251,191,36,0.6)] pointer-events-none`}
            aria-hidden="true"
          />
          {/* Asinhas brancas — emoji 🪽 espelhado para ter par esquerdo/direito */}
          <span
            className={`absolute ${s.wing.split(' ')[0]} ${s.wing.split(' ')[1]} top-1/2 -translate-y-1/2 pointer-events-none select-none drop-shadow-sm`}
            style={{ transform: 'translateY(-50%) scaleX(-1)' }}
            aria-hidden="true"
          >
            🪽
          </span>
          <span
            className={`absolute ${s.wing.split(' ')[0]} ${s.wing.split(' ')[2]} top-1/2 -translate-y-1/2 pointer-events-none select-none drop-shadow-sm`}
            aria-hidden="true"
          >
            🪽
          </span>
        </>
      )}
    </div>
  )
}
