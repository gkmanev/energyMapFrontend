<template>
  <div id="app">
    <!-- Loading overlay for initial load -->
    <div v-if="initialLoading" class="initial-loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading energy data...</p>
      </div>
    </div>
    <div class="header">
      <h1>Energy App by Entra Energy</h1>
      <div class="controls">
        <!-- Add toggle for heatmap type -->
        <label>
          <input type="radio" v-model="heatmapType" value="prices"> Price Heatmap
        </label>
        <label>
          <input type="radio" v-model="heatmapType" value="capacity"> Capacity Heatmap
        </label>
        <label>
          <input type="radio" v-model="heatmapType" value="generation"> Generation Heatmap
        </label>
        <button @click="refreshHeatmapData" :disabled="isRefreshing">
          {{ isRefreshing ? 'Refreshing...' : 'Refresh Data' }}
        </button>
      </div>
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
            </template>
            <div style="margin-top: 40px;"><span><h3>Generation by technology</h3></span></div>
            <!-- Generation -->
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
          ref="leafletMap"
        >
          <LTileLayer
            :url="tileUrl"
            :attribution="attribution"
            :options="{ noWrap: true, bounds: [[-90, -180], [90, 180]] }"
          />
          <!-- Use v-if instead of :key to prevent unnecessary remounting -->
          <LGeoJson
            v-if="countriesGeoJson && !isMapUpdating"
            :geojson="countriesGeoJson"
            :options="geoJsonOptions"
            :options-style="optionsStyle"
            ref="geoJsonLayer"
          />
        </LMap>
      </div>
    </div>
    
    <!-- Price Slider -->
    <div v-if="heatmapType === 'prices'" class="time-slider-overlay">
      <h3>Historical Prices - Last 48 Hours</h3>
      <div class="slider-info">
        <span class="time-display">{{ currentTimeDisplay }}</span>
        <span class="price-display">{{ averagePriceDisplay }}</span>
      </div>
       <!-- Play button before the slider -->
      <div class="play-controls">
        <button 
          @click="togglePlay" 
          :disabled="!hasTimeData || isRefreshing"
          class="play-button"
        >
          {{ isPlaying ? '⏸ Pause' : '▶ Play' }}
        </button>
      </div>
      
      <!-- Enhanced smooth draggable slider -->
      <div class="slider-wrapper">
        <div class="custom-slider">
          <!-- Native range input for smooth dragging -->
          <input 
            v-model="currentTimeIndex"
            type="range" 
            :min="0" 
            :max="maxTimeIndex"
            :disabled="!hasTimeData || isRefreshing"
            class="smooth-range-slider"
            @input="onSliderChange"
            @change="onSliderChange"
          />
          
          <!-- Custom visual track and progress -->
          <div class="slider-track"></div>
          <div class="slider-progress" :style="progressStyle"></div>
        </div>
        
        <!-- Time tick marks BELOW the slider -->
        <div v-if="hasTimeData" class="time-ticks-below">
          <div 
            v-for="(tick, index) in timeTicks" 
            :key="index"
            class="time-tick-below"
            :style="{ left: tick.position }"
            @click="jumpToTick(tick.index)"
          >
            <div class="tick-mark-below"></div>
            <div class="tick-label-below">{{ tick.label }}</div>
          </div>
        </div>
      </div>
      
      <div v-if="!hasTimeData && heatmapType === 'prices'" class="no-data-message">
        Click "Refresh Data" to load historical price data
      </div>
    </div>

    <!-- Generation Slider -->
    <div v-if="heatmapType === 'generation'" class="time-slider-overlay">
      <h3>Generation Data - Last 48 Hours</h3>
      <div class="slider-info">
        <span class="time-display">{{ currentTimeDisplay }}</span>
        <span class="generation-display">{{ totalGenerationDisplay }}</span>
      </div>
      
      <!-- Enhanced smooth draggable slider -->
      <div class="slider-wrapper">
        <div class="custom-slider">
          <!-- Native range input for smooth dragging -->
          <input 
            v-model="currentTimeIndex"
            type="range" 
            :min="0" 
            :max="maxTimeIndex"
            :disabled="!hasTimeData || isRefreshing"
            class="smooth-range-slider"
            @input="onSliderChange"
            @change="onSliderChange"
          />
          
          <!-- Custom visual track and progress -->
          <div class="slider-track"></div>
          <div class="slider-progress" :style="progressStyle"></div>
        </div>
        
        <!-- Time tick marks BELOW the slider -->
        <div v-if="hasTimeData" class="time-ticks-below">
          <div 
            v-for="(tick, index) in generationTimeTicks" 
            :key="index"
            class="time-tick-below"
            :style="{ left: tick.position }"
            @click="jumpToTick(tick.index)"
          >
            <div class="tick-mark-below"></div>
            <div class="tick-label-below">{{ tick.label }}</div>
          </div>
        </div>
      </div>
      
      <div v-if="!hasTimeData && heatmapType === 'generation'" class="no-data-message">
        Click "Refresh Data" to load generation data
      </div>
    </div>

    <!-- NEW: Actual footer positioned below the slider -->
    <footer class="app-footer">
      <div class="footer-content">
        <!-- <span>© 2025 Entra Energy | Energy Data Visualization</span> -->
      </div>
    </footer>

    <!-- Capacity Legend - only show for capacity heatmap -->
    <!-- <div v-if="heatmapType === 'capacity'" class="legend">
      <h3>{{ legendTitle }}</h3>
      <div class="color-scale">
        <div class="scale-bar" :style="scaleBarStyle"></div>
        <div class="scale-labels">
          <span>{{ minValue.toFixed(2) }}</span>
          <span>{{ maxValue.toFixed(2) }} {{ legendUnit }}</span>
        </div>
      </div> -->
      <!-- <div class="legend-items">
        <div 
          v-for="country in sampleCountries" 
          :key="country.name"
          class="legend-item"
        >
          <span 
            class="color-box" 
            :style="{ backgroundColor: country.color }"
          ></span>
          {{ country.name }}: {{ country.value.toFixed(0) }} {{ legendUnit }}
        </div>
      </div>
    </div> -->
  </div>
