<template>
  <div id="app" class="energy-map-app">
    <!-- Loading overlay for initial load -->
    <div v-if="initialLoading" class="initial-loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading energy data...</p>
      </div>
    </div>
    <div class="layout-shell">
      <div class="content-shell">
        <div class="header">
          <div class="controls">
            <!-- Add toggle for heatmap type -->
            <label class="radio-pill">
              <input type="radio" v-model="heatmapType" value="prices">
              <span>Price</span>
            </label>
            <label class="radio-pill">
              <input type="radio" v-model="heatmapType" value="capacity">
              <span>Capacity</span>
            </label>
            <label class="radio-pill">
              <input type="radio" v-model="heatmapType" value="generation">
              <span>Generation</span>
            </label>
          </div>
          <div class="header-logo" aria-label="visualize.energy">
            <span class="logo-primary">visualize</span>
            <span class="logo-dot">.</span>
            <span class="logo-highlight">energy</span>
          </div>
          <div class="header-top">
            <div class="header-clock"><LocalClock /></div>
          </div>
        </div>

        <!-- FLEX ROW: sidebar + map -->
        <div class="map-row">

          <div
            v-if="!isMobileViewport && isModalOpen"
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
              :use-global-leaflet="true"
              class="map"
              @ready="onMapReady"
              ref="leafletMap"
            >
              <LTileLayer
                :url="tileUrl"
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

        <div v-if="isMobileViewport && mobilePanelVisible" class="mobile-bottom-panel">
          <div class="mobile-panel-header">
            <div class="mobile-panel-titles">
              <p class="mobile-panel-label">Energy Prices (48h)</p>
              <h4 class="mobile-panel-country">{{ mobilePanelCountry }}</h4>
            </div>
            <button class="mobile-panel-close" @click="closeMobilePanel">Hide</button>
          </div>

          <div class="mobile-panel-body">
            <div v-if="mobilePanelLoading" class="mobile-panel-loading">
              <div class="loading-spinner-small"></div>
              <p>Loading price data...</p>
            </div>
            <div v-else-if="mobilePanelError" class="mobile-panel-error">
              <p>{{ mobilePanelError }}</p>
              <button @click="retryMobilePanel">Retry</button>
            </div>
            <div v-else class="mobile-panel-chart">
              <canvas id="mobile-price-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Price Slider -->
        <div v-if="heatmapType === 'prices'" class="time-slider-overlay">
          <div class="overlay-header">
            <h3>Historical Prices - Last 48 Hours [EUR/MWh]</h3>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
              <span class="price-display">{{ averagePriceDisplay }}</span>
            </div>
          </div>

          <div class="slider-row">
            <div class="play-controls">
              <button
                @click="togglePlay"
                :disabled="!hasTimeData || isRefreshing"
                class="play-button"
              >
                {{ isPlaying ? '⏸ Pause' : '▶ Play' }}
              </button>
              <label class="show-pct-toggle">
                <input type="checkbox" v-model="showPctInTooltip" @change="onPctToggle" />
                Show %
              </label>
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
                  @pointerdown="onSliderPointerDown"
                  @pointerup="onSliderPointerUp"
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
          </div>

          <div v-if="!hasTimeData && heatmapType === 'prices'" class="no-data-message">
            Click "Refresh Data" to load historical price data
          </div>
        </div>

        <!-- Generation Slider -->
        <div v-if="heatmapType === 'generation'" class="time-slider-overlay">
          <div class="overlay-header">
            <h3>Generation Data - Last 48 Hours</h3>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
              <span class="generation-display">{{ totalGenerationDisplay }}</span>
            </div>
          </div>

          <div class="slider-row slider-row--full">
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
          </div>

          <div v-if="!hasTimeData && heatmapType === 'generation'" class="no-data-message">
            Click "Refresh Data" to load generation data
          </div>
        </div>

        <!-- Capacity Slider (keeps layout consistent even with static data) -->
        <div v-if="heatmapType === 'capacity'" class="time-slider-overlay">
          <div class="overlay-header">
            <h3>Installed Capacity Snapshot</h3>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
              <span class="generation-display">{{ totalCapacityDisplay }}</span>
            </div>
          </div>

          <div class="slider-row slider-row--full">
            <div class="slider-wrapper">
              <div class="custom-slider">
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

                <div class="slider-track"></div>
                <div class="slider-progress" :style="progressStyle"></div>
              </div>

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
          </div>

          <div v-if="!hasTimeData" class="no-data-message">
            Capacity data is currently static; refresh to sync with the latest snapshot.
          </div>
        </div>
      </div>

      <!-- Separate Modal Windows for Charts -->
      <transition-group
        v-if="separateModals.length"
        name="modal-fade"
        tag="div"
        class="separate-modal-stack"
      >
        <div
          v-for="modal in separateModals"
          :key="modal.id"
          :id="'separate-modal-' + modal.id"
          :class="[
            'separate-modal',
            { 'separate-modal--thumbnail': modal.thumbnail, 'separate-modal--mobile': isMobileViewport }
          ]"
          :style="getSeparateModalStyle(modal.id)"
          v-show="modal.visible"
        >
        <!-- Draggable header -->
        <div
          class="separate-modal-header"
          @pointerdown.stop="startSeparateModalDrag($event, modal.id)"
          @dblclick="toggleSeparateModalView(modal.id)"
          @click.stop="handleThumbnailTap(modal.id, $event)"
          :style="{ cursor: isMobileViewport ? 'default' : 'move' }"
        >
          <h4>{{ modal.country }} - {{ modal.title }}</h4>
          <button
            @click="closeSeparateModal(modal.id)"
            class="separate-modal-close"
          >
            ×
          </button>
        </div>

        <div
          v-if="modal.thumbnail"
          class="separate-modal-thumbnail-preview"
          @click.stop="handleThumbnailTap(modal.id, $event)"
        >
          <div class="thumbnail-icon-badge">
            <span class="thumbnail-icon-glyph">{{ getModalIconSymbol(modal.type) }}</span>
            <span class="thumbnail-icon-label">{{ getModalIconLabel(modal.type) }}</span>
          </div>
          <div class="thumbnail-icon-row">
            <span
              v-for="icon in getModalSparkIcons(modal.type)"
              :key="icon"
              class="thumbnail-spark-icon"
            >
              {{ icon }}
            </span>
          </div>
        </div>

        <!-- Modal content -->
        <div class="separate-modal-content">
          <div v-if="modal.loading" class="separate-modal-loading">
            <div class="loading-spinner-small"></div>
            <p>Loading {{ modal.type }} data...</p>
          </div>

          <div v-else-if="modal.error" class="separate-modal-error">
            <p>Error: {{ modal.error }}</p>
            <button @click="retrySeparateModalData(modal.id)">Retry</button>
          </div>

          <!-- FLOWS MODAL: uses /api/flows/latest/?country=XX internally -->
          <div v-else-if="modal.type === 'powerflow'" class="powerflow-modal-body">
            <PowerFlow
              :country-iso="getCountryISO2ByName(modal.country) || 'BG'"
            />
          </div>

          <!-- Net flows modal -->
          <div v-else-if="modal.type === 'netflows'" class="netflow-modal">
            <div class="chart-container netflow-chart">
              <canvas :id="'separate-chart-' + modal.id"></canvas>
            </div>
            <div v-if="modal.meta" class="netflow-summary">
              <div class="netflow-summary-item">
                <span class="netflow-summary-label">Latest net flow</span>
                <span class="netflow-summary-value" :class="{ 'is-import': (modal.meta.latestNet || 0) < 0 }">
                  {{ formatMegawatts(Math.abs(modal.meta.latestNet || 0)) }} MW
                  <small>{{ (modal.meta.latestNet || 0) >= 0 ? 'export' : 'import' }}</small>
                </span>
              </div>
              <div class="netflow-summary-item">
                <span class="netflow-summary-label">Peak export</span>
                <span class="netflow-summary-value">{{ formatMegawatts(modal.meta.peakExport || 0) }} MW</span>
              </div>
              <div class="netflow-summary-item">
                <span class="netflow-summary-label">Peak import</span>
                <span class="netflow-summary-value">{{ formatMegawatts(modal.meta.peakImport || 0) }} MW</span>
              </div>
            </div>
            <div v-if="modal.meta?.latestTimestamp" class="netflow-updated">
              Updated: {{ modal.meta.latestTimestamp }}
            </div>
          </div>

          <!-- Generation modal: custom layout for small viewports -->
            <div v-else-if="modal.type === 'generation'" class="generation-modal">
              <div v-if="modal.meta?.updatedLabel" class="generation-updated">{{ modal.meta.updatedLabel }}</div>
              <div class="chart-container generation-chart">
                <canvas :id="'separate-chart-' + modal.id"></canvas>
              </div>
              <div v-if="modal.meta" class="generation-total">
                <span class="generation-total-label">Total output</span>
                <span class="generation-total-value">{{ formatMegawatts(modal.meta.totalGeneration) }} MW</span>
              </div>
              <div
                v-if="
                  modal.meta &&
                  modal.meta.todayForecastTotal !== undefined &&
                  modal.meta.todayForecastTotal !== null
                "
                class="generation-forecast"
              >
                <div class="generation-forecast-header">
                  <span class="generation-forecast-label">Today's forecast</span>
                  <span class="generation-forecast-value">{{ formatMegawatts(modal.meta.todayForecastTotal) }} MW</span>
                </div>
                <div
                  v-if="modal.meta.todayForecastLabel"
                  class="generation-forecast-subtext"
                >
                  {{ modal.meta.todayForecastLabel }}
                </div>
              </div>
              <div
                v-if="modal.meta && modal.meta.topTechnologies.length"
                class="generation-top-techs"
              >
              <div
                v-for="tech in modal.meta.topTechnologies"
                :key="tech.name"
                class="generation-tech-pill"
              >
                <span class="generation-tech-color" :style="{ backgroundColor: tech.color }"></span>
                <span class="generation-tech-name">{{ tech.name }}</span>
                <span class="generation-tech-value">{{ formatMegawatts(tech.value) }} MW</span>
                <span class="generation-tech-share">({{ formatPercent(tech.share) }})</span>
              </div>
            </div>
          </div>

          <!-- Capacity modal: enriched layout with summary + breakdown -->
          <div v-else-if="modal.type === 'capacity'" class="capacity-modal">
            <div class="chart-container capacity-chart">
              <canvas :id="'separate-chart-' + modal.id"></canvas>
            </div>

            <div v-if="modal.meta" class="capacity-summary">
              <div class="capacity-metrics">
                <div class="capacity-metric">
                  <span class="capacity-metric-label">Installed capacity</span>
                  <span class="capacity-metric-value">{{ formatMegawatts(modal.meta.totalCapacity) }} MW</span>
                </div>
                  <div class="capacity-metric">
                    <span class="capacity-metric-label">Current generation</span>
                    <span class="capacity-metric-value">{{ formatMegawatts(modal.meta.totalGeneration) }} MW</span>
                  </div>
                <div class="capacity-metric">
                  <span class="capacity-metric-label">Utilisation</span>
                  <span class="capacity-metric-value">{{ formatPercent(modal.meta.utilization) }}</span>
                </div>
              </div>
              <div v-if="modal.meta.updatedLabel" class="capacity-updated">{{ modal.meta.updatedLabel }}</div>
            </div>

            <div
              v-if="modal.meta && modal.meta.topTechnologies.length"
              class="capacity-top-techs"
            >
              <div
                v-for="tech in modal.meta.topTechnologies"
                :key="tech.name"
                class="capacity-tech-card"
              >
                <span class="capacity-tech-color" :style="{ backgroundColor: tech.color }"></span>
                <div class="capacity-tech-content">
                  <div class="capacity-tech-header">
                    <span class="capacity-tech-name">{{ tech.name }}</span>
                    <span class="capacity-tech-share">{{ formatPercent(tech.capacityShare) }} of capacity</span>
                  </div>
                  <div class="capacity-tech-values">
                    <span class="capacity-tech-capacity">{{ formatMegawatts(tech.capacity) }} MW installed</span>
                    <span class="capacity-tech-generation">{{ formatMegawatts(tech.generation) }} MW now</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Other chart modals (capacity, prices…) -->
          <div
            v-else
            class="chart-container"
            :class="{ 'price-chart': modal.type === 'prices' }"
          >
            <canvas :id="'separate-chart-' + modal.id"></canvas>
          </div>
        </div>

        <!-- Resize handles -->
        <div
          v-if="!isMobileViewport"
          class="separate-modal-resize-handle separate-modal-resize-right"
          @pointerdown.stop.prevent="startSeparateModalResize($event, modal.id, 'right')"
        ></div>
        <div
          v-if="!isMobileViewport"
          class="separate-modal-resize-handle separate-modal-resize-bottom"
          @pointerdown.stop.prevent="startSeparateModalResize($event, modal.id, 'bottom')"
        ></div>
        <div
          v-if="!isMobileViewport"
          class="separate-modal-resize-handle separate-modal-resize-corner"
          @pointerdown.stop.prevent="startSeparateModalResize($event, modal.id, 'corner')"
        ></div>
      </div>
    </transition-group>

    <!-- NEW: Actual footer positioned below the slider -->
    <footer class="app-footer">
      <div class="footer-content">
        <!-- <span>© 2025 Entra Energy | Energy Data Visualization</span> -->
      </div>
    </footer>
    </div>
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

const DEFAULT_MODAL_WIDTH = 350
const DEFAULT_MODAL_HEIGHT = 280
const MODAL_MOBILE_BREAKPOINT = 1200
const MIN_DESKTOP_HEIGHT = 680

const calculateResponsiveModalSize = () => {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_MODAL_WIDTH, height: DEFAULT_MODAL_HEIGHT }
  }

  const viewportWidth = window.innerWidth || DEFAULT_MODAL_WIDTH
  const viewportHeight = window.innerHeight || DEFAULT_MODAL_HEIGHT
  const isNarrowDesktop = viewportWidth > MODAL_MOBILE_BREAKPOINT && viewportWidth <= 1440
  const isCompactViewport = isNarrowDesktop || viewportWidth <= 1440 || viewportHeight <= 900

  if (!isCompactViewport) {
    return { width: DEFAULT_MODAL_WIDTH, height: DEFAULT_MODAL_HEIGHT }
  }

  const widthFactor = isNarrowDesktop ? 0.2 : 0.22
  const heightFactor = isNarrowDesktop ? 0.26 : 0.28
  const compactWidth = Math.max(280, Math.round(viewportWidth * widthFactor))
  const compactHeight = Math.max(220, Math.round(viewportHeight * heightFactor))

  return {
    width: Math.min(DEFAULT_MODAL_WIDTH, compactWidth),
    height: Math.min(DEFAULT_MODAL_HEIGHT, compactHeight),
  }
}

const BULK_REQUEST_CONFIG = {
  timeout: 30000,
  retry: 2,
  retryDelay: 1000
}

import PowerFlow from "@/components/PowerFlow.vue";
import LocalClock from "@/components/LocalClock.vue"
import { markRaw, toRaw, nextTick } from 'vue'
import { LMap, LTileLayer, LGeoJson } from '@vue-leaflet/vue-leaflet'
import Chart from 'chart.js/auto'
import { Tooltip } from 'chart.js'
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

import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
})

const generationCursorState = new Map()

const CURSOR_TOOLTIP_OFFSET = 32

const tooltipPositioners = Tooltip?.positioners || Chart?.Tooltip?.positioners

if (tooltipPositioners) {
  tooltipPositioners.cursorLeft = function cursorLeft(elements, eventPosition) {
    if (!elements?.length) {
      return false
    }

    const basePosition = tooltipPositioners.nearest.call(this, elements, eventPosition)
    if (!basePosition) {
      return false
    }

    const chartArea = this.chart?.chartArea || {}
    const desiredX = eventPosition?.x != null ? eventPosition.x - CURSOR_TOOLTIP_OFFSET : basePosition.x
    const minX = (chartArea.left ?? 0) + CURSOR_TOOLTIP_OFFSET
    const boundedX = Math.max(minX, desiredX)

    return {
      x: boundedX,
      y: basePosition.y
    }
  }
}

const generationCursorPlugin = {
  id: 'generationCursor',
  afterDatasetsDraw(chart) {
    const state = generationCursorState.get(chart.id)
    const timestamp = state?.timestamp
    const xScale = chart.scales?.x
    if (!Number.isFinite(timestamp) || !xScale) return

    const x = xScale.getPixelForValue(timestamp)
    const { left, right, top, bottom } = chart.chartArea || {}
    if (!Number.isFinite(x) || x < left || x > right) return

    const ctx = chart.ctx
    ctx.save()
    ctx.strokeStyle = state?.color || '#f97316'
    ctx.lineWidth = state?.lineWidth || 2
    ctx.setLineDash(state?.dash || [6, 4])
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, bottom)
    ctx.stroke()
    ctx.restore()
  },
  afterDestroy(chart) {
    generationCursorState.delete(chart.id)
  }
}

