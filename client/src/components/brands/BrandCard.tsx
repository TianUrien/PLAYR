/**
 * BrandCard Component
 *
 * Displays a brand in a card format for the directory grid.
 */

import { Link } from 'react-router-dom'
import { Store, ExternalLink, CheckCircle } from 'lucide-react'
import type { Brand } from '@/hooks/useBrands'

interface BrandCardProps {
  brand: Brand
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'Equipment',
  apparel: 'Apparel',
  accessories: 'Accessories',
  nutrition: 'Nutrition',
  services: 'Services',
  technology: 'Technology',
  other: 'Other',
}

export function BrandCard({ brand }: BrandCardProps) {
  return (
    <Link
      to={`/brands/${brand.slug}`}
      className="group block bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all duration-200"
    >
      {/* Logo Section */}
      <div className="aspect-square bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6 relative">
        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt={brand.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <Store className="w-16 h-16 text-gray-300 group-hover:text-gray-400 transition-colors" />
        )}

        {/* Verified Badge */}
        {brand.is_verified && (
          <div className="absolute top-3 right-3">
            <CheckCircle className="w-5 h-5 text-indigo-500" />
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
              {brand.name}
            </h3>
            <p className="text-sm text-gray-500 capitalize">
              {CATEGORY_LABELS[brand.category] || brand.category}
            </p>
          </div>
          {brand.website_url && (
            <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
          )}
        </div>

        {brand.bio && (
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
            {brand.bio}
          </p>
        )}
      </div>
    </Link>
  )
}

export default BrandCard
