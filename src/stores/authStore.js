import { reactive } from 'vue'
import * as authService from '@/services/authService'
import { normalizeApiError } from '@/utils/apiErrors'
import { setApiClientAuthHandlers } from '@/services/axiosClient'

const STORAGE_KEYS = {
  accessToken: 'energy-map-auth-access',
  refreshToken: 'energy-map-auth-refresh',
  user: 'energy-map-auth-user'
}

const authState = reactive({
  user: readStoredUser(),
  accessToken: readStorage(STORAGE_KEYS.accessToken),
  refreshToken: readStorage(STORAGE_KEYS.refreshToken),
  isAuthenticated: Boolean(readStorage(STORAGE_KEYS.accessToken)),
  isLoading: false,
  initialized: false,
  error: null
})

let authRouter = null
let initPromise = null
let refreshPromise = null

function readStorage(key) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return ''
  }

  return window.localStorage.getItem(key) || ''
}

function readStoredUser() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEYS.user)
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    window.localStorage.removeItem(STORAGE_KEYS.user)
    return null
  }
}

function persistAuthState() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  if (authState.accessToken) {
    window.localStorage.setItem(STORAGE_KEYS.accessToken, authState.accessToken)
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.accessToken)
  }

  if (authState.refreshToken) {
    window.localStorage.setItem(STORAGE_KEYS.refreshToken, authState.refreshToken)
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.refreshToken)
  }

  if (authState.user) {
    window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(authState.user))
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.user)
  }
}

function syncAuthenticatedFlag() {
  authState.isAuthenticated = Boolean(authState.accessToken)
}

function applyAuthPayload(payload) {
  authState.user = payload?.user || null
  authState.accessToken = payload?.access || ''
  authState.refreshToken = payload?.refresh || authState.refreshToken || ''
  authState.error = null
  syncAuthenticatedFlag()
  persistAuthState()
}

function clearAuthState() {
  authState.user = null
  authState.accessToken = ''
  authState.refreshToken = ''
  authState.error = null
  syncAuthenticatedFlag()
  persistAuthState()
}

async function redirectToLogin(reason = '') {
  if (!authRouter) {
    return
  }

  const target = reason
    ? { name: 'login', query: { reason } }
    : { name: 'login' }

  try {
    await authRouter.push(target)
  } catch {
    // Ignore redundant navigation errors.
  }
}

async function runAuthAction(action, fallbackMessage) {
  authState.isLoading = true
  authState.error = null

  try {
    return await action()
  } catch (error) {
    const normalized = normalizeApiError(error, fallbackMessage)
    authState.error = normalized.message
    throw error
  } finally {
    authState.isLoading = false
  }
}

export function useAuthStore() {
  return authStore
}

export const authStore = {
  get user() {
    return authState.user
  },
  get accessToken() {
    return authState.accessToken
  },
  get refreshToken() {
    return authState.refreshToken
  },
  get isAuthenticated() {
    return authState.isAuthenticated
  },
  get isLoading() {
    return authState.isLoading
  },
  get initialized() {
    return authState.initialized
  },
  get error() {
    return authState.error
  },

  setRouter(router) {
    authRouter = router
  },

  async register(payload) {
    return runAuthAction(async () => {
      const { data } = await authService.register(payload)
      // Registration requires email activation, so a successful response must
      // never establish a session from any tokens the API may include.
      clearAuthState()
      return data
    }, 'Unable to create your account.')
  },

  async login(payload) {
    return runAuthAction(async () => {
      const { data } = await authService.login(payload)
      applyAuthPayload(data)
      return data.user
    }, 'Unable to sign in with those credentials.')
  },

  async fetchMe({ showLoading = false } = {}) {
    if (!authState.accessToken) {
      throw new Error('Missing access token.')
    }

    if (showLoading) {
      authState.isLoading = true
    }

    authState.error = null

    try {
      const { data } = await authService.getMe()
      authState.user = data
      syncAuthenticatedFlag()
      persistAuthState()
      return data
    } catch (error) {
      const normalized = normalizeApiError(error, 'Unable to load your account.')
      authState.error = normalized.message
      throw error
    } finally {
      if (showLoading) {
        authState.isLoading = false
      }
    }
  },

  async refreshAccessToken() {
    if (!authState.refreshToken) {
      throw new Error('Missing refresh token.')
    }

    if (refreshPromise) {
      return refreshPromise
    }

    refreshPromise = (async () => {
      try {
        const { data } = await authService.refresh({
          refresh: authState.refreshToken
        })

        authState.accessToken = data?.access || ''
        syncAuthenticatedFlag()
        persistAuthState()
        return authState.accessToken
      } catch (error) {
        clearAuthState()
        throw error
      } finally {
        refreshPromise = null
      }
    })()

    return refreshPromise
  },

  async logout(options = {}) {
    const { redirect = true, reason = '' } = options
    clearAuthState()
    authState.initialized = true

    if (redirect) {
      await redirectToLogin(reason)
    }
  },

  async initAuth() {
    if (authState.initialized) {
      return authState.user
    }

    if (initPromise) {
      return initPromise
    }

    initPromise = (async () => {
      authState.isLoading = true
      authState.error = null

      try {
        if (authState.accessToken) {
          await this.fetchMe()
        } else if (authState.refreshToken) {
          await this.refreshAccessToken()
          await this.fetchMe()
        } else {
          clearAuthState()
        }
      } catch {
        await this.logout({
          redirect: false
        })
      } finally {
        authState.initialized = true
        authState.isLoading = false
        initPromise = null
      }

      return authState.user
    })()

    return initPromise
  }
}

setApiClientAuthHandlers({
  getAccessToken: () => authState.accessToken,
  getRefreshToken: () => authState.refreshToken,
  refreshAccessToken: () => authStore.refreshAccessToken(),
  logout: (options) => authStore.logout(options)
})