export default {
  name: 'EnergyMap',
  components: { LMap, LTileLayer, LGeoJson, LocalClock, PowerFlow },

  data() {
    return {
      modalDefaults: {
        ...calculateResponsiveModalSize(),
      },
      // Separate Modal System
      separateModals: [],
      separateModalIdCounter: 0,
      showFlows: true,
      flowsLayer: null,
      flowsData: {},                  // { "BG-RO": { [ts]: mw, ... }, ... }
      flowEdges: [                    // pick the borders you want to visualize
        // Examples – add more as you wish:
        ['BG','RO'], ['BG','GR'], ['BG','RS'], ['BG','TR'], ['RO','HU'],
        ['RO','UA'], ['RO','MD'], ['GR','AL'], ['GR','MK'], ['HU','AT'],
        ['HU','SK'], ['AT','DE'], ['DE','PL'], ['DE','CZ'], ['IT','AT'],
        ['IT','SI'], ['FR','ES'], ['FR','DE'], ['FR','IT'], ['ES','PT'],
      ],
      maxFlowAbsMW: 4000, // used to scale line width; adjust after first fetch
      // Modal drag and resize state
      modalPosition: { x: 0, y: 0 },
      modalSize: { width: 560, height: Math.floor(window.innerHeight * 0.7) },
      isDragging: false,
      isResizing: false,
      resizeDirection: null,
      separateModalDragState: {},  // Track drag state for each modal
      separateModalResizeState: {}, // Track resize state for each modal
      modalChartResizeRafs: {},
      layerByISO2: {},               // iso2 -> Leaflet layer
      countryMainCenterByISO2: {},    // cache of main polygon centers per country
      showChangeTooltips: false,      // enable/disable delta bubbles
      deltaHideTimer: null,
      isUserScrubbing: false,

      dragStartX: 0,
      dragStartY: 0,
      resizeStartX: 0,
      resizeStartY: 0,
      resizeStartWidth: 0,
      resizeStartHeight: 0,

      // Heatmap type controls - Price is default
      heatmapType: 'prices',
      isRefreshing: false,
      initialLoading: true,
      isMapUpdating: false,
      isPlaying: false,
      playInterval: null,
      playSpeed: 500,
      showPctInTooltip: true,
      
      // Time slider data for prices
      currentTimeIndex: 0,
      availableTimestamps: [],
      historicalPriceData: {},
      
      // Generation time-series data for heatmap (48 hours)
      availableGenerationTimestamps: [],
      historicalGenerationData: {},
      generationForecastData: {},
      
      // Capacity data (ISO-2 keyed)
      countryCapacityByISO2: {},
      capacityByISO2: {},
      
      // Existing data properties
      europeBounds: [[34, -25], [72, 45]],
      isModalOpen: false,
      isMobileViewport: typeof window !== 'undefined' ? window.innerWidth < MODAL_MOBILE_BREAKPOINT : false,
      mobilePanelVisible: false,
      mobilePanelLoading: false,
      mobilePanelError: null,
      mobilePanelCountry: '',
      mobilePanelISO2: null,
      mobilePanelChart: null,
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
      cacheValidityMs: 5 * 60 * 1000,
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
      mwFormatter: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
      percentFormatter: new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      }),

      countryPriceByISO2: {},
      priceByISO2: {},
      pricePollingMs: 5 * 60 * 1000,
      priceTimer: null,
      priceBadgeLayer: null,

      defaultZoom: 5,
      mobileZoomOffset: 1,
      zoom: (() => {
        const isClient = typeof window !== 'undefined'
        const isMobileViewport = isClient && window.innerWidth < MODAL_MOBILE_BREAKPOINT
        const defaultZoom = 5
        const mobileZoomOffset = 1
        const mobileZoom = Math.max(2, defaultZoom - mobileZoomOffset)
        return isMobileViewport ? mobileZoom : defaultZoom
      })(),
      center: [54, 20],
      selectedColorScheme: 'ylOrRd',
      tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',     
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
    // Modal style computed property for drag and resize
    modalStyle() {
      return {
        left: `${this.modalPosition.x}px`,
        top: `${this.modalPosition.y}px`,
        width: `${this.modalSize.width}px`,
        height: this.modalSize.height ? `${this.modalSize.height}px` : 'auto',
        position: 'absolute'
      }
    },
    
    progressStyle() {
      const percentage = this.maxTimeIndex > 0 ? (this.currentTimeIndex / this.maxTimeIndex) * 100 : 0
      return {
        width: `${percentage}%`
      }
    },
    
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
      
      return date.toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      })
    },
    
    timeTicks() {
      if (!this.hasTimeData || this.heatmapType !== 'prices') return []
      
      const ticks = []
      const totalTicks = 8
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableTimestamps[tickIndex]
        const date = new Date(timestamp)
        
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        let label
        if (i === 0) {
          label = '48h ago'
        } else if (i === totalTicks) {
          label = 'Now'
        } else {
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
    
    generationTimeTicks() {
      if (!this.hasTimeData || this.heatmapType !== 'generation') return []
      
      const ticks = []
      const totalTicks = 8
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableGenerationTimestamps[tickIndex]
        const date = new Date(timestamp)
        
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        let label
        if (i === 0) {
          label = '48h ago'
        } else if (i === totalTicks) {
          label = 'Now'
        } else {
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

    totalCapacityDisplay() {
      const capacities = Object.values(this.countryCapacityByISO2).filter(c => Number.isFinite(c))
      if (!capacities.length) return 'No capacity data'

      const total = capacities.reduce((sum, cap) => sum + cap, 0)
      return `Total: ${(total / 1000).toFixed(1)} GW`
    },

    currentDataByISO2() {
      if (this.heatmapType === 'capacity') {
        return this.countryCapacityByISO2
      }
      
      if (this.heatmapType === 'generation') {
        const result = {}
        const timestamp = Number(this.currentTimestamp)

        const useForecast = this.currentTimeIndex === this.maxTimeIndex && Object.keys(this.generationForecastData).length > 0

        const primarySource = useForecast ? this.generationForecastData : this.historicalGenerationData
        const fallbackSource = useForecast ? this.historicalGenerationData : null

        const findNearestValue = (timeData) => {
          if (!timeData) return undefined
          if (timeData[timestamp] !== undefined) return timeData[timestamp]

          const allTimestamps = Object.keys(timeData)
            .map(Number)
            .filter(Number.isFinite)
            .sort((a, b) => a - b)

          if (!allTimestamps.length) return undefined

          const pastTimestamps = allTimestamps.filter(ts => ts <= timestamp)
          if (pastTimestamps.length) {
            const nearestPast = pastTimestamps[pastTimestamps.length - 1]
            return timeData[nearestPast]
          }

          const nearestFuture = allTimestamps.find(ts => ts > timestamp)
          return nearestFuture !== undefined ? timeData[nearestFuture] : undefined
        }

        for (const [iso2, timeData] of Object.entries(primarySource)) {
          const value = findNearestValue(timeData)
          if (value !== undefined) {
            result[iso2] = value
          }
        }

        if (useForecast && fallbackSource) {
          for (const [iso2, timeData] of Object.entries(fallbackSource)) {
            if (result[iso2] === undefined) {
              const value = findNearestValue(timeData)
              if (value !== undefined) {
                result[iso2] = value
              }
            }
          }
        }

        return result
      }
      
      const result = {}
      const timestamp = Number(this.currentTimestamp)
      
      for (const [iso2, timeData] of Object.entries(this.historicalPriceData)) {
        if (timeData && timeData[timestamp] !== undefined) {
          result[iso2] = timeData[timestamp]
        }
      }
      
      return result
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
        if (newType === 'prices' && !this.hasTimeData) {
          this.refreshAllHistoricalPrices()
        } else if (newType === 'capacity' && Object.keys(this.countryCapacityByISO2).length === 0) {
          this.currentTimeIndex = this.maxTimeIndex
          this.refreshAllCapacities()
        } else if (newType === 'generation') {
          if (this.availableGenerationTimestamps.length === 0) {
            this.refreshAllHistoricalGeneration()
          }

          if (Object.keys(this.generationForecastData).length === 0) {
            this.refreshAllGenerationForecasts()
          }
        }
        else{
          this.showChangeTooltips = false;
          this.hideAllDeltaTooltips();
        }
        this.updateColorScheme()
        this.$nextTick(() => this.updatePriceBadges())

      },
      immediate: false
    },

    currentTimeIndex: {
      handler() {
        this.updateColorScheme()
        this.updateGenerationCursorLines()
        if (this.showChangeTooltips) this.updateDeltaTooltips();
        this.updatePriceBadges()
      },
    },

  },

  methods: {

    formatMegawatts(value) {
      if (value == null || Number.isNaN(value)) return '0';
      return this.mwFormatter.format(Math.round(value));
    },

    formatPercent(value) {
      if (value == null || Number.isNaN(value)) return '0%';
      const bounded = Math.max(0, Math.min(100, value));
      return `${this.percentFormatter.format(bounded)}%`;
    },

    getAnimationTimeline() {
      if (this.heatmapType === 'generation' && this.availableGenerationTimestamps.length) {
        return this.availableGenerationTimestamps
      }

      return this.availableTimestamps
    },

    getGenerationCursorTimestamp() {
      const timeline = this.getAnimationTimeline()
      if (!timeline.length) return null

      const clampedIndex = Math.min(this.currentTimeIndex, timeline.length - 1)
      return timeline[clampedIndex] ?? null
    },

    applyGenerationCursor(chart, timestamp, style = {}) {
      if (!chart) return

      generationCursorState.set(chart.id, {
        timestamp,
        color: style.color || '#fb923c',
        lineWidth: style.lineWidth || 1.5,
        dash: style.dash || [5, 4]
      })

      chart.update('none')
    },

    updateGenerationCursorLines() {
      const timestamp = this.getGenerationCursorTimestamp()
      if (!Number.isFinite(timestamp)) return

      if (this.generationChartInstance) {
        this.applyGenerationCursor(this.generationChartInstance, timestamp)
      }

      this.separateModals
        .filter(modal => modal.type === 'generation' && modal.chart)
        .forEach(modal => this.applyGenerationCursor(modal.chart, timestamp))
    },

    normalizeTechnologyKey(name) {
      if (!name) return ''
      return String(name)
        .trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
    },

    applyAlpha(color, alpha) {
      if (!color) {
        return `rgba(100, 116, 139, ${alpha})`
      }

      if (color.startsWith('#')) {
        let hex = color.slice(1)
        if (hex.length === 3) {
          hex = hex.split('').map(char => char + char).join('')
        }
        const int = parseInt(hex, 16)
        const r = (int >> 16) & 255
        const g = (int >> 8) & 255
        const b = int & 255
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }

      const rgbMatch = color.match(/^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/i)
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }

      const rgbaMatch = color.match(/^rgba\((\d+)\s*,\s*(\d+)\s*,\s*(\d+),\s*([0-9.]+)\)$/i)
      if (rgbaMatch) {
        const [, r, g, b] = rgbaMatch
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }

      return color
    },

    // --- Vertical modal helper ---------------------------------------------
    // Returns {x,y} for a given slotIndex stacked vertically from the left
    // edge so multiple modals align in a single column.
    _gridPosition(slotIndex, modalWidth = 400, modalHeight = 300) {
      const marginFromEdge = 20   // left/top margin to the viewport
      const viewportHeight = typeof window !== 'undefined' ? (window.innerHeight || 0) : 0
      const compactVertical = viewportHeight > 0 && viewportHeight < 900
      const gapX = 16
      const gapY = compactVertical ? 12 : 16 // vertical gap between rows
      const startY = compactVertical ? 72 : 100 // initial top offset

      const availableHeight = Math.max(0, viewportHeight - startY - marginFromEdge)
      const rowsPerColumn = Math.max(1, Math.floor((availableHeight + gapY) / (modalHeight + gapY)) || 1)

      const column = Math.floor(slotIndex / rowsPerColumn)
      const row = slotIndex % rowsPerColumn

      const x = marginFromEdge + column * (modalWidth + gapX)
      const y = startY + row * (modalHeight + gapY)
      return { x, y }
    },

    isLargeScreenLayout() {
      if (typeof window === 'undefined') return false

      const viewportWidth = window.innerWidth || 0
      const viewportHeight = window.innerHeight || 0
      if (viewportWidth < MODAL_MOBILE_BREAKPOINT) return false

      const comfortableHeight = viewportHeight >= 760
      const laptopHeight = viewportHeight >= 620
      const compactButDesktop = viewportHeight >= 560

      return comfortableHeight || laptopHeight || compactButDesktop
    },

    getDesktopLayoutPosition(modal, baseSize) {
      if (!this.isLargeScreenLayout()) return null
      if (modal?.thumbnail) return null

      const viewportHeight = window.innerHeight || 0
      const viewportWidth = window.innerWidth || 0
      const isMediumDesktop = viewportWidth >= MODAL_MOBILE_BREAKPOINT && viewportWidth <= 1440
      const normalizedSize = {
        width: Math.max(baseSize.width, 320),
        height: Math.max(baseSize.height, 240)
      }
      const marginFromEdge = isMediumDesktop ? 16 : 20
      const compactVertical = viewportHeight > 0 && viewportHeight < 900
      const gap = isMediumDesktop ? 14 : (compactVertical ? 12 : 16)
      const startY = isMediumDesktop ? 48 : (compactVertical ? 56 : 80)

      if (modal.type === 'capacity') {
        const maxHeightBudget = Math.max(
          normalizedSize.height,
          (window.innerHeight || normalizedSize.height) - startY - marginFromEdge
        )
        const cappedHeight = isMediumDesktop
          ? Math.min(maxHeightBudget, Math.floor((viewportHeight || normalizedSize.height) * 0.9))
          : maxHeightBudget
        const fullHeight = Math.max(normalizedSize.height, cappedHeight)

        return {
          position: { x: marginFromEdge, y: startY },
          size: { width: normalizedSize.width, height: fullHeight }
        }
      }

      const layoutOrder = ['generation', 'prices', 'powerflow', 'netflows']
      const slotIndex = layoutOrder.indexOf(modal.type)
      if (slotIndex === -1) return null

      const columns = 2
      const totalWidth = (normalizedSize.width * columns) + gap
      const xStart = Math.max(marginFromEdge, (window.innerWidth || 0) - totalWidth - marginFromEdge)
      const column = slotIndex % columns
      const row = Math.floor(slotIndex / columns)

      const x = xStart + column * (normalizedSize.width + gap)
      const availableHeight = Math.max(normalizedSize.height, (viewportHeight || normalizedSize.height) - startY - marginFromEdge)
      const baseHeight = compactVertical
        ? Math.min(normalizedSize.height, Math.max(200, Math.floor((availableHeight - gap) / Math.max(row + 1, 1))))
        : normalizedSize.height

      const y = startY + row * (baseHeight + gap)

      return {
        position: { x, y },
        size: { ...normalizedSize, height: baseHeight }
      }
    },



    getThumbnailDefaults() {
      const minWidth = 238

      if (typeof window === 'undefined') {
        return { width: minWidth, height: 70 }
      }

      const viewportWidth = window.innerWidth || 800
      const viewportHeight = window.innerHeight || 600

      const width = Math.max(minWidth, Math.round(viewportWidth * 0.14))
      const height = Math.max(60, Math.round(viewportHeight * 0.1))

      return { width, height }
    },

    shouldUseThumbnailMode() {
      if (typeof window === 'undefined') return false

      const viewportWidth = window.innerWidth || 0
      const viewportHeight = window.innerHeight || 0

      if (this.isMobileViewport) return false

      return viewportWidth < MODAL_MOBILE_BREAKPOINT && viewportHeight <= 800
    },

    getSeparateModalStyle(modalId) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal) return {}

      if (this.isMobileViewport) {
        return {
          position: 'relative',
          width: '100%',
          height: 'auto',
          left: 'auto',
          top: 'auto',
          maxWidth: '100%',
          maxHeight: 'none',
          marginTop: '12px',
          zIndex: 'auto'
        }
      }

      return {
        position: 'fixed',
        left: `${modal.position.x}px`,
        top: `${modal.position.y}px`,
        width: `${modal.size.width}px`,
        height: `${modal.size.height}px`,
        zIndex: 1200 + modalId,
        overflow: 'hidden',
        maxWidth: '90vw',
        maxHeight: '95vh',
        transition: 'width 180ms ease, height 180ms ease'
      }
    },
    // Simple hash -> stable pseudo-random
_hashInt(s) { let x = 0; for (let i=0;i<s.length;i++) x = (x*31 + s.charCodeAt(i))|0; return Math.abs(x); },
_rand01(key) { return (this._hashInt(String(key)) % 10000) / 10000; },

