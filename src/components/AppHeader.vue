<template>
  <header class="app-header">
    <div class="header-main">
      <div class="header-left">
        <a class="brand" href="/">
          visualize<span class="brand-accent">.energy</span>
        </a>

        <nav class="view-tabs" role="tablist" aria-label="Map view">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="tab"
            :class="{ active: modelValue === tab.id }"
            :aria-selected="modelValue === tab.id"
            @click="emit('update:modelValue', tab.id)"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <div class="header-right">
        <span class="clock" :title="clockFull">
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
          {{ clockShort }}
        </span>

        <button type="button" class="btn-agent" @click="emit('open-agent')">
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 5.7a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
          </svg>
          AI agent
        </button>
      </div>
    </div>

    <div class="header-sub">
      <div class="layers">
        <span class="strip-label">Layers</span>

        <label class="layer-toggle">
          <input
            type="checkbox"
            :checked="layers.irradiance"
            @change="toggleLayer('irradiance')"
          />
          <span class="switch" aria-hidden="true"></span>
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          Irradiance
        </label>

        <label class="layer-toggle">
          <input
            type="checkbox"
            :checked="layers.wind"
            @change="toggleLayer('wind')"
          />
          <span class="switch" aria-hidden="true"></span>
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 8h8.5a2.5 2.5 0 1 0-2.4-3.2M3 12h15.5a2.5 2.5 0 1 1-2.4 3.2M4 16h7.5a2.5 2.5 0 1 1-2.4 3.2" />
          </svg>
          Wind
        </label>
      </div>

      <div class="legend" aria-label="Price color scale">
        <span class="legend-unit">{{ legendUnit }}</span>
        <span class="legend-tick">{{ legendMin }}</span>
        <span class="legend-ramp"></span>
        <span class="legend-tick">{{ legendMax }}+</span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'price' },
  legendUnit: { type: String, default: 'EUR/MWh' },
  legendMin: { type: [Number, String], default: 0 },
  legendMax: { type: [Number, String], default: 120 },
  layersValue: {
    type: Object,
    default: () => ({ irradiance: false, wind: false })
  }
})

const emit = defineEmits(['update:modelValue', 'open-agent', 'layer-change'])

const tabs = [
  { id: 'price', label: 'Price' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'generation', label: 'Generation' }
]

const layers = ref({
  irradiance: Boolean(props.layersValue?.irradiance),
  wind: Boolean(props.layersValue?.wind)
})

watch(
  () => props.layersValue,
  (value) => {
    layers.value = {
      irradiance: Boolean(value?.irradiance),
      wind: Boolean(value?.wind)
    }
  },
  { deep: true }
)

function toggleLayer(name) {
  layers.value = {
    ...layers.value,
    [name]: !layers.value[name]
  }
  emit('layer-change', { ...layers.value })
}

const now = ref(new Date())
let timer

const clockShort = computed(() => (
  now.value.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short'
  })
))

const clockFull = computed(() => (
  now.value.toLocaleString('en-GB', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short'
  })
))

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 60_000)
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.app-header {
  --hdr-bg: #1a1230;
  --hdr-bg-sub: #1f1638;
  --hdr-border: #3a2f5c;
  --hdr-pill-bg: #241a42;
  --hdr-accent: #7c6cf0;
  --hdr-accent-hover: #8f80f4;
  --hdr-text: #ffffff;
  --hdr-text-soft: #cfc4f2;
  --hdr-text-dim: #b6a9e8;
  --hdr-text-faint: #8677b8;

  background: var(--hdr-bg);
  border: 1px solid var(--hdr-border);
  border-radius: 12px;
  overflow: hidden;
  font-family: inherit;
}

.icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  flex-wrap: wrap;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.brand {
  font-size: 15px;
  font-weight: 500;
  color: var(--hdr-text);
  text-decoration: none;
  white-space: nowrap;
}

.brand-accent {
  color: var(--hdr-accent-hover);
}

.view-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--hdr-pill-bg);
  border-radius: 8px;
}

.tab {
  font-size: 13px;
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--hdr-text-dim);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab:hover {
  color: var(--hdr-text-soft);
}

.tab.active {
  background: var(--hdr-accent);
  color: var(--hdr-text);
  font-weight: 500;
}

.tab:focus-visible {
  outline: 2px solid var(--hdr-accent-hover);
  outline-offset: 1px;
}

.clock {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--hdr-text-faint);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.btn-agent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: var(--hdr-accent);
  color: var(--hdr-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.btn-agent:hover {
  background: var(--hdr-accent-hover);
}

.header-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-top: 1px solid var(--hdr-border);
  background: var(--hdr-bg-sub);
  flex-wrap: wrap;
}

.strip-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hdr-text-faint);
}

.layers {
  display: flex;
  align-items: center;
  gap: 14px;
}

.layer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--hdr-text-soft);
  cursor: pointer;
  user-select: none;
}

.layer-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch {
  width: 26px;
  height: 15px;
  border-radius: 8px;
  background: var(--hdr-border);
  position: relative;
  transition: background 0.15s;
}

.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--hdr-text-faint);
  transition: transform 0.15s, background 0.15s;
}

.layer-toggle input:checked + .switch {
  background: var(--hdr-accent);
}

.layer-toggle input:checked + .switch::after {
  transform: translateX(11px);
  background: var(--hdr-text);
}

.layer-toggle input:focus-visible + .switch {
  outline: 2px solid var(--hdr-accent-hover);
  outline-offset: 1px;
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-unit {
  font-size: 11px;
  color: var(--hdr-text-faint);
}

.legend-tick {
  font-size: 11px;
  color: var(--hdr-text-dim);
  font-variant-numeric: tabular-nums;
}

.legend-ramp {
  width: 90px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #f2e8c9, #f0a04b, #d63a2f, #6b0d24);
}

@media (max-width: 560px) {
  .header-left {
    flex-wrap: wrap;
    gap: 10px;
  }

  .header-sub {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
