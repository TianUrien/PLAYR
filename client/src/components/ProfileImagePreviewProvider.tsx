import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import ImagePreviewModal from './ImagePreviewModal'

interface PreviewPayload {
  src: string
  alt?: string
  title?: string
}

interface ProfileImagePreviewContextValue {
  openPreview: (payload: PreviewPayload) => void
}

const noop = () => {}

const ProfileImagePreviewContext = createContext<ProfileImagePreviewContextValue>({
  openPreview: noop,
})

export function ProfileImagePreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null)

  const openPreview = useCallback((payload: PreviewPayload) => {
    if (!payload.src) return
    setPreview(payload)
  }, [])

  const closePreview = useCallback(() => setPreview(null), [])

  const value = useMemo(() => ({ openPreview }), [openPreview])

  return (
    <ProfileImagePreviewContext.Provider value={value}>
      {children}
      <ImagePreviewModal
        isOpen={Boolean(preview)}
        src={preview?.src ?? ''}
        alt={preview?.alt}
        title={preview?.title}
        onClose={closePreview}
      />
    </ProfileImagePreviewContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useProfileImagePreview = () => useContext(ProfileImagePreviewContext)
