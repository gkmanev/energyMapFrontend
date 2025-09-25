<template>
  <div id="app">
    <div class="header">
      <h1>Energy App by Entra Energy</h1>
      <!-- <div class="controls">
        <label>
          <input type="checkbox" v-model="showTooltips"> Show Country Tooltips
        </label>
        <select v-model="selectedColorScheme" @change="updateColorScheme">
          <option value="viridis">Viridis</option>
          <option value="plasma">Plasma</option>
          <option value="inferno">Inferno</option>
          <option value="turbo">Turbo</option>
          <option value="spectral">Spectral</option>
        </select>
        <button @click="randomizeData">Randomize Data</button>
      </div> -->
    </div>

    <!-- FLEX ROW: sidebar + map -->
    <div class="map-row">
  <!-- Modal side sheet over the map -->
  <transition name="panel-slide" appear>
    <aside
      v-if="isModalOpen"
      class="left-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Country details"
    >
      <div class="panel-header">
        <h3>{{ selectedFeature && selectedFeature.name }}</h3>
        <button class="panel-close" @click="closePanel" aria-label="Close">✕</button>
      </div>
      <div class="panel-content">
  <!-- Capacity -->
  <div v-if="capacityLoading">Loading capacity…</div>
  <div v-else-if="capacityError" style="color:#b00020">{{ capacityError }}</div>
  <template v-else>
    <p v-if="capacityYear">Latest year: {{ capacityYear }}</p>
    <div class="chart-box">
      <canvas ref="capacityChart"></canvas>
    </div>
    <!-- <div style="margin-top:10px;">
      <small>Installed capacity in MW by technology</small>
    </div> -->
  </template>
  <div style="margin-top: 40px;"><span><h3>Generation by technology</h3></span></div>
  <!-- Generation (NOT nested under capacity anymore) -->
  <div v-if="generationLoading" style="margin-top:16px;">Loading generation…</div>
  <div v-else-if="generationError" style="margin-top:16px;color:#b00020">{{ generationError }}</div>
  <template v-else>
    <p v-if="generationDateLabel" style="margin-top:16px;">{{ generationDateLabel }}</p>
    <div class="chart-box chart-box--sm">
      <canvas ref="generationChart"></canvas>
    </div>
    <div style="margin-top:10px;">
      <small>Hourly generation (MW) by technology</small>
    </div>
  </template>
</div>


    </aside>
  </transition>

  <!-- Scrim blocks interaction and closes panel on click -->
  <div
    v-if="isModalOpen"
    class="panel-scrim"
    @click="closePanel"
    aria-hidden="true"
  ></div>

  <!-- Map column -->
  <div class="map-col">
    <LMap
      :zoom="zoom"
      :center="center"
      :options="mapOptions"
      :use-global-leaflet="false"
      class="map"
      @ready="onMapReady"
    >
      <LTileLayer
        :url="tileUrl"
        :attribution="attribution"
        :options="{ noWrap: true, bounds: [[-90, -180], [90, 180]] }"
      />
      <LGeoJson
        v-if="countriesGeoJson"
        :geojson="countriesGeoJson"
        :options="geoJsonOptions"
        :options-style="optionsStyle"
      />
    </LMap>
  </div>
</div>
    <div class="legend">
      <h3>Energy Data Legend</h3>
      <div class="color-scale">
        <div class="scale-bar" :style="scaleBarStyle"></div>
            <div class="scale-labels">
            <span>{{ minValue.toFixed(2) }}</span>
            <span>{{ maxValue.toFixed(2) }} {{ sampleCurrency }}/MWh</span>
            </div>
      </div>
      <div class="legend-items">
        <div 
          v-for="country in sampleCountries" 
          :key="country.name"
          class="legend-item"
        >
          <span 
            class="color-box" 
            :style="{ backgroundColor: country.color }"
          ></span>
          <!-- {{ country.name }}: {{ country.value.toFixed(1) }} TWh -->
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const SUPPORTED_PRICE_ISO2 = new Set([
  // Adjust this list to what your API supports
  'AL','AT','BA','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB',
  'GR','HR','HU','IE','IS','IT','LT','LU','LV','ME','MK','MT','NL','NO','PL',
  'PT','RO','RS','SE','SI','SK','TR','UA'
])
import { markRaw, toRaw, nextTick } from 'vue'
import { LMap, LTileLayer, LGeoJson } from '@vue-leaflet/vue-leaflet'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-date-fns' // <- add this for the time scale
import axios from 'axios'
import { scaleSequential } from 'd3-scale'
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateTurbo,
  interpolateSpectral
} from 'd3-scale-chromatic'

