const stripHtml = (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export function normalizeApiError(error, fallbackMessage = 'Something went wrong.') {
  const status = error?.response?.status ?? null
  const data = error?.response?.data
  const fieldErrors = {}
  let message = fallbackMessage

  if (typeof data === 'string' && data.trim()) {
    const trimmed = data.trim()
    const plainText = stripHtml(trimmed)

    if (trimmed.startsWith('<!DOCTYPE html') || trimmed.startsWith('<html')) {
      if (plainText.includes('Page not found') && plainText.includes('/api/auth/')) {
        message = 'Authentication is not available on this backend yet.'
      } else {
        message = plainText || fallbackMessage
      }
    } else {
      message = trimmed
    }
  } else if (data && typeof data === 'object') {
    for (const [key, rawValue] of Object.entries(data)) {
      const values = Array.isArray(rawValue)
        ? rawValue.map((item) => String(item)).filter(Boolean)
        : rawValue != null
          ? [String(rawValue)]
          : []

      if (!values.length) {
        continue
      }

      if (key === 'detail' || key === 'non_field_errors') {
        message = values.join(' ')
        continue
      }

      fieldErrors[key] = values
    }

    if (message === fallbackMessage) {
      const firstFieldError = Object.values(fieldErrors).flat()[0]
      if (firstFieldError) {
        message = firstFieldError
      }
    }
  } else if (error?.message) {
    message = String(error.message)
  }

  return {
    status,
    message,
    fieldErrors
  }
}

export function firstFieldError(fieldErrors, fieldName) {
  return fieldErrors?.[fieldName]?.[0] || ''
}