</template>

<script>
const SUPPORTED_PRICE_ISO2 = new Set([
  'AL','AT','BA','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB',
  'GR','HR','HU','IE','IS','IT','LT','LU','LV','ME','MK','MT','NL','NO','PL',
  'PT','RO','RS','SE','SI','SK','TR','UA'
])

const SUPPORTED_CAPACITY_ISO2 = new Set([
  'AL','AT','BA','BE','BG','CH','CZ','DE','DK','EE','ES','FI','FR','GB',
  'GR','HR','HU','IE','IT','LT','LU','LV','NL','NO','PL','PT','RO','SE','SI','SK'
])

// Generation uses same countries as capacity for now
const SUPPORTED_GENERATION_ISO2 = SUPPORTED_CAPACITY_ISO2

const BULK_REQUEST_CONFIG = {
  timeout: 30000,
  retry: 2,
  retryDelay: 1000
}

import { markRaw, toRaw, nextTick } from 'vue'
import { LMap, LTileLayer, LGeoJson } from '@vue-leaflet/vue-leaflet'
import Chart from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import axios from 'axios'
import { scaleSequential } from 'd3-scale'
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateInferno,
  interpolateTurbo,
  interpolateSpectral,
  interpolateYlOrRd
} from 'd3-scale-chromatic'

export default {
  name: 'EnergyMap',
  components: { LMap, LTileLayer, LGeoJson },

  data() {
    return {
      // Heatmap type controls - Price is default
      heatmapType: 'prices',
      isRefreshing: false,
      initialLoading: true,
      isMapUpdating: false, // Add this to prevent layer conflicts\
      isPlaying: false,
      playInterval: null,
      playSpeed: 500, // milliseconds between steps
      
      // Time slider data for prices
      currentTimeIndex: 0,
      availableTimestamps: [], // Array of timestamps for the last 48 hours
      historicalPriceData: {},  // { iso2: { timestamp: price, ... }, ... }
      
      // Generation time-series data for heatmap (48 hours)
      availableGenerationTimestamps: [], // Array of timestamps for generation data
      historicalGenerationData: {},  // { iso2: { timestamp: generation_mw, ... }, ... }
      
      // Capacity data (ISO-2 keyed)
      countryCapacityByISO2: {},
      capacityByISO2: {},
      
      // Existing data properties
      europeBounds: [[34, -25], [72, 45]],
      isModalOpen: false,
      selectedFeature: null,
      currentAbortController: null,
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
      priceCache: new Map(),
      capacityCache: new Map(),
      cacheTimestamp: null,
      cacheValidityMs: 5 * 60 * 1000, // 5 minutes
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

      // Legacy price data (for backward compatibility)
      countryPriceByISO2: {},
      priceByISO2: {},
      pricePollingMs: 5 * 60 * 1000,
      priceTimer: null,

      // Map state
      zoom: 4,
      center: [54, 20],
      showTooltips: true,
      selectedColorScheme: 'ylOrRd',
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
        spectral: interpolateSpectral,
        ylOrRd: interpolateYlOrRd
      }
    }
  },

  computed: {
    progressStyle() {
      const percentage = this.maxTimeIndex > 0 ? (this.currentTimeIndex / this.maxTimeIndex) * 100 : 0
      return {
        width: `${percentage}%`
      }
    },
    
    // Time slider computed properties
    hasTimeData() {
      if (this.heatmapType === 'generation') {
        return this.availableGenerationTimestamps.length > 0
      }
      return this.availableTimestamps.length > 0
    },
    
    maxTimeIndex() {
      if (this.heatmapType === 'generation') {
        return Math.max(0, this.availableGenerationTimestamps.length - 1)
      }
      return Math.max(0, this.availableTimestamps.length - 1)
    },
    
    currentTimestamp() {
      if (this.heatmapType === 'generation') {
        return this.availableGenerationTimestamps[this.currentTimeIndex] || Date.now()
      }
      return this.availableTimestamps[this.currentTimeIndex] || Date.now()
    },
    
    currentTimeDisplay() {
      if (!this.hasTimeData) return 'No data'
      const date = new Date(this.currentTimestamp)
      
      // Both price and generation use hourly display for 48 hours
      return date.toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    
    // Time ticks for price slider labels
    timeTicks() {
      if (!this.hasTimeData || this.heatmapType !== 'prices') return []
      
      const ticks = []
      const totalTicks = 8 // Show 8 tick marks across the slider
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableTimestamps[tickIndex]
        const date = new Date(timestamp)
        
        // Position as percentage from left
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        // Format label based on time
        let label
        if (i === 0) {
          label = '48h ago' // Leftmost (oldest)
        } else if (i === totalTicks) {
          label = 'Now' // Rightmost (newest)
        } else {
          // Show hours ago
          const hoursAgo = Math.round((this.availableTimestamps[this.maxTimeIndex] - timestamp) / (60 * 60 * 1000))
          label = `${hoursAgo}h`
        }
        
        ticks.push({
          position,
          label,
          timestamp,
          index: tickIndex
        })
      }
      
      return ticks
    },
    
    // Generation time ticks for slider (48 hours like prices)
    generationTimeTicks() {
      if (!this.hasTimeData || this.heatmapType !== 'generation') return []
      
      const ticks = []
      const totalTicks = 8 // Show 8 tick marks across the slider (same as prices)
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableGenerationTimestamps[tickIndex]
        const date = new Date(timestamp)
        
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        let label
        if (i === 0) {
          label = '48h ago' // Leftmost (oldest)
        } else if (i === totalTicks) {
          label = 'Now' // Rightmost (newest)
        } else {
          // Show hours ago
          const hoursAgo = Math.round((this.availableGenerationTimestamps[this.maxTimeIndex] - timestamp) / (60 * 60 * 1000))
          label = `${hoursAgo}h`
        }
        
        ticks.push({
          position,
          label,
          timestamp,
          index: tickIndex
        })
      }
      
      return ticks
    },
    
    averagePriceDisplay() {
      if (this.heatmapType !== 'prices' || !this.hasTimeData) return ''
      const prices = Object.values(this.currentDataByISO2).filter(p => Number.isFinite(p))
      if (prices.length === 0) return 'No price data'
      const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length
      return `Avg: ${avg.toFixed(2)} EUR/MWh`
    },
    
    totalGenerationDisplay() {
      if (this.heatmapType !== 'generation' || !this.hasTimeData) return ''
      const generations = Object.values(this.currentDataByISO2).filter(g => Number.isFinite(g))
      if (generations.length === 0) return 'No generation data'
      const total = generations.reduce((sum, gen) => sum + gen, 0)
      return `Total: ${(total/1000).toFixed(1)} GW`
    },

    // Updated computed properties for multi heatmap functionality
