<template>
  <div id="app">
    <EnergyMap />
  </div>
</template>

<script setup lang="ts">
import EnergyMap from './components/EnergyMap.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
}

body {
  margin: 0;
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
}
</style>
