const DEFAULT_API_BASE_URL = 'https://api.visualize.energy/api'

const stripTrailingSlashes = (value) => String(value || '').replace(/\/+$/, '')
const parseBooleanEnv = (value, fallback = false) => {
  if (value == null || value === '') {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

const configuredBaseUrl = stripTrailingSlashes(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
)

export const API_BASE_URL = configuredBaseUrl || DEFAULT_API_BASE_URL
export const AUTH_ENABLED = parseBooleanEnv(import.meta.env.VITE_AUTH_ENABLED, true)
export const API_ROOT_URL = API_BASE_URL.endsWith('/api')
  ? API_BASE_URL.slice(0, -4)
  : API_BASE_URL

export function buildApiUrl(path = '') {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = String(path || '').replace(/^\/+/, '')
  return normalizedPath ? `${API_BASE_URL}/${normalizedPath}` : API_BASE_URL
}

export function buildApiRootUrl(path = '') {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = String(path || '').replace(/^\/+/, '')
  return normalizedPath ? `${API_ROOT_URL}/${normalizedPath}` : API_ROOT_URL
}
