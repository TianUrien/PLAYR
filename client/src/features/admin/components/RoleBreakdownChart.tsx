/**
 * RoleBreakdownChart Component
 *
 * Displays user role distribution as a donut chart with legend.
 */

import { useMemo } from 'react'

interface RoleBreakdownChartProps {
  players: number
  coaches: number
  clubs: number
  loading?: boolean
}

const COLORS = {
  players: '#8b5cf6', // Purple
  coaches: '#3b82f6', // Blue
  clubs: '#f59e0b', // Amber
}

export function RoleBreakdownChart({
  players,
  coaches,
  clubs,
  loading = false,
}: RoleBreakdownChartProps) {
  const total = players + coaches + clubs

  const chartData = useMemo(() => {
    if (total === 0) return []

    const data = [
      { label: 'Players', value: players, color: COLORS.players, percentage: (players / total) * 100 },
      { label: 'Coaches', value: coaches, color: COLORS.coaches, percentage: (coaches / total) * 100 },
      { label: 'Clubs', value: clubs, color: COLORS.clubs, percentage: (clubs / total) * 100 },
    ].filter((d) => d.value > 0)

    // Calculate SVG arc segments
    let currentAngle = -90 // Start from top
    return data.map((item) => {
      const angle = (item.percentage / 100) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle = endAngle

      // Convert angles to radians for SVG path
      const startRad = (startAngle * Math.PI) / 180
      const endRad = (endAngle * Math.PI) / 180

      // SVG arc parameters
      const radius = 40
      const innerRadius = 25
      const cx = 50
      const cy = 50

      const x1 = cx + radius * Math.cos(startRad)
      const y1 = cy + radius * Math.sin(startRad)
      const x2 = cx + radius * Math.cos(endRad)
      const y2 = cy + radius * Math.sin(endRad)
      const x3 = cx + innerRadius * Math.cos(endRad)
      const y3 = cy + innerRadius * Math.sin(endRad)
      const x4 = cx + innerRadius * Math.cos(startRad)
      const y4 = cy + innerRadius * Math.sin(startRad)

      const largeArcFlag = angle > 180 ? 1 : 0

      const path = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
        'Z',
      ].join(' ')

      return { ...item, path }
    })
  }, [players, coaches, clubs, total])

  if (loading) {
    return (
      <div className="flex items-center gap-6">
        <div className="w-32 h-32 bg-gray-100 rounded-full animate-pulse" />
        <div className="space-y-3 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 animate-pulse">
              <div className="w-3 h-3 bg-gray-200 rounded-full" />
              <div className="flex-1 h-4 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        No user data available
      </div>
    )
  }

  return (
    <div className="flex items-center gap-8">
      {/* Donut Chart */}
      <div className="relative w-32 h-32 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-0">
          {chartData.map((segment, index) => (
            <path
              key={index}
              d={segment.path}
              fill={segment.color}
              className="transition-opacity hover:opacity-80"
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">{total.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3 flex-1">
        {chartData.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              <div className="text-right">
                <span className="text-sm font-semibold text-gray-900">
                  {item.value.toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  ({Math.round(item.percentage)}%)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