// Build a plausible power-flow state from your data (or smart synth if missing)
buildPowerFlowForCountry(iso2, ts = Number(this.currentTimestamp)) {
  // Anchor to your hourly total generation if available; fallback to 3 GW
  const genSeries = this.historicalGenerationData?.[iso2] || null;
  const totalGen = Number(genSeries?.[ts]) || 3000; // MW

  // Estimated site load ~ close to total generation +/- 10–50%
  const load = Math.max(500, Math.round(totalGen * (0.9 + 0.5 * this._rand01('ld:'+iso2))));

  // PV share varies with hour and country
  const pvShare = 0.10 + 0.25 * this._rand01('pv:' + iso2 + ':' + (ts/3600000|0)); // 10..35%
  const pvGen = Math.round(totalGen * pvShare);

  // Battery behavior: charge around solar hours, discharge otherwise
  const hour = new Date(ts).getUTCHours();
  const isSolarHour = hour >= 9 && hour <= 16;
  const battCap = Math.max(200, Math.round(0.15 * load));
  const batteryCharge = isSolarHour ? Math.round(Math.min(battCap, pvGen * 0.35)) : 0;
  const batteryDischarge = !isSolarHour ? Math.round(Math.min(battCap, load * 0.25)) : 0;

  // Split PV priority: Home, then Battery, then Grid
  const pvToHome = Math.min(pvGen, Math.round(load * (0.45 + 0.25 * this._rand01('pth:'+iso2))));
  const pvLeft = Math.max(0, pvGen - pvToHome);
  const pvToBattery = Math.min(pvLeft, batteryCharge);
  const pvToGrid = Math.max(0, pvLeft - pvToBattery);

  // Use battery to help supply remaining home load at night
  const batteryToHome = Math.min(batteryDischarge, Math.max(0, load - pvToHome));
  const remainingHome = Math.max(0, load - pvToHome - batteryToHome);

  // Grid covers remaining demand; allow some export bias
  const gridToHome = remainingHome;
  const exportBias = this._rand01('exp:'+iso2) < 0.35;
  const extraExport = exportBias ? Math.round(0.12 * totalGen * this._rand01('x:'+iso2)) : 0;
  const homeToGrid = Math.max(0, pvToGrid + Math.max(0, batteryDischarge - batteryToHome) + extraExport);

  // Headline import/export (shown on Grid node)
  const gridImport = gridToHome;
  const gridExport = homeToGrid;

  return {
    pvGen,
    homeLoad: load,
    gridImport,
    gridExport,
    batteryCharge,
    batteryDischarge,

    // Optional per-link flows (PowerFlow can infer if you set these 0)
    pvToHome,
    pvToGrid,
    pvToBattery,
    gridToHome,
    gridToBattery: 0,
    batteryToHome,
    homeToPv: 0
  };
},

    async refreshAllFlows() {
      // Just synthesize for now
      this.generateFakeFlowsData()

    },
    generateFakeFlowsData() {
      // Use your 48h timestamps from prices; if missing, synthesize them
      const ts = (this.availableTimestamps?.length
        ? this.availableTimestamps
        : this.generateLast48HoursTimestamps()
      ).map(Number)

      const out = {}
      // Deterministic pseudo-random per edge using a hash
      const h = (s) => {
        let x = 0; for (let i=0;i<s.length;i++) x = (x*31 + s.charCodeAt(i))|0; return Math.abs(x)
      }

      // Create a smooth-ish waveform with daily rhythm + noise
      for (const [A,B] of this.flowEdges) {
        const key = `${A}-${B}`
        const seed = h(key) % 1000
        const series = {}
        for (let i=0; i<ts.length; i++) {
          const t = ts[i] / (1000*60*60) // hours
          // Base amplitude depends on seed (200..2200 MW)
          const amp = 200 + (seed % 2000)
          // Slow sine (daily), edge-dependent phase
          const phase = (seed % 360) * Math.PI / 180
          const sine = Math.sin((2*Math.PI/24)*t + phase)
          // A bit of hourly “noise” but deterministic
          const noi = (((seed * (i+7)) % 200) - 100) * 0.5
          // Net flow (signed): + means A -> B ; – means B -> A
          const mw = Math.round(0.7*amp*sine + noi)
          series[ts[i]] = mw
        }
        out[key] = series
      }
      // Save max abs for stroke scaling
      let maxAbs = 0
      Object.values(out).forEach(s => {
        Object.values(s).forEach(v => { const a = Math.abs(v); if (a>maxAbs) maxAbs=a })
      })
      this.maxFlowAbsMW = Math.max(maxAbs, 1000)
      this.flowsData = out
    },

    buildCountryNetFlowsSeries(iso2) {
      if (!iso2 || !this.flowsData) return []

      const relevantEdges = Object.entries(this.flowsData).filter(([key]) => {
        if (!key.includes('-')) return false
        const [a, b] = key.split('-')
        return a === iso2 || b === iso2
      })
      if (!relevantEdges.length) return []

      const timestampsSet = new Set()
      relevantEdges.forEach(([, series]) => {
        Object.keys(series || {}).forEach(ts => timestampsSet.add(Number(ts)))
      })
      const timestamps = Array.from(timestampsSet).filter(Number.isFinite).sort((a, b) => a - b)

      return timestamps.map(ts => {
        let imports = 0
        let exports = 0

        relevantEdges.forEach(([key, series]) => {
          const [a, b] = key.split('-')
          const value = Number(series?.[ts])
          if (!Number.isFinite(value) || value === 0) return

          if (iso2 === a) {
            if (value > 0) {
              exports += value
            } else {
              imports += Math.abs(value)
            }
          } else if (iso2 === b) {
            if (value > 0) {
              imports += value
            } else {
              exports += Math.abs(value)
            }
          }
        })

        return {
          ts,
          imports,
          exports,
          net: exports - imports
        }
      }).filter(point => (point.imports || 0) > 0 || (point.exports || 0) > 0)
    },

    normalizeLayerPolygons(latlngs) {
      if (!Array.isArray(latlngs) || !latlngs.length) return []

      const first = latlngs[0]

      if (first?.lat !== undefined) {
        return [[latlngs]]
      }

      if (Array.isArray(first) && first[0]?.lat !== undefined) {
        return [latlngs]
      }

      if (Array.isArray(first) && Array.isArray(first[0]) && first[0][0]?.lat !== undefined) {
        return latlngs
      }

      return []
    },

    computeRingAreaAndCentroid(ring = []) {
      if (!ring.length) return null

      let areaSum = 0
      let cxSum = 0
      let cySum = 0

      for (let i = 0; i < ring.length; i += 1) {
        const current = ring[i]
        const next = ring[(i + 1) % ring.length]
        if (!current || !next) continue

        const cross = (current.lng * next.lat) - (next.lng * current.lat)
        areaSum += cross
        cxSum += (current.lng + next.lng) * cross
        cySum += (current.lat + next.lat) * cross
      }

      const signedArea = areaSum / 2
      const absArea = Math.abs(signedArea)

      if (absArea > 0) {
        const cx = cxSum / (3 * areaSum)
        const cy = cySum / (3 * areaSum)
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          return { area: absArea, centroid: [cy, cx] }
        }
      }

      const fallbackPoint = ring.find(pt => pt?.lat !== undefined && pt?.lng !== undefined)
      if (fallbackPoint) {
        return { area: 0, centroid: [fallbackPoint.lat, fallbackPoint.lng] }
      }

      return null
    },

    // Get a country’s visual center, preferring provided label coordinates
    getCountryCenter(iso2) {
      if (!iso2) return null
      if (!this.countryMainCenterByISO2) this.countryMainCenterByISO2 = {}

      const cached = this.countryMainCenterByISO2[iso2]
      if (cached) return cached

      const layer = this.layerByISO2[iso2]
      const props = layer?.feature?.properties || {}

      const labelLng = props.LABEL_X ?? props.LABEL_LON ?? props.label_x ?? null
      const labelLat = props.LABEL_Y ?? props.LABEL_LAT ?? props.label_y ?? null

      let center = null

      if (Number.isFinite(labelLat) && Number.isFinite(labelLng)) {
        center = [labelLat, labelLng]
      }

      if (!center && layer?.getCenter) {
        const c = layer.getCenter()
        if (c) center = [c.lat, c.lng]
      }

      if (!center) {
        const latlngs = layer?.getLatLngs ? layer.getLatLngs() : null
        const polygons = latlngs ? this.normalizeLayerPolygons(latlngs) : []

        let best = null

        polygons.forEach((rings) => {
          const outerRing = rings?.[0]
          const stats = this.computeRingAreaAndCentroid(outerRing)
          if (!stats?.centroid) return
          if (!best || (stats.area ?? 0) > (best.area ?? 0)) {
            best = stats
          }
        })

        center = best?.centroid || null
      }

      if (!center && layer?.getBounds) {
        const c = layer.getBounds().getCenter()
        center = [c.lat, c.lng]
      }

      if (center) {
        this.countryMainCenterByISO2[iso2] = center
      }

      return center || null
    },

    // Map absolute flow (MW) to a 1..8 px stroke width (tweak as you like)
    flowStrokeWidth(mwAbs) {
      const max = Math.max(this.maxFlowAbsMW || 1, 1)
      const t = Math.min(mwAbs / max, 1)
      return 1 + Math.round(7 * Math.sqrt(t)) // sqrt for visual balance
    },

    // Color by direction (A->B is positive)
    flowColor(mw) {
      if (!Number.isFinite(mw)) return '#999'
      if (mw >  0) return '#3fb950' // export from A to B
      if (mw <  0) return '#e5534b' // export from B to A (i.e., A imports)
      return '#9aa0a6'
    },
    // Build a tiny arrowhead polygon near the line end
    makeArrowHead(pStart, pEnd, sizeMeters = 25000) {
      // Convert lat/lng to Leaflet points at current zoom for simple math
      if (!this.map) return null
      const map = this.map
      const s = map.latLngToLayerPoint(pStart)
      const e = map.latLngToLayerPoint(pEnd)
      const v = e.subtract(s)
      const len = Math.max(v.distanceTo({ x:0, y:0 }), 1)
      const unit = v.multiplyBy(1 / len)

      // place arrow at 75% along the line
      const tip = s.add(unit.multiplyBy(len * 0.75))
      const perp = L.point(-unit.y, unit.x) // 90° rotated

      // Convert size in meters to pixels (rough) using current scale
      const metersPerPixel = (40075017 * Math.cos((pEnd.lat*Math.PI)/180)) / Math.pow(2, this.map.getZoom()+8)
      const px = Math.max(6, Math.min(14, sizeMeters / Math.max(metersPerPixel, 1)))

      const left  = tip.add(perp.multiplyBy(px * 0.6)).subtract(unit.multiplyBy(px))
      const right = tip.subtract(perp.multiplyBy(px * 0.6)).subtract(unit.multiplyBy(px))

      const toLatLng = (pt) => map.layerPointToLatLng(pt)
      return [ toLatLng(left), toLatLng(tip), toLatLng(right) ]
    },
    async redrawFlowsWhenReady() {
  // Wait up to ~2s for layers to attach
  const needs = new Set(this.flowEdges.flat()) // ISO2 involved in flows
  const have = () => [...needs].every(iso => this.layerByISO2[iso])
  const start = performance.now()
  while (!have() && performance.now() - start < 2000) {
    await new Promise(r => setTimeout(r, 50))
  }

},

    closeAllSeparateModals() {
      // Destroy charts to avoid leaks
      this.separateModals.forEach(m => {
        if (m.chart) m.chart.destroy()
      })
      // Clear the arrays and state maps
      this.separateModals = []
      this.separateModalDragState = {}
      this.separateModalResizeState = {}
    },


    onSliderPointerDown() {
      this.isUserScrubbing = true;
      this.beginMotion();
    },
    onSliderPointerUp() {
      this.isUserScrubbing = false;
      this.endMotionSoon();  // hide a moment after user stops
    },
    onSliderChange() {
        this.beginMotion();        // show labels while scrubbing/playing
        this.updateDeltaTooltips();
        this.endMotionSoon(400);   // hide shortly after idle
      // const slider = this.$el.querySelector('.enhanced-time-slider');
      // if (slider) {
      //   slider.classList.add('transitioning');
      //   setTimeout(() => slider.classList.remove('transitioning'), 200);
      // }
      // this.beginMotion();       // keep visible while scrubbing
      // this.updateDeltaTooltips();
      // this.endMotionSoon(400);  // refresh the idle timer on each tick
    },
    onPctToggle() {
      // If change-tooltips are currently visible, refresh their content right away
      if (this.showChangeTooltips) {
        this.updateDeltaTooltips();
      }
    },

    updateDeltaTooltips() {
      if (this.heatmapType !== 'prices' || !this.showChangeTooltips || this.currentTimeIndex <= 0) {
        this.hideAllDeltaTooltips();
        return;
      }

      const unit = ''; // keep as-is if you don't want units in the bubble
      for (const iso2 in this.layerByISO2) {
        const lyr = this.layerByISO2[iso2];
        if (!lyr) continue;
        const ch = this.getPriceDelta(iso2);
        if (!ch || !Number.isFinite(ch.delta)) {
          if (lyr.closeTooltip) lyr.closeTooltip();
          continue;
        }

        const d = ch.delta;
        const arrow = d > 0 ? '↑' : (d < 0 ? '↓' : '→');
        const sign = d > 0 ? '+' : '';

        // 👇 ONLY add % when the checkbox is checked
        const pctStr = (this.showPctInTooltip && Number.isFinite(ch.pct))
          ? ` (${sign}${ch.pct.toFixed(1)}%)`
          : '';

        const text = `${arrow} ${sign}${d.toFixed(2)} ${unit}${pctStr}`;

        if (lyr.getTooltip && lyr.getTooltip()) {
          lyr.getTooltip().setContent(text);
        } else if (lyr.bindTooltip) {
          lyr.bindTooltip(text, { permanent: true, direction: 'center', className: 'delta-tooltip' }).openTooltip();
        }
      }
    },

    hideAllDeltaTooltips() {
      for (const iso2 in this.layerByISO2) {
        const lyr = this.layerByISO2[iso2];
        if (lyr?.closeTooltip) lyr.closeTooltip();
      }
    },
    beginMotion() {
      this.showChangeTooltips = true;
      if (this.deltaHideTimer) { clearTimeout(this.deltaHideTimer); this.deltaHideTimer = null; }
      this.updateDeltaTooltips();
    },
    endMotionSoon(delayMs = 500) {
      if (this.deltaHideTimer) clearTimeout(this.deltaHideTimer);
      this.deltaHideTimer = setTimeout(() => {
        if (!this.isPlaying && !this.isUserScrubbing) {
          this.showChangeTooltips = false;
          this.hideAllDeltaTooltips();
        }
      }, delayMs);
    },


    getPriceDelta(iso2) {
      if (this.heatmapType !== 'prices' || !this.hasTimeData) return null;

      const t = this.currentTimeIndex;
      if (t <= 0) return null;

      const tsCur  = Number(this.availableTimestamps[t]);
      const tsPrev = Number(this.availableTimestamps[t - 1]);

      const cur  = this.historicalPriceData?.[iso2]?.[tsCur];
      const prev = this.historicalPriceData?.[iso2]?.[tsPrev];

      if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;

      const delta = cur - prev;
      const pct = prev !== 0 ? (delta / prev) * 100 : null;

      return { delta, pct };
    },

    updateModalDefaultsFromViewport() {
      const responsiveSize = calculateResponsiveModalSize()
      this.modalDefaults.width = responsiveSize.width
      this.modalDefaults.height = responsiveSize.height
    },

    updateResponsiveZoom() {
      if (typeof window === 'undefined') return

      const isMobileViewport = window.innerWidth < MODAL_MOBILE_BREAKPOINT
      const minZoom = this.mapOptions?.minZoom ?? 0
      const mobileZoom = Math.max(minZoom, this.defaultZoom - this.mobileZoomOffset)
      const targetZoom = isMobileViewport ? mobileZoom : this.defaultZoom

      if (this.zoom !== targetZoom) {
        this.zoom = targetZoom

        if (this.map) {
          this.map.setZoom(targetZoom)
        }
      }
    },

    getResponsiveModalDefaults(modalType = null) {
      const responsiveSize = calculateResponsiveModalSize()
      this.modalDefaults.width = responsiveSize.width
      this.modalDefaults.height = responsiveSize.height

      const baseDefaults = {
        ...this.modalDefaults,
        ...responsiveSize,
      }

      return baseDefaults
    },

    getModalIconSymbol(modalType) {
      const icons = {
        powerflow: '⚡',
        netflows: '🌐',
        generation: '🌞',
        capacity: '📊'
      }

      return icons[modalType] || '📈'
    },

    getModalIconLabel(modalType) {
      const labels = {
        powerflow: 'Power flow',
        netflows: 'Net flows',
        generation: 'Generation',
        capacity: 'Capacity'
      }

      return labels[modalType] || 'Chart'
    },

    getModalSparkIcons(modalType) {
      if (modalType === 'powerflow') return ['⚡', '🔀', '⚡']
      if (modalType === 'netflows') return ['🌐', '↔️', '🛰️']
      if (modalType === 'generation') return ['🌤️', '📈', '🌿']
      if (modalType === 'capacity') return ['🏭', '📊', '📈']
      return ['📈', '📊', '✨']
    },

    toggleSeparateModalView(modalId) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal) return

      if (modal.thumbnail) {
        const expandedSize = this.getResponsiveModalDefaults(modal.type)
        modal.size = { ...expandedSize }
        modal.lastExpandedSize = expandedSize
        modal.thumbnail = false
      } else {
        const thumbnailSize = this.getThumbnailDefaults()
        modal.size = { ...thumbnailSize }
        modal.thumbnail = true
      }

      modal.userModified = false
      this.repositionSeparateModals()
      this.queueModalChartResize(modalId)
    },

    createSeparateModal(country, type, title) {
      // Check if modal for this country and type already exists
      const existingModal = this.separateModals.find(
        m => m.country === country && m.type === type
      )
      if (existingModal) {
        existingModal.visible = true
        return existingModal.id
      }

      const modalId = this.separateModalIdCounter++
      const thumbnailSize = this.getThumbnailDefaults()
      const expandedSize = this.getResponsiveModalDefaults(type)
      const useThumbnailMode = this.shouldUseThumbnailMode()
      const modalSize = useThumbnailMode ? thumbnailSize : expandedSize
      const modalWidth = modalSize.width
      const modalHeight = modalSize.height

      // Determine 2×2 grid slot (desktop only)
      const visibleModals = this.separateModals.filter(m => m.visible)
      const slotIndex = visibleModals.length
      const { x, y } = this.isMobileViewport
        ? { x: 0, y: 0 }
        : this._gridPosition(slotIndex, modalWidth, modalHeight)

      const modal = {
        id: modalId,
        country,
        type,
        title,
        visible: true,
        loading: true,
        error: null,
        chart: null,
        data: null,
        forecastData: null,
        meta: null,
        position: { x, y },
        size: { width: modalWidth, height: modalHeight },
        lastExpandedSize: expandedSize,
        thumbnail: useThumbnailMode,
        userModified: false
      }

      const desktopLayout = this.getDesktopLayoutPosition(modal, modal.size)
      if (!this.isMobileViewport && desktopLayout) {
        modal.position = desktopLayout.position
        modal.size = desktopLayout.size
      }

      if (this.isMobileViewport) {
        modal.thumbnail = false
        modal.size = { ...expandedSize }
      }

      this.separateModals.push(modal)

      // Initialize drag/resize state
      this.separateModalDragState[modalId] = {
        isDragging: false,
        startX: 0,
        startY: 0,
        startPosX: 0,
        startPosY: 0
      }
      this.separateModalResizeState[modalId] = {
        isResizing: false,
        direction: null,
        startX: 0,
        startY: 0,
        startWidth: 0,
        startHeight: 0
      }

      this.loadSeparateModalData(modalId, country, type)
      return modalId
    },

    scrollToModal(modalId) {
      if (!this.isMobileViewport || typeof window === 'undefined') return

      this.$nextTick(() => {
        const modalEl = document.getElementById(`separate-modal-${modalId}`)
        if (!modalEl) return

        const rect = modalEl.getBoundingClientRect()
        const scrollTarget = window.scrollY + rect.top - 18

        window.scrollTo({
          top: Math.max(scrollTarget, 0),
          behavior: 'smooth'
        })
      })
    },

    repositionSeparateModals() {
      if (this.isMobileViewport) return

      // Keep the 2×2 grid when auto-arranging (e.g. on resize),
      // but don't move modals the user already dragged/resized.
      const visible = this.separateModals.filter(m => m.visible)
      let gridIndex = 0

      visible.forEach(modal => {
        if (modal.userModified) return

        const baseSize = modal.thumbnail
          ? this.getThumbnailDefaults()
          : this.getResponsiveModalDefaults(modal.type)

        const desktopLayout = this.getDesktopLayoutPosition(modal, baseSize)
        if (desktopLayout) {
          modal.position = desktopLayout.position
          modal.size = desktopLayout.size
          return
        }

        const { x, y } = this._gridPosition(gridIndex, baseSize.width, baseSize.height)
        modal.position.x = x
        modal.position.y = y
        modal.size.width = baseSize.width
        modal.size.height = baseSize.height
        gridIndex += 1
      })
    },

    syncSeparateModalModes() {
      const shouldUseThumbnails = this.shouldUseThumbnailMode()

      this.separateModals.forEach(modal => {
        if (modal.userModified) return

        if (shouldUseThumbnails && !modal.thumbnail) {
          const thumbnailSize = this.getThumbnailDefaults()
          modal.thumbnail = true
          modal.size = { ...thumbnailSize }
        }

        if (!shouldUseThumbnails && modal.thumbnail) {
          const expandedSize = modal.lastExpandedSize || this.getResponsiveModalDefaults(modal.type)
          modal.thumbnail = false
          modal.size = { ...expandedSize }
        }
      })
    },


    closeSeparateModal(modalId) {
      const modalIndex = this.separateModals.findIndex(modal => modal.id === modalId)
      if (modalIndex !== -1) {
        const modal = this.separateModals[modalIndex]
        if (modal.chart) {
          modal.chart.destroy()
        }
        if (this.modalChartResizeRafs[modalId]) {
          cancelAnimationFrame(this.modalChartResizeRafs[modalId])
          delete this.modalChartResizeRafs[modalId]
        }
        this.separateModals.splice(modalIndex, 1)

        // Clean up drag/resize state
        delete this.separateModalDragState[modalId]
        delete this.separateModalResizeState[modalId]
        
        // Reposition remaining modals to close gaps
        this.$nextTick(() => {
          this.repositionSeparateModals()
        })
      }
    },


    // Start dragging separate modal
    startSeparateModalDrag(event, modalId) {
      if (this.isMobileViewport) return

      if (event.target.closest('.separate-modal-close') ||
          event.target.closest('.separate-modal-resize-handle')) {
        return
      }

      const dragState = this.separateModalDragState[modalId]
      const modal = this.separateModals.find(m => m.id === modalId)

      if (!dragState || !modal) return

      dragState.isDragging = true
      dragState.startX = event.clientX
      dragState.startY = event.clientY
      dragState.startPosX = modal.position.x
      dragState.startPosY = modal.position.y

      dragState.moveHandler = (e) => this.onSeparateModalDrag(e, modalId)
      dragState.upHandler = (e) => this.stopSeparateModalDrag(modalId, e)

      document.addEventListener('pointermove', dragState.moveHandler, { passive: false })
      document.addEventListener('pointerup', dragState.upHandler, { passive: false })
    },

    // Handle separate modal dragging
    onSeparateModalDrag(event, modalId) {
      const dragState = this.separateModalDragState[modalId]
      const modal = this.separateModals.find(m => m.id === modalId)

      if (!dragState?.isDragging || !modal) return

      if (event.cancelable) {
        event.preventDefault()
      }

      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      
      const newX = dragState.startPosX + deltaX
      const newY = dragState.startPosY + deltaY
      
      // Snap to right edge when close
      const snapDistance = 50
      const rightEdgeX = window.innerWidth - modal.size.width - 20
      
      let finalX = newX
      if (Math.abs(newX - rightEdgeX) < snapDistance) {
        finalX = rightEdgeX // Snap to right edge
      }
      
      // Constrain to viewport
      const maxX = window.innerWidth - modal.size.width
      const maxY = window.innerHeight - modal.size.height
      
      modal.position.x = Math.max(0, Math.min(finalX, maxX))
      modal.position.y = Math.max(0, Math.min(newY, maxY))
    },

    // Stop dragging separate modal
    stopSeparateModalDrag(modalId, event) {
      const dragState = this.separateModalDragState[modalId]
      if (!dragState) return

      dragState.isDragging = false
      if (dragState.moveHandler) {
        document.removeEventListener('pointermove', dragState.moveHandler)
        dragState.moveHandler = null
      }
      if (dragState.upHandler) {
        document.removeEventListener('pointerup', dragState.upHandler)
        dragState.upHandler = null
      }
      const modal = this.separateModals.find(m => m.id === modalId)
      if (modal) modal.userModified = true
      if (event?.type === 'pointerup') {
        event.stopPropagation()
      }
    },
    // Start resizing separate modal
    startSeparateModalResize(event, modalId, direction) {
      if (this.isMobileViewport) return

      const resizeState = this.separateModalResizeState[modalId]
      const modal = this.separateModals.find(m => m.id === modalId)
      
      if (!resizeState || !modal) return

      resizeState.isResizing = true
      resizeState.direction = direction
      resizeState.startX = event.clientX
      resizeState.startY = event.clientY
      resizeState.startWidth = modal.size.width
      resizeState.startHeight = modal.size.height

      resizeState.moveHandler = (e) => this.onSeparateModalResize(e, modalId)
      resizeState.upHandler = (e) => this.stopSeparateModalResize(modalId, e)

      document.addEventListener('pointermove', resizeState.moveHandler, { passive: false })
      document.addEventListener('pointerup', resizeState.upHandler, { passive: false })
      event.stopPropagation()
    },

    // Handle separate modal resizing
    onSeparateModalResize(event, modalId) {
      const resizeState = this.separateModalResizeState[modalId]
      const modal = this.separateModals.find(m => m.id === modalId)

      if (!resizeState?.isResizing || !modal) return

      if (event.cancelable) {
        event.preventDefault()
      }

      const deltaX = event.clientX - resizeState.startX
      const deltaY = event.clientY - resizeState.startY

      let newWidth = resizeState.startWidth
      let newHeight = resizeState.startHeight

      if (resizeState.direction === 'right' || resizeState.direction === 'corner') {
        newWidth = resizeState.startWidth + deltaX
      }

      if (resizeState.direction === 'bottom' || resizeState.direction === 'corner') {
        newHeight = resizeState.startHeight + deltaY
      }

      const minWidth = 180
      const minHeight = 120

      const maxWidth = Math.max(minWidth, window.innerWidth - modal.position.x - 12)
      const maxHeight = Math.max(minHeight, window.innerHeight - modal.position.y - 12)

      newWidth = Math.min(Math.max(newWidth, minWidth), maxWidth)
      newHeight = Math.min(Math.max(newHeight, minHeight), maxHeight)

      // Apply the constrained dimensions
      modal.size.width = newWidth
      modal.size.height = newHeight
      modal.thumbnail = false
      modal.lastExpandedSize = { width: newWidth, height: newHeight }

      this.queueModalChartResize(modalId)
    },

    // Stop resizing separate modal
    stopSeparateModalResize(modalId, event) {
      const resizeState = this.separateModalResizeState[modalId]
      if (!resizeState) return

      resizeState.isResizing = false
      resizeState.direction = null
      if (resizeState.moveHandler) {
        document.removeEventListener('pointermove', resizeState.moveHandler)
        resizeState.moveHandler = null
      }
      if (resizeState.upHandler) {
        document.removeEventListener('pointerup', resizeState.upHandler)
        resizeState.upHandler = null
      }
      const modal = this.separateModals.find(m => m.id === modalId)
      if (modal) modal.userModified = true
      if (event?.type === 'pointerup') {
        event.stopPropagation()
      }
      this.queueModalChartResize(modalId)
    },

    handleThumbnailTap(modalId, event) {
      if (event?.target.closest('.separate-modal-close')) return

      const dragState = this.separateModalDragState[modalId]
      const resizeState = this.separateModalResizeState[modalId]
      if (dragState?.isDragging || resizeState?.isResizing) return

      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal || !modal.thumbnail) return

      this.toggleSeparateModalView(modalId)
    },

    queueModalChartResize(modalId) {
      if (!this.modalChartResizeRafs) {
        this.modalChartResizeRafs = {}
      }
      if (this.modalChartResizeRafs[modalId]) {
        cancelAnimationFrame(this.modalChartResizeRafs[modalId])
      }

      this.$nextTick(() => {
        this.modalChartResizeRafs[modalId] = requestAnimationFrame(() => {
          const modal = this.separateModals.find(m => m.id === modalId)
          if (!modal?.chart) {
            delete this.modalChartResizeRafs[modalId]
            return
          }
          this.resizeSeparateModalChart(modalId)
          modal.chart.update('none')
          delete this.modalChartResizeRafs[modalId]
        })
      })
    },



    async loadSeparateModalData(modalId, country, type) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal) return

      try {
        modal.loading = true
        modal.error = null
        modal.meta = null
        modal.forecastData = null

        let data
        if (type === 'capacity') {
          // Use the existing capacity fetch method
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')
          
          const url = `https://api.visualize.energy/api/capacity/latest/?country=${encodeURIComponent(iso2)}`
          const { data: response } = await axios.get(url)
          data = response.items || []
        } else if (type === 'generation') {
          // Use existing generation method
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')

          const end = new Date()
          const start = new Date(end.getTime() - 48 * 60 * 60 * 1000)
          const startDate = encodeURIComponent(start.toISOString())
          const endDate = encodeURIComponent(end.toISOString())

          const url = `https://api.visualize.energy/api/generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`
          console.log(url)
          const [rangeResponse, forecastItems] = await Promise.all([
            axios.get(url),
            this.fetchGenerationForecastRange(iso2)
          ])
          const response = rangeResponse?.data || {}
          data = response.items || []
          modal.forecastData = forecastItems
        }
        else if (type === 'prices') {
          // New: prices modal (last 48h). Reuse your historical price fetcher.
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')

          // Returns object like { [hourTs]: price, ... }
          const timeData = await this.fetchHistoricalPricesForCountry(iso2)
          if (!timeData || Object.keys(timeData).length === 0) {
            throw new Error('No price data available')
          }

          // Normalize to sorted array for Chart.js time series
          // [{ ts, price }, ...] ascending by ts
          data = Object.entries(timeData)
            .map(([ts, price]) => ({ ts: Number(ts), price }))
            .sort((a, b) => a.ts - b.ts)
        }else if (type === 'powerflow') {
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')
          data = this.buildPowerFlowForCountry(iso2, Number(this.currentTimestamp))
        }else if (type === 'netflows') {
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')
          const series = this.buildCountryNetFlowsSeries(iso2)
          if (!series.length) {
            throw new Error('No cross-border flow data available')
          }
          data = series
          const latestPoint = series[series.length - 1] || {}
          const peakExport = series.reduce((max, point) => Math.max(max, point.exports || 0), 0)
          const peakImport = series.reduce((max, point) => Math.max(max, point.imports || 0), 0)
          modal.meta = {
            latestNet: latestPoint.net ?? 0,
            latestTimestamp: latestPoint.ts
              ? new Date(latestPoint.ts).toLocaleString()
              : '',
            peakExport,
            peakImport
          }
        }else {
          throw new Error(`Unknown modal type: ${type}`)
        }

        modal.data = data
        modal.loading = false

        // Wait for DOM update then create chart
        await nextTick()
        if (type !== 'powerflow') {
          this.createSeparateModalChart(modalId)
        }

      } catch (error) {
        console.error(`Error loading ${type} data for ${country}:`, error)
        modal.loading = false
        modal.error = error.message || 'Failed to load data'
      }
    },

    // NEW: Helper method to get ISO2 by country name
    getCountryISO2ByName(countryName) {
      if (!this.countriesGeoJson) return null
      
      const feature = this.countriesGeoJson.features.find(f => {
        const name = this.getCountryName(f)
        return name === countryName
      })
      
      return feature ? this.getCountryISO2(feature) : null
    },

    async retrySeparateModalData(modalId) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (modal) {
        await this.loadSeparateModalData(modalId, modal.country, modal.type)
      }
    },

    async createSeparateModalChart(modalId) {

      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal || !modal.data) return

      const canvas = document.getElementById('separate-chart-' + modalId)
      if (!canvas) return

      const ctx = canvas.getContext('2d')

      if (modal.chart) {
        modal.chart.destroy()
      }

      if (modal.type === 'capacity') {

        const items = [...modal.data].sort((a, b) =>
          (b.installed_capacity_mw || 0) - (a.installed_capacity_mw || 0)
        )

        const labels = items.map(i => i.psr_name)
        const capacityValues = items.map(i => Number(i.installed_capacity_mw) || 0)

        // Get ISO2 from modal's country name instead of selectedFeature
        const iso2 = this.getCountryISO2ByName(modal.country)

        const generationByTech = await this.getGenerationByTechnology(iso2)
        const generationMapped = items.map(item => {
          const name = item.psr_name || item.psr_type || 'Unknown'
          const normalized = this.normalizeTechnologyKey(name)
          const value = generationByTech[name]
          if (typeof value === 'number') return value
          if (normalized && typeof generationByTech[normalized] === 'number') {
            return generationByTech[normalized]
          }
          return 0
        })

        const remainingCapacity = capacityValues.map((cap, i) => {
          const installed = cap || 0
          const gen = generationMapped[i] || 0
          return Math.max(0, installed - gen)
        })

        const totalCapacity = capacityValues.reduce((sum, value) => sum + (value || 0), 0)
        const totalGeneration = generationMapped.reduce((sum, value) => sum + (value || 0), 0)
        const utilization = totalCapacity > 0 ? (totalGeneration / totalCapacity) * 100 : 0

        const capacityShares = capacityValues.map(value => totalCapacity > 0 ? (value / totalCapacity) * 100 : 0)
        const utilizationRates = capacityValues.map((cap, index) => cap > 0 ? (generationMapped[index] / cap) * 100 : 0)

        const defaultPalette = { border: '#64748b', fill: 'rgba(100,116,139,0.25)' }
        const palettes = items.map(item => this.psrColors[item.psr_name] || defaultPalette)
        const generationBackgroundColors = palettes.map(p => this.applyAlpha(p.border || defaultPalette.border, 0.85))
        const generationBorderColors = palettes.map(p => p.border || defaultPalette.border)
        const capacityBackgroundColors = palettes.map(p => this.applyAlpha(p.border || defaultPalette.border, 0.18))
        const capacityBorderColors = palettes.map(p => this.applyAlpha(p.border || defaultPalette.border, 0.35))

        const legendItems = items.map((item, index) => ({
          name: item.psr_name,
          capacity: capacityValues[index] || 0,
          generation: generationMapped[index] || 0,
          remaining: remainingCapacity[index] || 0,
          capacityShare: capacityShares[index] || 0,
          generationShare: totalGeneration > 0 ? (generationMapped[index] / totalGeneration) * 100 : 0,
          utilization: utilizationRates[index] || 0,
          color: palettes[index].border || defaultPalette.border
        }))

        const topTechnologies = legendItems
          .filter(item => item.capacity > 0)
          .slice(0, 3)

        const lastUpdatedTs = items.reduce((latest, item) => {
          const candidate = item.datetime_utc || item.updated_at || item.modified || item.timestamp || null
          const parsed = candidate ? Date.parse(candidate) : NaN
          if (Number.isFinite(parsed)) {
            return Math.max(latest, parsed)
          }
          return latest
        }, -Infinity)

        modal.meta = {
          totalCapacity,
          totalGeneration,
          utilization,
          topTechnologies,
          legendItems,
          updatedLabel: Number.isFinite(lastUpdatedTs) && lastUpdatedTs > 0
            ? `Last updated ${new Date(lastUpdatedTs).toLocaleString()}`
            : ''
        }

        const formatMwValue = value => this.formatMegawatts(value)
        const formatPercentValue = value => this.formatPercent(value)

        const chartContainer = canvas.parentElement
        if (chartContainer) {
          const recommendedHeight = Math.max(220, Math.min(520, items.length * 40))
          chartContainer.style.setProperty('--capacity-chart-min-height', `${recommendedHeight}px`)
          chartContainer.style.removeProperty('--capacity-chart-height')
          chartContainer.style.removeProperty('height')
        }

        modal.chart = markRaw(new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Current Generation',
                data: generationMapped,
                backgroundColor: generationBackgroundColors,
                borderColor: generationBorderColors,
                borderWidth: 1.5,
                stack: 'capacity',
                borderRadius: {
                  topLeft: 0,
                  bottomLeft: 0,
                  topRight: 0,
                  bottomRight: 0
                },
                borderSkipped: false
              },
              {
                label: 'Capacity',
                data: remainingCapacity,
                backgroundColor: capacityBackgroundColors,
                borderColor: capacityBorderColors,
                borderWidth: 1,
                stack: 'capacity',
                borderRadius: {
                  topLeft: 0,
                  bottomLeft: 0,
                  topRight: 12,
                  bottomRight: 12
                },
                borderSkipped: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            layout: {
              padding: { top: 8, right: 12, bottom: 0, left: 4 }
            },
            scales: {
              x: {
                beginAtZero: true,
                stacked: true,
                grid: {
                  color: 'rgba(148, 163, 184, 0.2)',
                  drawBorder: false,
                  lineWidth: 1
                },
                ticks: {
                  color: '#e2e8f0',
                  callback: value => formatMwValue(value)
                },
                title: {
                  display: true,
                  text: 'Megawatts (MW)',
                  color: '#f8fafc',
                  font: { size: 12, weight: 600 }
                }
              },
              y: {
                stacked: true,
                grid: {
                  display: false,
                  drawBorder: false
                },
                ticks: {
                  color: '#e2e8f0',
                  autoSkip: false,
                  maxRotation: 0,
                  minRotation: 0,
                  font: { size: 11 }
                }
              }
            },
            plugins: {
              legend: {
                position: 'top',
                labels: {
                  color: '#f8fafc',
                  usePointStyle: true,
                  padding: 18,
                  font: { size: 11, weight: 500 }
                }
              },
              tooltip: {
                padding: 12,
                mode: 'nearest',
                intersect: true,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1,
                callbacks: {
                  label: context => {
                    const index = context.dataIndex
                    if (context.datasetIndex === 0) {
                      const value = context.parsed.x || 0
                      const utilisation = utilizationRates[index] || 0
                      return `Generation: ${formatMwValue(value)} MW (${formatPercentValue(utilisation)})`
                    }
                    const spare = context.parsed.x || 0
                    const capacity = capacityValues[index] || 0
                    const idleShare = capacity > 0 ? (spare / capacity) * 100 : 0
                    return `Capacity: ${formatMwValue(spare)} MW (${formatPercentValue(idleShare)})`
                  },
                  footer: tooltipItems => {
                    if (!tooltipItems.length) return ''
                    const index = tooltipItems[0].dataIndex
                    const installed = capacityValues[index] || 0
                    const share = capacityShares[index] || 0
                    return `Installed: ${formatMwValue(installed)} MW (${formatPercentValue(share)})`
                  }
                }
              }
            },
            interaction: { mode: 'nearest', axis: 'y', intersect: true }
          }
        }))

      } else if (modal.type === 'generation') {

          // Build a stacked area chart for generation by technology
          const items = Array.isArray(modal.data)
            ? JSON.parse(JSON.stringify(modal.data))
            : [];

          // Extract unique sorted timestamps
          const timestamps = Array.from(
            new Set(items.map(i => Date.parse(i.datetime_utc)))
          ).sort((a, b) => a - b);

          const timeline = this.getAnimationTimeline();
          let xMin = timeline.length ? timeline[0] : undefined;
          let xMax = timeline.length ? timeline[timeline.length - 1] : undefined;

          const latestTimestamp = timestamps[timestamps.length - 1] || null;
          const forecastSeries = this.prepareForecastSeries(modal.forecastData);

          if (forecastSeries.length) {
            const firstForecast = forecastSeries[0]?.x;
            const lastForecast = forecastSeries[forecastSeries.length - 1]?.x;
            if (Number.isFinite(firstForecast) && (xMin === undefined || firstForecast < xMin)) {
              xMin = firstForecast;
            }
            if (Number.isFinite(lastForecast) && (xMax === undefined || lastForecast > xMax)) {
              xMax = lastForecast;
            }
          }

          // Group generation MW by technology and timestamp
          const byTech = new Map();
          items.forEach(i => {
            const tech = i.psr_name || i.psr_type || 'Unknown';
            const time = Date.parse(i.datetime_utc);
            if (!Number.isFinite(time)) return;
            if (!byTech.has(tech)) byTech.set(tech, new Map());
            byTech.get(tech).set(time, Number(i.generation_mw) || 0);
          });

          const techSummaries = [];

          // Assemble datasets with proper x,y format for time series
          const datasets = [];
          byTech.forEach((series, tech) => {
            const color = this.psrColors[tech] || { border: 'rgba(0,0,0,0.8)', fill: 'rgba(0,0,0,0.4)' };
            const data = timestamps.map(ts => ({
              x: ts,
              y: series.get(ts) || 0
            }));
            const latestValue = latestTimestamp ? (series.get(latestTimestamp) || 0) : 0;
            techSummaries.push({
              name: tech,
              value: latestValue,
              color: color.border
            });
            datasets.push({
              label: tech,
              data,
              borderColor: color.border,
              backgroundColor: color.fill,
              pointRadius: 0,
              borderWidth: 1,
              fill: true,
              stack: 'gen',
              tension: 0.25
            });
          });

          if (forecastSeries.length) {
            datasets.push({
              label: "Today's forecast",
              data: forecastSeries,
              type: 'line',
              borderColor: '#facc15',
              backgroundColor: 'rgba(250, 204, 21, 0.18)',
              borderDash: [6, 3],
              pointRadius: 0,
              borderWidth: 2,
              fill: false,
              spanGaps: true,
              tension: 0.25,
              yAxisID: 'y',
              order: 0
            });
          }

          const totalGeneration = techSummaries.reduce((sum, entry) => sum + (entry.value || 0), 0);
          const sortedSummaries = techSummaries
            .slice()
            .sort((a, b) => (b.value || 0) - (a.value || 0));

          const legendItems = sortedSummaries.map(entry => ({
            name: entry.name,
            value: entry.value || 0,
            share: totalGeneration > 0 ? (entry.value / totalGeneration) * 100 : 0,
            color: entry.color
          }));

          const forecastSummary = this.summarizeTodayForecast(forecastSeries);

          modal.meta = {
            totalGeneration,
            topTechnologies: legendItems.slice(0, 3),
            legendItems,
            updatedLabel: latestTimestamp
              ? `Latest reading: ${new Date(latestTimestamp).toLocaleString()}`
              : '',
            todayForecastTotal: forecastSummary ? forecastSummary.total : null,
            todayForecastLabel: forecastSummary?.label || ''
          };

          const cfg = {
            type: 'line',
            data: { datasets },
            plugins: [generationCursorPlugin],
            options: {
              responsive: true,
              maintainAspectRatio: false,
              normalized: true,
              parsing: { xAxisKey: 'x', yAxisKey: 'y' },
              scales: {
                x: {
                  type: 'time',
                  time: { unit: 'hour', tooltipFormat: 'HH:mm' },
                  min: xMin,
                  max: xMax,
                  grid: {
                    color: 'rgba(148, 163, 184, 0.14)',
                    drawBorder: false
                  },
                  ticks: {
                    color: '#cbd5f5'
                  }
                },
                y: {
                  stacked: true,
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'Generation (MW)',
                    color: '#f8fafc',
                    font: { size: 12, weight: 600 }
                  },
                  grid: {
                    color: 'rgba(148, 163, 184, 0.12)',
                    drawBorder: false
                  },
                  ticks: {
                    callback: v => Intl.NumberFormat().format(v),
                    color: '#cbd5f5'
                  }
                }
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  position: 'cursorLeft',
                  mode: 'index',
                  intersect: false,
                  backgroundColor: 'rgba(15, 23, 42, 0.92)',
                  titleColor: '#f8fafc',
                  bodyColor: '#e2e8f0',
                  borderColor: 'rgba(148, 163, 184, 0.35)',
                  borderWidth: 1,
                  xAlign: 'right',
                  caretPadding: 10
                },
                generationCursor: {
                  timestamp: this.getGenerationCursorTimestamp(),
                  color: '#fb923c',
                  lineWidth: 1.5,
                  dash: [5, 4]
                }
              },
              interaction: {
                mode: 'index',
                intersect: false
              }
            }
          };

          modal.chart = markRaw(new Chart(ctx, cfg));
          this.updateGenerationCursorLines();
      }
      else if (modal.type === 'prices') {
        // Expect modal.data as [{ ts, price }]
        const points = Array.isArray(modal.data) ? modal.data : []
        if (!points.length) return

        const data = points.map(p => ({ x: p.ts, y: Number(p.price) || 0 }))
        const cfg = {
          type: 'line',
          data: {
            datasets: [{
              label: 'Price (EUR/MWh)',
              data,
              borderColor: 'rgba(102,126,234,1)',
              backgroundColor: 'rgba(102,126,234,0.25)',
              pointRadius: 0,
              borderWidth: 2,
              fill: true,
              tension: 0.25
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
              x: {
                type: 'time',
                time: { unit: 'hour', tooltipFormat: 'dd/MM HH:mm' },
                grid: {
                  color: 'rgba(148, 163, 184, 0.14)',
                  drawBorder: false
                },
                ticks: {
                  color: '#cbd5f5'
                }
              },
              y: {
                beginAtZero: false,
                title: {
                  display: true,
                  text: 'EUR/MWh',
                  color: '#f8fafc',
                  font: { size: 12, weight: 600 }
                },
                grid: {
                  color: 'rgba(148, 163, 184, 0.12)',
                  drawBorder: false
                },
                ticks: {
                  callback: v => Intl.NumberFormat().format(v),
                  color: '#cbd5f5'
                }
              }
            },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  color: '#f8fafc'
                }
              },
              tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        }

        modal.chart = markRaw(new Chart(ctx, cfg))
      }
      else if (modal.type === 'netflows') {
        const series = Array.isArray(modal.data) ? modal.data : []
        if (!series.length) return

        const exportsData = series.map(point => ({ x: point.ts, y: point.exports || 0 }))
        const importsData = series.map(point => ({ x: point.ts, y: -(point.imports || 0) }))
        const netData = series.map(point => ({ x: point.ts, y: point.net || 0 }))

        const cfg = {
          type: 'bar',
          data: {
            datasets: [
              {
                label: 'Exports',
                data: exportsData,
                backgroundColor: 'rgba(34,197,94,0.75)',
                borderColor: 'rgba(34,197,94,1)',
                borderWidth: 1,
                stack: 'flows'
              },
              {
                label: 'Imports',
                data: importsData,
                backgroundColor: 'rgba(248,113,113,0.75)',
                borderColor: 'rgba(239,68,68,1)',
                borderWidth: 1,
                stack: 'flows'
              },
              {
                label: 'Net flow',
                data: netData,
                type: 'line',
                borderColor: '#facc15',
                backgroundColor: 'rgba(250,204,21,0.2)',
                pointRadius: 0,
                borderWidth: 2,
                fill: false,
                tension: 0.25,
                yAxisID: 'y'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
              x: {
                type: 'time',
                time: { unit: 'hour', tooltipFormat: 'dd/MM HH:mm' },
                grid: {
                  color: 'rgba(148, 163, 184, 0.14)',
                  drawBorder: false
                },
                ticks: { color: '#cbd5f5' }
              },
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'MW',
                  color: '#f8fafc',
                  font: { size: 12, weight: 600 }
                },
                grid: {
                  color: 'rgba(148, 163, 184, 0.12)',
                  drawBorder: false
                },
                ticks: {
                  callback: v => Intl.NumberFormat().format(v),
                  color: '#cbd5f5'
                }
              }
            },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: { color: '#f8fafc' }
              },
              tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1,
                callbacks: {
                  label(context) {
                    const label = context.dataset?.label || ''
                    const value = context.parsed.y || 0
                    const magnitude = Math.abs(value)
                    return `${label}: ${Intl.NumberFormat().format(magnitude)} MW`
                  }
                }
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        }

        modal.chart = markRaw(new Chart(ctx, cfg))
      }
      this.queueModalChartResize(modalId)
    },

    // Drag and resize methods
    startDrag(event) {
      if (event.target.closest('.panel-close')) return
      
      this.isDragging = true
      this.dragStartX = event.clientX - this.modalPosition.x
      this.dragStartY = event.clientY - this.modalPosition.y
      
      document.addEventListener('mousemove', this.onDrag)
      document.addEventListener('mouseup', this.stopDrag)
      
      event.preventDefault()
    },
    
    onDrag(event) {
      if (!this.isDragging) return
      
      const newX = event.clientX - this.dragStartX
      const newY = event.clientY - this.dragStartY
      
      // Constrain to viewport
      const maxX = window.innerWidth - this.modalSize.width
      const maxY = window.innerHeight - (this.modalSize.height || 600)
      
      this.modalPosition.x = Math.max(0, Math.min(newX, maxX))
      this.modalPosition.y = Math.max(0, Math.min(newY, maxY))
    },
    
    stopDrag() {
      this.isDragging = false
      document.removeEventListener('mousemove', this.onDrag)
      document.removeEventListener('mouseup', this.stopDrag)
    },
    
    startResize(event, direction) {
      this.isResizing = true
      this.resizeDirection = direction
      this.resizeStartX = event.clientX
      this.resizeStartY = event.clientY
      this.resizeStartWidth = this.modalSize.width
      this.resizeStartHeight = this.modalSize.height || this.$refs.modalPanel?.offsetHeight || 600
      
      document.addEventListener('mousemove', this.onResize)
      document.addEventListener('mouseup', this.stopResize)
      
      event.preventDefault()
      event.stopPropagation()
    },
    
    onResize(event) {
      if (!this.isResizing) return
      
      const deltaX = event.clientX - this.resizeStartX
      const deltaY = event.clientY - this.resizeStartY
      
      if (this.resizeDirection === 'right' || this.resizeDirection === 'corner') {
        this.modalSize.width = Math.max(400, Math.min(this.resizeStartWidth + deltaX, window.innerWidth - this.modalPosition.x))
      }
      
      if (this.resizeDirection === 'bottom' || this.resizeDirection === 'corner') {
        this.modalSize.height = Math.max(300, Math.min(this.resizeStartHeight + deltaY, window.innerHeight - this.modalPosition.y))
      }
    },
    
    stopResize() {
      this.isResizing = false
      this.resizeDirection = null
      document.removeEventListener('mousemove', this.onResize)
      document.removeEventListener('mouseup', this.stopResize)
    },

    // ADD THIS MISSING METHOD
    resizeSeparateModalChart(modalId) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal || !modal.chart) return

      const canvas = document.getElementById('separate-chart-' + modalId)
      if (!canvas) return

      if (modal.type === 'capacity' || modal.type === 'generation') {
        modal.chart.resize()
        return
      }

      // Update canvas container size
      const container = canvas.parentElement
      if (container) {
        container.style.width = '100%'
        container.style.height = '100%'
      }

      // Trigger Chart.js resize
      modal.chart.resize()
    },

    
    togglePlay() {
      if (this.isPlaying) {
        this.pauseAnimation()
      } else {
        this.startAnimation()
      }
    },
    
    startAnimation() {
      this.currentTimeIndex = 0;
      this.isPlaying = true;
      this.beginMotion();  // show labels while playing
      this.playInterval = setInterval(() => {
        if (this.currentTimeIndex >= this.maxTimeIndex) {
          this.pauseAnimation();
        } else {
          this.currentTimeIndex++;
          this.updateDeltaTooltips();
        }
      }, this.playSpeed);
    },
    pauseAnimation() {
      this.isPlaying = false;
      if (this.playInterval) { clearInterval(this.playInterval); this.playInterval = null; }
      this.endMotionSoon(); // hide shortly after pause
    },

    jumpToTick(tickIndex) {
      this.currentTimeIndex = tickIndex
      this.onSliderChange()
    },
    
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
    
    generateLast48HoursGenerationTimestamps() {
      const timestamps = []
      const now = new Date()
      const currentHourUTC = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        0,
        0,
        0
      )

      for (let i = 47; i >= 0; i--) {
        const timestamp = currentHourUTC - i * 60 * 60 * 1000
        timestamps.push(timestamp)
      }

      return timestamps
    },
    


    async fetchHistoricalPricesForCountry(iso2) {
      if (!this.priceSupported(iso2)) return null

      const cacheKey = `${iso2}_${this.getCurrentDateKey()}`
      const now = Date.now()
      
      if (this.priceCache.has(cacheKey) && 
          this.cacheTimestamp && 
          (now - this.cacheTimestamp) < this.cacheValidityMs) {
        return this.priceCache.get(cacheKey)
      }

      try {
        const now = new Date()
        const start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        
        const url = `https://api.visualize.energy/api/prices/range/?country=${encodeURIComponent(iso2)}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}`
        console.log("forCountry",url)
        const { data } = await axios.get(url, {
          timeout: 10000,
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
      
      this.availableTimestamps = this.generateLast48HoursTimestamps()
      this.currentTimeIndex = this.maxTimeIndex
      
      const supportedCountries = []
      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (iso2 && this.priceSupported(iso2, feature)) {
          supportedCountries.push(iso2)
        }
      }
      
      const chunkSize = 20
      const newHistoricalData = {}
      
      const chunks = []
      for (let i = 0; i < supportedCountries.length; i += chunkSize) {
        chunks.push(supportedCountries.slice(i, i + chunkSize))
      }
      console.log(chunks)
      const chunkPromises = chunks.map(async (chunk, index) => {
        try {
          const chunkData = await this.fetchBulkHistoricalPrices(chunk)
          return { success: true, data: chunkData, chunkIndex: index }
        } catch (error) {
          console.error(`Bulk call ${index + 1} failed:`, error)
          return { success: false, error, chunkIndex: index }
        }
      })
      
      const results = await Promise.allSettled(chunkPromises)
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          Object.assign(newHistoricalData, result.value.data)
        }
      })

      this.historicalPriceData = newHistoricalData
      this.updateColorScheme()
      if (this.showChangeTooltips) this.$nextTick(() => this.updateDeltaTooltips());
      this.$nextTick(() => this.updatePriceBadges())

    },

    async fetchBulkHistoricalPrices(countries) {
      if (countries.length === 0) return {}
      
      try {
        console.log("Called!")
        const now = new Date()
        const start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        
        const url = `https://api.visualize.energy/api/prices/bulk-range/?countries=${countries.join(',')}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}`
        console.log(url)
        const { data } = await axios.get(url, {
          timeout: 15000,
          signal: this.currentAbortController?.signal
        })
        
        const historicalData = {}
        
        if (data.data) {
          for (const [iso2, countryData] of Object.entries(data.data)) {
            if (countryData.items && Array.isArray(countryData.items)) {
              const timeData = {}
              
              for (const item of countryData.items) {
                const timestamp = new Date(item.datetime_utc).getTime()
                if (Number.isFinite(item.price)) {
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

    async fetchBulkHistoricalGeneration(countries) {
      if (countries.length === 0) return {}

      try {
        // last 48h window, aligned to how you build timestamps for prices
        const now = new Date()
        const start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
        // end is exclusive; your API accepts full ISO for end
        const endISO = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

        // Use your new bulk endpoint
        // Supports start/end (UTC) or period. We’ll send start/end for symmetry with prices.
        const url = `https://api.visualize.energy/api/generation/bulk-range/` +
                    `?countries=${countries.join(',')}` +
                    `&start=${start.toISOString()}` +
                    `&end=${endISO}`

        const { data } = await axios.get(url, {
          timeout: 15000,
          signal: this.currentAbortController?.signal
        })

        // data.data = { "AT": { items: [{ datetime_utc, psr_type, psr_name, generation_mw }, ...] }, ... }
        // We need TOTAL generation per timestamp (sum over technologies) for heatmap.
        const aggregatedByCountry = {}

        if (data?.data && typeof data.data === 'object') {
          for (const [iso2, countryData] of Object.entries(data.data)) {
            const byTs = Object.create(null)

            if (Array.isArray(countryData.items)) {
              for (const item of countryData.items) {
                const t = new Date(item.datetime_utc).getTime()
                if (!Number.isFinite(t)) continue
                const v = Number(item.generation_mw)
                if (!Number.isFinite(v)) continue

                // Hour-bin (just like prices)
                const hourTs = Math.floor(t / (60 * 60 * 1000)) * (60 * 60 * 1000)
                byTs[hourTs] = (byTs[hourTs] || 0) + v
              }
            }

            if (Object.keys(byTs).length > 0) {
              aggregatedByCountry[iso2] = byTs
            }
          }
        }

        return aggregatedByCountry
      } catch (error) {
        console.error(`Bulk generation request failed for ${countries.length} countries:`, error)
        throw error
      }
    },

    async fetchBulkGenerationForecast(countries) {
      if (countries.length === 0) return {}

      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)

        const url = `https://api.visualize.energy/api/generation-forecast/bulk-range/` +
                    `?countries=${countries.join(',')}` +
                    `&start=${start.toISOString()}` +
                    `&end=${end.toISOString()}`

        const { data } = await axios.get(url, {
          timeout: 15000,
          signal: this.currentAbortController?.signal
        })

        const aggregatedByCountry = {}
        const HOUR_MS = 60 * 60 * 1000

        if (data?.data && typeof data.data === 'object') {
          for (const [iso2, countryData] of Object.entries(data.data)) {
            const byTs = Object.create(null)

            if (Array.isArray(countryData.items)) {
              for (const item of countryData.items) {
                const t = Date.parse(item.datetime_utc)
                if (!Number.isFinite(t)) continue
                const v = Number(item.forecast_mw ?? item.generation_mw ?? item.total_generation_mw ?? item.value)
                if (!Number.isFinite(v)) continue

                const hourTs = Math.floor(t / HOUR_MS) * HOUR_MS
                byTs[hourTs] = (byTs[hourTs] || 0) + v
              }
            }

            if (Object.keys(byTs).length > 0) {
              aggregatedByCountry[iso2] = byTs
            }
          }
        }

        return aggregatedByCountry
      } catch (error) {
        console.error(`Bulk generation forecast request failed for ${countries.length} countries:`, error)
        throw error
      }
    },

    async refreshAllHistoricalGeneration() {
      if (!this.countriesGeoJson) return

      // Drive the slider with the same 48h grid used for prices
      this.availableGenerationTimestamps = this.generateLast48HoursGenerationTimestamps()
      this.currentTimeIndex = this.availableGenerationTimestamps.length - 1

      // Find supported countries
      const supported = []
      for (const f of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(f)
        if (iso2 && this.generationSupported(iso2)) supported.push(iso2)
      }

      // Chunk to match server safety limit (20)
      const chunkSize = 20
      const chunks = []
      for (let i = 0; i < supported.length; i += chunkSize) {
        chunks.push(supported.slice(i, i + chunkSize))
      }

      const merged = {}
      const chunkPromises = chunks.map(async (chunk, idx) => {
        try {
          const chunkData = await this.fetchBulkHistoricalGeneration(chunk)
          return { ok: true, data: chunkData, idx }
        } catch (err) {
          return { ok: false, err, idx }
        }
      })

      const results = await Promise.allSettled(chunkPromises)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          Object.assign(merged, r.value.data)
        }
      }

      this.historicalGenerationData = merged
      this.updateColorScheme()
    },

    async refreshAllGenerationForecasts() {
      if (!this.countriesGeoJson) return

      const supported = []
      for (const f of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(f)
        if (iso2 && this.generationSupported(iso2)) supported.push(iso2)
      }

      const chunkSize = 20
      const chunks = []
      for (let i = 0; i < supported.length; i += chunkSize) {
        chunks.push(supported.slice(i, i + chunkSize))
      }

      const merged = {}
      const chunkPromises = chunks.map(async (chunk, idx) => {
        try {
          const chunkData = await this.fetchBulkGenerationForecast(chunk)
          return { ok: true, data: chunkData, idx }
        } catch (err) {
          return { ok: false, err, idx }
        }
      })

      const results = await Promise.allSettled(chunkPromises)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          Object.assign(merged, r.value.data)
        }
      }

      this.generationForecastData = merged
      this.updateColorScheme()
    },





    async fetchHistoricalGenerationForCountry(iso2) {
      if (!this.generationSupported(iso2)) return null
      
      try {
        const timeData = {}
        
        const now = new Date()
        const start = new Date(now.getTime() - 48 * 60 * 60 * 1000)
        const end = new Date()
        
        const startDate = start.toISOString().split('T')[0]
        const endDate = end.toISOString().split('T')[0]
        
        const url = `https://api.visualize.energy/api/generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`
       
        const { data } = await axios.get(url, { 
          timeout: 10000,
          signal: this.currentAbortController?.signal 
        })

        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const dt = new Date(item.datetime_utc)
            const timestamp = dt.getTime()
            
            if (Number.isFinite(timestamp) && !isNaN(timestamp) && Number.isFinite(item.generation_mw)) {
              if (!timeData[timestamp]) {
                timeData[timestamp] = 0
              }
              
              timeData[timestamp] += item.generation_mw
            }
          }
        }
        
        return Object.keys(timeData).length > 0 ? timeData : null
      } catch (error) {
        if (error.response?.status === 400) {
          console.warn(`400 Bad Request for generation data ${iso2}`)
        } else {
          console.error(`Failed to fetch historical generation for ${iso2}:`, error)
        }
        return null
      }
    },

    capacitySupported(iso2) {
      return SUPPORTED_CAPACITY_ISO2.has(iso2)
    },
    
    generationSupported(iso2) {
      return SUPPORTED_GENERATION_ISO2.has(iso2)
    },
    
    priceSupported(iso2, feature) {
      return SUPPORTED_PRICE_ISO2.has(iso2)
    },

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
      
      // Reset modal position and size
      this.modalPosition = { x: 0, y: 0 }
      this.modalSize = { width: 560, height: null }
    },

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

    async fetchCapacityForHeatmap(iso2) {
      if (!this.capacitySupported(iso2)) return null

      try {
        const url = `https://api.visualize.energy/api/capacity/latest/?country=${encodeURIComponent(iso2)}`
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
            .catch(() => {})
        )
      }

      await Promise.allSettled(tasks)
      this.countryCapacityByISO2 = { ...this.countryCapacityByISO2, ...updates }
      this.updateColorScheme()
    },

    async refreshHeatmapData() {
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
          await Promise.all([
            this.refreshAllHistoricalGeneration(),
            this.refreshAllGenerationForecasts()
          ])
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

    async loadCountriesData() {
      try {
        const response = await axios.get(
          'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
        )
        this.countriesGeoJson = markRaw(response.data)
      } catch (err) {
        console.error('Error loading countries data:', err)
      }
    },

    async fetchCapacity(iso2) {
      this.capacityLoading = true
      this.capacityError = null
      this.capacityYear = null
      this.capacityItems = []
      this.destroyCapacityChart()

      try {
        const url = `https://api.visualize.energy/api/capacity/latest/?country=${encodeURIComponent(iso2)}`
        const { data } = await axios.get(url)
        this.capacityYear = data.year
        this.capacityItems = Array.isArray(data.items) ? data.items : []
        
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
          //this.renderCapacityChart()
        }
      }
    },

    onEachFeature(feature, layer) {
      const vm = this
      const name = vm.getCountryName(feature)
      const iso2 = vm.getCountryISO2(feature)
      const getVal = () => (iso2 ? vm.currentDataByISO2?.[iso2] : null)

      try {
        layer.on({
          mouseover(e) {
            try {
              const lyr = e.target
              if (lyr && lyr.setStyle) {
                lyr.setStyle({ weight: 3, color: '#666', dashArray: '', fillOpacity: 1 })
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
              vm.closeAllSeparateModals();

              // First, open the original modal
              vm.openModal({ name, value: getVal(), properties: feature.properties })
              await new Promise(r => setTimeout(r, 220))
              if (iso2) {
                await Promise.all([vm.fetchCapacity(iso2), vm.fetchGeneration(iso2)])
                await vm.$nextTick()
                if (vm.generationChartInstance?.resize) vm.generationChartInstance.resize()
                if (vm.generationChartInstance?.update) vm.generationChartInstance.update()

                // UPDATED: Create BOTH capacity and generation modals for each click
                const capacityModalId = vm.createSeparateModal(name, 'capacity', 'Energy Capacity')
                vm.createSeparateModal(name, 'generation', 'Energy Generation')
                vm.createSeparateModal(name, 'prices', 'Energy Prices (48h)')
                vm.createSeparateModal(name, 'powerflow', 'Energy Power Flow')
                vm.createSeparateModal(name, 'netflows', 'Net Imports vs Exports')

                if (vm.isMobileViewport && capacityModalId !== undefined) {
                  vm.scrollToModal(capacityModalId)
                }
              } else {
                vm.capacityError = 'Missing ISO-2 code for this feature'
                vm.generationError = 'Missing ISO-2 code for this feature'
              }
            } catch (error) {
              console.warn('Error in click handler:', error)
            }
          }
        })
        const iso2Key = vm.getCountryISO2(feature);
        if (iso2Key) {
          vm.layerByISO2[iso2Key] = layer;
        }
      } catch (error) {
        console.error('Error setting up layer events:', error)
      }
    },

    async updateColorScheme() {
      if (!this.countriesGeoJson) return
      
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

    onMapReady(mapObject) {
      this.map = mapObject
      if (!this.map.getPane('flowsPane')) {
        this.map.createPane('flowsPane')
        this.map.getPane('flowsPane').style.zIndex = 650 // above overlay pane
      }

      this.updateResponsiveZoom()
      this.updatePriceBadges()

    },

    ensurePriceBadgeLayer() {
      if (!this.map) return null

      if (!this.priceBadgeLayer) {
        this.priceBadgeLayer = L.layerGroup()
        this.priceBadgeLayer.addTo(this.map)
      }

      return this.priceBadgeLayer
    },

    updatePriceBadges() {
      const badgeLayer = this.ensurePriceBadgeLayer()
      if (!badgeLayer) return

      badgeLayer.clearLayers()

      if (this.heatmapType !== 'prices') return

      Object.entries(this.currentDataByISO2).forEach(([iso2, value]) => {
        if (!Number.isFinite(value)) return

        const center = this.getCountryCenter(iso2)
        if (!center) return

        const badgeHtml = `
          <div class="price-badge">
            <div class="price-badge__value" style="font-weight:bold; color: white;">${value.toFixed(0)}</div>
          </div>
        `

        const marker = L.marker(center, {
          icon: L.divIcon({
           className: 'price-badge-icon',
            html: badgeHtml,
          //   iconSize: [72, 48],
          //   iconAnchor: [36, 24]
          }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 800
        })

        marker.addTo(badgeLayer)
      })
    },

    async renderCapacityChart() {
      const canvas = this.$refs.capacityChart
      if (!canvas) return
      
      this.destroyCapacityChart()

      const items = [...this.capacityItems].sort((a, b) => 
        (b.installed_capacity_mw || 0) - (a.installed_capacity_mw || 0)
      )
      
      const labels = items.map(i => i.psr_name)
      const capacityValues = items.map(i => i.installed_capacity_mw)

      const iso2 = this.getCountryISO2(this.selectedFeature)
      
      const generationByTech = await this.getGenerationByTechnology(iso2)

      const generationMapped = items.map(item => {
        const name = item.psr_name || item.psr_type || 'Unknown'
        const normalized = this.normalizeTechnologyKey(name)
        const direct = generationByTech[name]
        if (typeof direct === 'number') return direct
        if (normalized && typeof generationByTech[normalized] === 'number') {
          return generationByTech[normalized]
        }
        return 0
      })

      const remainingCapacity = capacityValues.map((cap, i) => {
        const installed = Number(cap) || 0
        const gen = generationMapped[i] || 0
        return Math.max(0, installed - gen)
      })

      const ctx = canvas.getContext('2d')
      
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
                  const datasetIndex = context.datasetIndex
                  if (datasetIndex === 0) {
                    const value = context.parsed.y
                    const capacity = capacityValues[context.dataIndex]
                    const percentage = capacity > 0 ? ((value / capacity) * 100).toFixed(1) : 0
                    return `Current Generation: ${value.toFixed(0)} MW (${percentage}%)`
                  } else {
                    return `Available Capacity: ${context.parsed.y.toFixed(0)} MW`
                  }
                },
                footer: function(tooltipItems) {
                  if (tooltipItems.length > 0) {
                    const index = tooltipItems[0].dataIndex
                    const total = capacityValues[index]
                    return `Total Installed: ${total.toFixed(0)} MW`
                  }
                }
              }
            }
          }
        }
      }))
    },

    async getGenerationByTechnology(iso2) {
      if (!iso2) return {}

      try {

        const end = new Date()
        const start = new Date(end.getTime() - 48 * 60 * 60 * 1000)
        const startDate = encodeURIComponent(start.toISOString())
        const endDate = encodeURIComponent(end.toISOString())

        const url = `https://api.visualize.energy/api/generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`
        const { data } = await axios.get(url)

        if (!Array.isArray(data.items) || !data.items.length) {
          return {}
        }

        const latestByTech = new Map()
        const updateEntry = (key, value, timestamp) => {
          if (!key) return
          const existing = latestByTech.get(key)
          if (!existing || timestamp > existing.timestamp) {
            latestByTech.set(key, { value, timestamp })
          }
        }

        for (const item of data.items) {
          const timestamp = Date.parse(item.datetime_utc)
          if (!Number.isFinite(timestamp)) continue

          const tech = item.psr_name || item.psr_type || 'Unknown'
          const value = Number(item.generation_mw) || 0

          updateEntry(tech, value, timestamp)

          const normalized = this.normalizeTechnologyKey(tech)
          if (normalized && normalized !== tech) {
            updateEntry(normalized, value, timestamp)
          }
        }

        const byTech = {}
        latestByTech.forEach((entry, key) => {
          byTech[key] = entry.value
        })

        return byTech
      } catch (e) {
        console.error(`Failed to get generation for ${iso2}`, e)
        return {}
      }
    },

    async fetchGenerationForecastRange(iso2) {
      if (!iso2) return []

      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)

        const url = `https://api.visualize.energy/api/generation-forecast/range/?country=${encodeURIComponent(iso2)}&start=${start.toISOString()}&end=${end.toISOString()}`
        const { data } = await axios.get(url)

        if (!data || !Array.isArray(data.items)) {
          return []
        }

        return data.items
      } catch (error) {
        console.error(`Failed to fetch generation forecast for ${iso2}`, error)
        return []
      }
    },

    prepareForecastSeries(forecastItems) {
      if (!Array.isArray(forecastItems) || !forecastItems.length) return []

      const hourly = new Map()
      const HOUR_MS = 60 * 60 * 1000

      for (const item of forecastItems) {
        const timestamp = Date.parse(item.datetime_utc)
        if (!Number.isFinite(timestamp)) continue
        const value = Number(item.forecast_mw ?? item.generation_mw ?? item.total_generation_mw ?? item.value)
        if (!Number.isFinite(value)) continue

        const hourTs = Math.floor(timestamp / HOUR_MS) * HOUR_MS
        const bucket = hourly.get(hourTs) || { sum: 0, count: 0 }
        bucket.sum += value
        bucket.count += 1
        hourly.set(hourTs, bucket)
      }

      return Array.from(hourly.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([x, bucket]) => ({ x, y: bucket.count ? bucket.sum / bucket.count : 0 }))
    },

    summarizeTodayForecast(series) {
      if (!Array.isArray(series) || !series.length) return null

      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(startOfDay)
      endOfDay.setDate(endOfDay.getDate() + 1)

      const filtered = series.filter(point => (
        point.x >= startOfDay.getTime() && point.x < endOfDay.getTime()
      ))

      if (!filtered.length) return null

      const total = filtered.reduce((sum, point) => sum + (Number(point.y) || 0), 0)
      const formattedDate = startOfDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

      return {
        total,
        label: `Forecast window: ${formattedDate}`
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

    async fetchGeneration(iso2) {
      this.generationLoading = true
      this.generationError = null
      this.generationItems = []
      this.generationDateLabel = null
      this.destroyGenerationChart()

      try {
        const end = new Date()
        const start = new Date(end.getTime() - 48 * 60 * 60 * 1000)
        const startDate = encodeURIComponent(start.toISOString())
        const endDate = encodeURIComponent(end.toISOString())

        const url = `https://api.visualize.energy/api/generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`
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

      const timeline = this.getAnimationTimeline()
      const xMin = timeline.length ? timeline[0] : undefined
      const xMax = timeline.length ? timeline[timeline.length - 1] : undefined

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
        plugins: [generationCursorPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          normalized: true,
          parsing: { xAxisKey: 'x', yAxisKey: 'y' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'hour', tooltipFormat: 'HH:mm' },
              min: xMin,
              max: xMax
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
      this.updateGenerationCursorLines()
    },

    handleWindowResize() {
      // Reposition modals when window is resized
      this.updateResponsiveZoom()
      this.updateModalDefaultsFromViewport()
      this.updateMobileState()
      this.syncSeparateModalModes()
      this.repositionSeparateModals()

    },
    autoArrangeSeparateModals() {
      this.repositionSeparateModals()
    },

    destroyGenerationChart() {
      if (this.generationChartInstance?.destroy) this.generationChartInstance.destroy()
      this.generationChartInstance = null
    },

    updateMobileState() {
      const previous = this.isMobileViewport
      this.isMobileViewport = typeof window !== 'undefined'
        ? window.innerWidth < MODAL_MOBILE_BREAKPOINT
        : false

      if (this.isMobileViewport) {
        this.stackModalsForMobile()
      }

      if (previous && !this.isMobileViewport) {
        this.closeMobilePanel()
      }
    },

    async openMobilePricePanel(country, iso2) {
      this.mobilePanelCountry = country
      this.mobilePanelISO2 = iso2
      this.mobilePanelVisible = true
      this.mobilePanelLoading = true
      this.mobilePanelError = null

      try {
        const timeData = await this.fetchHistoricalPricesForCountry(iso2)
        if (!timeData || !Object.keys(timeData).length) {
          this.mobilePanelError = 'No price data available'
          return
        }

        const points = Object.entries(timeData)
          .map(([ts, price]) => ({ ts: Number(ts), price }))
          .sort((a, b) => a.ts - b.ts)

        this.mobilePanelLoading = false
        await this.$nextTick()
        this.renderMobilePriceChart(points)
      } catch (error) {
        console.error('Failed to open mobile price panel:', error)
        this.mobilePanelError = 'Unable to load price data'
      } finally {
        this.mobilePanelLoading = false
      }
    },

    stackModalsForMobile() {
      if (!this.isMobileViewport) return

      this.separateModals.forEach(modal => {
        modal.thumbnail = false
        modal.userModified = false
        modal.position = { x: 0, y: 0 }
        modal.size = { ...this.getResponsiveModalDefaults(modal.type) }
      })
    },

    renderMobilePriceChart(points) {
      if (this.mobilePanelChart) {
        this.mobilePanelChart.destroy()
        this.mobilePanelChart = null
      }

      const canvas = document.getElementById('mobile-price-chart')
      if (!canvas || !points?.length) return

      const data = points.map(p => ({ x: p.ts, y: Number(p.price) || 0 }))
      const config = {
        type: 'line',
        data: {
          datasets: [{
            label: 'Price (EUR/MWh)',
            data,
            borderColor: 'rgba(102,126,234,1)',
            backgroundColor: 'rgba(102,126,234,0.25)',
            pointRadius: 0,
            borderWidth: 2,
            fill: true,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          parsing: { xAxisKey: 'x', yAxisKey: 'y' },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'hour', tooltipFormat: 'dd/MM HH:mm' },
              grid: {
                color: 'rgba(148, 163, 184, 0.14)',
                drawBorder: false
              },
              ticks: {
                color: '#cbd5f5'
              }
            },
            y: {
              beginAtZero: false,
              title: {
                display: true,
                text: 'EUR/MWh',
                color: '#f8fafc',
                font: { size: 12, weight: 600 }
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.12)',
                drawBorder: false
              },
              ticks: {
                callback: v => Intl.NumberFormat().format(v),
                color: '#cbd5f5'
              }
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: '#f8fafc'
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleColor: '#f8fafc',
              bodyColor: '#e2e8f0',
              borderColor: 'rgba(148, 163, 184, 0.35)',
              borderWidth: 1
            }
          },
          interaction: { mode: 'index', intersect: false }
        }
      }

      this.mobilePanelChart = markRaw(new Chart(canvas.getContext('2d'), config))
    },

    closeMobilePanel() {
      this.mobilePanelVisible = false
      this.mobilePanelLoading = false
      this.mobilePanelError = null
      this.mobilePanelCountry = ''
      this.mobilePanelISO2 = null
      if (this.mobilePanelChart) {
        this.mobilePanelChart.destroy()
        this.mobilePanelChart = null
      }
    },

    retryMobilePanel() {
      if (this.mobilePanelISO2) {
        this.openMobilePricePanel(this.mobilePanelCountry, this.mobilePanelISO2)
      }
    }
  },

    async mounted() {

      this.updateModalDefaultsFromViewport()
      this.updateResponsiveZoom()
      this.updateMobileState()
      window.addEventListener('resize', this.handleWindowResize)
      window.addEventListener('keydown', this.onKeydown)
    this.initialLoading = true
    try {
      await this.loadCountriesData()
      await this.refreshAllFlows()
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
    window.removeEventListener('resize', this.handleWindowResize)
    window.removeEventListener('keydown', this.onKeydown)
    this.destroyCapacityChart()
    this.destroyGenerationChart()

    // Clean up separate modal charts
    this.separateModals.forEach(modal => {
      if (modal.chart) {
        modal.chart.destroy()
      }
    })

    if (this.priceTimer) clearInterval(this.priceTimer)
    if (this.playInterval) clearInterval(this.playInterval)

    if (this.mobilePanelChart) {
      this.mobilePanelChart.destroy()
      this.mobilePanelChart = null
    }

    if (this.priceBadgeLayer && this.map) {
      this.priceBadgeLayer.remove()
      this.priceBadgeLayer = null
    }

    // Clean up drag/resize listeners
    document.removeEventListener('mousemove', this.onDrag)
    document.removeEventListener('mouseup', this.stopDrag)
    document.removeEventListener('mousemove', this.onResize)
    document.removeEventListener('mouseup', this.stopResize)
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&display=swap');

/* App container */
.energy-map-app {
  font-family: 'Manrope', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #2c3e50;
  margin: 0;
  padding: 0;
  height: 100vh;
  width: 100%;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
}

.layout-shell {
  width: min(900px, 100%);
  max-width: 100%;
  margin: 0 auto;
  padding: 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.content-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 1;
  width: 100%;
}

/* Compact header */
.header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  padding: 10px 12px;
  color: #0f172a;
  flex-shrink: 0;
  gap: 12px;
  border-radius: 11px;
  border: 1px solid #fff;
  background: rgba(255, 255, 255, 0.02);
}

.header-logo {
  justify-self: center;
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.logo-primary {
  color: #f3f3f3;
}

.logo-dot {
  color: #b280e9;
  padding: 0 2px;
}

.logo-highlight {
  color: #b280e9;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  justify-content: flex-end;
}
.header h1 {
  margin: 0;
  font-weight: 600;
  font-size: 1.05rem;
  line-height: 1.1;
  letter-spacing: 0.02em;
}

.header-clock {
  font-size: 15px;
  padding: 0 6px;
  color: #ffffff;
}

.controls {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin: 0 0 0 12px;
}

.radio-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 4px 0;
  border-radius: 0;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.radio-pill input[type="radio"] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-pill span {
  position: relative;
  z-index: 1;
  padding-bottom: 2px;
}

.radio-pill:hover {
  color: #bbbbbb;
}

.radio-pill input[type="radio"]:checked + span {
  color: #f4f4f4;
  border-bottom: 2px solid #ffffff;
}

.radio-pill input[type="radio"]:checked ~ span,
.radio-pill input[type="radio"]:checked + span {
  font-weight: 700;
  color: ffffff;
}

.radio-pill input[type="radio"]:focus-visible + span {
  outline: 2px solid #ffffff;
  outline-offset: 4px;
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

/* Updated modal panel - now supports drag and resize */
.left-panel {
  position: absolute;
  top: 0;
  left: 0;
  min-width: 400px;
  min-height: 300px;
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
  user-select: none;
}

.panel-scrim {
  position: absolute;
  /* inset: 0; */
  /* background: rgba(0,0,0,0.08); */
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
  user-select: none;
}

.panel-close {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  z-index: 10;
}

.panel-content {
  padding: 14px;
  overflow: auto;
  flex: 1;
}

/* Separate Modal Styles */
.separate-modal {
  position: relative;
  z-index: 0;
  display: flex;
  flex-direction: column;
  background: transparent;
  border-radius: 22px;
  overflow: hidden;
  isolation: isolate;
  backdrop-filter: blur(16px) saturate(170%);
  -webkit-backdrop-filter: blur(16px) saturate(170%);
  border: 1px solid rgba(255, 255, 255, 0.26);
  box-shadow:
    0 30px 80px rgba(5, 10, 25, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  color: #0f172a;
}

.separate-modal-stack {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto 60px;
  padding: 0 6px;
}

.separate-modal--mobile {
  position: relative;
  width: 100%;
  max-width: 100%;
  left: auto;
  top: auto;
  transform: none;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.35);
  margin-top: 10px;
}

.separate-modal::before,
.separate-modal::after {
  content: "";
  position: absolute;
  pointer-events: none;
  border-radius: inherit;
}

.separate-modal::before {
  inset: 10% 12% 28% 14%; 
   background:
    radial-gradient(circle at 18% 18%, rgba(56, 189, 248, 0.28), transparent 42%),
    radial-gradient(circle at 80% 10%, rgba(129, 140, 248, 0.24), transparent 40%),
    radial-gradient(circle at 58% 74%, rgba(236, 72, 153, 0.22), transparent 48%); 
   filter: blur(30px);
  opacity: 0.8;
}

.separate-modal::after {
  inset: 1px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.02));
  mix-blend-mode: screen;
}

/* .separate-modal--thumbnail {
  border-radius: 18px;
  box-shadow:
    0 18px 48px rgba(8, 15, 32, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.36),
    0 0 0 1px rgba(255, 255, 255, 0.12);
  background: radial-gradient(circle at 22% 22%, rgba(59, 130, 246, 0.42), transparent 48%),
              radial-gradient(circle at 78% 18%, rgba(236, 72, 153, 0.36), transparent 52%),
              rgba(255, 255, 255, 0.8);
  padding: 6px 8px 12px;
  min-width: 238px;
  max-width: 320px;
} */

.separate-modal--mobile .separate-modal-content {
  max-height: none;
  padding: 16px;
}

.separate-modal--mobile .price-chart,
.separate-modal--mobile .netflow-modal .chart-container {
  width: 100%;
  margin: 0 auto;
  display: flex;
  justify-content: center;
}

.separate-modal--mobile .price-chart canvas,
.separate-modal--mobile .netflow-modal .chart-container canvas {
  width: 100% !important;
  max-width: 540px;
  margin: 0 auto;
}

.separate-modal--mobile .separate-modal-header {
  cursor: default;
}

.separate-modal-thumbnail-preview {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  padding: 12px;
  gap: 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 14px 30px rgba(15, 23, 42, 0.14);
}

.thumbnail-icon-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.92), rgba(99, 102, 241, 0.88));
  color: #f8fafc;
  box-shadow:
    0 12px 30px rgba(59, 130, 246, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 0 0 1px rgba(255, 255, 255, 0.24);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  justify-content: center;
}

