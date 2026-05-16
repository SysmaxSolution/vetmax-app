'use client'

import Link from 'next/link'
import { PawPrint } from 'lucide-react'

interface PatientLinkProps {
  id:        string
  name:      string
  photoUrl?: string | null
  className?: string
  size?:     'sm' | 'md'
}

const SPECIES_EMOJI: Record<string, string> = {
  dog:     '🐕',
  cat:     '🐈',
  bird:    '🐦',
  rabbit:  '🐰',
  rodent:  '🐭',
  reptile: '🦎',
  fish:    '🐟',
  exotic:  '🐾',
}

export default function PatientLink({ id, name, photoUrl, className, size = 'sm' }: PatientLinkProps) {
  const avatarSize = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7'
  const textSize   = size === 'sm' ? 'text-sm'  : 'text-base'

  return (
    <Link
      href={`/dashboard/patients/${id}`}
      className={`inline-flex items-center gap-1.5 group ${className ?? ''}`}
      onClick={e => e.stopPropagation()}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className={`${avatarSize} rounded-full object-cover flex-shrink-0 border border-slate-200`}
        />
      ) : (
        <span className={`${avatarSize} rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0`}>
          <PawPrint className="h-3 w-3 text-blue-400" />
        </span>
      )}
      <span className={`${textSize} font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline transition-colors`}>
        {name}
      </span>
    </Link>
  )
}