currentDataByISO2() {
  if (this.heatmapType === 'capacity') {
    return this.countryCapacityByISO2;
  }
  
  if (this.heatmapType === 'generation') {
    const result = {};
    const timestamp = Number(this.currentTimestamp); // ENSURE it's a number
    
    console.log('Looking for timestamp:', timestamp);
    console.log("DATA", this.historicalGenerationData)
    for (const [iso2, timeData] of Object.entries(this.historicalGenerationData)) {
      if (timeData && timeData[timestamp] !== undefined) {
        result[iso2] = timeData[timestamp];
      }
    }
    
    console.log(`Generation data at timestamp ${timestamp}: ${Object.keys(result).length} countries`);
    return result;
  }
  
  // For prices
  const result = {};
  const timestamp = Number(this.currentTimestamp); // ENSURE it's a number
  
  for (const [iso2, timeData] of Object.entries(this.historicalPriceData)) {
    if (timeData && timeData[timestamp] !== undefined) {
      result[iso2] = timeData[timestamp];
    }
  }
  
  return result;
},

    
    legendTitle() {
      if (this.heatmapType === 'prices') return 'Energy Price Legend'
      if (this.heatmapType === 'capacity') return 'Installed Capacity Legend'
      if (this.heatmapType === 'generation') return 'Generation Legend'
      return 'Heatmap Legend'
    },
    
    legendUnit() {
      if (this.heatmapType === 'prices') return 'EUR/MWh'
      if (this.heatmapType === 'capacity') return 'MW'
      if (this.heatmapType === 'generation') return 'MW'
      return 'MW'
    },
    
    minValue() {
      const values = Object.values(this.currentDataByISO2)
      return values.length ? Math.min(...values) : 0
    },
    
    maxValue() {
      const values = Object.values(this.currentDataByISO2)
      return values.length ? Math.max(...values) : (this.heatmapType === 'prices' ? 100 : 10000)
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
        const value = Number.isFinite(this.currentDataByISO2[iso2]) ? this.currentDataByISO2[iso2] : this.minValue
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
        const value = iso2 ? vm.currentDataByISO2?.[iso2] : undefined
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

  watch: {
    heatmapType: {
      handler(newType) {
        // Only refresh if switching to a type without data
        if (newType === 'prices' && !this.hasTimeData) {
          this.refreshAllHistoricalPrices()
        } else if (newType === 'capacity' && Object.keys(this.countryCapacityByISO2).length === 0) {
          this.currentTimeIndex = this.maxTimeIndex; // Jump to current time
          this.refreshAllCapacities()  
        } else if (newType === 'generation' && this.availableGenerationTimestamps.length === 0) {
          this.refreshAllHistoricalGeneration()
        }
        // Always update the color scheme when switching types
        this.updateColorScheme()
      },
      immediate: false
    },

    currentTimeIndex: {
      handler() {
        // Update map when time index changes
        this.updateColorScheme()
      }
    }
  },

  methods: {
      togglePlay() {
        if (this.isPlaying) {
          this.pauseAnimation()
        } else {
          this.startAnimation()
        }
      },
      startAnimation() {
        // Reset to start
        this.currentTimeIndex = 0
        this.isPlaying = true
        
        this.playInterval = setInterval(() => {
          if (this.currentTimeIndex >= this.maxTimeIndex) {
            // Reached the end, stop
            this.pauseAnimation()
          } else {
            this.currentTimeIndex++
            this.onSliderChange()
          }
        }, this.playSpeed)
      },
        pauseAnimation() {
        this.isPlaying = false
        if (this.playInterval) {
          clearInterval(this.playInterval)
          this.playInterval = null
        }
      },

    jumpToTick(tickIndex) {
      this.currentTimeIndex = tickIndex
      this.onSliderChange()
    },
    
    // Time slider methods
    generateLast48HoursTimestamps() {
      const timestamps = []
      const now = new Date()
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0)
      
      for (let i = 47; i >= 0; i--) {
        const timestamp = new Date(currentHour.getTime() - (i * 60 * 60 * 1000))
        timestamps.push(timestamp.getTime())
      }
      
      return timestamps
    },
    
    // Generate timestamps for last 48 hours for generation heatmap (same as prices)
    generateLast48HoursGenerationTimestamps() {
      const timestamps = []
      const now = new Date()
      const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0)
      
      for (let i = 47; i >= 0; i--) {
        const timestamp = new Date(currentHour.getTime() - (i * 60 * 60 * 1000))
        timestamps.push(timestamp.getTime())
      }
      
      return timestamps
    },
    
    onSliderChange() {
      // Add smooth transition class temporarily
      const slider = this.$el.querySelector('.enhanced-time-slider')
      if (slider) {
        slider.classList.add('transitioning')
        setTimeout(() => {
          slider.classList.remove('transitioning')
        }, 200)
      }
    },

    // Historical price data loading
    async fetchHistoricalPricesForCountry(iso2) {
      if (!this.priceSupported(iso2)) return null

      // Check cache first
      const cacheKey = `${iso2}_${this.getCurrentDateKey()}`
      const now = Date.now()
      
      if (this.priceCache.has(cacheKey) && 
          this.cacheTimestamp && 
          (now - this.cacheTimestamp) < this.cacheValidityMs) {
        console.log(`Using cached data for ${iso2}`)
        return this.priceCache.get(cacheKey)
      }

      try {
        const now = new Date()
        const start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        
        const url = `http://85.14.6.37:16601/api/prices/range/?country=${encodeURIComponent(iso2)}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}`
        
        const { data } = await axios.get(url, {
          timeout: 10000, // 10 second timeout
          signal: this.currentAbortController?.signal
        })
        
        const timeData = {}
        
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const timestamp = new Date(item.datetime_utc).getTime()
            if (Number.isFinite(item.price)) {
              const hourTimestamp = Math.floor(timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000)
              timeData[hourTimestamp] = item.price
            }
          }
        }
        
        // Cache the result
        this.priceCache.set(cacheKey, timeData)
        this.cacheTimestamp = now
        
        return timeData
      } catch (e) {
        console.error(`Failed to fetch historical prices for ${iso2}:`, e)
        return null
      }
    },
    
    getCurrentDateKey() {
      return new Date().toISOString().split('T')[0]
    },

    async refreshAllHistoricalPrices() {
      if (!this.countriesGeoJson) return
      
      // Generate timestamps
      this.availableTimestamps = this.generateLast48HoursTimestamps()
      this.currentTimeIndex = this.maxTimeIndex
      
      // Get all supported countries
      const supportedCountries = []
      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (iso2 && this.priceSupported(iso2, feature)) {
          supportedCountries.push(iso2)
        }
      }
      
      console.log(`Loading price data for ${supportedCountries.length} countries using bulk API`)
      
      // Process ALL countries in chunks of 20 (your API limit)
      const chunkSize = 20
      const newHistoricalData = {}
      
      const chunks = []
      for (let i = 0; i < supportedCountries.length; i += chunkSize) {
        chunks.push(supportedCountries.slice(i, i + chunkSize))
      }
      
      console.log(`Making ${chunks.length} bulk API calls instead of ${supportedCountries.length} individual calls`)
      
      // Process all chunks concurrently (this is the key optimization!)
      const chunkPromises = chunks.map(async (chunk, index) => {
        try {
          console.log(`Starting bulk call ${index + 1}/${chunks.length} for ${chunk.length} countries`)
          const chunkData = await this.fetchBulkHistoricalPrices(chunk)
          return { success: true, data: chunkData, chunkIndex: index }
        } catch (error) {
          console.error(`Bulk call ${index + 1} failed:`, error)
          return { success: false, error, chunkIndex: index }
        }
      })
      
      // Wait for all chunks to complete
      const results = await Promise.allSettled(chunkPromises)
      
      // Process results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          Object.assign(newHistoricalData, result.value.data)
          console.log(`Chunk ${index + 1} completed: ${Object.keys(result.value.data).length} countries`)
        }
      })
      
      this.historicalPriceData = newHistoricalData
      this.updateColorScheme()
      
      console.log(`Bulk loading completed: ${Object.keys(newHistoricalData).length} countries loaded`)
    },

    async fetchBulkHistoricalPrices(countries) {
      if (countries.length === 0) return {}
      
      try {
        const now = new Date()
        const start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        
        const url = `http://85.14.6.37:16601/api/prices/bulk-range/?countries=${countries.join(',')}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}`
        
        console.log(`Bulk API call: ${url}`)
        
        const { data } = await axios.get(url, {
          timeout: 15000,
          signal: this.currentAbortController?.signal
        })
        
        const historicalData = {}
        
        // Process the bulk response
        if (data.data) {
          for (const [iso2, countryData] of Object.entries(data.data)) {
            if (countryData.items && Array.isArray(countryData.items)) {
              const timeData = {}
              
              for (const item of countryData.items) {
                const timestamp = new Date(item.datetime_utc).getTime()
                if (Number.isFinite(item.price)) {
                  // Round to nearest hour
                  const hourTimestamp = Math.floor(timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000)
                  timeData[hourTimestamp] = item.price
                }
              }
              
              if (Object.keys(timeData).length > 0) {
                historicalData[iso2] = timeData
              }
            }
          }
        }
        
        return historicalData
        
      } catch (error) {
        console.error(`Bulk API request failed for ${countries.length} countries:`, error)
        throw error
      }
    },

    // Fetch historical generation data for heatmap (48 hours)
    async refreshAllHistoricalGeneration() {
      if (!this.countriesGeoJson) return;
      
      this.availableGenerationTimestamps = this.generateLast48HoursGenerationTimestamps();
      this.currentTimeIndex = this.availableGenerationTimestamps.length - 1;
      
      const generationUpdates = {};
      const tasks = [];
      
      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature);
        
        if (!iso2 || !this.generationSupported(iso2)) continue;
        
        tasks.push(
          this.fetchHistoricalGenerationForCountry(iso2)
            .then(timeData => {
              if (timeData && Object.keys(timeData).length > 0) {
                generationUpdates[iso2] = timeData;
              }
            })
            .catch(error => {
              console.error(`Failed to fetch generation for ${iso2}`, error);
            })
        );
      }
      
      await Promise.allSettled(tasks);      
      this.historicalGenerationData = { ...this.historicalGenerationData, ...generationUpdates };

    
      
      this.updateColorScheme();
    },
    
    // Fetch historical generation data for a single country (48 hours for heatmap)