.thumbnail-icon-glyph {
  font-size: 18px;
  line-height: 1;
}

.thumbnail-icon-label {
  font-weight: 700;
  letter-spacing: 0.05em;
  font-size: 12px;
}

.thumbnail-icon-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.12));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 8px 20px rgba(15, 23, 42, 0.12);
  flex-wrap: wrap;
  justify-content: center;
}

.thumbnail-spark-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  background: linear-gradient(135deg, rgba(226, 232, 240, 0.92), rgba(241, 245, 249, 0.95));
  box-shadow:
    0 8px 18px rgba(15, 23, 42, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  color: #0f172a;
}

.separate-modal-header {
  position: relative;
  z-index: 1;
  padding: 16px 18px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  letter-spacing: 0.01em;
  color: #0f172a;
  background: none;
  border-bottom: none;
  box-shadow: none;
}

.separate-modal-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.separate-modal--thumbnail .separate-modal-header {
  padding: 14px 16px 10px;
  justify-content: space-between;
  gap: 10px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    0 14px 30px rgba(15, 23, 42, 0.14);
}

.separate-modal--thumbnail .separate-modal-header h4 {
  font-size: 12px;
  font-weight: 800;
  text-align: left;
  color: #0f172a;
}

.separate-modal-close {
  background: linear-gradient(145deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.85));
  border: 1px solid rgba(148, 163, 184, 0.35);
  color: #e2e8f0;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 0 0 1px rgba(59, 130, 246, 0.22);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.separate-modal--thumbnail .separate-modal-close {
  transform: scale(0.9);
  opacity: 0.9;
}

