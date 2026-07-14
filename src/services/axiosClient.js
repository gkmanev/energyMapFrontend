import axios from 'axios'
import { API_BASE_URL } from '@/config/api'

const getServerElapsedMs = (response) => {
  if (!response) {
    return null
  }

  return (
    response.data?.server_elapsed_ms ??
    response.data?.server_elapsed_time ??
    response.headers?.server_elapsed_ms ??
    response.headers?.server_elapsed_time ??
    response.headers?.['server_elapsed_ms'] ??
    response.headers?.['server_elapsed_time'] ??
    null
  )
}

const logServerElapsedMs = (response) => {
  const serverElapsedMs = getServerElapsedMs(response)

  if (serverElapsedMs !== null) {
    console.log('server_elapsed_ms:', serverElapsedMs)
  }
}

const attachResponseLogging = (client) => {
  client.interceptors.response.use(
    (response) => {
      logServerElapsedMs(response)
      return response
    },
    (error) => {
      logServerElapsedMs(error?.response)
      return Promise.reject(error)
    }
  )
}

const httpClient = axios.create()
export const apiClient = axios.create({
  baseURL: API_BASE_URL
})

let getAccessToken = () => ''
let getRefreshToken = () => ''
let refreshAccessToken = null
let logout = null

const shouldSkipRefresh = (config = {}) => {
  const url = String(config.url || '')
  return (
    config._retry ||
    url.includes('auth/login/') ||
    url.includes('auth/register/') ||
    url.includes('auth/refresh/')
  )
}

export function setApiClientAuthHandlers(handlers = {}) {
  getAccessToken = handlers.getAccessToken || (() => '')
  getRefreshToken = handlers.getRefreshToken || (() => '')
  refreshAccessToken = handlers.refreshAccessToken || null
  logout = handlers.logout || null
}

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken()
  if (accessToken) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => {
    logServerElapsedMs(response)
    return response
  },
  async (error) => {
    logServerElapsedMs(error?.response)

    const originalRequest = error?.config
    const status = error?.response?.status

    if (
      status !== 401 ||
      !originalRequest ||
      shouldSkipRefresh(originalRequest) ||
      !getRefreshToken() ||
      typeof refreshAccessToken !== 'function'
    ) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      const nextAccessToken = await refreshAccessToken()
      originalRequest.headers = originalRequest.headers || {}
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      if (typeof logout === 'function') {
        await logout({
          redirect: false
        })
      }

      return Promise.reject(refreshError)
    }
  }
)

attachResponseLogging(httpClient)

export default httpClient
