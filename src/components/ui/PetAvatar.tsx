/**
 * PetAvatar — Avatar centralizado para pets em toda a aplicação VetMax.
 * Hierarquia de fallback: photo_url → emoji da espécie → inicial da espécie
 */

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
  xs:  { wrapper: 'h-8 w-8',  text: 'text-base', img: 'h-8 w-8' },
  sm:  { wrapper: 'h-10 w-10', text: 'text-lg',  img: 'h-10 w-10' },
  md:  { wrapper: 'h-12 w-12', text: 'text-2xl', img: 'h-12 w-12' },
  lg:  { wrapper: 'h-16 w-16', text: 'text-3xl', img: 'h-16 w-16' },
}

interface PetAvatarProps {
  name:      string
  species:   string
  photoUrl?: string | null
  size?:     keyof typeof SIZE_CLASSES
  className?: string
}

export function PetAvatar({ name, species, photoUrl, size = 'md', className = '' }: PetAvatarProps) {
  const s = SIZE_CLASSES[size]
  const emoji = SPECIES_EMOJI[species] ?? '🐾'

  return (
    <div
      className={`flex-shrink-0 overflow-hidden rounded-full bg-slate-100 flex items-center justify-center ${s.wrapper} ${className}`}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className={`${s.img} object-cover`}
        />
      ) : (
        <span className={s.text}>{emoji}</span>
      )}
    </div>
  )
}