.separate-modal-close:hover {
  transform: translateY(-1px);
  background: linear-gradient(145deg, rgba(59, 130, 246, 0.9), rgba(37, 99, 235, 0.85));
  box-shadow:
    0 18px 42px rgba(37, 99, 235, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.14);
}

@media (max-width: 1400px) {
  .separate-modal--thumbnail {
    padding: 8px 10px 14px;
    max-width: 280px;
  }

  .separate-modal-thumbnail-preview {
    padding: 10px;
    gap: 8px;
  }

  .thumbnail-icon-badge {
    padding: 7px 10px;
    font-size: 11px;
  }

  .thumbnail-icon-row {
    padding: 7px 8px;
  }
}

.separate-modal-content {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 18px;
  overflow-x: hidden;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background:none;
  box-shadow:none;
}

.separate-modal--thumbnail .separate-modal-content {
  display: none;
}

.separate-modal-loading {
  text-align: center;
  color: #cbd5f5;
  font-size: 12px;
}

.separate-modal-error {
  text-align: center;
  color: #fca5a5;
  font-size: 12px;
}

.separate-modal-error button {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.9), rgba(239, 68, 68, 0.85));
  color: #f8fafc;
  border: none;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  margin-top: 10px;
  font-size: 11px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 8px 18px rgba(248, 113, 113, 0.35);
}

