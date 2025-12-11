<template>
  <div id="app">
    <EnergyMap />
  </div>
</template>

<script setup lang="ts">
import EnergyMap from './components/EnergyMap.vue'
</script>

<style>
body {
  margin: 0;
  min-height: 100vh;
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
</style>
