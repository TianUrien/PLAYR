type PostgrestErrorLike = {
  code?: string
  message?: string
  details?: string
} | null | undefined

export const isUniqueViolationError = (error: PostgrestErrorLike): boolean => {
  if (!error) return false
  const normalizedMessage = (error.message ?? '').toLowerCase()
  const normalizedDetails = (error.details ?? '').toLowerCase()

  return (
    error.code === '23505' ||
    normalizedMessage.includes('duplicate key value') ||
    normalizedDetails.includes('already exists')
  )
}