// Fetch historical generation data for a single country (48 hours for heatmap)
async fetchHistoricalGenerationForCountry(iso2) {
  if (!this.generationSupported(iso2)) return null;
  
  try {
    const timeData = {};
    
    const now = new Date();
    const start = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const end = new Date();
    
    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];
    
    const url = `http://85.14.6.37:16601/api/generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`;
   
    const { data } = await axios.get(url, { 
      timeout: 10000,
      signal: this.currentAbortController?.signal 
    });   

      if (Array.isArray(data.items)) {        
      
        for (const item of data.items) {
          console.log("ITEM", item)
          // Use datetime_utc (with underscore) - confirmed from API response
          const dt = new Date(item.datetime_utc);
          const timestamp = dt.getTime();
          
          if (Number.isFinite(timestamp) && !isNaN(timestamp) && Number.isFinite(item.generation_mw)) {
            // Round to nearest hour - SAME logic as price data
            //const hourTimestamp = Math.floor(timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
            console.log("Time",timestamp)
            // Initialize if needed
            if (!timeData[timestamp]) {
              timeData[timestamp] = 0;
            }
            
            // Sum generation values for this specific hour
            timeData[timestamp] += item.generation_mw;
          }
        }
    }
    console.log(timeData)
    
    return Object.keys(timeData).length > 0 ? timeData : null;
    

  } catch (error) {
    if (error.response?.status === 400) {
      console.warn(`400 Bad Request for generation data ${iso2}`);
    } else {
      console.error(`Failed to fetch historical generation for ${iso2}:`, error);
    }
    return null;
  }
},




    // Support check methods
    capacitySupported(iso2) {
      return SUPPORTED_CAPACITY_ISO2.has(iso2)
    },
    
    generationSupported(iso2) {
      return SUPPORTED_GENERATION_ISO2.has(iso2)
    },
    
    priceSupported(iso2, feature) {
      return SUPPORTED_PRICE_ISO2.has(iso2)
    },

    // Panel controls
    openModal(payload) { this.selectedFeature = payload; this.isModalOpen = true },
    closeModal() { this.isModalOpen = false },
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

    // Utility methods
    getCountryISO2(feature) {
      const p = feature?.properties || {}
      const raw = p.ISO_A2_EH || p.ISO_A2 || p.iso_a2 || p.iso2 || p.ISO2
      if (!raw) return null
      const c = String(raw).toUpperCase()
      if (c === '-99') return null
      if (c === 'FX') return 'FR'
      if (c === 'UK') return 'GB'
      return c.length === 2 ? c : null
    },

    getCountryName(feature) {
      return feature.properties.name || feature.properties.NAME || feature.properties.ADMIN || 'Unknown'
    },

    // Capacity methods (unchanged)
    async fetchCapacityForHeatmap(iso2) {
      if (!this.capacitySupported(iso2)) return null

      try {
        const url = `http://85.14.6.37:16601/api/capacity/latest/?country=${encodeURIComponent(iso2)}`
        const { data } = await axios.get(url)
        
        const totalMW = Array.isArray(data.items) 
          ? data.items.reduce((sum, item) => sum + (item.installed_capacity_mw || 0), 0)
          : 0

        if (Number.isFinite(totalMW) && totalMW > 0) {
          this.countryCapacityByISO2 = { ...this.countryCapacityByISO2, [iso2]: totalMW }
        }
        
        return totalMW
      } catch (e) {
        console.error(`Failed to fetch capacity for ${iso2}:`, e)
        return null
      }
    },

    async refreshAllCapacities() {
      if (!this.countriesGeoJson) return
      const updates = {}
      const tasks = []

      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (!iso2 || !this.capacitySupported(iso2)) continue

        tasks.push(
          this.fetchCapacityForHeatmap(iso2)
            .then(totalMW => { 
              if (Number.isFinite(totalMW) && totalMW > 0) {
                updates[iso2] = totalMW
              }
            })
            .catch(() => {/* swallow per-country errors */})
        )
      }

      await Promise.allSettled(tasks)
      this.countryCapacityByISO2 = { ...this.countryCapacityByISO2, ...updates }
      this.updateColorScheme()
    },

    // Generic refresh method
    async refreshHeatmapData() {
      // Cancel any existing requests
      if (this.currentAbortController) {
        this.currentAbortController.abort()
      }
      
      this.currentAbortController = new AbortController()
      this.isRefreshing = true
      
      try {
        if (this.heatmapType === 'prices') {
          await this.refreshAllHistoricalPrices()
        } else if (this.heatmapType === 'capacity') {
          await this.refreshAllCapacities()
        } else if (this.heatmapType === 'generation') {
          await this.refreshAllHistoricalGeneration()
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error refreshing heatmap data:', error)
        }
      } finally {
        this.isRefreshing = false
        this.currentAbortController = null
      }
    },

    // Data loading with markRaw fix
    async loadCountriesData() {
      try {
        const response = await axios.get(
          'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
        )
        // Use markRaw to prevent Vue reactivity on GeoJSON data
        this.countriesGeoJson = markRaw(response.data)
        
      } catch (err) {
        console.error('Error loading countries data:', err)
      }
    },

    // Capacity method for modal (unchanged)
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
        
        // Also update heatmap data when fetching detailed data
        const totalMW = this.capacityItems.reduce((sum, item) => sum + (item.installed_capacity_mw || 0), 0)
        if (Number.isFinite(totalMW) && totalMW > 0) {
          this.countryCapacityByISO2 = { ...this.countryCapacityByISO2, [iso2]: totalMW }
        }
        
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

    // Map interaction with better error handling
    onEachFeature(feature, layer) {
      const vm = this
      const name = vm.getCountryName(feature)
      const iso2 = vm.getCountryISO2(feature)
      const getVal = () => (iso2 ? vm.currentDataByISO2?.[iso2] : null)

      // Add error handling
      try {
        layer.on({
          mouseover(e) {
            try {
              const lyr = e.target
              if (lyr && lyr.setStyle) {
                lyr.setStyle({ weight: 3, color: '#666', dashArray: '', fillOpacity: 1 })
              }
              if (vm.showTooltips) {
                const v = getVal()
                const unit = vm.legendUnit
                const decimals = vm.heatmapType === 'prices' ? 2 : 0
                let text = Number.isFinite(v) 
                  ? `${name}: ${v.toFixed(decimals)} ${unit}` 
                  : `${name}: no data`
                
                // Add time info for tooltips
                if (vm.hasTimeData) {
                  text += `\n${vm.currentTimeDisplay}`
                }
                
                if (lyr && lyr.bindTooltip) {
                  lyr.bindTooltip(text, { permanent: false, direction: 'center', className: 'custom-tooltip' }).openTooltip()
                }
              }
            } catch (error) {
              console.warn('Error in mouseover handler:', error)
            }
          },
          mouseout(e) {
            try {
              if (e.target && e.target.setStyle) {
                e.target.setStyle(vm.optionsStyle(feature))
              }
              if (e.target && e.target.closeTooltip) {
                e.target.closeTooltip()
              }
            } catch (error) {
              console.warn('Error in mouseout handler:', error)
            }
          },
          async click() {
            try {
              vm.openModal({ name, value: getVal(), properties: feature.properties })
              await new Promise(r => setTimeout(r, 220))
              if (iso2) {
                await Promise.all([vm.fetchCapacity(iso2), vm.fetchGeneration(iso2)])
                await vm.$nextTick()
                if (vm.generationChartInstance?.resize) vm.generationChartInstance.resize()
                if (vm.generationChartInstance?.update) vm.generationChartInstance.update()
              } else {
                vm.capacityError = 'Missing ISO-2 code for this feature'
                vm.generationError = 'Missing ISO-2 code for this feature'
              }
            } catch (error) {
              console.warn('Error in click handler:', error)
            }
          }
        })
      } catch (error) {
        console.error('Error setting up layer events:', error)
      }
    },