export default {
  name: 'EnergyMap',
  components: { LMap, LTileLayer, LGeoJson },

  data() {
    return {
      // Inline panel state
      isModalOpen: false,
      selectedFeature: null,
      capacityLoading: false,
      capacityError: null,
      capacityYear: null,
      capacityItems: [],
      capacityChartInstance: null,
      generationLoading: false,
      generationError: null,
      generationDateLabel: null,
      generationItems: [],
      generationChartInstance: null,
      psrColors: {
        'Solar':        { border: '#f5b000', fill: 'rgba(245,176,0,0.45)' },
        'Wind Onshore': { border: '#2ca02c', fill: 'rgba(44,160,44,0.45)' },
        'Nuclear':      { border: '#8e44ad', fill: 'rgba(142,68,173,0.45)' },
        'Fossil Gas':   { border: '#ff7f0e', fill: 'rgba(255,127,14,0.45)' },
        'Fossil Hard coal': { border: '#4d4d4d', fill: 'rgba(77,77,77,0.45)' },
        'Fossil Brown coal/Lignite': { border: '#7f6a4d', fill: 'rgba(127,106,77,0.45)' },
        'Hydro Run-of-river and pondage': { border: '#1f77b4', fill: 'rgba(31,119,180,0.45)' },
        'Hydro Water Reservoir':          { border: '#4aa3d2', fill: 'rgba(74,163,210,0.45)' },
        'Hydro Pumped Storage':           { border: '#7fb3d5', fill: 'rgba(127,179,213,0.45)' },
        'Biomass':     { border: '#6ba292', fill: 'rgba(107,162,146,0.45)' },
        'Waste':       { border: '#b56576', fill: 'rgba(181,101,118,0.45)' }
      },

      // Prices (ISO-2 keyed)
      countryPriceByISO2: {},        // { FR: 53.8, BG: 71.15, ... }
      priceByISO2: {},               // cache/meta { FR: { price, currency, ts } }
      pricePollingMs: 5 * 60 * 1000,
      priceTimer: null,

      // Map state
      zoom: 4,
      center: [54, 15],
      showTooltips: true,
      selectedColorScheme: 'viridis',
      tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      mapOptions: {
        zoomSnap: 0.5,
        preferCanvas: true,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: false
      },

      countriesGeoJson: null,
      map: null,

      colorInterpolators: {
        viridis: interpolateViridis,
        plasma: interpolatePlasma,
        inferno: interpolateInferno,
        turbo: interpolateTurbo,
        spectral: interpolateSpectral
      }
    }
  },

  computed: {
    sampleCurrency() {
      const first = Object.values(this.priceByISO2)[0]
      return (first && first.currency) || 'EUR'
    },
    minValue() {
      const values = Object.values(this.countryPriceByISO2)
      return values.length ? Math.min(...values) : 0
    },
    maxValue() {
      const values = Object.values(this.countryPriceByISO2)
      return values.length ? Math.max(...values) : 100
    },
    colorScale() {
      return scaleSequential(this.colorInterpolators[this.selectedColorScheme])
        .domain([this.minValue, this.maxValue])
    },
    scaleBarStyle() {
      const interpolator = this.colorInterpolators[this.selectedColorScheme]
      const steps = 20
      const gradientStops = []
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        gradientStops.push(`${interpolator(t)} ${t * 100}%`)
      }
      return { background: `linear-gradient(to right, ${gradientStops.join(', ')})` }
    },
    sampleCountries() {
      if (!this.countriesGeoJson) return []
      return this.countriesGeoJson.features.slice(0, 8).map(f => {
        const iso2 = this.getCountryISO2(f)
        const name = this.getCountryName(f)
        const value = Number.isFinite(this.countryPriceByISO2[iso2]) ? this.countryPriceByISO2[iso2] : this.minValue
        return { name, value, color: this.colorScale(value) }
      })
    },
    geoJsonOptions() {
      return { onEachFeature: this.onEachFeature }
    },
    optionsStyle() {
      const vm = this
      return function (feature) {
        const iso2 = vm.getCountryISO2(feature)
        const value = iso2 ? vm.countryPriceByISO2?.[iso2] : undefined
        const has = Number.isFinite(value)
        return {
          fillColor: has ? vm.colorScale(value) : '#E6E6E6',
          weight: 1,
          opacity: 1,
          color: has ? '#FFFFFF' : '#CCCCCC',
          dashArray: '',
          fillOpacity: has ? 0.85 : 0.5
        }
      }
    }
  },

  methods: {
    priceSupported(iso2, feature) {
      // if you prefer: return feature?.properties?.CONTINENT === 'Europe'
      return SUPPORTED_PRICE_ISO2.has(iso2)
    },
    openModal(payload) { this.selectedFeature = payload; this.isModalOpen = true },
    closeModal() { this.isModalOpen = false },

    // Panel controls
    openPanel(payload) { this.selectedFeature = payload; this.isModalOpen = true },
    closePanel() {
      this.isModalOpen = false
      this.capacityError = null
      this.capacityYear = null
      this.capacityItems = []
      this.destroyCapacityChart()
      this.generationError = null
      this.generationDateLabel = null
      this.generationItems = []
      this.destroyGenerationChart()
    },

    getCountryISO2(feature) {
      const p = feature?.properties || {}
      const raw = p.ISO_A2_EH || p.ISO_A2 || p.iso_a2 || p.iso2 || p.ISO2
      if (!raw) return null
      const c = String(raw).toUpperCase()
      if (c === '-99') return null
      if (c === 'FX') return 'FR' // Metropolitan France
      if (c === 'UK') return 'GB'
      return c.length === 2 ? c : null
    },

    getCountryName(feature) {
      return feature.properties.name || feature.properties.NAME || feature.properties.ADMIN || 'Unknown'
    },

    async loadCountriesData() {
      try {
        const response = await axios.get(
          'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
        )
        this.countriesGeoJson = response.data
        await this.refreshAllPrices()
        this.priceTimer = setInterval(() => this.refreshAllPrices(), this.pricePollingMs)
      } catch (err) {
        console.error('Error loading countries data:', err)
      }
    },

    pickCurrentPrice(items) {
      if (!Array.isArray(items) || !items.length) return null
      const now = new Date()
      const nowUtcHour = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0
      )
      const withTs = items
        .map(it => ({ ...it, ts: Date.parse(it.datetime_utc) }))
        .sort((a, b) => a.ts - b.ts)

      const exact = withTs.find(it => it.ts === nowUtcHour)
      if (exact) return exact.price

      let latest = null
      for (const it of withTs) {
        if (it.ts <= nowUtcHour) latest = it
        else break
      }
      return latest ? latest.price : withTs[0].price
    },

    async fetchCurrentPriceForCountry(iso2) {
      if (!this.priceSupported(iso2)) return null

      try {
        const url = `http://85.14.6.37:16601/api/prices/range/?country=${encodeURIComponent(iso2)}&contract=A01&period=today`
        const { data } = await axios.get(url)
        const price = this.pickCurrentPrice(data.items)
        const currency = (data.items?.[0]?.currency) || 'EUR'

        this.priceByISO2[iso2] = { price, currency, ts: Date.now() }
        if (Number.isFinite(price)) {
          this.countryPriceByISO2 = { ...this.countryPriceByISO2, [iso2]: price }
        }
        return price
      } catch (e) {
        // 400/404 → mark as unsupported/no data and do not rethrow
        this.priceByISO2[iso2] = { price: null, currency: 'EUR', ts: Date.now(), error: e?.response?.status }
        return null
      }
    },

    async refreshAllPrices() {
      if (!this.countriesGeoJson) return
      const updates = {}
      const tasks = []

      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (!iso2 || !this.priceSupported(iso2, feature)) continue

        tasks.push(
          this.fetchCurrentPriceForCountry(iso2)
            .then(price => { if (Number.isFinite(price)) updates[iso2] = price })
            .catch(() => {/* swallow per-country errors */})
        )
      }

      await Promise.allSettled(tasks)
      this.countryPriceByISO2 = { ...this.countryPriceByISO2, ...updates }
      this.updateColorScheme()
    },

    async fetchCapacity(iso2) {
      this.capacityLoading = true
      this.capacityError = null
      this.capacityYear = null
      this.capacityItems = []
      this.destroyCapacityChart()

      try {
        const url = `http://85.14.6.37:16601/api/capacity/latest/?country=${encodeURIComponent(iso2)}`
        const { data } = await axios.get(url)
        this.capacityYear = data.year
        this.capacityItems = Array.isArray(data.items) ? data.items : []
      } catch (e) {
        this.capacityError = 'Failed to load capacity data'
      } finally {
        this.capacityLoading = false
        await this.$nextTick()
        if (!this.capacityError && this.capacityItems.length) {
          this.renderCapacityChart()
        }
      }
    },

    onEachFeature(feature, layer) {
      const vm = this
      const name = vm.getCountryName(feature)
      const iso2 = vm.getCountryISO2(feature)
      const getVal = () => (iso2 ? vm.countryPriceByISO2?.[iso2] : null)

      layer.on({
        mouseover(e) {
          const lyr = e.target
          lyr.setStyle({ weight: 3, color: '#666', dashArray: '', fillOpacity: 1 })
          if (vm.showTooltips) {
            const v = getVal()
            const currency = (iso2 && vm.priceByISO2?.[iso2]?.currency) || 'EUR'
            const text = Number.isFinite(v) ? `${name}: ${v.toFixed(2)} ${currency}/MWh` : `${name}: no data`
            lyr.bindTooltip(text, { permanent: false, direction: 'center', className: 'custom-tooltip' }).openTooltip()
          }
        },
        mouseout(e) {
          e.target.setStyle(vm.optionsStyle(feature))
          e.target.closeTooltip()
        },
        async click() {
          vm.openModal({ name, value: getVal(), properties: feature.properties })
          await new Promise(r => setTimeout(r, 220)) // wait for panel-slide transition
          if (iso2) {
            await Promise.all([vm.fetchCapacity(iso2), vm.fetchGeneration(iso2)])
            // if chart exists, ensure a final update after layout settles
            await vm.$nextTick()
            vm.generationChartInstance?.resize()
            vm.generationChartInstance?.update()
          } else {
            vm.capacityError = 'Missing ISO-2 code for this feature'
            vm.generationError = 'Missing ISO-2 code for this feature'
          }
        }

      })
    },

    updateColorScheme() {
      if (this.countriesGeoJson) {
        // touch object to trigger LGeoJson reactive re-style
        this.countriesGeoJson = { ...this.countriesGeoJson }
      }
    },

    onMapReady(mapObject) { this.map = mapObject },

    renderCapacityChart() {
      const canvas = this.$refs.capacityChart
      if (!canvas) return
      this.destroyCapacityChart()

      const items = [...this.capacityItems].sort((a, b) => (b.installed_capacity_mw || 0) - (a.installed_capacity_mw || 0))
      const labels = items.map(i => i.psr_name)
      const values = items.map(i => i.installed_capacity_mw)

      const ctx = canvas.getContext('2d')
      this.capacityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Installed capacity (MW)',
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgb(54, 162, 235)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true } },
          plugins: { legend: { display: true } }
        }
      })
    },

    destroyCapacityChart() {
      if (this.capacityChartInstance) {
        this.capacityChartInstance.destroy()
        this.capacityChartInstance = null
      }
    },

    onKeydown(e) {
      if (e.key === 'Escape' && this.isModalOpen) this.closePanel()
    },
  //****************GENERATION*****************//
