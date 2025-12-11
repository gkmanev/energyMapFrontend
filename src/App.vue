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
  background:
    radial-gradient(46% 60% at 18% 50%, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 62%),
    radial-gradient(46% 60% at 82% 50%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 62%),
    #1a1c20;
  background-attachment: fixed;
  color: #e5e7eb;
}

#app {
  min-height: 100vh;
}
</style>