// Fixed updateColorScheme method - uses safe layer updating
    async updateColorScheme() {
      if (!this.countriesGeoJson) return
      
      // Instead of removing/recreating the layer, update styles directly
      const geoJsonRef = this.$refs.geoJsonLayer
      if (geoJsonRef && geoJsonRef.leafletObject) {
        try {
          geoJsonRef.leafletObject.eachLayer((layer) => {
            if (layer.feature && layer.setStyle) {
              layer.setStyle(this.optionsStyle(layer.feature))
            }
          })
        } catch (error) {
          console.warn('Error updating layer styles:', error)
        }
      }
    },

    onMapReady(mapObject) { this.map = mapObject },

    // Chart methods with markRaw fixes
async renderCapacityChart() {
  const canvas = this.$refs.capacityChart;
  if (!canvas) return;
  
  this.destroyCapacityChart();

  // Sort items by capacity
  const items = [...this.capacityItems].sort((a, b) => 
    (b.installed_capacity_mw || 0) - (a.installed_capacity_mw || 0)
  );
  
  const labels = items.map(i => i.psr_name);
  const capacityValues = items.map(i => i.installed_capacity_mw);

  // Get current generation data for the selected country
  const iso2 = this.getCountryISO2(this.selectedFeature);
  
  // AWAIT the generation data before creating the chart
  const generationByTech = await this.getGenerationByTechnology(iso2);
  
  console.log('generationByTech', generationByTech);

  // Map generation to capacity items
  const generationMapped = items.map(item => {
    const genValue = generationByTech[item.psr_name] || 0;
    return genValue;
  });

  // Calculate remaining capacity
  const remainingCapacity = capacityValues.map((cap, i) => {
    const gen = generationMapped[i] || 0;
    return Math.max(0, cap - gen);
  });

  const ctx = canvas.getContext('2d');
  
  // Use markRaw to prevent Vue reactivity
  this.capacityChartInstance = markRaw(new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Generation (MW)',
          data: generationMapped,
          backgroundColor: 'rgba(54, 162, 235, 0.85)',
          borderColor: 'rgb(54, 162, 235)',
          borderWidth: 2,
          stack: 'capacity'
        },
        {
          label: 'Available Capacity (MW)',
          data: remainingCapacity,
          backgroundColor: 'rgba(200, 200, 200, 0.4)',
          borderColor: 'rgb(150, 150, 150)',
          borderWidth: 1,
          stack: 'capacity'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true
        },
        y: {
          beginAtZero: true,
          stacked: true
        }
      },
      plugins: {
        legend: {
          display: true
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const datasetIndex = context.datasetIndex;
              if (datasetIndex === 0) {
                const value = context.parsed.y;
                const capacity = capacityValues[context.dataIndex];
                const percentage = capacity > 0 ? ((value / capacity) * 100).toFixed(1) : 0;
                return `Current Generation: ${value.toFixed(0)} MW (${percentage}%)`;
              } else {
                return `Available Capacity: ${context.parsed.y.toFixed(0)} MW`;
              }
            },
            footer: function(tooltipItems) {
              if (tooltipItems.length > 0) {
                const index = tooltipItems[0].dataIndex;
                const total = capacityValues[index];
                return `Total Installed: ${total.toFixed(0)} MW`;
              }
            }
          }
        }
      }
    }
  }));
},



