import GalleryManager from './GalleryManager'

interface ClubMediaTabProps {
  clubId?: string
  readOnly?: boolean
}

export default function ClubMediaTab({ clubId, readOnly = false }: ClubMediaTabProps) {
  return (
    <GalleryManager
      mode="club"
      entityId={clubId}
      readOnly={readOnly}
      title="Photo Gallery"
      description="Manage your club photos"
      emptyStateDescription="No photos yet"
      addButtonLabel="Add Photos"
    />
  )
}
