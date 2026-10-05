<template>
  <section class="auth-card">
    <div class="auth-card__header">
      <h1 id="auth-title">Sign up</h1>
    </div>

    <div v-if="submitError" class="auth-banner auth-banner--error" role="alert">
      {{ submitError }}
    </div>

    <div v-if="!authEnabled" class="auth-banner auth-banner--warning">
      Authentication is not enabled on this backend yet. Anonymous access is currently allowed.
    </div>

    <div v-if="registrationComplete" class="auth-banner auth-banner--success" role="status">
      We sent an activation link to <strong>{{ form.email }}</strong>. Activate your account from that email, then log in.
    </div>

    <form v-else class="auth-form" @submit.prevent="handleSubmit">
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
          autocomplete="new-password"
          placeholder="Minimum 8 characters"
          :disabled="auth.isLoading || !authEnabled"
        />
        <small v-if="passwordError">{{ passwordError }}</small>
      </label>

      <label class="auth-field">
        <span>Confirm password</span>
        <input
          v-model="form.password_confirmation"
          type="password"
          autocomplete="new-password"
          placeholder="Repeat your password"
          :disabled="auth.isLoading || !authEnabled"
        />
        <small v-if="passwordConfirmationError">{{ passwordConfirmationError }}</small>
      </label>

      <button class="auth-submit" type="submit" :disabled="auth.isLoading || !authEnabled">
        {{ auth.isLoading ? 'Creating account...' : 'Create account' }}
      </button>
    </form>

    <p v-if="!registrationComplete" class="auth-card__footer">
      Already registered?
      <RouterLink to="/login">Log in</RouterLink>
    </p>
    <p v-else class="auth-card__footer">
      <RouterLink to="/login">Go to log in</RouterLink>
    </p>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AUTH_ENABLED } from '@/config/api'
import { useAuthStore } from '@/stores/authStore'
import { firstFieldError, normalizeApiError } from '@/utils/apiErrors'

const auth = useAuthStore()
const authEnabled = AUTH_ENABLED

const form = reactive({
  email: '',
  password: '',
  password_confirmation: ''
})

const fieldErrors = ref({})
const submitError = ref('')
const registrationComplete = ref(false)

const emailError = computed(() => firstFieldError(fieldErrors.value, 'email'))
const passwordError = computed(() => firstFieldError(fieldErrors.value, 'password'))
const passwordConfirmationError = computed(() => firstFieldError(fieldErrors.value, 'password_confirmation'))

function validateForm() {
  const errors = {}

  if (!form.email) {
    errors.email = ['Email is required.']
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = ['Enter a valid email address.']
  }

  if (!form.password) {
    errors.password = ['Password is required.']
  } else if (form.password.length < 8) {
    errors.password = ['Password must be at least 8 characters long.']
  }

  if (!form.password_confirmation) {
    errors.password_confirmation = ['Confirm your password.']
  } else if (form.password_confirmation !== form.password) {
    errors.password_confirmation = ['Passwords do not match.']
  }

  return errors
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
    await auth.register({
      email: form.email,
      password: form.password
    })
    registrationComplete.value = true
  } catch (error) {
    const normalized = normalizeApiError(error, 'Unable to create your account.')
    fieldErrors.value = normalized.fieldErrors
    submitError.value = normalized.message
  }
}
</script>

<style scoped src="@/assets/auth-form.css"></style>