async getGenerationByTechnology(iso2) {
  if (!iso2) return {};
  
  try {
    const url = `http://85.14.6.37:16601/api/generation/yesterday?country=${encodeURIComponent(iso2)}`;
    const { data } = await axios.get(url);    
    const byTech = {};    
    if (Array.isArray(data.items)) {
      const now = new Date();
      // -24h offset
      now.setTime(now.getTime() - (24 * 60 * 60 * 1000));
      now.setMinutes(0, 0, 0);
      const currentTimeISO = now.toISOString().split('.')[0] + 'Z';
      for (const item of data.items) {        
        const tech = item.psr_name || item.psr_type || 'Unknown';        
        const gen = Number(item.generation_mw) || 0;        
        const itemDate = item.datetime_utc       
        if (currentTimeISO === itemDate){
          byTech[tech] = gen
        }

      }      
    }       
    return byTech;
  } catch (e) {
    console.error(`Failed to get generation for ${iso2}`, e);
    return {};
  }
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

    // Generation method for modal (unchanged - uses yesterday API)
    async fetchGeneration(iso2) {
      this.generationLoading = true
      this.generationError = null
      this.generationItems = []
      this.generationDateLabel = null
      this.destroyGenerationChart()

      try {
        const url = `http://85.14.6.37:16601/api/generation/yesterday/?country=${encodeURIComponent(iso2)}`
        console.log(url)
        const { data } = await axios.get(url)
        this.generationItems = Array.isArray(data.items) ? data.items : []
      } catch (e) {
        this.generationError = 'Failed to load generation data'
      } finally {
        this.generationLoading = false
        await this.$nextTick()
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

      const items = JSON.parse(JSON.stringify(this.generationItems))
      const timestamps = Array.from(new Set(items.map(i => Date.parse(i.datetime_utc))))
        .sort((a, b) => a - b)

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
          stack: 'gen'
        })
      }

      const cfg = {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          normalized: true,
          parsing: { xAxisKey: 'x', yAxisKey: 'y' },
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
      // Use markRaw to prevent Vue reactivity
      this.generationChartInstance = markRaw(new Chart(ctx, cfg))
    },

    destroyGenerationChart() {
      if (this.generationChartInstance?.destroy) this.generationChartInstance.destroy()
      this.generationChartInstance = null
    }
  },

  async mounted() {
    
    window.addEventListener('keydown', this.onKeydown)
    this.initialLoading = true
    try {
        // First load the GeoJSON data
          await this.loadCountriesData()
          
          if (this.countriesGeoJson) {
          if (this.heatmapType === 'prices') {
            await this.refreshAllHistoricalPrices()
          } else {
            await this.refreshAllCapacities()
          }
        }
    } catch (error) {
        console.error('Error during initial data loading:', error)
    } finally {
      this.initialLoading = false
    }
  },

  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
    this.destroyCapacityChart()
    this.destroyGenerationChart()
    if (this.priceTimer) clearInterval(this.priceTimer)
    if (this.playInterval) clearInterval(this.playInterval)
  }
}
</script>

