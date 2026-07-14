import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/authStore'
import 'leaflet/dist/leaflet.css'  // Add this line

const app = createApp(App)
const auth = useAuthStore()

auth.setRouter(router)

app.use(router)

await auth.initAuth()
await router.isReady()

app.mount('#app')