async fetchGeneration(iso2) {
  this.generationLoading = true
  this.generationError = null
  this.generationItems = []
  this.generationDateLabel = null
  this.destroyGenerationChart()

  try {
    const url = `http://85.14.6.37:16601/api/generation/yesterday/?country=${encodeURIComponent(iso2)}`
    const { data } = await axios.get(url)
    this.generationItems = Array.isArray(data.items) ? data.items : []
    //this.generationDateLabel = data.date_label 
    
  } catch (e) {
    this.generationError = 'Failed to load generation data'
  } finally {
    this.generationLoading = false
    await this.$nextTick()
    // изчакай панела (transition) да се разположи
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (!this.generationError && this.generationItems.length) {
      this.renderGenerationChart()
      this.generationChartInstance?.resize()
      this.generationChartInstance?.update()
    }
  }
},

renderGenerationChart() {
  const canvas = this.$refs.generationChart
  if (!canvas) return
  this.destroyGenerationChart()

  // чисто копие без Proxy
  const items = JSON.parse(JSON.stringify(this.generationItems))

  // уникални timestamp-и (epoch ms)
  const timestamps = Array.from(new Set(items.map(i => Date.parse(i.datetime_utc))))
    .sort((a, b) => a - b)

  // групиране по технология
  const byTech = new Map()
  for (const it of items) {
    const key = it.psr_name || it.psr_type || 'Unknown'
    if (!byTech.has(key)) byTech.set(key, new Map())
    byTech.get(key).set(Date.parse(it.datetime_utc), Number(it.generation_mw) || 0)
  }

  const datasets = []
  for (const [tech, series] of byTech.entries()) {
    const color = this.psrColors[tech] || { border: '#999', fill: 'rgba(153,153,153,0.35)' }
    const data = timestamps.map(ts => ({ x: ts, y: series.get(ts) ?? 0 }))
    datasets.push({
      label: tech,
      data,
      borderColor: color.border,
      backgroundColor: color.fill,
      pointRadius: 0,
      borderWidth: 1,
      tension: 0.25,
      fill: true,
      stack: 'gen' // явна купчина за stacked area
    })
  }

  const cfg = {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      parsing: { xAxisKey: 'x', yAxisKey: 'y' }, // казваме му кои ключове да чете
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'hour', tooltipFormat: 'HH:mm' }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: v => Intl.NumberFormat().format(v) },
          title: { display: true, text: 'MW' }
        }
      }
    }
  }

  const ctx = canvas.getContext('2d')
  this.generationChartInstance = markRaw(new Chart(ctx, cfg))
},