<style scoped>
/* App container */
#app {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #2c3e50;
  margin: 0;
  padding: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Compact header */
.header {
  text-align: center;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  flex-shrink: 0;
}

.header h1 {
  margin: 0 0 8px 0;
  font-weight: 300;
  font-size: 1.8rem;
  line-height: 1.2;
}

.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.controls input[type="radio"] {
  margin: 0;
}

.controls button {
  padding: 6px 12px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  font-size: 14px;
}

.controls button:hover:not(:disabled) {
  background-color: #218838;
  transform: translateY(-1px);
}

.controls button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  transform: none;
}

/* Map layout */
.map-row {
  position: relative;
  display: flex;
  gap: 16px;
  align-items: stretch;
  margin: 0;
  flex: 1;
  min-height: 0;
  padding-bottom: 0px;
}

.left-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
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

.panel-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.08);
  z-index: 1000;
}

.panel-slide-enter-active, .panel-slide-leave-active {
  transition: transform 220ms ease, opacity 220ms ease;
}

.panel-slide-enter-from, .panel-slide-leave-to {
  transform: translateX(-14px);
  opacity: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
}

.panel-close {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}

.panel-content {
  padding: 14px;
  overflow: auto;
}

.map-col {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.map {
  height: 100%;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.chart-box {
  height: 520px;
  min-height: 520px;
  width: 100%;
}

.chart-box--sm {
  height: 400px;
  min-height: 400px;
  width: 100%;
}

/* Time slider positioned above footer (overlay style) */
.time-slider-overlay {
  /* position: fixed;
  bottom: 78px;
  left: 20px;
  right: 20px; */
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 10px 15px;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 1001;
  max-height: 145px;
} 

.time-slider-overlay h3 {
  margin: 0 0 6px 0;
  font-size: 14px;
  font-weight: 600;
  color: #2d3748;
}

.slider-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.time-display {
  font-weight: 600;
  color: #667eea;
}

.price-display, .generation-display {
  font-weight: 600;
  color: #48bb78;
}

.slider-wrapper {
  position: relative;
  height: 55px;
  margin: 5px 0;
}

.custom-slider {
  position: relative;
  height: 28px;
  margin: 0;
}

.smooth-range-slider {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  width: 100%;
  height: 28px;
  transform: translateY(-50%);
  background: transparent;
  outline: none;
  cursor: pointer;
  z-index: 3;
  -webkit-appearance: none;
  appearance: none;
}

.smooth-range-slider::-webkit-slider-track {
  height: 6px;
  background: transparent;
  border: none;
  border-radius: 3px;
}

.smooth-range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #667eea;
  cursor: grab;
  border: 2px solid white;
  box-shadow: 0 3px 8px rgba(102, 126, 234, 0.4);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.smooth-range-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
}

.smooth-range-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.8);
}

