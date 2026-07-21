<template>
  <section class="auth-page">
    <div class="auth-card">
      <div class="auth-card__header">
        <p class="auth-card__eyebrow">Create Account</p>
        <h1>Sign up</h1>
        <p>Create your account to unlock the authenticated dashboard.</p>
      </div>

      <div v-if="submitError" class="auth-banner auth-banner--error">
        {{ submitError }}
      </div>

      <div v-if="!authEnabled" class="auth-banner auth-banner--warning">
        Authentication is not enabled on this backend yet. Anonymous access is currently allowed.
      </div>

      <div v-if="registrationComplete" class="auth-banner auth-banner--success">
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
    </div>
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

<style scoped>
.auth-page {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 48px 20px 72px;
  box-sizing: border-box;
}

.auth-card {
  width: min(560px, 100%);
  padding: 28px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 34%),
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
  color: #93c5fd;
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

.auth-banner--success {
  background: rgba(94, 234, 212, 0.12);
  border: 1px solid rgba(94, 234, 212, 0.28);
  color: #ccfbf1;
  line-height: 1.5;
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
  outline: 2px solid rgba(147, 197, 253, 0.52);
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
  color: #082f49;
  background: linear-gradient(135deg, #93c5fd, #f8fafc);
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
  color: #93c5fd;
  font-weight: 700;
}

</style>