.separate-modal-error button:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(248, 113, 113, 0.4);
}

.loading-spinner-small {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(148, 163, 184, 0.28);
  border-top: 2px solid rgba(96, 165, 250, 0.95);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 8px;
}

/* Resize handles */
.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 10;
}

.resize-handle-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}

.resize-handle-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  cursor: ns-resize;
}

.resize-handle-corner {
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(102, 126, 234, 0.3) 50%);
}

.resize-handle:hover {
  background: rgba(102, 126, 234, 0.2);
}

.map-col {
  flex: 1 1 auto;
  min-width: 0;
  height: auto;
  display: flex;
  justify-content: center;
}

.map {
  width: 100%;
  aspect-ratio: 1 / 1;
  height: auto;
  min-height: 480px;
  max-height: 72vh;
  border-radius: 18px;
  overflow: hidden;
  background: radial-gradient(
    circle at 50% 38%,
    rgba(124, 58, 237, 0.38) 0%,
    rgba(237, 233, 254, 0.92) 48%,
    #f8fafc 88%
  );
}

.price-badge,
.price-badge__value {
    color: inherit; /* inherit from parent */
}

/* .price-badge {
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 8px 10px;
  width: 72px;
  height: 48px;
  box-sizing: border-box;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(6px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  pointer-events: none;
} */

