import { cn } from '@/lib/utils'

type RoleBadgeProps = {
  role?: 'player' | 'coach' | 'club' | string | null
  className?: string
}

const roleStyles: Record<string, string> = {
  player: 'bg-blue-100 text-blue-700',
  coach: 'bg-purple-100 text-purple-700',
  club: 'bg-orange-100 text-orange-700',
}

export default function RoleBadge({ role, className }: RoleBadgeProps) {
  if (!role) return null

  const normalizedRole = role.toLowerCase()
  const baseClass = roleStyles[normalizedRole] ?? 'bg-gray-100 text-gray-600'

  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium capitalize', baseClass, className)}>
      {normalizedRole}
    </span>
  )
}
