import { useState } from 'react'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type BucketLike = {
  id: string
  label: string
  completed: boolean
}

interface ProfileStrengthCardProps<TBucket extends BucketLike = BucketLike> {
  /** Completion percentage (0-100) */
  percentage: number
  /** List of completion buckets */
  buckets: TBucket[]
  /** Whether data is loading */
  loading?: boolean
  /** Callback when a bucket action is clicked */
  onBucketAction?: (bucket: TBucket) => void
}

/**
 * Get the color class for the progress bar based on percentage.
 */
function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'bg-emerald-500'
  if (percentage >= 75) return 'bg-emerald-400'
  if (percentage >= 50) return 'bg-amber-400'
  if (percentage >= 25) return 'bg-orange-400'
  return 'bg-red-400'
}

/**
 * ProfileStrengthCard - Compact, expandable profile completion indicator.
 * 
 * Collapsed: Shows progress bar, percentage, and step count
 * Expanded: Shows clickable checklist of steps
 */
export default function ProfileStrengthCard<TBucket extends BucketLike>({
  percentage,
  buckets,
  loading = false,
  onBucketAction,
}: ProfileStrengthCardProps<TBucket>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const completedCount = buckets.filter(b => b.completed).length
  const isComplete = percentage >= 100

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-28 mb-2" />
            <div className="h-1.5 bg-gray-100 rounded-full w-full" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Collapsed Header - Always visible */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Title + Progress bar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold text-gray-900">Profile strength</h3>
              <span className={cn(
                "text-sm font-bold tabular-nums",
                isComplete ? "text-emerald-600" : "text-gray-700"
              )}>
                {percentage}%
              </span>
            </div>
            
            {/* Progress Bar - Thin and modern */}
            <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out",
                  getProgressColor(percentage)
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
            
            {/* Step count */}
            <p className="text-xs text-gray-500 mt-1.5">
              {completedCount} of {buckets.length} steps completed
            </p>
          </div>

          {/* Right: Toggle button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs font-medium text-[#8026FA] hover:text-[#6B20D4] transition-colors flex-shrink-0"
          >
            {isExpanded ? (
              <>
                Hide
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Details
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details - Animated dropdown */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-3 pt-1 border-t border-gray-100">
            <ul className="space-y-1">
              {buckets.map(bucket => (
                <li key={bucket.id}>
                  {bucket.completed ? (
                    <div className="flex items-center gap-2.5 py-1.5 text-sm text-emerald-600">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{bucket.label}</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onBucketAction?.(bucket)}
                      className="w-full flex items-center gap-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors group"
                    >
                      <Circle className="w-4 h-4 flex-shrink-0 text-gray-300" />
                      <span className="truncate flex-1 text-left">{bucket.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
