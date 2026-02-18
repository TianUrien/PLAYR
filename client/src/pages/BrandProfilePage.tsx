/**
 * BrandProfilePage
 *
 * Public profile page for a brand.
 */

import { useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Store, MessageCircle } from 'lucide-react'
import { Header, Layout, Button } from '@/components'
import { BrandHeader, ProductCard } from '@/components/brands'
import Breadcrumbs from '@/components/Breadcrumbs'
import { useBrand } from '@/hooks/useBrand'
import { useBrandProducts } from '@/hooks/useBrandProducts'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAuthStore } from '@/lib/auth'
import { trackDbEvent } from '@/lib/trackDbEvent'
import { trackProfileView } from '@/lib/analytics'
import Skeleton from '@/components/Skeleton'

export default function BrandProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const { user, profile } = useAuthStore()
  const { brand, isLoading, error } = useBrand(slug)
  const { products, isLoading: productsLoading } = useBrandProducts(brand?.id)

  // Track brand profile view (skip if brand owner)
  const isOwnBrand = profile?.role === 'brand' && brand?.profile_id === user?.id
  useEffect(() => {
    if (!brand || isOwnBrand) return
    const ref = new URLSearchParams(window.location.search).get('ref') || 'direct'
    trackDbEvent('profile_view', 'profile', brand.profile_id, { viewed_role: 'brand', source: ref })
    trackProfileView('brand', brand.profile_id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand?.id])

  // Check if current user can message this brand
  const canMessage = user && profile?.role !== 'brand' && brand

  return (
    <Layout>
      {!isMobile && <Header />}

      <div className={`flex-1 bg-gray-50 ${isMobile ? 'pt-[var(--app-header-offset)]' : ''}`}>
        {/* Back Button (Mobile) */}
        {isMobile && (
          <div className="bg-white border-b border-gray-200 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </button>
          </div>
        )}

        {/* Breadcrumbs (Desktop) */}
        {!isMobile && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-2">
            <Breadcrumbs
              items={[
                { label: 'Brands', to: '/brands' },
                { label: brand?.name || 'Brand' },
              ]}
            />
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error}
            </div>
          </div>
        )}

        {/* Not Found State */}
        {!isLoading && !error && !brand && (
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Brand not found
            </h2>
            <p className="text-gray-600 mb-6">
              The brand you're looking for doesn't exist or has been removed.
            </p>
            <Link to="/brands">
              <Button>Browse Brands</Button>
            </Link>
          </div>
        )}

        {/* Brand Profile */}
        {brand && (
          <>
            {/* Header */}
            <BrandHeader brand={brand} />

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
              {/* Message Button */}
              {canMessage && (
                <div className="mb-6">
                  <Link to={`/messages?to=${brand.profile_id}`}>
                    <Button className="w-full sm:w-auto">
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Send Message
                    </Button>
                  </Link>
                </div>
              )}

              {/* About Section */}
              {brand.bio && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    About
                  </h2>
                  <p className="text-gray-600 whitespace-pre-wrap">
                    {brand.bio}
                  </p>
                </div>
              )}

              {/* Products & Services */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Products & Services
                </h2>

                {productsLoading ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                        <Skeleton width="100%" height={180} />
                        <div className="p-4 space-y-2">
                          <Skeleton width="60%" height={20} />
                          <Skeleton width="100%" height={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    This brand hasn't added any products yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        brandWebsiteUrl={brand.website_url}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
