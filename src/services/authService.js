import { apiClient } from '@/services/axiosClient'

export function register(payload) {
  return apiClient.post('auth/register/', payload)
}

export function login(payload) {
  return apiClient.post('auth/login/', payload)
}

export function refresh(payload) {
  return apiClient.post('auth/refresh/', payload)
}

export function getMe() {
  return apiClient.get('auth/me/')
}