/* .price-badge__value {
  font-weight: 800;
  font-size: 17px;
  color: #ffffff;
  letter-spacing: 103px;
} */

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
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(10px);
  border-radius: 8px;
  padding: 5px 10px 6px;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: min(860px, 92vw);
  align-self: center;
  margin-top: 18px;
  margin-bottom: 50px;

}

.overlay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.time-slider-overlay h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #2d3748;
  white-space: nowrap;
}

.slider-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.slider-info span {
  line-height: 1.1;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.slider-row--full {
  gap: 0;
  width: 100%;
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
  flex: 1;
  height: 30px;
  margin: 0;
  min-width: 200px;
}

.custom-slider {
  position: relative;
  height: 16px;
}

.smooth-range-slider {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  width: 100%;
  height: 16px;
  transform: translateY(-50%);
  background: transparent;
  outline: none;
  cursor: pointer;
  z-index: 3;
  -webkit-appearance: none;
  appearance: none;
}

.smooth-range-slider::-webkit-slider-track {
  height: 3px;
  background: transparent;
  border: none;
  border-radius: 3px;
}

.smooth-range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #667eea;
  cursor: grab;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.smooth-range-slider::-webkit-slider-thumb:hover {
  transform: scale(1.05);
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.5);
}

.smooth-range-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.7);
}