destroyGenerationChart() {
  if (this.generationChartInstance?.destroy) this.generationChartInstance.destroy()
  this.generationChartInstance = null
}

  },

  async mounted() {
    window.addEventListener('keydown', this.onKeydown)
    await this.loadCountriesData()
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
    this.destroyCapacityChart()
    if (this.priceTimer) clearInterval(this.priceTimer)
    this.destroyGenerationChart()
  }
}
</script>


<style scoped>
#app {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #2c3e50;
}

/* Header and controls */
.header {
  text-align: center;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
.header h1 { margin: 0 0 15px 0; font-weight: 300; font-size: 2.2rem; }
.controls { display: flex; justify-content: center; align-items: center; gap: 20px; flex-wrap: wrap; }
.controls label { display: flex; align-items: center; gap: 8px; color: white; }
.controls select { padding: 8px 12px; border: none; border-radius: 4px; background: white; color: #333; cursor: pointer; }
.controls button { padding: 8px 16px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-weight: 500; }
.controls button:hover { background-color: #218838; transform: translateY(-1px); }

/* Two-column row: left panel + map */
.map-row {
  position: relative;           /* enables absolute positioning for panel/scrim */
  display: flex;
  gap: 16px;
  align-items: stretch;
  margin: 20px;
  height: 700px;
}
.left-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  /* Wider: min 560px, prefer 56vw, max 800px */
  width: clamp(560px, 56vw, 800px);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #222;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1100;
}
/* Scrim blocks interaction with the map and closes on click */
.panel-scrim {
  position: absolute;
  inset: 0;                     /* cover the whole map-row */
  background: rgba(0,0,0,0.08); /* subtle scrim */
  z-index: 1000;                /* below the panel, above the map */
}
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 220ms ease, opacity 220ms ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(-14px);
  opacity: 0;
}
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid #eee;
}
.panel-close { border: none; background: transparent; font-size: 18px; cursor: pointer; }
.panel-content { padding: 14px; overflow: auto; }

