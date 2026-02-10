export function FeedSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm animate-pulse">
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 rounded bg-gray-200" />
          <div className="w-32 h-4 rounded bg-gray-200" />
          <div className="w-16 h-4 rounded bg-gray-200" />
        </div>

        {/* Avatar + content */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="w-40 h-5 rounded bg-gray-200" />
            <div className="w-24 h-4 rounded bg-gray-200" />
            <div className="w-56 h-4 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  )
}