.smooth-range-slider::-moz-range-track {
  height: 6px;
  background: transparent;
  border: none;
  border-radius: 3px;
}

.smooth-range-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #667eea;
  cursor: grab;
  border: 2px solid white;
  box-shadow: 0 3px 8px rgba(102, 126, 234, 0.4);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.smooth-range-slider::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.6);
}

.smooth-range-slider::-moz-range-thumb:active {
  cursor: grabbing;
  transform: scale(1.05);
}

.slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 6px;
  background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e0 100%);
  border-radius: 3px;
  transform: translateY(-50%);
  z-index: 1;
}

.slider-progress {
  position: absolute;
  top: 50%;
  left: 0;
  height: 6px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px 0 0 3px;
  transform: translateY(-50%);
  transition: width 0.2s ease;
  z-index: 2;
}

.time-ticks-below {
  position: absolute;
  top: 10px;
  left: 0;
  right: 0;
  height: 23px;
}

.time-tick-below {
  position: absolute;
  transform: translateX(-50%);
  cursor: pointer;
  transition: all 0.2s ease;
}

.time-tick-below:hover {
  transform: translateX(-50%) scale(1.05);
}

.tick-mark-below {
  width: 2px;
  height: 8px;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  border-radius: 1px;
  margin: 0 auto 4px auto;
  transition: all 0.2s ease;
}

.tick-label-below {
  font-size: 12px;
  color: #6f61c1;
  text-align: center;
  white-space: nowrap;
  font-weight: 500;
  transition: color 0.2s ease;
  line-height: 1.2;
}

.time-tick-below:hover .tick-label-below {
  color: #667eea;
  font-weight: 600;
}

.time-tick-below:hover .tick-mark-below {
  height: 12px;
  width: 3px;
}

.no-data-message {
  text-align: center;
  color: #718096;
  font-style: italic;
  margin-top: 8px;
  font-size: 12px;
}

/* Footer positioned at the bottom */
.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 35px;
  background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 500;
}

/* Legend */
.legend {
  margin: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.legend h3 {
  margin: 0 0 20px 0;
  color: #343a40;
  font-weight: 500;
}

.color-scale {
  margin-bottom: 20px;
}

.scale-bar {
  height: 20px;
  border-radius: 10px;
  margin-bottom: 5px;
  border: 1px solid #ddd;
}

.scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  color: #666;
}

.legend-items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  background: #f8f9fa;
}

.color-box {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

/* Loading overlay */
.initial-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  text-align: center;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Leaflet fixes */
:global(.custom-tooltip) {
  background: rgba(0,0,0,0.8) !important;
  border: none !important;
  border-radius: 4px !important;
  color: white !important;
  white-space: pre-line !important;
}

:global(.leaflet-interactive),
:global(.leaflet-overlay-pane svg),
:global(.leaflet-overlay-pane path),
:global(.leaflet-clickable),
:global(.leaflet-container),
:global(.leaflet-container:focus) {
  outline: none !important;
}

.leaflet-container {
  outline: none !important;
}

.leaflet-container,
.leaflet-container *,
.leaflet-container *:before,
.leaflet-container *:after {
  -webkit-tap-highlight-color: transparent !important;
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  -khtml-user-select: none !important;
  -moz-user-select: none !important;
  -ms-user-select: none !important;
  user-select: none !important;
}

/* Responsive design */
@media (max-width: 900px) {
  .left-panel {
    width: min(420px, 50vw);
  }
  
  .slider-info {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    gap: 4px;
  }
  

  
  .tick-label-below {
    font-size: 9px;
  }
  
  .chart-box--sm {
    height: 360px;
    min-height: 360px;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .header {
    padding: 8px 15px;
  }
  
  .header h1 {
    font-size: 1.6rem;
  }
  
  .controls {
    gap: 10px;
    margin-top: 6px;
  }
  
  /* .time-slider-overlay {
    bottom: 40px;
    left: 8px;
    right: 8px;
    padding: 8px 12px;
    max-height: 65px;
  } */
  
  .slider-wrapper {
    height: 50px;
  }
  
  .smooth-range-slider::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
  }
  
  .smooth-range-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
  }
  
  .tick-label-below {
    font-size: 9px;
  }
  
  .map-row {
    padding-bottom: 0px;
  }
  
  .app-footer {
    height: 30px;
  }
  
  .footer-content {
    font-size: 10px;
  }
}

@media (max-width: 600px) {
  .header h1 {
    font-size: 1.4rem;
    margin-bottom: 6px;
  }
  
  .controls {
    gap: 8px;
    flex-direction: column;
  }
  
  .controls label, .controls button {
    font-size: 13px;
  }
  
  .chart-box {
    height: 350px;
  }
  
  .chart-box--sm {
    height: 300px;
  }
  
  .time-slider-overlay h3 {
    font-size: 13px;
  }
  
  .tick-label-below {
    font-size: 8px;
  }
  
  .map-row {
    margin: 0;
    padding-bottom: 0px;
  }
  
  .slider-info {
    font-size: 11px;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .time-slider-overlay {
    background: rgba(26, 32, 44, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .time-slider-overlay h3 {
    color: #e2e8f0;
  }
  
  .slider-track {
    background: linear-gradient(90deg, #4a5568 0%, #2d3748 100%);
  }
  
  .tick-label-below {
    color: #a0aec0;
  }
  
  .time-tick-below:hover .tick-label-below {
    color: #90cdf4;
  }
  
  .no-data-message {
    color: #a0aec0;
  }
  
  .app-footer {
    background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
  }
}

.play-controls {
  display: flex;
  justify-content: left;
  margin-bottom: 8px;
}

.play-button {
  padding: 6px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.play-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.play-button:disabled {
  background: linear-gradient(135deg, #a0aec0 0%, #718096 100%);
  cursor: not-allowed;
  transform: none;
}
</style>
