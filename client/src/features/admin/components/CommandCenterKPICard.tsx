import { TrendingUp, TrendingDown } from 'lucide-react'

interface CommandCenterKPICardProps {
  label: string
  value: string | number
  change?: number
  changePct?: number
  subtitle?: string
  loading?: boolean
}

export function CommandCenterKPICard({
  label,
  value,
  change,
  changePct,
  subtitle,
  loading,
}: CommandCenterKPICardProps) {
  const hasChange = changePct !== undefined && changePct !== 0
  const isPositive = (changePct ?? 0) > 0

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
        <div className="h-8 w-24 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-32 bg-gray-100 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
        {label}
      </p>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {hasChange && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium mb-1 ${
              isPositive ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {Math.abs(changePct!).toFixed(0)}%
            {change !== undefined && (
              <span className="text-gray-400 ml-0.5">
                ({isPositive ? '+' : ''}{change.toLocaleString()})
              </span>
            )}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  )
}
