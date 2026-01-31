/**
 * BrandDashboard
 *
 * Dashboard page for brand users to manage their brand profile.
 * Follows the same structural pattern as PlayerDashboard, CoachDashboard, and ClubDashboard.
 */

import { useEffect, useState, useRef } from 'react'
import { Globe, Instagram, ExternalLink, Eye, Edit, MessageCircle, Store, Package, Users, Plus, FileText } from 'lucide-react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import Header from '@/components/Header'
import { Avatar, Button, DashboardMenu, ProfileStrengthCard, RoleBadge, ScrollableTabs } from '@/components'
import { BrandForm, type BrandFormData, ProductCard, AddProductModal, BrandPostCard, AddPostModal } from '@/components/brands'
import ConfirmActionModal from '@/components/ConfirmActionModal'
import { useBrandProfileStrength } from '@/hooks/useBrandProfileStrength'
import { useBrandProducts } from '@/hooks/useBrandProducts'
import type { BrandProduct, CreateProductInput, UpdateProductInput } from '@/hooks/useBrandProducts'
import { useBrandPosts } from '@/hooks/useBrandPosts'
import type { BrandPost, CreatePostInput, UpdatePostInput } from '@/hooks/useBrandPosts'
import { useMyBrand } from '@/hooks/useMyBrand'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import { logger } from '@/lib/logger'
import Skeleton from '@/components/Skeleton'

type TabType = 'overview' | 'products' | 'posts' | 'messages' | 'followers'

const TABS: { id: TabType; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'posts', label: 'Posts' },
  { id: 'messages', label: 'Messages' },
  { id: 'followers', label: 'Followers' },
]

