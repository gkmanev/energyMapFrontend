<template>
  <div class="modern-legend">
    <div class="legend-title">Carbon Intensity (gCO₂/kWh)</div>
    <div class="legend-gradient">
      <div class="gradient-bar"></div>
      <div class="legend-labels">
        <span class="legend-value">0</span>
        <span class="legend-value">200</span>
        <span class="legend-value">400</span>
        <span class="legend-value">600</span>
        <span class="legend-value">800+</span>
      </div>
    </div>
    <div class="legend-indicators">
      <div class="legend-row">
        <span class="legend-dot low"></span>
        <span class="legend-text">Low</span>
      </div>
      <div class="legend-row">
        <span class="legend-dot high"></span>
        <span class="legend-text">High</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  colorScale?: Function
  dataRange: [number, number]
}

const props = withDefaults(defineProps<Props>(), {
  colorScale: undefined
})
</script>

<style scoped>
.modern-legend {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(20px);
  z-index: 1000;
  min-width: 200px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.legend-title {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 16px;
  text-align: center;
}

.legend-gradient {
  margin-bottom: 16px;
}

.gradient-bar {
  width: 100%;
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(to right, 
    #1a9641 0%, 
    #a6d96a 25%, 
    #ffffbf 50%, 
    #fdae61 75%, 
    #d7191c 100%);
  margin-bottom: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #666;
  font-weight: 500;
}

.legend-indicators {
  display: flex;
  justify-content: space-around;
  gap: 20px;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.legend-dot.low {
  background: #1a9641;
}

.legend-dot.high {
  background: #d7191c;
}

.legend-text {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}
</style>
