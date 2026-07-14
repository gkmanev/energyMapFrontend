<template>
  <div id="app" class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/">
        <span class="brand__mark">visualize</span>
        <span class="brand__accent">.energy</span>
      </RouterLink>

      <nav class="topbar__nav">
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

    <main class="app-main" :class="{ 'app-main--auth': isAuthRoute }">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const route = useRoute()

const isAuthRoute = computed(() => ['login', 'signup'].includes(String(route.name || '')))
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
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 1400;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  backdrop-filter: blur(18px);
  background: rgba(10, 12, 24, 0.68);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.brand {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: #f8fafc;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.brand__accent {
  color: #5eead4;
}

.topbar__nav {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.topbar__link {
  color: rgba(226, 232, 240, 0.86);
  font-weight: 600;
}

.topbar__identity {
  display: grid;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.topbar__identity-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.88);
}

.topbar__identity strong {
  color: #f8fafc;
  font-size: 14px;
}

.topbar__button {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}

.topbar__button--primary {
  background: linear-gradient(135deg, #5eead4, #93c5fd);
  border-color: transparent;
  color: #042f2e;
}

.app-main {
  min-height: calc(100vh - 78px);
}

.app-main--auth {
  display: flex;
}

@media (max-width: 720px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .topbar__nav {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
