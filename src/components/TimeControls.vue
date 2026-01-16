<template>
  <div class="modern-time-controls">
    <div class="time-buttons">
      <button 
        v-for="period in timePeriods" 
        :key="period.value"
        :class="['time-btn', { active: selectedPeriod === period.value }]"
        @click="selectPeriod(period.value)"
      >
        {{ period.label }}
      </button>
    </div>
    
    <div class="live-status" v-if="selectedPeriod === 'live'">
      <div class="live-dot"></div>
      <span class="live-text">LIVE</span>
    </div>
    
    <div class="time-slider-container" v-if="selectedPeriod !== 'live'">
      <input 
        type="range" 
        class="time-slider"
        :min="0" 
        :max="timeRange.length - 1"
        v-model="timeIndex"
        @input="updateTime"
      />
      <div class="time-display">
        {{ currentTimeDisplay }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  currentTime: Date
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'time-changed': [time: Date]
}>()

const selectedPeriod = ref('live')
const timeIndex = ref(0)

const timePeriods = [
  { label: 'Live', value: 'live' },
  { label: 'Days', value: 'days' },
  { label: 'Months', value: 'months' },
  { label: 'Years', value: 'years' }
]

const timeRange = computed(() => {
  const now = new Date()
  const range = []

  switch (selectedPeriod.value) {
    case 'days': {
      const days = 30
      for (let i = days; i >= 0; i--) {
        const time = new Date(now)
        time.setDate(now.getDate() - i)
        time.setHours(0, 0, 0, 0)
        range.push(time)
      }
      break
    }
    case 'months': {
      const months = 12
      for (let i = months; i >= 0; i--) {
        const time = new Date(now.getFullYear(), now.getMonth() - i, 1)
        range.push(time)
      }
      break
    }
    case 'years': {
      const years = 5
      for (let i = years; i >= 0; i--) {
        const time = new Date(now.getFullYear() - i, 0, 1)
        range.push(time)
      }
      break
    }
    default: {
      range.push(now)
      break
    }
  }

  return range
})

const timeDisplayOptions = computed(() => {
  switch (selectedPeriod.value) {
    case 'months':
      return { month: 'short', year: 'numeric' }
    case 'years':
      return { year: 'numeric' }
    default:
      return { month: 'short', day: 'numeric', year: 'numeric' }
  }
})

const currentTimeDisplay = computed(() => {
  if (timeRange.value.length === 0) return ''
  return timeRange.value[timeIndex.value].toLocaleString('en-US', timeDisplayOptions.value)
})

const selectPeriod = (period: string) => {
  selectedPeriod.value = period
  timeIndex.value = timeRange.value.length - 1
  emitTimeChange()
}

const updateTime = () => {
  emitTimeChange()
}

const emitTimeChange = () => {
  const time = selectedPeriod.value === 'live' 
    ? new Date() 
    : timeRange.value[timeIndex.value]
  
  emit('time-changed', time)
}
</script>

<style scoped>
.modern-time-controls {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(20px);
  z-index: 1000;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-width: 280px;
}

.time-buttons {
  display: flex;
  gap: 2px;
  margin-bottom: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 4px;
}

.time-btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #666;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.time-btn.active {
  background: #007cba;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 124, 186, 0.3);
}

.time-btn:hover:not(.active) {
  background: rgba(0, 124, 186, 0.1);
  color: #007cba;
}

.live-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  color: #28a745;
  font-size: 13px;
  font-weight: 600;
  background: rgba(40, 167, 69, 0.1);
  border-radius: 8px;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: #28a745;
  border-radius: 50%;
  animation: pulse 2s infinite;
  box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.4);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(40, 167, 69, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(40, 167, 69, 0);
  }
}

.time-slider-container {
  text-align: center;
}

.time-slider {
  width: 100%;
  margin-bottom: 12px;
  height: 6px;
  border-radius: 3px;
  background: #e9ecef;
  outline: none;
  -webkit-appearance: none;
}

.time-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #007cba;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 124, 186, 0.3);
}

.time-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #007cba;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 6px rgba(0, 124, 186, 0.3);
}

.time-display {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  background: #f8f9fa;
  padding: 8px 12px;
  border-radius: 6px;
}

.live-text {
  font-size: 12px;
  letter-spacing: 0.5px;
}
</style>