.smooth-range-slider::-moz-range-track {
  height: 3px;
  background: transparent;
  border: none;
  border-radius: 3px;
}

.smooth-range-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #667eea;
  cursor: grab;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.4);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.smooth-range-slider::-moz-range-thumb:hover {
  transform: scale(1.05);
  box-shadow: 0 3px 10px rgba(102, 126, 234, 0.5);
}

.smooth-range-slider::-moz-range-thumb:active {
  cursor: grabbing;
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.7);
}

.slider-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e0 100%);
  border-radius: 3px;
  transform: translateY(-50%);
  z-index: 1;
}

.slider-progress {
  position: absolute;
  top: 50%;
  left: 0;
  height: 4px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 3px 0 0 3px;
  transform: translateY(-50%);
  transition: width 0.2s ease;
  z-index: 2;
}

.time-ticks-below {
  position: absolute;
  top: 6px;
  left: 0;
  right: 0;
  height: 18px;
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
  height: 6px;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  border-radius: 1px;
  margin: 0 auto 2px auto;
  transition: all 0.2s ease;
}

.tick-label-below {
  font-size: 9px;
  color: #6f61c1;
  text-align: center;
  white-space: nowrap;
  font-weight: 500;
  transition: color 0.2s ease;
  line-height: 1.1;
}

.time-tick-below:hover .tick-label-below {
  color: #667eea;
  font-weight: 600;
}

.time-tick-below:hover .tick-mark-below {
  height: 9px;
  width: 3px;
}

.no-data-message {
  text-align: center;
  color: #718096;
  font-style: italic;
  margin-top: 6px;
  font-size: 11px;
}

/* Footer positioned at the bottom */
.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 22px;
  background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;
}

.footer-content {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 12px;
  color: #e2e8f0;
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
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

@keyframes liquid-orbit {
  0% {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.05);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

@keyframes liquid-drift {
  0% {
    transform: rotate(0deg) translate3d(0, 0, 0);
    opacity: 0.45;
  }
  40% {
    transform: rotate(140deg) translate3d(2%, -1%, 0);
    opacity: 0.55;
  }
  80% {
    transform: rotate(300deg) translate3d(-3%, 2%, 0);
    opacity: 0.38;
  }
  100% {
    transform: rotate(360deg) translate3d(0, 0, 0);
    opacity: 0.45;
  }
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

/* Play controls */
.play-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.play-button {
  padding: 3px 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 1px 4px rgba(102, 126, 234, 0.3);
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

/* Responsive design */
@media (max-width: 900px) {
  .left-panel {
    min-width: 350px;
  }
  
  .slider-info {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    gap: 4px;
  }

  .slider-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .play-controls {
    justify-content: center;
  }

  .tick-label-below {
    font-size: 9px;
  }

  .map-row {
    flex-direction: column;
    width: 100%;
  }
  
  .chart-box--sm {
    height: 360px;
    min-height: 360px;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .header {
    grid-template-columns: 1fr;
    padding: 8px 12px;
    row-gap: 6px;
  }

  .header-logo {
    justify-self: center;
    font-size: 22px;
  }

  .header h1 {
    font-size: 1.2rem;
  }

  .controls {
    gap: 8px;
    justify-content: center;
    margin-top: 6px;
  }

  .header-top {
    justify-content: center;
    margin-left: 0;
  }

  .slider-wrapper {
    height: 36px;
  }

  .smooth-range-slider::-webkit-slider-thumb {
    width: 16px;
    height: 16px;
  }

  .smooth-range-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
  }

  .tick-label-below {
    font-size: 9px;
  }

  .map {
    min-height: 360px;
    max-height: 64vh;
  }

  .map-row {
    padding-bottom: 0px;
  }

  .app-footer {
    height: 22px;
  }

  .footer-content {
    font-size: 10px;
  }
}

@media (max-width: 600px) {
  .header h1 {
    font-size: 1.05rem;
    margin-bottom: 4px;
  }

  .controls {
    gap: 6px;
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 6px;
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
  
  .tick-label-below {
    font-size: 8px;
  }

  .map {
    min-height: 320px;
    max-height: 60vh;
  }

  .map-row {
    margin: 0;
    padding-bottom: 0px;
  }

  .time-slider-overlay {
    margin-top: 12px;
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
/* Separate Modal Resize Handles */
.separate-modal-resize-handle {
  position: absolute;
  background: transparent;
  z-index: 10;
  touch-action: none;
}

.separate-modal-resize-right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
}

.separate-modal-resize-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
  cursor: ns-resize;
}

.separate-modal-resize-corner {
  bottom: 0;
  right: 0;
  width: 20px;
  height: 20px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(59, 130, 246, 0.6) 50%);
  border-bottom-right-radius: 10px;
}

.separate-modal-resize-handle:hover {
  background: linear-gradient(135deg, transparent 50%, rgba(59, 130, 246, 0.75) 50%);
}

/* Make header draggable */
.separate-modal-header {
  user-select: none;
  touch-action: none;
}

@media (max-width: 768px) {
  .separate-modal-resize-right {
    width: 14px;
  }

  .separate-modal-resize-bottom {
    height: 14px;
  }

  .separate-modal-resize-corner {
    width: 28px;
    height: 28px;
  }
}
.chart-container {
  width: 100%;
  max-width: 100%;
  height: 100%;
  position: relative;
  min-height: 150px;
  padding: 0;
  border-radius: 16px;
  background: linear-gradient(150deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.54));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(15, 23, 42, 0.6),
    0 18px 40px rgba(8, 15, 32, 0.48);
  border: 1px solid rgba(148, 163, 184, 0.22);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  overflow: hidden;
}

.chart-container::before {
  content: "";
  position: absolute;
  /* inset: -40% -55% 45% -55%; */
  background: radial-gradient(circle at 30% 28%, rgba(148, 163, 184, 0.18), transparent 60%),
    radial-gradient(circle at 80% 65%, rgba(59, 130, 246, 0.18), transparent 62%),
    conic-gradient(from 220deg, rgba(148, 163, 184, 0.12), rgba(15, 23, 42, 0));
  opacity: 0.5;
  transform-origin: center;
  pointer-events: none;
}
.chart-container canvas {
  position: relative;
  z-index: 1;
  display: block;
  width: 100% !important;
  height: 100% !important;
  background: transparent;
  border-radius: 12px;
}
.separate-modal .chart-container,
.netflow-modal .chart-container {
  align-self: stretch;
}
.generation-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.generation-total {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.generation-forecast {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(250, 204, 21, 0.08);
  border: 1px solid rgba(250, 204, 21, 0.25);
  box-shadow: inset 0 0 0 1px rgba(250, 204, 21, 0.12);
}
.generation-forecast-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.generation-forecast-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(250, 204, 21, 0.85);
}
.generation-forecast-value {
  font-size: 18px;
  font-weight: 600;
  color: #fef9c3;
}
.generation-forecast-subtext {
  font-size: 10px;
  color: rgba(250, 204, 21, 0.7);
}
.generation-total-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(148, 163, 184, 0.85);
}
.generation-total-value {
  font-size: 22px;
  font-weight: 600;
  color: #f8fafc;
}
.generation-top-techs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.generation-tech-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 5px 12px;
  background: rgba(15, 23, 42, 0.7);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.32), 0 10px 24px rgba(15, 23, 42, 0.45);
  font-size: 11px;
  color: #e2e8f0;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.generation-tech-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.45);
}
.generation-tech-share {
  color: rgba(226, 232, 240, 0.75);
  font-size: 10px;
}
.generation-updated {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.75);
}
.generation-chart {
  flex: 1;
  min-height: 160px;
  min-width: 0;
}

.capacity-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.capacity-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #cbd5f5;
  font-size: 12px;
}

.capacity-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.capacity-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.24), 0 12px 28px rgba(15, 23, 42, 0.45);
}

.capacity-metric-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(148, 163, 184, 0.85);
}

.capacity-metric-value {
  font-size: 20px;
  font-weight: 600;
  color: #f8fafc;
}

.capacity-updated {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.75);
}

.capacity-top-techs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.capacity-tech-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.8);
  box-shadow: 0 16px 32px rgba(2, 6, 23, 0.55);
  border: 1px solid rgba(148, 163, 184, 0.2);
  flex: 1 1 240px;
  min-width: 0;
  color: #e2e8f0;
}

.capacity-tech-color {
  width: 12px;
  height: 40px;
  border-radius: 999px;
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.35);
}

.capacity-tech-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.capacity-tech-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.capacity-tech-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.capacity-tech-share {
  font-size: 10px;
  color: rgba(226, 232, 240, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.capacity-tech-values {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.85);
}

.capacity-tech-generation {
  color: #f8fafc;
  font-weight: 500;
}

.capacity-chart {
  flex: 1 1 auto;
  height: auto;
  min-height: var(--capacity-chart-min-height, clamp(220px, 32vh, 360px));
  min-width: 0;
  padding: 0;
  border-radius: 12px;
  background: linear-gradient(150deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.54));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(15, 23, 42, 0.6),
    0 18px 40px rgba(8, 15, 32, 0.48);
  position: relative;
}

.netflow-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.netflow-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.netflow-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #e2e8f0;
}

.netflow-summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(148, 163, 184, 0.85);
}

.netflow-summary-value {
  font-size: 18px;
  font-weight: 600;
  color: #34d399;
}

.netflow-summary-value small {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(226, 232, 240, 0.8);
  text-transform: uppercase;
}

.netflow-summary-value.is-import {
  color: #f87171;
}

.netflow-chart {
  flex: 1;
  min-height: 220px;
  min-width: 0;
}

.netflow-updated {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.75);
  text-align: right;
}

.mobile-bottom-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(180deg, #0f172a 0%, #0b1224 100%);
  color: #e2e8f0;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.22);
  padding: 12px 16px 16px;
  z-index: 1400;
}

.mobile-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-panel-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-panel-label {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.mobile-panel-country {
  margin: 0;
  font-size: 18px;
  color: #f8fafc;
}

.mobile-panel-close {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(226, 232, 240, 0.25);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.mobile-panel-close:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
}

.mobile-panel-body {
  margin-top: 10px;
  min-height: 230px;
}

.mobile-panel-chart {
  height: 260px;
  width: 100%;
}

.mobile-panel-loading,
.mobile-panel-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  min-height: 240px;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.35);
}

.mobile-panel-error button {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.25);
  background: rgba(239, 68, 68, 0.14);
  color: #fecdd3;
  cursor: pointer;
}

@media (min-width: 769px) {
  .mobile-bottom-panel {
    display: none;
  }
}

:global(.delta-tooltip) {
  background: rgba(0,0,0,0.75) !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  padding: 4px 6px !important;
  font-size: 12px !important;
  line-height: 1.2 !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
  white-space: nowrap !important;
}
.show-pct-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 0;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.75);
}
.play-button + .show-pct-toggle input[type="checkbox"] {
  cursor: pointer;
}

/* Smooth fade / scale when opening/closing separate modals */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.18s ease-out, transform 0.18s ease-out;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

/* Make the flows modal content stretch nicely */
.powerflow-modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  border-radius: 16px;
  background: linear-gradient(140deg, rgba(15, 23, 42, 0.78), rgba(15, 23, 42, 0.62));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(15, 23, 42, 0.6),
    0 18px 40px rgba(8, 15, 32, 0.48);
  border: 1px solid rgba(148, 163, 184, 0.22);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
}

.powerflow-modal-body > * {
  flex: 1;
  position: relative;
  z-index: 1;
}

</style>
