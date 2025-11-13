import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import type { Vacancy } from '@/lib/supabase'
import Button from './Button'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface ApplyToVacancyModalProps {
  isOpen: boolean
  onClose: () => void
  vacancy: Vacancy
  onSuccess: (vacancyId: string) => void
  onError?: (vacancyId: string) => void
}

export default function ApplyToVacancyModal({
  isOpen,
  onClose,
  vacancy,
  onSuccess,
  onError,
}: ApplyToVacancyModalProps) {
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return
    }
    onClose()
    setError(null)
  }, [isSubmitting, onClose])

  useFocusTrap({ containerRef: dialogRef, isActive: isOpen })

  useEffect(() => {
    if (!isOpen) {
      return
    }

    // Lock body scroll when modal is open
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [handleClose, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      setError('You must be signed in to apply.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const { error: insertError } = await supabase
        .from('vacancy_applications')
        .insert({
          vacancy_id: vacancy.id,
          player_id: user.id,
          status: 'pending',
        } as never)

      if (insertError) {
        // Check for duplicate application error (code 23505 = unique violation)
        if (insertError.code === '23505') {
          // User already applied - treat as success path
          onSuccess(vacancy.id)
          onClose()
          addToast('Application confirmed!', 'success')
        } else if (insertError.code === '42501' || insertError.message?.includes('row-level security')) {
          // RLS policy blocked the insert - role mismatch
          console.error('❌ Role mismatch - RLS policy blocked application:', insertError)
          onError?.(vacancy.id)
          
          // Show user-friendly role mismatch message
          if (vacancy.opportunity_type === 'coach') {
            addToast('Only coaches can apply to coach vacancies.', 'error')
          } else if (vacancy.opportunity_type === 'player') {
            addToast('Only players can apply to player vacancies.', 'error')
          } else {
            addToast('You cannot apply to this vacancy due to role restrictions.', 'error')
          }
        } else {
          // Real error - revert optimistic update
          console.error('❌ Error applying to vacancy:', insertError)
          onError?.(vacancy.id)
          setError('Failed to submit application. Please try again.')
          addToast('Failed to submit application. Please try again.', 'error')
        }
      } else {
        // Success! Application created
        onSuccess(vacancy.id)
        onClose()
        addToast('Application submitted successfully!', 'success')
      }
    } catch (err) {
      // Network error - UI already updated
      console.error('❌ Unexpected error:', err)
      onError?.(vacancy.id)
      setError('Network error. Please check your connection and try again.')
      addToast('Network error. Please check your connection and try again.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 id={titleId} className="text-2xl font-bold text-gray-900">Apply to Position</h2>
            <p id={descriptionId} className="text-sm text-gray-600 mt-1">{vacancy.title}</p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Vacancy Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            {vacancy.opportunity_type === 'player' && vacancy.position && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Position:</span>
                <span className="text-sm text-gray-900">{vacancy.position}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Location:</span>
              <span className="text-sm text-gray-900">
                {vacancy.location_city}, {vacancy.location_country}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Type:</span>
              <span className="text-sm text-gray-900 capitalize">{vacancy.opportunity_type}</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>What happens next?</strong> Your application will be sent to the club. 
              They'll review your profile and may contact you if you're a good fit.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