export default function BrandDashboard() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { brand, isLoading: brandLoading, updateBrand, refetch: refetchBrand } = useMyBrand()
  const { addToast } = useToastStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const param = searchParams.get('tab') as TabType | null
    return param && TABS.some(t => t.id === param) ? param : 'overview'
  })
  const [showEditModal, setShowEditModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Products
  const { products, isLoading: productsLoading, createProduct, updateProduct, deleteProduct } = useBrandProducts(brand?.id)
  const [showAddProductModal, setShowAddProductModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<BrandProduct | null>(null)
  const [productToDelete, setProductToDelete] = useState<BrandProduct | null>(null)
  const [isDeletingProduct, setIsDeletingProduct] = useState(false)

  // Posts
  const { posts, isLoading: postsLoading, createPost, updatePost, deletePost: deletePostFn } = useBrandPosts(brand?.id)
  const [showAddPostModal, setShowAddPostModal] = useState(false)
  const [editingPost, setEditingPost] = useState<BrandPost | null>(null)
  const [postToDelete, setPostToDelete] = useState<BrandPost | null>(null)
  const [isDeletingPost, setIsDeletingPost] = useState(false)

  // Profile strength for brand
  const { percentage, buckets, loading: strengthLoading, refresh: refreshStrength } = useBrandProfileStrength({
    brand,
    productCount: products.length,
  })

  // Track previous percentage to show toast on improvement
  const prevPercentageRef = useRef<number | null>(null)

  // Redirect if not a brand user
  useEffect(() => {
    if (!user) {
      navigate('/signup', { replace: true })
      return
    }
    if (profile && profile.role !== 'brand') {
      navigate('/dashboard/profile', { replace: true })
    }
  }, [user, profile, navigate])

  // Redirect to onboarding if no brand exists
  useEffect(() => {
    if (!brandLoading && !brand && profile?.role === 'brand') {
      navigate('/brands/onboarding', { replace: true })
    }
  }, [brand, brandLoading, profile?.role, navigate])

  // Sync tab with URL
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType | null
    if (tabParam && TABS.some(t => t.id === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [searchParams, activeTab])

  // Refresh profile strength when switching to overview tab
  useEffect(() => {
    if (activeTab === 'overview') {
      void refreshStrength()
    }
  }, [activeTab, refreshStrength])

  // Show toast when profile strength improves (only after all data has loaded
  // to avoid spurious toasts as brand, products, and strength resolve at different times)
  useEffect(() => {
    if (strengthLoading || brandLoading || productsLoading) return
    if (prevPercentageRef.current !== null && percentage > prevPercentageRef.current) {
      addToast(`Profile strength: ${percentage}%`, 'success')
    }
    prevPercentageRef.current = percentage
  }, [percentage, strengthLoading, brandLoading, productsLoading, addToast])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const handleProductSubmit = async (data: CreateProductInput | UpdateProductInput, isEdit: boolean) => {
    if (isEdit && editingProduct) {
      const result = await updateProduct(editingProduct.id, data)
      if (result.success) {
        addToast('Product updated', 'success')
        setEditingProduct(null)
        await refreshStrength()
      }
      return result
    }
    const result = await createProduct(data as CreateProductInput)
    if (result.success) {
      addToast('Product added', 'success')
      await refreshStrength()
    }
    return result
  }

  const handleDeleteProduct = async () => {
    if (!productToDelete) return
    setIsDeletingProduct(true)
    try {
      const result = await deleteProduct(productToDelete.id)
      if (!result.success) throw new Error(result.error)
      addToast('Product deleted', 'success')
      setProductToDelete(null)
      await refreshStrength()
    } catch {
      addToast('Failed to delete product', 'error')
    } finally {
      setIsDeletingProduct(false)
    }
  }

  const handlePostSubmit = async (data: CreatePostInput | UpdatePostInput, isEdit: boolean) => {
    if (isEdit && editingPost) {
      const result = await updatePost(editingPost.id, data)
      if (result.success) {
        addToast('Post updated', 'success')
        setEditingPost(null)
      }
      return result
    }
    const result = await createPost(data as CreatePostInput)
    if (result.success) {
      addToast('Post published', 'success')
    }
    return result
  }

  const handleDeletePost = async () => {
    if (!postToDelete) return
    setIsDeletingPost(true)
    try {
      const result = await deletePostFn(postToDelete.id)
      if (!result.success) throw new Error(result.error)
      addToast('Post deleted', 'success')
      setPostToDelete(null)
    } catch {
      addToast('Failed to delete post', 'error')
    } finally {
      setIsDeletingPost(false)
    }
  }

  const handleUpdateBrand = async (data: BrandFormData) => {
    setIsSubmitting(true)
    try {
      const result = await updateBrand({
        name: data.name,
        bio: data.bio || undefined,
        logo_url: data.logo_url || undefined,
        website_url: data.website_url || undefined,
        instagram_url: data.instagram_url || undefined,
        category: data.category,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to update brand')
      }

      addToast('Brand profile updated successfully', 'success')
      setShowEditModal(false)
      await refetchBrand()
      await refreshStrength()
    } catch (err) {
      logger.error('[BrandDashboard] Error updating brand:', err)
      addToast(err instanceof Error ? err.message : 'Failed to update brand', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return null
    const labels: Record<string, string> = {
      equipment: 'Equipment',
      apparel: 'Apparel',
      accessories: 'Accessories',
      nutrition: 'Nutrition',
      services: 'Services',
      technology: 'Technology',
      other: 'Other',
    }
    return labels[category] || category
  }

  // Loading state
  if (brandLoading || !brand) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <Skeleton variant="circular" width={96} height={96} className="flex-shrink-0" />
              <div className="flex-1 space-y-4">
                <Skeleton width="60%" height={40} />
                <div className="flex flex-wrap gap-4">
                  <Skeleton width={160} height={24} />
                  <Skeleton width={140} height={24} />
                </div>
                <Skeleton width={90} height={28} className="rounded-full" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-white shadow-sm">
            <div className="space-y-6 p-6 md:p-8">
              <Skeleton width="40%" height={28} />
              <Skeleton width="100%" height={120} />
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm mb-6 animate-fade-in overflow-visible">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <Avatar
              src={brand.logo_url}
              initials={getInitials(brand.name)}
              size="xl"
              className="flex-shrink-0"
              alt={brand.name ?? undefined}
              enablePreview
              previewTitle={brand.name ?? undefined}
            />

            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{brand.name}</h1>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/brands/${brand.slug}`)}
                    className="gap-1.5 whitespace-nowrap text-xs sm:text-sm px-2.5 sm:px-4"
                  >
                    <Eye className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden xs:inline">Public View</span>
                    <span className="xs:hidden">View</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowEditModal(true)}
                    className="gap-1.5 whitespace-nowrap text-xs sm:text-sm px-2.5 sm:px-4"
                  >
                    <Edit className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden xs:inline">Edit Brand</span>
                    <span className="xs:hidden">Edit</span>
                  </Button>
                  <DashboardMenu />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-4">
                {brand.category && (
                  <div className="flex items-center gap-2">
                    <Store className="w-5 h-5" />
                    <span>{getCategoryLabel(brand.category)}</span>
                  </div>
                )}
                {brand.website_url && (
                  <a
                    href={brand.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-indigo-600 transition-colors"
                  >
                    <Globe className="w-5 h-5" />
                    <span className="truncate max-w-[200px]">
                      {brand.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {brand.instagram_url && (
                  <a
                    href={brand.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-indigo-600 transition-colors"
                  >
                    <Instagram className="w-5 h-5" />
                    <span>Instagram</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RoleBadge role="brand" />
                {brand.is_verified && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                    Verified
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm animate-slide-in-up">
          <div className="sticky top-[68px] z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
            <ScrollableTabs
              tabs={TABS}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              className="gap-8 px-6"
              activeClassName="border-[#8b5cf6] text-[#8b5cf6]"
              inactiveClassName="border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
            />
          </div>

          <div className="p-6 md:p-8">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-fade-in">
                {/* Profile Strength Card */}
                <ProfileStrengthCard
                  percentage={percentage}
                  buckets={buckets}
                  loading={strengthLoading}
                  onBucketAction={(bucket) => {
                    if (bucket.actionId === 'edit-profile') {
                      setShowEditModal(true)
                    } else if (bucket.actionId === 'add-product') {
                      handleTabChange('products')
                      setEditingProduct(null)
                      setShowAddProductModal(true)
                    }
                  }}
                />

                {/* Brand Info Section */}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Brand Information</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                      <p className="text-gray-900 font-medium">{brand.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <p className="text-gray-900">{getCategoryLabel(brand.category) || 'Not specified'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                      {brand.website_url ? (
                        <a
                          href={brand.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {brand.website_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
                      {brand.instagram_url ? (
                        <a
                          href={brand.instagram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          {brand.instagram_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* About Section */}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">About</h2>
                  {brand.bio ? (
                    <p className="text-gray-700 whitespace-pre-wrap">{brand.bio}</p>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                      <p className="text-gray-500 mb-4">Add a description to tell people about your brand.</p>
                      <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)}>
                        Add Description
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Products & Services</h2>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setEditingProduct(null); setShowAddProductModal(true) }}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Product
                  </Button>
                </div>

                {productsLoading ? (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                        <Skeleton width="100%" height={200} />
                        <div className="p-4 space-y-2">
                          <Skeleton width="60%" height={20} />
                          <Skeleton width="100%" height={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No products yet</h3>
                    <p className="text-gray-600 max-w-md mx-auto mb-4">
                      Showcase your products and services here. Athletes will be able to discover and connect with your brand.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => { setEditingProduct(null); setShowAddProductModal(true) }}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First Product
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {products.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        brandWebsiteUrl={brand.website_url}
                        isOwner
                        onEdit={(p) => { setEditingProduct(p); setShowAddProductModal(true) }}
                        onDelete={(p) => setProductToDelete(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Posts</h2>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => { setEditingPost(null); setShowAddPostModal(true) }}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New Post
                  </Button>
                </div>

                {postsLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="rounded-xl border border-gray-200 p-4 space-y-3">
                        <Skeleton width="60%" height={18} />
                        <Skeleton width="100%" height={14} />
                        <Skeleton width="80%" height={14} />
                      </div>
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts yet</h3>
                    <p className="text-gray-600 max-w-md mx-auto mb-4">
                      Share updates, announcements, and news with your audience. Posts appear in the global brand feed.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => { setEditingPost(null); setShowAddPostModal(true) }}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create Your First Post
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {posts.map(post => (
                      <BrandPostCard
                        key={post.id}
                        post={post}
                        brandName={brand.name}
                        brandSlug={brand.slug}
                        brandLogoUrl={brand.logo_url}
                        brandIsVerified={brand.is_verified}
                        isOwner
                        onEdit={(p) => { setEditingPost(p); setShowAddPostModal(true) }}
                        onDelete={(p) => setPostToDelete(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Messages</h2>
                  <Link to="/messages">
                    <Button variant="primary" size="sm" className="gap-2">
                      <MessageCircle className="w-4 h-4" />
                      Open Messages
                    </Button>
                  </Link>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Conversations</h3>
                  <p className="text-gray-600 max-w-md mx-auto mb-4">
                    Athletes and clubs can reach out to you. View and respond to your messages in the Messages section.
                  </p>
                  <p className="text-sm text-gray-500">
                    Note: As a brand, you can reply to conversations but cannot initiate them.
                  </p>
                </div>
              </div>
            )}

            {/* Followers Tab */}
            {activeTab === 'followers' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900">Followers</h2>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h3>
                  <p className="text-gray-600 max-w-md mx-auto">
                    Soon athletes will be able to follow your brand. You'll see your followers here and be able to connect with them.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Brand Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowEditModal(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Edit Brand Profile</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <BrandForm
                  brand={brand}
                  onSubmit={handleUpdateBrand}
                  isSubmitting={isSubmitting}
                  submitLabel="Save Changes"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {brand && (
        <AddProductModal
          isOpen={showAddProductModal}
          onClose={() => { setShowAddProductModal(false); setEditingProduct(null) }}
          onSubmit={handleProductSubmit}
          brandId={brand.id}
          editingProduct={editingProduct}
        />
      )}

      {/* Delete Product Confirmation */}
      {productToDelete && (
        <ConfirmActionModal
          isOpen={Boolean(productToDelete)}
          title="Delete Product"
          description={`Are you sure you want to delete "${productToDelete.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmTone="danger"
          onConfirm={handleDeleteProduct}
          onClose={() => setProductToDelete(null)}
          confirmLoading={isDeletingProduct}
        />
      )}

      {/* Add/Edit Post Modal */}
      {brand && (
        <AddPostModal
          isOpen={showAddPostModal}
          onClose={() => { setShowAddPostModal(false); setEditingPost(null) }}
          onSubmit={handlePostSubmit}
          brandId={brand.id}
          editingPost={editingPost}
        />
      )}

      {/* Delete Post Confirmation */}
      {postToDelete && (
        <ConfirmActionModal
          isOpen={Boolean(postToDelete)}
          title="Delete Post"
          description="Are you sure you want to delete this post? This action cannot be undone."
          confirmLabel="Delete"
          confirmTone="danger"
          onConfirm={handleDeletePost}
          onClose={() => setPostToDelete(null)}
          confirmLoading={isDeletingPost}
        />
      )}
    </div>
  )
}
