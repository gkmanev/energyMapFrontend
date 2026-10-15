<template>
  <div id="app" class="app-shell">
    <header class="topbar">
      <nav class="topbar__nav" aria-label="Account">
        <RouterLink
          v-if="auth.isAuthenticated"
          class="topbar__link"
          to="/"
        >
          Dashboard
        </RouterLink>

        <template v-if="auth.isAuthenticated">
          <div class="topbar__identity">
            <span class="topbar__identity-label">Signed in as</span>
            <strong>{{ displayIdentity }}</strong>
          </div>
          <button class="topbar__button" type="button" @click="handleLogout">
            Logout
          </button>
        </template>
        <template v-else>
          <RouterLink class="topbar__link" to="/login">
            Login
          </RouterLink>
          <RouterLink class="topbar__button topbar__button--primary" to="/signup">
            Sign up
          </RouterLink>
        </template>

      </nav>
    </header>

    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const displayIdentity = computed(() => {
  const user = auth.user
  if (!user) {
    return 'Unknown user'
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return fullName || user.email || 'Unknown user'
})

async function handleLogout() {
  await auth.logout()
}
</script>

<style>
body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background: radial-gradient(
  48% 39% at 0% 50%, rgba(255, 255, 255, 0.14) 0%,
   rgba(255, 255, 255, 0) 62%),
   radial-gradient(46% 39% at 100% 50%,
   rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 62%),
   #1f0b39;
  background-attachment: fixed;
  color: #e5e7eb;
}

#app {
  min-height: 100vh;
}

a {
  text-decoration: none;
}
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 20px;
  font-family: Arial, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  backdrop-filter: blur(18px);
  background: rgba(10, 12, 24, 0.68);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.topbar__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  justify-content: flex-end;
}

.topbar__link,
.topbar__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 44px;
  padding: 8px 12px;
  flex-shrink: 0;
  white-space: nowrap;
  font: inherit;
}

.topbar__link:focus-visible,
.topbar__button:focus-visible {
  outline: 2px solid #5eead4;
  outline-offset: 2px;
}

.topbar__link {
  color: rgba(226, 232, 240, 0.86);
  font-weight: 600;
}

.topbar__identity {
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 0 8px;
}

.topbar__identity-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.88);
}

.topbar__identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: 14px;
}

.topbar__button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.topbar__button--primary {
  background: linear-gradient(135deg, #5eead4, #93c5fd);
  border-color: transparent;
  color: #042f2e;
}

.app-main {
  flex: 1;
}

@media (max-width: 1024px) {
  .topbar {
    padding-inline: 12px;
  }

  .topbar__nav {
    gap: 4px;
    max-width: 100%;
  }

  .topbar__identity {
    padding-inline: 4px;
  }

  .topbar__identity-label {
    display: none;
  }
}

/* On small screens the account links live in the map header's menu. */
@media (max-width: 768px) {
  .topbar {
    display: none;
  }
}
</style>
