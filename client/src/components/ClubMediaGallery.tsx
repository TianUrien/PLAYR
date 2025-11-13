import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ClubMedia } from '@/lib/supabase'

interface ClubMediaGalleryProps {
  clubId: string
  itemsPerPage?: number
}

export default function ClubMediaGallery({ clubId, itemsPerPage = 12 }: ClubMediaGalleryProps) {
  const [media, setMedia] = useState<ClubMedia[]>([])
  const [displayedMedia, setDisplayedMedia] = useState<ClubMedia[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const fetchMedia = async () => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('club_media')
          .select('*')
          .eq('club_id', clubId)
          .order('order_index', { ascending: true })
          .order('created_at', { ascending: false })

        if (error) throw error
        setMedia(data || [])
        setDisplayedMedia((data || []).slice(0, itemsPerPage))
      } catch (error) {
        console.error('Error fetching club media:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMedia()
  }, [clubId, itemsPerPage])

  const loadMore = () => {
    const nextPage = page + 1
    const startIndex = page * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const newMedia = media.slice(0, endIndex)
    
    setDisplayedMedia(newMedia)
    setPage(nextPage)
  }

  const hasMore = displayedMedia.length < media.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (media.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">📸</span>
        </div>
        <p className="text-gray-600">No photos yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Photo Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {displayedMedia.map((item) => (
          <div
            key={item.id}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow"
          >
            {/* Image */}
            <div className="relative aspect-square bg-gray-100">
              <img
                src={item.file_url}
                alt={item.alt_text || item.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Caption (if exists) */}
            {item.caption && (
              <div className="p-4">
                <p className="text-sm text-gray-700 line-clamp-2">
                  {item.caption}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            className="px-8 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  )
}