/* Map column takes remaining width and the same height */
.map-col {
  flex: 1 1 auto;
  min-width: 0; /* allows map to shrink properly */
}
.map {
  height: 100%; /* 100% of .map-col which inherits from .map-row */
  width: 100%;
}

/* Legend */
.legend {
  margin: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
.legend h3 { margin: 0 0 20px 0; color: #343a40; font-weight: 500; }
.color-scale { margin-bottom: 20px; }
.scale-bar { height: 20px; border-radius: 10px; margin-bottom: 5px; border: 1px solid #ddd; }
.scale-labels { display: flex; justify-content: space-between; font-size: 0.9rem; color: #666; }
.legend-items { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.legend-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; background: #f8f9fa; }
.color-box { width: 24px; height: 24px; border-radius: 4px; border: 1px solid #ccc; }

/* Leaflet UI fixes and tooltips */
:global(.custom-tooltip) {
  background: rgba(0,0,0,0.8) !important;
  border: none !important;
  border-radius: 4px !important;
  color: white !important;
}
:global(.leaflet-interactive),
:global(.leaflet-overlay-pane svg),
:global(.leaflet-overlay-pane path),
:global(.leaflet-clickable),
:global(.leaflet-container),
:global(.leaflet-container:focus) {
  outline: none !important;
}
.leaflet-container { outline: none !important; }
.leaflet-container * { outline: none !important; }
.leaflet-container *, .leaflet-container *:before, .leaflet-container *:after {
  -webkit-tap-highlight-color: transparent !important;
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  -khtml-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  user-select: none !important;
}

/* Updated responsive breakpoints */
@media (max-width: 900px) {
  .left-panel { width: min(420px, 50vw); } /* adjusted for wider panel */
  .map-row { height: 640px; } /* proportionally increased */
}
.chart-box--sm {
  height: 360px;
  min-height: 360px;
  width: 100%;
}
@media (max-width: 600px) {
  .map-row { flex-direction: column; height: auto; }
  .left-panel, .map { height: auto; }
  .chart-box { height: 350px; } /* smaller but still bigger than original */
  .chart-box--sm { height: 300px; }
}

.chart-box { 
  height: 520px; /* increased from 320px */
}

</style>
