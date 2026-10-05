<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="auth-dialog"
      aria-labelledby="auth-title"
      @cancel.prevent="dismiss"
      @click="handleBackdropClick"
    >
      <button
        class="auth-dialog__close"
        type="button"
        aria-label="Close account dialog"
        autofocus
        @click="dismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
      <slot />
    </dialog>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const dialog = ref(null)
const router = useRouter()

function dismiss() {
  router.push({ name: 'home' })
}

function handleBackdropClick(event) {
  if (event.target !== dialog.value) return
  const bounds = dialog.value.getBoundingClientRect()
  if (
    event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom
  ) {
    dismiss()
  }
}

onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<style scoped>
.auth-dialog {
  box-sizing: border-box;
  width: min(360px, calc(100% - 32px));
  max-width: none;
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  margin: auto;
  padding: 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: #1a1230;
  color: #f8fafc;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  font-family: Arial, sans-serif;
  font-size: 14px;
  line-height: 1.4;
}

.auth-dialog::backdrop {
  background: rgba(8, 6, 18, 0.22);
}

.auth-dialog__close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #b6a9d5;
  cursor: pointer;
}

.auth-dialog__close svg {
  width: 18px;
  height: 18px;
}

.auth-dialog__close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.auth-dialog__close:focus-visible {
  outline: 2px solid #9c8cf5;
  outline-offset: -2px;
}
</style>
