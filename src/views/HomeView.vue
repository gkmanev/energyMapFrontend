<template>
  <EnergyMap />
  <RouterView v-slot="{ Component }">
    <AuthModal v-if="Component">
      <component :is="Component" />
    </AuthModal>
  </RouterView>
</template>

<script setup>
import EnergyMap from '@/components/EnergyMap.vue'
import AuthModal from '@/components/AuthModal.vue'
import { RouterView } from 'vue-router'
</script>
