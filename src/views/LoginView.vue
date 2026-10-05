<template>
  <section class="auth-card">
    <div class="auth-card__header">
      <h1 id="auth-title">Log in</h1>
    </div>

    <div
      v-if="route.query.reason === 'session-expired'"
      class="auth-banner auth-banner--warning"
    >
      Your session expired. Please log in again.
    </div>

    <div v-if="!authEnabled" class="auth-banner auth-banner--warning">
      Authentication is not enabled on this backend yet. Anonymous access is currently allowed.
    </div>

    <div v-if="submitError" class="auth-banner auth-banner--error" role="alert">
      {{ submitError }}
    </div>

    <form class="auth-form" @submit.prevent="handleSubmit">
      <label class="auth-field">
        <span>Email</span>
        <input
          v-model.trim="form.email"
          type="email"
          autocomplete="email"
          placeholder="user@example.com"
          :disabled="auth.isLoading || !authEnabled"
        />
        <small v-if="emailError">{{ emailError }}</small>
      </label>

      <label class="auth-field">
        <span>Password</span>
        <input
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          :disabled="auth.isLoading || !authEnabled"
        />
        <small v-if="passwordError">{{ passwordError }}</small>
      </label>

      <button class="auth-submit" type="submit" :disabled="auth.isLoading || !authEnabled">
        {{ auth.isLoading ? 'Logging in...' : 'Log in' }}
      </button>
    </form>

    <p class="auth-card__footer">
      Need an account?
      <RouterLink to="/signup">Sign up</RouterLink>
    </p>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { AUTH_ENABLED } from '@/config/api'
import { useAuthStore } from '@/stores/authStore'
import { firstFieldError, normalizeApiError } from '@/utils/apiErrors'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const authEnabled = AUTH_ENABLED

const form = reactive({
  email: '',
  password: ''
})

const fieldErrors = ref({})
const submitError = ref('')

const emailError = computed(() => firstFieldError(fieldErrors.value, 'email'))
const passwordError = computed(() => firstFieldError(fieldErrors.value, 'password'))

function validateForm() {
  const errors = {}

  if (!form.email) {
    errors.email = ['Email is required.']
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = ['Enter a valid email address.']
  }

  if (!form.password) {
    errors.password = ['Password is required.']
  }

  return errors
}

function resolveRedirectTarget() {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/'
}

async function handleSubmit() {
  if (!authEnabled) {
    submitError.value = 'Authentication is not available on this backend yet.'
    return
  }

  fieldErrors.value = validateForm()
  submitError.value = ''

  if (Object.keys(fieldErrors.value).length) {
    submitError.value = 'Fix the highlighted fields and try again.'
    return
  }

  try {
    await auth.login({
      email: form.email,
      password: form.password
    })

    await router.push(resolveRedirectTarget())
  } catch (error) {
    const normalized = normalizeApiError(error, 'Invalid email or password.')
    fieldErrors.value = normalized.fieldErrors
    submitError.value = normalized.message
  }
}
</script>

<style scoped src="@/assets/auth-form.css"></style>
