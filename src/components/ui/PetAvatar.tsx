/**
 * PetAvatar — Avatar centralizado para pets em toda a aplicação SysVetMax.
 * Hierarquia de fallback: photo_url → emoji da espécie → inicial da espécie.
 *
 * Estado "in memoriam" (deceased=true):
 *   - Filtro grayscale na imagem/emoji
 *   - Anel lavanda (em vez de slate)
 *   - Overlay com asinhas + auréola (👼) acima da foto
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
  xs:  { wrapper: 'h-8 w-8',  text: 'text-base', img: 'h-8 w-8',  halo: 'text-[10px] -top-1 -right-1' },
  sm:  { wrapper: 'h-10 w-10', text: 'text-lg',  img: 'h-10 w-10', halo: 'text-xs -top-1 -right-1' },
  md:  { wrapper: 'h-12 w-12', text: 'text-2xl', img: 'h-12 w-12', halo: 'text-sm -top-1.5 -right-1.5' },
  lg:  { wrapper: 'h-16 w-16', text: 'text-3xl', img: 'h-16 w-16', halo: 'text-base -top-2 -right-2' },
}

interface PetAvatarProps {
  name:      string
  species:   string
  photoUrl?: string | null
  size?:     keyof typeof SIZE_CLASSES
  className?: string
  /** Pet falecido — aplica grayscale + asinhas/auréola. Default false. */
  deceased?: boolean
}

export function PetAvatar({ name, species, photoUrl, size = 'md', className = '', deceased = false }: PetAvatarProps) {
  const s = SIZE_CLASSES[size]
  const emoji = SPECIES_EMOJI[species] ?? '🐾'

  const bgClass    = deceased ? 'bg-violet-50 ring-1 ring-violet-200' : 'bg-slate-100'
  const grayscale  = deceased ? 'grayscale opacity-70' : ''

  return (
    <div
      className={`relative flex-shrink-0 overflow-visible rounded-full flex items-center justify-center ${s.wrapper} ${className}`}
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
        <span
          className={`absolute ${s.halo} pointer-events-none select-none drop-shadow-sm`}
          aria-hidden="true"
          title="In memoriam"
        >
          😇
        </span>
      )}
    </div>
  )
}
