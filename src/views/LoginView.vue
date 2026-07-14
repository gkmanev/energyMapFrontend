<template>
  <section class="auth-page">
    <div class="auth-card">
      <div class="auth-card__header">
        <p class="auth-card__eyebrow">Account Access</p>
        <h1>Log in</h1>
        <p>Use your account to access the map dashboard.</p>
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

      <div v-if="submitError" class="auth-banner auth-banner--error">
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
    </div>
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

<style scoped>
.auth-page {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 48px 20px 72px;
  box-sizing: border-box;
}

.auth-card {
  width: min(460px, 100%);
  padding: 28px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    radial-gradient(circle at top left, rgba(94, 234, 212, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(12, 16, 32, 0.94), rgba(20, 28, 48, 0.92));
  box-shadow: 0 24px 60px rgba(6, 10, 24, 0.38);
}

.auth-card__header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.4rem);
  color: #f8fafc;
}

.auth-card__header p {
  margin: 10px 0 0;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.5;
}

.auth-card__eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #5eead4;
}

.auth-banner {
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 14px;
}

.auth-banner--error {
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.28);
  color: #fecaca;
}

.auth-banner--warning {
  background: rgba(250, 204, 21, 0.12);
  border: 1px solid rgba(250, 204, 21, 0.28);
  color: #fde68a;
}

.auth-form {
  display: grid;
  gap: 16px;
  margin-top: 22px;
}

.auth-field {
  display: grid;
  gap: 8px;
}

.auth-field span {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.auth-field input {
  width: 100%;
  box-sizing: border-box;
  padding: 13px 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background: rgba(15, 23, 42, 0.7);
  color: #f8fafc;
  font-size: 15px;
}

.auth-field input:focus {
  outline: 2px solid rgba(94, 234, 212, 0.52);
  outline-offset: 1px;
}

.auth-field input:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.auth-field small {
  color: #fda4af;
}

.auth-submit {
  margin-top: 8px;
  border: none;
  border-radius: 14px;
  padding: 14px 18px;
  font-size: 15px;
  font-weight: 700;
  color: #042f2e;
  background: linear-gradient(135deg, #5eead4, #facc15);
  cursor: pointer;
}

.auth-submit:disabled {
  opacity: 0.72;
  cursor: not-allowed;
}

.auth-card__footer {
  margin: 22px 0 0;
  color: rgba(226, 232, 240, 0.78);
}

.auth-card__footer a {
  color: #5eead4;
  font-weight: 700;
}
</style>
