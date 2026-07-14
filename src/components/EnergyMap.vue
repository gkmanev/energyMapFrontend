<template>
  <div id="app" class="energy-map-app">
    <!-- Loading overlay for initial load -->
    <div v-if="initialLoading" class="initial-loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>Loading energy data...</p>
      </div>
    </div>
    <div class="layout-shell" :class="{ 'layout-shell--floating-header': shouldFloatHeader }">
      <div class="content-shell">
        <div
          ref="agentChatMenu"
          :class="['header-shell', { 'header-shell--floating': shouldFloatHeader }]"
        >
          <AppHeader
            v-model="headerActiveView"
            :legend-unit="legendUnit"
            :legend-min="headerLegendMin"
            :legend-max="headerLegendMax"
            :layers-value="{ irradiance: showIrradianceLayer, wind: showWindLayer }"
            @layer-change="onHeaderLayerChange"
            @open-agent="openAgentChat"
          />
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
            <transition name="agent-chat-pop">
              <div
                v-if="showAgentChat"
                ref="agentChatPopover"
                class="agent-chat-popover agent-chat-popover--map"
                role="dialog"
                aria-label="AI agent chat"
                @click.stop
              >
                <div class="agent-chat-popover__header">
                  <div class="agent-chat-popover__header-copy">
                    <strong>Energy Agent</strong>
                    <p>Quick map context and chart queries.</p>
                    <div class="agent-chat-popover__status-row">
                      <span
                        v-if="agentChatConversationId"
                        class="agent-chat-status-badge agent-chat-status-badge--muted"
                      >
                        Conversation active
                      </span>
                    </div>
                  </div>
                  <div class="agent-chat-popover__header-actions">
                    <button
                      type="button"
                      class="agent-chat-popover__clear"
                      @click="clearAgentChat"
                    >
                      New conversation
                    </button>
                    <button
                      type="button"
                      class="agent-chat-popover__close"
                      aria-label="Close AI agent chat"
                      @click="closeAgentChat"
                    >
                      x
                    </button>
                  </div>
                </div>

                <div ref="agentChatBody" class="agent-chat-body">
                  <div ref="agentChatMessages" class="agent-chat-messages">
                    <div
                      v-for="message in agentChatMessages"
                      :key="message.id"
                      :class="[
                        'agent-chat-message',
                        `agent-chat-message--${message.role}`
                      ]"
                    >
                      {{ message.text }}
                    </div>
                    <div v-if="agentChatTyping" class="agent-chat-message agent-chat-message--assistant agent-chat-message--typing">
                      Thinking...
                    </div>
                  </div>

                  <div v-if="agentChatChartSpecs.length" class="agent-chat-results">
                    <div v-if="agentChatChartsLoading" class="agent-chat-message agent-chat-message--assistant agent-chat-message--typing">
                      Loading charts...
                    </div>
                    <section
                      v-for="chartSpec in agentChatChartSpecs"
                      :key="chartSpec._canvasId"
                      class="agent-chat-panel"
                    >
                      <div class="agent-chat-panel__header">
                        <div>
                          <h4>{{ chartSpec.title || buildAgentChartFallbackTitle(chartSpec) }}</h4>
                          <p>{{ formatAgentChartSpecSummary(chartSpec) }}</p>
                        </div>
                        <span class="agent-chat-panel__unit">{{ getAgentChartUnit(chartSpec) }}</span>
                      </div>
                      <div v-if="chartSpec._renderError" class="agent-chat-panel__error">
                        {{ chartSpec._renderError }}
                      </div>
                      <div v-else class="chart-container agent-chat-chart-container">
                        <canvas :id="chartSpec._canvasId"></canvas>
                      </div>
                    </section>
                  </div>
                </div>

                <form class="agent-chat-form" @submit.prevent="sendAgentChatMessage">
                  <input
                    ref="agentChatInput"
                    v-model.trim="agentChatInput"
                    type="text"
                    maxlength="240"
                    class="agent-chat-form__input"
                    :placeholder="agentChatInputPlaceholder"
                  >
                  <button
                    type="submit"
                    class="agent-chat-form__submit"
                    :disabled="!agentChatInput || agentChatTyping"
                  >
                    Send
                  </button>
                </form>
              </div>
            </transition>
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
            <div
              v-show="showIrradianceLayer"
              class="irradiance-legend"
            >
              <div class="irradiance-legend__title">Irradiance W/m²</div>
              <div class="irradiance-legend__bar"></div>
              <div class="irradiance-legend__labels">
                <span>0</span>
                <span>400</span>
                <span>800+</span>
              </div>
            </div>
            <div v-show="showWindLayer" class="wind-legend">
              <div class="wind-legend__title">Wind 120 m (m/s)</div>
              <div class="wind-legend__bar"></div>
              <div class="wind-legend__labels">
                <span>0</span><span>7</span><span>12</span><span>18</span><span>25+</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isMobileViewport && mobilePanelVisible" class="mobile-bottom-panel">
          <div class="mobile-panel-header">
            <div class="mobile-panel-titles">
              <p class="mobile-panel-label">Energy Prices (48h)</p>
              <h4 class="mobile-panel-country">{{ mobilePanelCountry }}</h4>
              <span class="chart-brand-signature">visualize.energy</span>
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
        <div
          v-if="heatmapType === 'prices'"
          :class="['time-slider-overlay', { 'time-slider-overlay--floating': shouldFloatTimeSlider }]"
        >
          <div class="overlay-header">
            <h3>Historical Prices - {{ timeRangeHeading }} [EUR/MWh]</h3>
            <div class="time-range-buttons">
              <button
                v-for="option in timeRangeOptions"
                :key="option.value"
                :class="['time-range-button', { active: selectedTimeRange === option.value }]"
                @click="selectTimeRange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
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
          </div>

          <div v-if="!hasTimeData && heatmapType === 'prices'" class="no-data-message">
            Click "Refresh Data" to load historical price data
          </div>
        </div>

        <!-- Capacity Slider -->
        <div
          v-if="heatmapType === 'capacity'"
          :class="['time-slider-overlay', { 'time-slider-overlay--floating': shouldFloatTimeSlider }]"
        >
          <div class="overlay-header">
            <h3>Installed Capacity - {{ timeRangeHeading }} [MW]</h3>
            <div class="time-range-buttons">
              <button
                v-for="option in timeRangeOptions"
                :key="option.value"
                :class="['time-range-button', { active: selectedTimeRange === option.value }]"
                @click="selectTimeRange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
              <span class="capacity-display">{{ totalCapacityDisplay }}</span>
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

          <div v-if="!hasTimeData && heatmapType === 'capacity'" class="no-data-message">
            Click "Refresh Data" to load historical capacity data
          </div>
        </div>

        <!-- Generation Slider -->
        <div
          v-if="heatmapType === 'generation'"
          :class="['time-slider-overlay', { 'time-slider-overlay--floating': shouldFloatTimeSlider }]"
        >
          <div class="overlay-header">
            <h3>Generation Data - Last 48 Hours</h3>
            <div class="time-range-buttons">
              <button
                v-for="option in timeRangeOptions"
                :key="option.value"
                :class="['time-range-button', { active: selectedTimeRange === option.value }]"
                @click="selectTimeRange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="slider-info">
              <span class="time-display">{{ currentTimeDisplay }}</span>
              <span class="generation-display">{{ totalGenerationDisplay }}</span>
            </div>
          </div>

          <div class="slider-row slider-row--full">
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
            { 'separate-modal--thumbnail': modal.thumbnail, 'separate-modal--mobile': usesStackedModalLayout }
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
          :style="{ cursor: usesStackedModalLayout ? 'default' : 'move' }"
        >
          <div class="separate-modal-title">
            <h4>{{ modal.country }} - {{ modal.title }}</h4>
            <span class="chart-brand-signature">visualize.energy</span>
            <div
              v-if="modal.type === 'generation' && !modal.thumbnail"
              class="generation-mode-toggle"
              @pointerdown.stop
              @click.stop
            >
              <button
                class="generation-mode-button"
                :class="{ active: modal.generationView === 'all' }"
                @click="setGenerationModalView(modal.id, 'all')"
              >
                All
              </button>
              <button
                class="generation-mode-button"
                :class="{ active: modal.generationView === 'res' }"
                @click="setGenerationModalView(modal.id, 'res')"
              >
                RES Forecast
              </button>
            </div>
          </div>
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
              <div
                v-if="modal.meta.generationTimestampLabel"
                class="capacity-updated"
              >
                {{ modal.meta.generationTimestampLabel }}
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
          v-if="isLargeModalViewport"
          class="separate-modal-resize-handle separate-modal-resize-right"
          @pointerdown.stop.prevent="startSeparateModalResize($event, modal.id, 'right')"
        ></div>
        <div
          v-if="isLargeModalViewport"
          class="separate-modal-resize-handle separate-modal-resize-bottom"
          @pointerdown.stop.prevent="startSeparateModalResize($event, modal.id, 'bottom')"
        ></div>
        <div
          v-if="isLargeModalViewport"
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

const PSR_TYPE_NAME_OVERRIDES = Object.freeze({
  B99: 'BESS Charging'
})
const BESS_CHARGING_PSR_TYPE = 'B99'
const BESS_CHARGING_CAPACITY_PLACEHOLDER_MW = 2

const DEFAULT_MODAL_WIDTH = 350
const DEFAULT_MODAL_HEIGHT = 280
const MODAL_MOBILE_BREAKPOINT = 1200
const MODAL_DESKTOP_LAYOUT_BREAKPOINT = 2000
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

// Wind layer
const WIND_GRID_LATS = [35, 40, 45, 50, 55, 60, 65, 70]
const WIND_GRID_LONS = [-10, -3, 5, 13, 21, 30, 38]
const WIND_GNC = WIND_GRID_LONS.length
const WIND_N_PARTICLES = 2000
const WIND_FIELD_RES = 7
const WIND_SPEED_SCALE = 0.2
const WIND_TRAIL_FADE = 0.042
const WIND_REFRESH_MS = 15 * 60 * 1000

import { defineAsyncComponent } from 'vue'
const PowerFlow = defineAsyncComponent(() => import("@/components/PowerFlow.vue"));
import AppHeader from "@/components/AppHeader.vue"
import { markRaw, toRaw, nextTick } from 'vue'
import { LMap, LTileLayer, LGeoJson } from '@vue-leaflet/vue-leaflet'
import {
  Chart,
  LineController,
  BarController,
  LineElement,
  BarElement,
  PointElement,
  LinearScale,
  TimeScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

Chart.register(
  LineController, BarController, LineElement, BarElement, PointElement,
  LinearScale, TimeScale, CategoryScale, Tooltip, Legend, Filler
)
import 'chartjs-adapter-date-fns'
import axios from '@/services/axiosClient'
import { buildApiUrl } from '@/config/api'
import { FLOW_EIC_BY_ISO, FLOW_ISO_BY_EIC } from '@/utils/flowDomains'
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
const IRRADIANCE_LAYER_REFRESH_MS = 15 * 60 * 1000
const AGENT_CHART_PALETTE = [
  { border: '#60a5fa', fill: 'rgba(96, 165, 250, 0.24)' },
  { border: '#f59e0b', fill: 'rgba(245, 158, 11, 0.22)' },
  { border: '#22c55e', fill: 'rgba(34, 197, 94, 0.22)' },
  { border: '#f472b6', fill: 'rgba(244, 114, 182, 0.22)' },
  { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.22)' },
  { border: '#38bdf8', fill: 'rgba(56, 189, 248, 0.22)' }
]

const AGENT_SERIES_COLOR_HINTS = {
  wind: { border: '#22c55e', fill: 'rgba(34, 197, 94, 0.22)' },
  solar: { border: '#f5b000', fill: 'rgba(245, 176, 0, 0.24)' },
  price: { border: '#60a5fa', fill: 'rgba(96, 165, 250, 0.24)' },
  prices: { border: '#60a5fa', fill: 'rgba(96, 165, 250, 0.24)' }
}

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

const AGENT_CHAT_WELCOME_MESSAGE = 'Ask about the energy data for different countries.'
const AGENT_CHAT_SESSION_STORAGE_KEY = 'energy-map-agent-chat-session'
const AGENT_CHART_QUERY_URL = buildApiUrl('chart-query/')
const AGENT_CHART_STATUS_VALUES = new Set(['chart', 'text'])
const AGENT_CHART_DATA_UNITS = Object.freeze({
  capacity: 'MW',
  flows: 'MW',
  generation: 'MW',
  generation_res: 'MW',
  prices: 'EUR/MWh'
})

function createInitialAgentChatMessages() {
  return [
    {
      id: 1,
      role: 'assistant',
      text: AGENT_CHAT_WELCOME_MESSAGE
    }
  ]
}

/**
 * @typedef {Object} ChartSpec
 * @property {string | null | undefined} [title]
 * @property {string} data_type
 * @property {string[]} countries
 * @property {string[]} series
 * @property {boolean} include_prices
 * @property {string} start_utc
 * @property {string} end_utc
 * @property {string} resolution
 * @property {string} chart_type
 * @property {string | undefined} [country_from]
 * @property {string | undefined} [country_to]
 */

/**
 * @typedef {Object} EnergyChatResponse
 * @property {string} conversation_id
 * @property {'chart' | 'text'} status
 * @property {string} text
 * @property {ChartSpec[]} charts
 */

export default {
  name: 'EnergyMap',
  components: { AppHeader, LMap, LTileLayer, LGeoJson, PowerFlow },

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
      latestRealFlowsByEdge: {},      // { "BG-RO": { value, timestamp } }
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
      dragStartX: 0,
      dragStartY: 0,
      resizeStartX: 0,
      resizeStartY: 0,
      resizeStartWidth: 0,
      resizeStartHeight: 0,

      // Heatmap type controls - Price is default
      heatmapType: 'prices',
      showIrradianceLayer: false,
      irradianceOverlayLayer: null,
      irradianceSeriesByISO2: {},
      irradianceLayerByISO2: {},
      irradianceLayerLoading: false,
      irradianceLayerError: null,
      irradianceLayerRequestId: 0,
      irradianceLayerRefreshTimer: null,
      // Wind layer
      showWindLayer: false,
      windLayerLoading: false,
      windLayerError: null,
      windCanvas: null,
      windCtx: null,
      windAnimFrame: null,
      windParticles: [],
      windField: null,
      windGridSource: [],
      windRefreshTimer: null,
      windRequestId: 0,
      mapResizeObserver: null,
      mapLayoutRefreshRaf: null,
      mapLayoutRefreshTimeoutId: null,
      isRefreshing: false,
      initialLoading: true,
      isMapUpdating: false,
      isPlaying: false,
      showAgentChat: false,
      agentChatInput: '',
      agentChatTyping: false,
      agentChatCharts: [],
      agentChatChartsLoading: false,
      agentChatConversationId: null,
      agentChatStatus: 'idle',
      agentChatChartSpecs: [],
      agentChatResponseKey: 0,
      agentChatMessageIdCounter: 2,
      agentChatMessages: createInitialAgentChatMessages(),
      playInterval: null,
      playSpeed: 500,
      selectedTimeRange: 'hours',
      timeRangeOptions: [
        { label: 'Hours', value: 'hours' },
        { label: 'Days', value: 'days' },
        { label: 'Months', value: 'months' },
        { label: 'Years', value: 'years' }
      ],
      
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
      isLargeModalViewport: typeof window !== 'undefined' ? window.innerWidth >= MODAL_DESKTOP_LAYOUT_BREAKPOINT : false,
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
      generationByTechCache: new Map(),
      generationByTechPending: new Map(),
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
      mapBadgeLayer: null,

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
      sliderFloatingEnabled: false,

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

    usesStackedModalLayout() {
      return !this.isLargeModalViewport
    },

    irradianceLayerToggleTitle() {
      if (this.irradianceLayerLoading) {
        return 'Loading tilted irradiance overlay'
      }
      if (this.irradianceLayerError) {
        return this.irradianceLayerError
      }
      return 'Toggle tilted irradiance overlay'
    },

    irradianceLayerToggleStateLabel() {
      if (this.irradianceLayerLoading) {
        return 'Loading'
      }
      if (this.irradianceLayerError) {
        return 'Retry'
      }
      return this.showIrradianceLayer ? 'On' : 'Off'
    },

    windLayerTitle() {
      if (this.windLayerLoading) return 'Loading wind data...'
      if (this.windLayerError) return this.windLayerError
      return 'Toggle animated wind particle layer'
    },

    windLayerStateLabel() {
      if (this.windLayerLoading) return 'Loading'
      if (this.windLayerError) return 'Retry'
      return this.showWindLayer ? 'On' : 'Off'
    },
    
    progressStyle() {
      const percentage = this.maxTimeIndex > 0 ? (this.currentTimeIndex / this.maxTimeIndex) * 100 : 0
      return {
        width: `${percentage}%`
      }
    },

    shouldFloatHeader() {
      return this.isMobileViewport && this.sliderFloatingEnabled
    },

    shouldFloatTimeSlider() {
      return this.isMobileViewport && this.sliderFloatingEnabled
    },

    agentChatInputPlaceholder() {
      return this.agentChatConversationId
        ? 'Reply or ask for another chart...'
        : 'Ask for a chart...'
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
      if (this.selectedTimeRange === 'hours' && this.currentTimeIndex === this.maxTimeIndex) {
        const quarterMs = 15 * 60 * 1000
        return Math.floor(Date.now() / quarterMs) * quarterMs
      }
      if (this.heatmapType === 'generation') {
        return this.availableGenerationTimestamps[this.currentTimeIndex] || Date.now()
      }
      return this.availableTimestamps[this.currentTimeIndex] || Date.now()
    },

    headerClockTimestamp() {
      if (!this.hasTimeData) return null
      if (this.currentTimeIndex >= this.maxTimeIndex) return null
      return this.currentTimestamp
    },
    
    currentTimeDisplay() {
      if (!this.hasTimeData) return 'No data'
      const date = new Date(this.currentTimestamp)
      
      const timeRangeFormats = {
        hours: {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        },
        days: {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        },
        months: {
          month: 'short',
          year: 'numeric'
        },
        years: {
          year: 'numeric'
        }
      }

      return date.toLocaleString('en-GB', timeRangeFormats[this.selectedTimeRange] || timeRangeFormats.days)
    },

    timeRangeHeading() {
      switch (this.selectedTimeRange) {
        case 'days':
          return 'Last 30 Days'
        case 'months':
          return 'Last 12 Months'
        case 'years':
          return 'Last 5 Years'
        default:
          return 'Last 48 Hours'
      }
    },

    headerActiveView: {
      get() {
        return this.heatmapType === 'prices' ? 'price' : this.heatmapType
      },
      set(value) {
        this.heatmapType = value === 'price' ? 'prices' : value
      }
    },
    
    timeTicks() {
      if (!this.hasTimeData || !['prices', 'capacity'].includes(this.heatmapType)) return []
      
      const ticks = []
      const totalTicks = this.selectedTimeRange === 'months'
        ? this.maxTimeIndex
        : 8
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableTimestamps[tickIndex]
        
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        const label = this.formatTimeTickLabel(timestamp, i, totalTicks, this.availableTimestamps[this.maxTimeIndex])
        
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
      const totalTicks = this.selectedTimeRange === 'months'
        ? this.maxTimeIndex
        : 8
      
      for (let i = 0; i <= totalTicks; i++) {
        const tickIndex = Math.floor((i / totalTicks) * this.maxTimeIndex)
        const timestamp = this.availableGenerationTimestamps[tickIndex]
        
        const position = `${(tickIndex / this.maxTimeIndex) * 100}%`
        
        const label = this.formatTimeTickLabel(timestamp, i, totalTicks, this.availableGenerationTimestamps[this.maxTimeIndex])
        
        ticks.push({
          position,
          label,
          timestamp,
          index: tickIndex
        })
      }
      
      return ticks
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

        const useForecast = this.selectedTimeRange === 'hours'
          && this.currentTimeIndex === this.maxTimeIndex
          && Object.keys(this.generationForecastData).length > 0

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
      const useNearestValue = this.selectedTimeRange === 'months'
        || (this.selectedTimeRange === 'hours' && this.currentTimeIndex === this.maxTimeIndex)

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
      
      for (const [iso2, timeData] of Object.entries(this.historicalPriceData)) {
        if (!timeData) continue
        if (useNearestValue) {
          const value = findNearestValue(timeData)
          if (value !== undefined) {
            result[iso2] = value
          }
        } else if (timeData[timestamp] !== undefined) {
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

    headerLegendMin() {
      if (!Number.isFinite(this.minValue)) return 0
      return Math.floor(this.minValue)
    },

    headerLegendMax() {
      if (!Number.isFinite(this.maxValue)) {
        return this.heatmapType === 'prices' ? 100 : 10000
      }
      return Math.ceil(this.maxValue)
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
        } else if (newType === 'capacity') {
          this.currentTimeIndex = this.maxTimeIndex
          if (!this.hasCompleteCapacityCoverage()) {
            this.refreshAllCapacities()
          }
          if (!Object.keys(this.latestRealFlowsByEdge || {}).length) {
            void this.refreshLatestRealFlows()
          }
        } else if (newType === 'generation') {
          if (this.availableGenerationTimestamps.length === 0) {
            this.refreshAllHistoricalGeneration()
          } else {
            this.currentTimeIndex = this.maxTimeIndex
          }

          if (Object.keys(this.generationForecastData).length === 0) {
            this.refreshAllGenerationForecasts()
          }
        }
        this.updateColorScheme()
        this.$nextTick(() => this.updateMapBadges())

      },
      immediate: false
    },

    currentTimeIndex: {
      handler() {
        this.updateColorScheme()
        this.updateGenerationCursorLines()
        this.updateMapBadges()
        void this.updateCapacityModalGenerationValues()
        if (this.showIrradianceLayer && Object.keys(this.irradianceSeriesByISO2).length) {
          this.applyIrradianceOverlay()
        }
      },
    },

    showIrradianceLayer: {
      handler(enabled) {
        if (enabled) {
          this.startIrradianceLayerRefresh()
          void this.refreshIrradianceLayerOverlay()
          return
        }

        this.stopIrradianceLayerRefresh()
        this.clearIrradianceLayerOverlay()
      }
    },

    showWindLayer(enabled) {
      if (enabled) {
        void this.startWindLayer()
      } else {
        this.stopWindLayer()
      }
    },

    initialLoading(isLoading) {
      if (!isLoading) {
        this.queueMapLayoutRefresh()
      }
    }

  },

  methods: {
    onHeaderLayerChange(layers) {
      this.showIrradianceLayer = Boolean(layers?.irradiance)
      this.showWindLayer = Boolean(layers?.wind)
    },

    toggleAgentChat() {
      if (this.showAgentChat) {
        this.closeAgentChat()
        return
      }

      this.openAgentChat()
    },

    async openAgentChat() {
      this.showAgentChat = true
      await nextTick()
      if (this.agentChatChartSpecs.length) {
        await this.renderAgentChatCharts()
      }
      this.focusAgentChatInput()
      this.scrollAgentChatToBottom()
    },

    closeAgentChat() {
      this.showAgentChat = false
      this.agentChatTyping = false
      this.destroyAgentChatCharts()
    },

    clearAgentChat() {
      this.agentChatResponseKey += 1
      this.agentChatInput = ''
      this.agentChatTyping = false
      this.agentChatChartsLoading = false
      this.agentChatConversationId = null
      this.agentChatStatus = 'idle'
      this.destroyAgentChatCharts()
      this.agentChatChartSpecs = []
      this.agentChatMessageIdCounter = 2
      this.agentChatMessages = createInitialAgentChatMessages()
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(AGENT_CHAT_SESSION_STORAGE_KEY)
      }
      this.$nextTick(() => {
        this.scrollAgentChatToBottom()
        this.focusAgentChatInput()
      })
    },

    focusAgentChatInput() {
      this.$refs.agentChatInput?.focus?.()
    },

    scrollAgentChatToBottom() {
      const container = this.$refs.agentChatBody || this.$refs.agentChatMessages
      if (!container) return
      container.scrollTop = container.scrollHeight
    },

    pushAgentChatMessage(role, text) {
      const content = String(text || '').trim()
      if (!content) return

      this.agentChatMessages.push({
        id: this.agentChatMessageIdCounter++,
        role,
        text: content
      })
    },

    mapAgentChatChartSpecs(charts, responseKey = this.agentChatResponseKey) {
      return (Array.isArray(charts) ? charts : [])
        .filter(chart => chart && typeof chart === 'object')
        .map((chart, index) => ({
          title: chart.title == null ? null : String(chart.title).trim(),
          data_type: String(chart.data_type || '').trim().toLowerCase(),
          countries: Array.isArray(chart.countries)
            ? chart.countries.map(country => String(country || '').trim().toUpperCase()).filter(Boolean)
            : [],
          series: Array.isArray(chart.series)
            ? chart.series.map(series => String(series || '').trim().toLowerCase()).filter(Boolean)
            : [],
          include_prices: Boolean(chart.include_prices),
          start_utc: String(chart.start_utc || '').trim(),
          end_utc: String(chart.end_utc || '').trim(),
          resolution: String(chart.resolution || '').trim().toLowerCase(),
          chart_type: String(chart.chart_type || '').trim().toLowerCase() === 'bar' ? 'bar' : 'line',
          country_from: String(chart.country_from || '').trim().toUpperCase(),
          country_to: String(chart.country_to || '').trim().toUpperCase(),
          _canvasId: chart._canvasId || `agent-chat-chart-${responseKey}-${index}`,
          _renderError: null
        }))
    },

    parseEnergyChatResponse(payload, responseKey = this.agentChatResponseKey) {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Unexpected chart-query response.')
      }

      if (typeof payload.conversation_id !== 'string') {
        throw new Error('Unexpected chart-query response.')
      }

      if (!AGENT_CHART_STATUS_VALUES.has(payload.status)) {
        throw new Error('Unexpected chart-query response.')
      }

      if (typeof payload.text !== 'string') {
        throw new Error('Unexpected chart-query response.')
      }

      if (!Array.isArray(payload.charts)) {
        throw new Error('Unexpected chart-query response.')
      }

      return /** @type {EnergyChatResponse} */ ({
        conversation_id: payload.conversation_id,
        status: payload.status,
        text: payload.text,
        charts: this.mapAgentChatChartSpecs(payload.charts, responseKey)
      })
    },

    persistAgentChatSession() {
      if (typeof window === 'undefined' || !window.sessionStorage) return

      window.sessionStorage.setItem(
        AGENT_CHAT_SESSION_STORAGE_KEY,
        JSON.stringify({
          conversationId: this.agentChatConversationId,
          messages: this.agentChatMessages,
          status: this.agentChatStatus,
          chartSpecs: this.agentChatChartSpecs,
          responseKey: this.agentChatResponseKey,
          messageIdCounter: this.agentChatMessageIdCounter
        })
      )
    },

    restoreAgentChatSession() {
      if (typeof window === 'undefined' || !window.sessionStorage) return

      const rawSession = window.sessionStorage.getItem(AGENT_CHAT_SESSION_STORAGE_KEY)
      if (!rawSession) return

      try {
        const parsedSession = JSON.parse(rawSession)
        const restoredResponseKey = Number(parsedSession?.responseKey)
        const restoredMessages = Array.isArray(parsedSession?.messages)
          ? parsedSession.messages
              .filter(message => message && typeof message === 'object')
              .map((message, index) => ({
                id: Number.isFinite(Number(message.id)) ? Number(message.id) : index + 1,
                role: message.role === 'user' ? 'user' : 'assistant',
                text: String(message.text ?? message.content ?? '').trim()
              }))
              .filter(message => message.text)
          : []
        const highestMessageId = restoredMessages.reduce((maxId, message) => Math.max(maxId, message.id), 1)
        const restoredCounter = Number(parsedSession?.messageIdCounter)
        const normalizedStatus = String(parsedSession?.status || '').trim()

        this.agentChatConversationId = parsedSession?.conversationId || null
        this.agentChatStatus = normalizedStatus === 'loading'
          ? 'idle'
          : (normalizedStatus || 'idle')
        this.agentChatChartSpecs = this.mapAgentChatChartSpecs(
          parsedSession?.chartSpecs,
          Number.isFinite(restoredResponseKey) ? restoredResponseKey : 0
        )
        this.agentChatResponseKey = Number.isFinite(restoredResponseKey) ? restoredResponseKey : 0
        this.agentChatMessages = restoredMessages.length ? restoredMessages : createInitialAgentChatMessages()
        this.agentChatMessageIdCounter = Math.max(
          Number.isFinite(restoredCounter) ? restoredCounter : 2,
          highestMessageId + 1,
          2
        )
      } catch (error) {
        console.warn('Unable to restore agent chat session:', error)
        window.sessionStorage.removeItem(AGENT_CHAT_SESSION_STORAGE_KEY)
      }
    },

    applyAgentChatResponse(payload, responseKey) {
      this.agentChatConversationId = payload.conversation_id || this.agentChatConversationId
      this.agentChatStatus = payload.status
      this.destroyAgentChatCharts()
      this.agentChatChartSpecs = this.mapAgentChatChartSpecs(payload.charts, responseKey)
      this.pushAgentChatMessage('assistant', payload.text)
    },

    async sendAgentPrompt(prompt) {
      if (this.agentChatTyping) return
      this.agentChatInput = prompt
      await this.sendAgentChatMessage()
    },

    async sendAgentChatMessage() {
      const prompt = (this.agentChatInput || '').trim()
      if (!prompt || this.agentChatTyping) return

      this.pushAgentChatMessage('user', prompt)
      this.agentChatInput = ''
      this.agentChatTyping = true
      this.agentChatChartsLoading = false
      this.agentChatStatus = 'loading'
      const responseKey = this.agentChatResponseKey + 1
      this.agentChatResponseKey = responseKey
      this.persistAgentChatSession()
      await nextTick()
      this.scrollAgentChatToBottom()

      try {
        const requestBody = { message: prompt }
        if (this.agentChatConversationId) {
          requestBody.conversation_id = this.agentChatConversationId
        }

        const { data } = await axios.post(AGENT_CHART_QUERY_URL, requestBody)
        const response = this.parseEnergyChatResponse(data, responseKey)

        if (responseKey !== this.agentChatResponseKey) return

        this.applyAgentChatResponse(response, responseKey)
      } catch (error) {
        if (responseKey !== this.agentChatResponseKey) return

        const errorMessage =
          error?.response?.data?.error ||
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          'Unable to fetch chart query results.'

        this.agentChatStatus = 'error'
        this.pushAgentChatMessage('assistant', `Chart query failed: ${errorMessage}`)
      } finally {
        if (responseKey !== this.agentChatResponseKey) return

        this.agentChatTyping = false
        this.persistAgentChatSession()
        await nextTick()
        if (this.showAgentChat && this.agentChatChartSpecs.length) {
          await this.renderAgentChatCharts()
        }
        this.scrollAgentChatToBottom()
        this.focusAgentChatInput()
      }
    },

    buildAgentChartFallbackTitle(chartSpec) {
      const countryLabel = chartSpec.data_type === 'flows'
        ? [chartSpec.country_from || chartSpec.countries[0], chartSpec.country_to || chartSpec.countries[1]]
            .filter(Boolean)
            .join(' -> ')
        : chartSpec.countries.join(' vs ')

      switch (chartSpec.data_type) {
        case 'prices':
          return `${countryLabel || 'Requested'} day-ahead prices`
        case 'capacity':
          return `${countryLabel || 'Requested'} installed capacity`
        case 'flows':
          return `${countryLabel || 'Requested'} physical flows`
        case 'generation_res':
          return `${countryLabel || 'Requested'} renewable generation`
        default:
          return `${countryLabel || 'Requested'} generation`
      }
    },

    formatAgentChartSpecSummary(chartSpec) {
      const parts = []
      const dataTypeLabels = {
        capacity: 'Capacity',
        flows: 'Flows',
        generation: 'Generation',
        generation_res: 'RES generation',
        prices: 'Prices'
      }
      const primaryLabel = chartSpec.data_type === 'flows'
        ? [chartSpec.country_from || chartSpec.countries[0], chartSpec.country_to || chartSpec.countries[1]]
            .filter(Boolean)
            .join(' -> ')
        : chartSpec.countries.join(', ')

      if (primaryLabel) parts.push(primaryLabel)
      if (dataTypeLabels[chartSpec.data_type]) parts.push(dataTypeLabels[chartSpec.data_type])
      if (chartSpec.series.length) {
        parts.push(chartSpec.series.map(series => this.formatAgentSeriesLabel(series)).join(', '))
      }
      if (chartSpec.resolution) parts.push(this.formatAgentResolutionLabel(chartSpec.resolution))
      if (chartSpec.include_prices && chartSpec.data_type !== 'prices') parts.push('with prices')

      return parts.join(' | ')
    },

    getAgentChartUnit(chartSpec) {
      const primaryUnit = AGENT_CHART_DATA_UNITS[chartSpec.data_type] || 'Value'
      if (chartSpec.include_prices && chartSpec.data_type !== 'prices') {
        return `${primaryUnit} + EUR/MWh`
      }
      return primaryUnit
    },

    formatAgentResolutionLabel(resolution) {
      const labels = {
        h: 'Hourly',
        d: 'Daily',
        w: 'Weekly',
        m: 'Monthly',
        y: 'Yearly'
      }

      return labels[resolution] || String(resolution || '').toUpperCase()
    },

    destroyAgentChatCharts() {
      this.agentChatCharts.forEach(chart => chart?.destroy?.())
      this.agentChatCharts = []
    },

    async renderAgentChatCharts() {
      this.destroyAgentChatCharts()
      if (!this.agentChatChartSpecs.length) return

      this.agentChatChartsLoading = true
      const renderKey = this.agentChatResponseKey

      try {
        await nextTick()

        const chartEntries = await Promise.all(
          this.agentChatChartSpecs.map(async (chartSpec, panelIndex) => {
            chartSpec._renderError = null

            try {
              const canvas = document.getElementById(chartSpec._canvasId)
              const context = canvas?.getContext?.('2d')
              if (!context) return null

              const config = await this.buildAgentChartConfig(chartSpec, panelIndex)
              return { config, context }
            } catch (error) {
              chartSpec._renderError = error?.message || 'Unable to render this chart.'
              return null
            }
          })
        )

        if (renderKey !== this.agentChatResponseKey) return

        chartEntries.forEach(entry => {
          if (!entry?.context || !entry?.config) return
          this.agentChatCharts.push(markRaw(new Chart(entry.context, entry.config)))
        })
      } finally {
        if (renderKey === this.agentChatResponseKey) {
          this.agentChatChartsLoading = false
        }
      }
    },

    async buildAgentChartConfig(chartSpec, panelIndex) {
      const model = await this.buildAgentChartModel(chartSpec, panelIndex)
      const isCategoryChart = model.axisType === 'category'
      const startUtc = Date.parse(chartSpec.start_utc)
      const endUtc = Date.parse(chartSpec.end_utc)
      const timeUnit = this.getAgentChartTimeUnit(chartSpec.resolution)
      const scales = isCategoryChart
        ? {
            x: {
              type: 'category',
              grid: {
                color: 'rgba(148, 163, 184, 0.14)',
                drawBorder: false
              },
              ticks: {
                color: '#cbd5f5',
                autoSkip: false,
                maxRotation: 45,
                minRotation: 0
              }
            },
            y: {
              beginAtZero: model.beginAtZero,
              title: {
                display: Boolean(model.primaryUnit),
                text: model.primaryUnit || 'Value',
                color: '#f8fafc',
                font: { size: 12, weight: 600 }
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.12)',
                drawBorder: false
              },
              ticks: {
                callback: value => Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value),
                color: '#cbd5f5'
              }
            }
          }
        : {
            x: {
              type: 'time',
              time: {
                unit: timeUnit,
                tooltipFormat: timeUnit === 'hour' ? 'dd/MM HH:mm' : 'dd/MM/yyyy'
              },
              min: Number.isFinite(startUtc) ? startUtc : undefined,
              max: Number.isFinite(endUtc) ? endUtc : undefined,
              grid: {
                color: 'rgba(148, 163, 184, 0.14)',
                drawBorder: false
              },
              ticks: {
                color: '#cbd5f5'
              }
            },
            y: {
              beginAtZero: model.beginAtZero,
              title: {
                display: Boolean(model.primaryUnit),
                text: model.primaryUnit || 'Value',
                color: '#f8fafc',
                font: { size: 12, weight: 600 }
              },
              grid: {
                color: 'rgba(148, 163, 184, 0.12)',
                drawBorder: false
              },
              ticks: {
                callback: value => Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value),
                color: '#cbd5f5'
              }
            }
          }

      if (model.secondaryUnit) {
        scales.yPrices = {
          position: 'right',
          beginAtZero: false,
          title: {
            display: true,
            text: model.secondaryUnit,
            color: '#f8fafc',
            font: { size: 12, weight: 600 }
          },
          grid: {
            drawOnChartArea: false,
            drawBorder: false
          },
          ticks: {
            callback: value => Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value),
            color: '#93c5fd'
          }
        }
      }

      return {
        type: model.chartType,
        data: isCategoryChart
          ? { labels: model.labels || [], datasets: model.datasets }
          : { datasets: model.datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          parsing: false,
          normalized: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: model.datasets.length > 1,
              position: 'bottom',
              labels: {
                color: '#e2e8f0',
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 8,
                boxHeight: 8
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
          scales
        }
      }
    },

    async buildAgentChartModel(chartSpec, panelIndex) {
      switch (chartSpec.data_type) {
        case 'capacity':
          return this.buildAgentCapacityChartModel(chartSpec, panelIndex)
        case 'flows':
          return this.buildAgentFlowChartModel(chartSpec, panelIndex)
        case 'prices':
          return this.buildAgentPriceChartModel(chartSpec, panelIndex)
        case 'generation_res':
          return this.buildAgentGenerationChartModel(chartSpec, panelIndex, true)
        case 'generation':
        default:
          return this.buildAgentGenerationChartModel(chartSpec, panelIndex, false)
      }
    },

    async buildAgentPriceChartModel(chartSpec, panelIndex) {
      const countries = chartSpec.countries.filter(Boolean)
      const datasets = (
        await Promise.all(
          countries.map(async (country, seriesIndex) => {
            const items = await this.fetchAgentPriceItems(chartSpec, country)
            const points = this.aggregateSeriesPointsByResolution(
              items
                .map(item => ({
                  timestamp: Date.parse(item.datetime_utc),
                  value: Number(item.price)
                }))
                .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.value)),
              chartSpec.resolution,
              'average'
            ).map(point => ({ x: point.timestamp, y: point.value }))
            const color = this.getAgentChartSeriesColor({ id: country, name: country }, panelIndex, seriesIndex)
            return this.createAgentTimeSeriesDataset(country, points, color)
          })
        )
      ).filter(dataset => dataset.data.length)

      if (!datasets.length) {
        throw new Error('No price data was returned for this chart.')
      }

      return {
        axisType: 'time',
        beginAtZero: false,
        chartType: chartSpec.chart_type,
        datasets,
        primaryUnit: AGENT_CHART_DATA_UNITS.prices
      }
    },

    async buildAgentGenerationChartModel(chartSpec, panelIndex, renewableOnly = false) {
      const countries = chartSpec.countries.filter(Boolean)
      const requestedSeries = chartSpec.series.length
        ? chartSpec.series
        : [renewableOnly ? 'res' : 'generation']

      const generationDatasets = (
        await Promise.all(
          countries.map(async (country, countryIndex) => {
            const items = renewableOnly
              ? await this.fetchAgentResGenerationItems(chartSpec, country)
              : await this.fetchAgentGenerationItems(chartSpec, country)

            return requestedSeries
              .map((seriesKey, seriesIndex) => {
                const groupedValues = new Map()

                items.forEach(item => {
                  if (!this.agentChartSeriesMatches(item, seriesKey)) return

                  const timestamp = Date.parse(item.datetime_utc)
                  const value = Number(item.generation_mw)
                  if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return

                  const current = groupedValues.get(timestamp) || 0
                  groupedValues.set(timestamp, current + value)
                })

                const points = this.aggregateSeriesPointsByResolution(
                  Array.from(groupedValues.entries()).map(([timestamp, value]) => ({ timestamp, value })),
                  chartSpec.resolution,
                  'average'
                ).map(point => ({ x: point.timestamp, y: point.value }))

                const label = countries.length > 1 && requestedSeries.length > 1
                  ? `${country} ${this.formatAgentSeriesLabel(seriesKey)}`
                  : countries.length > 1
                    ? country
                    : this.formatAgentSeriesLabel(seriesKey)
                const color = this.getAgentChartSeriesColor(
                  { id: `${country}_${seriesKey}`, name: label },
                  panelIndex,
                  countryIndex + seriesIndex
                )

                return this.createAgentTimeSeriesDataset(label, points, color, {
                  fill: chartSpec.chart_type === 'line' && requestedSeries.length === 1 && countries.length === 1
                })
              })
              .filter(dataset => dataset.data.length)
          })
        )
      ).flat()

      const priceDatasets = chartSpec.include_prices
        ? await this.buildAgentPriceOverlayDatasets(chartSpec, panelIndex, generationDatasets.length)
        : []
      const datasets = [...generationDatasets, ...priceDatasets]

      if (!datasets.length) {
        throw new Error('No generation data was returned for this chart.')
      }

      return {
        axisType: 'time',
        beginAtZero: true,
        chartType: chartSpec.chart_type,
        datasets,
        primaryUnit: AGENT_CHART_DATA_UNITS[chartSpec.data_type] || AGENT_CHART_DATA_UNITS.generation,
        secondaryUnit: priceDatasets.length ? AGENT_CHART_DATA_UNITS.prices : null
      }
    },

    async buildAgentCapacityChartModel(chartSpec, panelIndex) {
      const responses = await Promise.all(
        chartSpec.countries
          .filter(Boolean)
          .map(async country => ({
            country,
            payload: await this.fetchAgentCapacityItems(country)
          }))
      )
      const labels = []
      const labelSet = new Set()

      responses.forEach(({ payload }) => {
        const items = this.applyCapacityModalOverrides(payload?.items)
        items.forEach(item => {
          const name = String(item?.psr_name || item?.psr_type || '').trim()
          if (!name || labelSet.has(name)) return
          labelSet.add(name)
          labels.push(name)
        })
      })

      const datasets = responses.map(({ country, payload }, seriesIndex) => {
        const items = this.applyCapacityModalOverrides(payload?.items)
        const valueByLabel = new Map(
          items.map(item => [
            String(item?.psr_name || item?.psr_type || '').trim(),
            Number(item?.installed_capacity_mw) || 0
          ])
        )
        const color = this.getAgentChartSeriesColor({ id: country, name: country }, panelIndex, seriesIndex)
        return {
          label: country,
          data: labels.map(label => valueByLabel.get(label) || 0),
          borderColor: color.border,
          backgroundColor: color.fill,
          borderWidth: 1.5
        }
      }).filter(dataset => dataset.data.some(value => Number.isFinite(value) && value !== 0))

      if (!datasets.length || !labels.length) {
        throw new Error('No capacity data was returned for this chart.')
      }

      return {
        axisType: 'category',
        beginAtZero: true,
        chartType: chartSpec.chart_type === 'line' ? 'line' : 'bar',
        datasets,
        labels,
        primaryUnit: AGENT_CHART_DATA_UNITS.capacity
      }
    },

    async buildAgentFlowChartModel(chartSpec, panelIndex) {
      const source = chartSpec.country_from || chartSpec.countries[0] || ''
      const target = chartSpec.country_to || chartSpec.countries[1] || ''
      const payload = await this.fetchAgentFlowItems(chartSpec, source, target)
      const points = this.aggregateSeriesPointsByResolution(
        (Array.isArray(payload?.items) ? payload.items : [])
          .map(item => ({
            timestamp: Date.parse(item.datetime_utc),
            value: Number(item.quantity_mw)
          }))
          .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.value)),
        chartSpec.resolution,
        'average'
      ).map(point => ({ x: point.timestamp, y: point.value }))

      if (!points.length) {
        throw new Error('No flow data was returned for this chart.')
      }

      const label = [source, target].filter(Boolean).join(' -> ') || 'Flow'
      return {
        axisType: 'time',
        beginAtZero: true,
        chartType: chartSpec.chart_type,
        datasets: [
          this.createAgentTimeSeriesDataset(
            label,
            points,
            this.getAgentChartSeriesColor({ id: label, name: label }, panelIndex, 0),
            { fill: chartSpec.chart_type === 'line' }
          )
        ],
        primaryUnit: AGENT_CHART_DATA_UNITS.flows
      }
    },

    async buildAgentPriceOverlayDatasets(chartSpec, panelIndex, offset = 0) {
      const countries = chartSpec.countries.filter(Boolean)
      const datasets = (
        await Promise.all(
          countries.map(async (country, seriesIndex) => {
            const items = await this.fetchAgentPriceItems(chartSpec, country)
            const points = this.aggregateSeriesPointsByResolution(
              items
                .map(item => ({
                  timestamp: Date.parse(item.datetime_utc),
                  value: Number(item.price)
                }))
                .filter(point => Number.isFinite(point.timestamp) && Number.isFinite(point.value)),
              chartSpec.resolution,
              'average'
            ).map(point => ({ x: point.timestamp, y: point.value }))
            const label = `${country} price`
            const color = this.getAgentChartSeriesColor({ id: label, name: label }, panelIndex, offset + seriesIndex)

            return this.createAgentTimeSeriesDataset(label, points, color, {
              borderDash: [6, 4],
              fill: false,
              yAxisID: 'yPrices'
            })
          })
        )
      ).filter(dataset => dataset.data.length)

      return datasets
    },

    createAgentTimeSeriesDataset(label, data, color, options = {}) {
      return {
        label,
        data,
        borderColor: color.border,
        backgroundColor: color.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHitRadius: 14,
        tension: 0.25,
        fill: Boolean(options.fill),
        spanGaps: true,
        yAxisID: options.yAxisID || 'y',
        borderDash: options.borderDash || undefined
      }
    },

    async fetchAgentPriceItems(chartSpec, country) {
      const resolutionQuery = this.getAgentChartResolutionQuery(chartSpec.resolution, { allowWeeklyClientAggregation: true })
      const url = buildApiUrl(`prices/range/?country=${encodeURIComponent(country)}&contract=A01&start=${encodeURIComponent(chartSpec.start_utc)}&end=${encodeURIComponent(chartSpec.end_utc)}${resolutionQuery}`)
      const { data } = await axios.get(url)
      return Array.isArray(data?.items) ? data.items : []
    },

    async fetchAgentGenerationItems(chartSpec, country) {
      const resolutionQuery = this.getAgentChartResolutionQuery(chartSpec.resolution, { allowWeeklyClientAggregation: true })
      const url = buildApiUrl(`generation/range?country=${encodeURIComponent(country)}&start=${encodeURIComponent(chartSpec.start_utc)}&end=${encodeURIComponent(chartSpec.end_utc)}${resolutionQuery}`)
      const { data } = await axios.get(url)
      return this.applyGenerationPsrOverrides(data?.items)
    },

    async fetchAgentResGenerationItems(chartSpec, country) {
      const url = buildApiUrl(`generation-res/range/?country=${encodeURIComponent(country)}&start=${encodeURIComponent(chartSpec.start_utc)}&end=${encodeURIComponent(chartSpec.end_utc)}`)
      const { data } = await axios.get(url)
      return this.applyGenerationPsrOverrides(data?.items)
    },

    async fetchAgentCapacityItems(country) {
      const url = buildApiUrl(`capacity/latest/?country=${encodeURIComponent(country)}`)
      const { data } = await axios.get(url)
      return data
    },

    async fetchAgentFlowItems(chartSpec, source, target) {
      const url = buildApiUrl(`flows/range/?from=${encodeURIComponent(source)}&to=${encodeURIComponent(target)}&start=${encodeURIComponent(chartSpec.start_utc)}&end=${encodeURIComponent(chartSpec.end_utc)}`)
      const { data } = await axios.get(url)
      return data
    },

    getAgentChartResolutionQuery(resolution, options = {}) {
      const normalizedResolution = String(resolution || '').trim().toLowerCase()
      if (normalizedResolution === 'd' || normalizedResolution === 'm' || normalizedResolution === 'y') {
        return `&resolution=${normalizedResolution}`
      }
      if (!options.allowWeeklyClientAggregation && normalizedResolution === 'h') {
        return '&resolution=h'
      }
      return ''
    },

    aggregateSeriesPointsByResolution(points, resolution, mode = 'average') {
      const normalizedResolution = String(resolution || '').trim().toLowerCase()
      const aggregated = new Map()

      points.forEach(point => {
        const timestamp = this.bucketAgentChartTimestamp(point.timestamp, normalizedResolution)
        if (!Number.isFinite(timestamp) || !Number.isFinite(point.value)) return

        if (!aggregated.has(timestamp)) {
          aggregated.set(timestamp, { sum: 0, count: 0 })
        }

        const entry = aggregated.get(timestamp)
        entry.sum += point.value
        entry.count += 1
      })

      return Array.from(aggregated.entries())
        .map(([timestamp, entry]) => ({
          timestamp,
          value: mode === 'sum'
            ? entry.sum
            : entry.count > 0
              ? entry.sum / entry.count
              : entry.sum
        }))
        .sort((a, b) => a.timestamp - b.timestamp)
    },

    bucketAgentChartTimestamp(timestamp, resolution) {
      if (!Number.isFinite(timestamp)) return NaN

      const date = new Date(timestamp)
      switch (resolution) {
        case 'y':
          return Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0)
        case 'm':
          return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
        case 'w': {
          const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
          const day = utcDate.getUTCDay() || 7
          utcDate.setUTCDate(utcDate.getUTCDate() - day + 1)
          return utcDate.getTime()
        }
        case 'd':
          return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
        case 'h':
        default:
          return Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            0,
            0,
            0
          )
      }
    },

    agentChartSeriesMatches(item, seriesKey) {
      const normalizedSeries = this.normalizeTechnologyKey(seriesKey)
      const normalizedName = this.normalizeTechnologyKey(item?.psr_name)
      const normalizedType = this.getPsrTypeKey(item?.psr_type).toLowerCase()

      if (!normalizedSeries || normalizedSeries === 'generation' || normalizedSeries === 'total') {
        return true
      }
      if (normalizedSeries === 'res') {
        return true
      }
      if (normalizedSeries === 'solar') {
        return normalizedName.includes('solar') || normalizedType === 'b16'
      }
      if (normalizedSeries === 'wind') {
        return normalizedName.includes('wind')
      }

      return normalizedName === normalizedSeries
        || normalizedName.includes(normalizedSeries)
        || normalizedType === normalizedSeries
    },

    formatAgentSeriesLabel(seriesKey) {
      const labels = {
        generation: 'Generation',
        prices: 'Prices',
        res: 'RES',
        solar: 'Solar',
        total: 'Total',
        wind: 'Wind'
      }
      return labels[seriesKey] || String(seriesKey || '').replace(/_/g, ' ')
    },

    getAgentChartTimeUnit(resolution) {
      const unitByResolution = {
        h: 'hour',
        d: 'day',
        w: 'week',
        m: 'month',
        y: 'year'
      }

      return unitByResolution[resolution] || 'day'
    },

    getAgentChartSeriesColor(series, panelIndex, seriesIndex) {
      const seriesKey = String(series?.id || series?.name || '').trim().toLowerCase()

      if (AGENT_SERIES_COLOR_HINTS[seriesKey]) {
        return AGENT_SERIES_COLOR_HINTS[seriesKey]
      }

      if (seriesKey.includes('solar')) {
        return AGENT_SERIES_COLOR_HINTS.solar
      }

      if (seriesKey.includes('wind')) {
        return AGENT_SERIES_COLOR_HINTS.wind
      }

      if (seriesKey.includes('price')) {
        return AGENT_SERIES_COLOR_HINTS.price
      }

      return AGENT_CHART_PALETTE[(panelIndex + seriesIndex) % AGENT_CHART_PALETTE.length]
    },

    handleAgentChatPointerDown(event) {
      if (!this.showAgentChat) return
      const buttonContainer = this.$refs.agentChatMenu
      const popover = this.$refs.agentChatPopover
      if (buttonContainer?.contains?.(event.target) || popover?.contains?.(event.target)) return
      this.closeAgentChat()
    },

    async selectTimeRange(range) {
      const isSameRange = this.selectedTimeRange === range
      this.pauseAnimation()
      if (!isSameRange) {
        this.selectedTimeRange = range
      }
      this.resetTimeRangeToNow()
      if (this.heatmapType === 'prices') {
        await this.refreshAllHistoricalPrices()
        await this.refreshVisiblePriceModals()
        await this.refreshVisibleGenerationModals()
        this.currentTimeIndex = this.maxTimeIndex
        return
      }

      if (this.heatmapType === 'generation') {
        await this.refreshAllHistoricalGeneration()
        if (this.selectedTimeRange === 'hours') {
          await this.refreshAllGenerationForecasts()
        }
        await this.refreshVisiblePriceModals()
        await this.refreshVisibleGenerationModals()
        this.currentTimeIndex = this.maxTimeIndex
        return
      }

      this.availableTimestamps = this.generatePriceRangeTimestamps()
      await this.refreshVisiblePriceModals()
      await this.refreshVisibleGenerationModals()
      this.currentTimeIndex = this.maxTimeIndex
    },

    resetTimeRangeToNow() {
      if (this.heatmapType === 'generation') {
        if (!this.availableGenerationTimestamps.length) {
          this.availableGenerationTimestamps = this.generateGenerationRangeTimestamps()
        }
        this.currentTimeIndex = this.maxTimeIndex
        return
      }

      this.availableTimestamps = this.generatePriceRangeTimestamps()
      this.currentTimeIndex = this.maxTimeIndex
    },

    formatTimeTickLabel(timestamp, index, totalTicks, latestTimestamp) {
      const date = new Date(timestamp)

      if (this.selectedTimeRange === 'months') {
        const latestDate = new Date(latestTimestamp)
        const monthsAgo = (latestDate.getFullYear() - date.getFullYear()) * 12
          + (latestDate.getMonth() - date.getMonth())
        if (index === 0) {
          return `${monthsAgo}mo ago`
        }
        if (index === totalTicks) {
          return 'Now'
        }
        return `${monthsAgo}mo`
      }

      if (this.selectedTimeRange === 'years') {
        return date.toLocaleString('en-GB', { year: 'numeric' })
      }

      if (this.selectedTimeRange === 'days') {
        const daysAgo = Math.round((latestTimestamp - timestamp) / (24 * 60 * 60 * 1000))
        if (index === 0) {
          return `${daysAgo}d ago`
        }
        if (index === totalTicks) {
          return 'Now'
        }
        return `${daysAgo}d`
      }

      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    },

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
        .filter(modal => ['generation', 'prices', 'netflows'].includes(modal.type) && modal.chart)
        .forEach(modal => this.applyGenerationCursor(modal.chart, timestamp))
    },

    async updateCapacityModalGenerationValues() {
      if (!this.separateModals.length) return
      const timestamp = Number(this.currentTimestamp)
      if (!Number.isFinite(timestamp)) return

      const capacityModals = this.separateModals
        .filter(modal => modal.type === 'capacity' && modal.data)

      if (!capacityModals.length) return

      await Promise.all(
        capacityModals.map(modal => this.refreshCapacityModalGeneration(modal, timestamp))
      )
    },

    async refreshCapacityModalGeneration(modal, timestamp) {
      if (!modal || modal.type !== 'capacity' || !modal.data) return

      const items = [...modal.data].sort((a, b) =>
        (b.installed_capacity_mw || 0) - (a.installed_capacity_mw || 0)
      )

      const capacityValues = items.map(i => Number(i.installed_capacity_mw) || 0)
      const iso2 = this.getCountryISO2ByName(modal.country)
      const generationByTech = await this.getGenerationByTechnologyAt(iso2, timestamp)

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
        generationTimestampLabel: Number.isFinite(timestamp)
          ? `Generation at ${new Date(timestamp).toLocaleString()}`
          : '',
        updatedLabel: Number.isFinite(lastUpdatedTs) && lastUpdatedTs > 0
          ? `Last updated ${new Date(lastUpdatedTs).toLocaleString()}`
          : ''
      }

      if (!modal.chart) return

      modal.chart.data.datasets[0].data = generationMapped
      modal.chart.data.datasets[1].data = remainingCapacity
      modal.chart.$capacityValues = capacityValues
      modal.chart.$generationValues = generationMapped
      modal.chart.update('none')
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

    getPsrTypeKey(value) {
      if (value == null) return ''
      return String(value).trim().toUpperCase()
    },

    applyGenerationPsrOverrides(items) {
      if (!Array.isArray(items)) return []

      return items.map(item => {
        if (!item || typeof item !== 'object') return item

        const psrType = this.getPsrTypeKey(item.psr_type)
        const overrideName = PSR_TYPE_NAME_OVERRIDES[psrType]

        return {
          ...item,
          psr_type: psrType || item.psr_type,
          psr_name: overrideName || item.psr_name || psrType || 'Unknown'
        }
      })
    },

    applyCapacityModalOverrides(items) {
      const normalizedItems = Array.isArray(items)
        ? items
            .filter(item => item && typeof item === 'object')
            .map(item => {
              const psrType = this.getPsrTypeKey(item.psr_type)
              const overrideName = PSR_TYPE_NAME_OVERRIDES[psrType]
              return {
                ...item,
                psr_type: psrType || item.psr_type,
                psr_name: overrideName || item.psr_name || psrType || 'Unknown',
                installed_capacity_mw: Number(item.installed_capacity_mw) || 0
              }
            })
        : []

      const normalizedBessName = this.normalizeTechnologyKey(PSR_TYPE_NAME_OVERRIDES[BESS_CHARGING_PSR_TYPE])
      const bessIndex = normalizedItems.findIndex(item => (
        this.getPsrTypeKey(item.psr_type) === BESS_CHARGING_PSR_TYPE
        || this.normalizeTechnologyKey(item.psr_name) === normalizedBessName
      ))

      const bessItem = {
        psr_type: BESS_CHARGING_PSR_TYPE,
        psr_name: PSR_TYPE_NAME_OVERRIDES[BESS_CHARGING_PSR_TYPE],
        installed_capacity_mw: BESS_CHARGING_CAPACITY_PLACEHOLDER_MW
      }

      if (bessIndex >= 0) {
        normalizedItems[bessIndex] = {
          ...normalizedItems[bessIndex],
          ...bessItem
        }
      } else {
        normalizedItems.push(bessItem)
      }

      return normalizedItems
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
      if (!this.isLargeModalViewport) return false

      const viewportHeight = window.innerHeight || 0

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
      const isMediumDesktop = viewportWidth >= MODAL_DESKTOP_LAYOUT_BREAKPOINT && viewportWidth <= 2400
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

      const viewportHeight = window.innerHeight || 0

      if (this.usesStackedModalLayout || this.isMobileViewport) return false

      return viewportHeight <= 800
    },

    getSeparateModalStyle(modalId) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal) return {}

      if (this.usesStackedModalLayout) {
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
      this.generateFakeFlowsData()
      await this.refreshLatestRealFlows()
      this.$nextTick(() => {
        void this.redrawFlowsWhenReady()
      })
    },
    resolveConfiguredFlowEdge(sourceIso, targetIso) {
      for (const [fromIso, toIso] of this.flowEdges) {
        if (fromIso === sourceIso && toIso === targetIso) {
          return { key: `${fromIso}-${toIso}`, sign: 1 }
        }
        if (fromIso === targetIso && toIso === sourceIso) {
          return { key: `${fromIso}-${toIso}`, sign: -1 }
        }
      }
      return null
    },
    collectLatestRealFlowRecord(countryIso, row, edgeStore) {
      const domainCodes = FLOW_EIC_BY_ISO[countryIso]
      const centerCodes = new Set(
        (Array.isArray(domainCodes) ? domainCodes : [domainCodes]).filter(Boolean)
      )
      if (!centerCodes.size) return

      const quantityMw = Number(row?.quantity_mw)
      if (!Number.isFinite(quantityMw) || quantityMw <= 0) return

      const outDomain = row?.out_domain_eic
      const inDomain = row?.in_domain_eic
      if (!outDomain || !inDomain) return

      let sourceIso = null
      let targetIso = null

      if (centerCodes.has(outDomain)) {
        sourceIso = countryIso
        targetIso = FLOW_ISO_BY_EIC[inDomain] || null
      } else if (centerCodes.has(inDomain)) {
        sourceIso = FLOW_ISO_BY_EIC[outDomain] || null
        targetIso = countryIso
      } else {
        return
      }

      if (!sourceIso || !targetIso || sourceIso === targetIso) return

      const resolvedEdge = this.resolveConfiguredFlowEdge(sourceIso, targetIso)
      if (!resolvedEdge) return

      const parsedTimestamp = Date.parse(row?.datetime_utc || row?.timestamp || '')
      const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now()
      const signedValue = quantityMw * resolvedEdge.sign
      const existing = edgeStore[resolvedEdge.key]

      if (
        !existing ||
        timestamp > existing.timestamp ||
        (timestamp === existing.timestamp && Math.abs(signedValue) > Math.abs(existing.value))
      ) {
        edgeStore[resolvedEdge.key] = {
          value: signedValue,
          timestamp
        }
      }
    },
    async refreshLatestRealFlows() {
      const countries = [...new Set(this.flowEdges.flat())].filter((iso2) => FLOW_EIC_BY_ISO[iso2])
      if (!countries.length) return

      const latestByEdge = {}
      const responses = await Promise.allSettled(
        countries.map(async (iso2) => {
          const url = buildApiUrl(`flows/latest/?country=${encodeURIComponent(iso2)}&neighbors=1`)
          const { data } = await axios.get(url, { timeout: 20000 })
          const items = Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data?.data)
              ? data.data
              : []

          return { iso2, items }
        })
      )

      responses.forEach((response) => {
        if (response.status !== 'fulfilled') {
          console.warn('Failed to fetch latest cross-border flows:', response.reason)
          return
        }

        const { iso2, items } = response.value
        items.forEach((row) => {
          this.collectLatestRealFlowRecord(iso2, row, latestByEdge)
        })
      })

      if (Object.keys(latestByEdge).length) {
        this.latestRealFlowsByEdge = latestByEdge
        this.$nextTick(() => {
          this.updateFlowsOverlay()
        })
      }
    },
    generateFakeFlowsData() {
      // Use your 48h timestamps from prices; if missing, synthesize them
      const ts = (this.availableTimestamps?.length
        ? this.availableTimestamps
        : this.generatePriceRangeTimestamps()
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

    pointInRing(point, ring = []) {
      if (!point || !Array.isArray(ring) || ring.length < 3) return false

      const { lat, lng } = point
      let inside = false

      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].lng
        const yi = ring[i].lat
        const xj = ring[j].lng
        const yj = ring[j].lat

        const intersects = ((yi > lat) !== (yj > lat)) &&
          (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        if (intersects) inside = !inside
      }

      return inside
    },

    pointInPolygon(point, rings = []) {
      if (!point || !rings.length) return false

      const [outer, ...holes] = rings
      if (!this.pointInRing(point, outer)) return false

      return !holes.some(hole => this.pointInRing(point, hole))
    },

    pointInPolygons(point, polygons = []) {
      if (!point || !polygons.length) return false
      return polygons.some(rings => this.pointInPolygon(point, rings))
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

      const latlngs = layer?.getLatLngs ? layer.getLatLngs() : null
      const polygons = latlngs ? this.normalizeLayerPolygons(latlngs) : []

      const parsedLabelLat = Number(labelLat)
      const parsedLabelLng = Number(labelLng)
      const labelPoint = Number.isFinite(parsedLabelLat) && Number.isFinite(parsedLabelLng)
        ? { lat: parsedLabelLat, lng: parsedLabelLng }
        : null

      let best = null

      polygons.forEach((rings) => {
        const outerRing = rings?.[0]
        const stats = this.computeRingAreaAndCentroid(outerRing)
        if (!stats?.centroid) return
        if (!best || (stats.area ?? 0) > (best.area ?? 0)) {
          best = stats
        }
      })

      const centroidPoint = best?.centroid
        ? { lat: best.centroid[0], lng: best.centroid[1] }
        : null

      if (centroidPoint && this.pointInPolygons(centroidPoint, polygons)) {
        center = [centroidPoint.lat, centroidPoint.lng]
      }

      if (!center && labelPoint && this.pointInPolygons(labelPoint, polygons)) {
        center = [labelPoint.lat, labelPoint.lng]
      }

      if (!center && labelPoint) {
        center = [labelPoint.lat, labelPoint.lng]
      }

      if (!center && layer?.getCenter) {
        const c = layer.getCenter()
        if (c) center = [c.lat, c.lng]
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
    capacityFlowStrokeWidth(capacityMw, baseWidth = 0) {
      const maxCapacity = Math.max(this.maxValue || 1, 1)
      const safeCapacity = Math.max(Number(capacityMw) || 0, 0)
      const t = Math.min(safeCapacity / maxCapacity, 1)
      const scaledWidth = 5 + (18 * Math.pow(t, 0.65))
      return Math.max(baseWidth + 5, Math.round(scaledWidth * 10) / 10)
    },

    // Color by direction (A->B is positive)
    flowColor(mw) {
      if (!Number.isFinite(mw)) return '#999'
      if (mw >  0) return '#3fb950' // export from A to B
      if (mw <  0) return '#e5534b' // export from B to A (i.e., A imports)
      return '#9aa0a6'
    },
    // Build a tiny arrowhead polygon near the line end
    makeArrowHead(pStart, pEnd, sizeMeters = 25000, { minPx = 6, maxPx = 14 } = {}) {
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
      const px = Math.max(minPx, Math.min(maxPx, sizeMeters / Math.max(metersPerPixel, 1)))

      const left  = tip.add(perp.multiplyBy(px * 0.6)).subtract(unit.multiplyBy(px))
      const right = tip.subtract(perp.multiplyBy(px * 0.6)).subtract(unit.multiplyBy(px))

      const toLatLng = (pt) => map.layerPointToLatLng(pt)
      return [ toLatLng(left), toLatLng(tip), toLatLng(right) ]
    },
    getLatestFlowValue(edgeKey) {
      const realFlow = this.latestRealFlowsByEdge?.[edgeKey]
      if (Number.isFinite(realFlow?.value)) {
        return realFlow.value
      }

      const series = this.flowsData?.[edgeKey]
      if (!series) return null

      let latestTimestamp = -Infinity
      let latestValue = null

      Object.entries(series).forEach(([timestamp, value]) => {
        const parsedTimestamp = Number(timestamp)
        const parsedValue = Number(value)
        if (!Number.isFinite(parsedTimestamp) || !Number.isFinite(parsedValue)) return
        if (parsedTimestamp > latestTimestamp) {
          latestTimestamp = parsedTimestamp
          latestValue = parsedValue
        }
      })

      return latestValue
    },
    buildCurvedFlowPoints(start, end, edgeKey, segments = 22) {
      if (!this.map || !start || !end) return []

      const startLatLng = L.latLng(start[0], start[1])
      const endLatLng = L.latLng(end[0], end[1])
      const startPoint = this.map.latLngToLayerPoint(startLatLng)
      const endPoint = this.map.latLngToLayerPoint(endLatLng)
      const delta = endPoint.subtract(startPoint)
      const length = Math.max(Math.hypot(delta.x, delta.y), 1)
      const unit = delta.multiplyBy(1 / length)
      const perpendicular = L.point(-unit.y, unit.x)
      const bendDirection = this._rand01(`curve:${edgeKey}`) >= 0.5 ? 1 : -1
      const bendDepth = Math.max(18, Math.min(60, length * 0.18)) * bendDirection
      const controlPoint = startPoint
        .add(delta.multiplyBy(0.5))
        .add(perpendicular.multiplyBy(bendDepth))

      const points = []
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments
        const oneMinusT = 1 - t
        const x = (oneMinusT * oneMinusT * startPoint.x) +
          (2 * oneMinusT * t * controlPoint.x) +
          (t * t * endPoint.x)
        const y = (oneMinusT * oneMinusT * startPoint.y) +
          (2 * oneMinusT * t * controlPoint.y) +
          (t * t * endPoint.y)
        points.push(this.map.layerPointToLatLng(L.point(x, y)))
      }

      return points
    },
    clearFlowsOverlay() {
      if (this.flowsLayer) {
        this.flowsLayer.remove()
        this.flowsLayer = null
      }
    },
    updateFlowsOverlay() {
      this.clearFlowsOverlay()

      if (!this.map || !this.showFlows || this.heatmapType !== 'capacity') return
      if (!Object.keys(this.flowsData || {}).length) return

      const overlay = L.featureGroup()
      const routeColor = '#718adb'
      const capacityData = this.currentDataByISO2 || {}

      this.flowEdges.forEach(([fromIso, toIso]) => {
        const rawFlow = this.getLatestFlowValue(`${fromIso}-${toIso}`)
        if (!Number.isFinite(rawFlow) || Math.abs(rawFlow) < 1) return

        const sourceIso = rawFlow >= 0 ? fromIso : toIso
        const targetIso = rawFlow >= 0 ? toIso : fromIso

        if (!Number.isFinite(capacityData[sourceIso]) || !Number.isFinite(capacityData[targetIso])) {
          return
        }

        const sourceCenter = this.getCountryCenter(sourceIso)
        const targetCenter = this.getCountryCenter(targetIso)
        if (!sourceCenter || !targetCenter) return

        const curvePoints = this.buildCurvedFlowPoints(sourceCenter, targetCenter, `${sourceIso}-${targetIso}`)
        if (curvePoints.length < 2) return

        const strokeWidth = Math.max(2, this.flowStrokeWidth(Math.abs(rawFlow)))
        const capacityStrokeWidth = this.capacityFlowStrokeWidth(capacityData[targetIso], strokeWidth)

        overlay.addLayer(L.polyline(curvePoints, {
          pane: 'flowsPane',
          color: routeColor,
          weight: capacityStrokeWidth,
          opacity: 0.7,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'capacity-flow-route capacity-flow-route--capacity'
        }))

        overlay.addLayer(L.polyline(curvePoints, {
          pane: 'flowsPane',
          color: '#1f2e57',
          weight: strokeWidth + 4,
          opacity: 0.18,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'capacity-flow-route capacity-flow-route--glow'
        }))

        overlay.addLayer(L.polyline(curvePoints, {
          pane: 'flowsPane',
          color: routeColor,
          weight: strokeWidth,
          opacity: 0.96,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'capacity-flow-route'
        }))

        const arrowStart = curvePoints[Math.max(0, curvePoints.length - 4)]
        const arrowEnd = curvePoints[curvePoints.length - 1]
        const capacityArrowHead = this.makeArrowHead(
          arrowStart,
          arrowEnd,
          18000 + capacityStrokeWidth * 2200,
          { minPx: 9, maxPx: 22 }
        )
        if (capacityArrowHead?.length) {
          overlay.addLayer(L.polygon(capacityArrowHead, {
            pane: 'flowsPane',
            color: routeColor,
            fillColor: routeColor,
            fillOpacity: 0.7,
            weight: 1,
            opacity: 0.7,
            interactive: false,
            className: 'capacity-flow-arrow capacity-flow-arrow--capacity'
          }))
        }

        const arrowHead = this.makeArrowHead(arrowStart, arrowEnd, 14000 + strokeWidth * 1800)
        if (arrowHead?.length) {
          overlay.addLayer(L.polygon(arrowHead, {
            pane: 'flowsPane',
            color: routeColor,
            fillColor: routeColor,
            fillOpacity: 0.98,
            weight: 1,
            opacity: 0.98,
            interactive: false,
            className: 'capacity-flow-arrow'
          }))
        }
      })

      if (!overlay.getLayers().length) return

      this.flowsLayer = overlay
      this.flowsLayer.addTo(this.map)
    },
    async redrawFlowsWhenReady() {
      // Wait up to ~2s for layers to attach
      const needs = new Set(this.flowEdges.flat()) // ISO2 involved in flows
      const have = () => [...needs].every(iso => this.layerByISO2[iso])
      const start = performance.now()
      while (!have() && performance.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 50))
      }
      this.updateFlowsOverlay()
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


    onSliderChange() {
      // const slider = this.$el.querySelector('.enhanced-time-slider');
      // if (slider) {
      //   slider.classList.add('transitioning');
      //   setTimeout(() => slider.classList.remove('transitioning'), 200);
      // }
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
      const { x, y } = this.usesStackedModalLayout
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
        resForecastData: null,
        meta: null,
        generationView: 'all',
        position: { x, y },
        size: { width: modalWidth, height: modalHeight },
        lastExpandedSize: expandedSize,
        thumbnail: useThumbnailMode,
        userModified: false
      }

      const desktopLayout = this.getDesktopLayoutPosition(modal, modal.size)
      if (!this.usesStackedModalLayout && desktopLayout) {
        modal.position = desktopLayout.position
        modal.size = desktopLayout.size
      }

      if (this.usesStackedModalLayout) {
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
      if (!this.usesStackedModalLayout || typeof window === 'undefined') return

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
      if (this.usesStackedModalLayout) return

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
      if (this.usesStackedModalLayout) return

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
      if (this.usesStackedModalLayout) return

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
          
          const url = buildApiUrl(`capacity/latest/?country=${encodeURIComponent(iso2)}`)
          const { data: response } = await axios.get(url)
          data = this.applyCapacityModalOverrides(response.items)
        } else if (type === 'generation') {
          // Use existing generation method
          const iso2 = this.getCountryISO2ByName(country)
          if (!iso2) throw new Error('Country not found')

          const { start, end } = this.getGenerationRangeDates()
          const startDate = encodeURIComponent(start.toISOString())
          const endDate = encodeURIComponent(end.toISOString())
          const resolutionParam = this.getGenerationResolutionParam()

          const url = buildApiUrl(`generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}${resolutionParam}`)
          const todayForecastRange = this.getTodayRangeDates()
          const modalForecastRange = this.selectedTimeRange === 'hours'
            ? { ...todayForecastRange, resolutionParam: '' }
            : this.selectedTimeRange === 'days'
            ? { start, end, resolutionParam }
            : this.selectedTimeRange === 'months'
              ? { start, end, resolutionParam }
              : this.selectedTimeRange === 'years'
                ? { start, end, resolutionParam }
                : { ...todayForecastRange, resolutionParam: '' }
          const [rangeResponse, forecastItems] = await Promise.all([
            axios.get(url),
            this.fetchGenerationForecastRange(iso2, modalForecastRange)
          ])
          const response = rangeResponse?.data || {}
          data = this.applyGenerationPsrOverrides(response.items)
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

    async refreshVisibleGenerationModals() {
      const visibleGenerationModals = this.separateModals.filter(
        modal => modal.visible && modal.type === 'generation'
      )
      if (!visibleGenerationModals.length) return

      await Promise.allSettled(
        visibleGenerationModals.map(modal =>
          this.loadSeparateModalData(modal.id, modal.country, modal.type)
        )
      )
    },

    async refreshVisiblePriceModals() {
      const visiblePriceModals = this.separateModals.filter(
        modal => modal.visible && modal.type === 'prices'
      )
      if (!visiblePriceModals.length) return

      await Promise.allSettled(
        visiblePriceModals.map(modal =>
          this.loadSeparateModalData(modal.id, modal.country, modal.type)
        )
      )
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
        if (modal.type === 'generation' && modal.generationView === 'res') {
          await this.setGenerationModalView(modalId, 'res', { force: true })
          return
        }
        await this.loadSeparateModalData(modalId, modal.country, modal.type)
      }
    },

    async setGenerationModalView(modalId, view, { force = false } = {}) {
      const modal = this.separateModals.find(m => m.id === modalId)
      if (!modal || modal.type !== 'generation') return
      if (!force && modal.generationView === view) return

      modal.generationView = view

      if (view === 'res') {
        if (force || modal.resForecastData === null) {
          modal.loading = true
          modal.error = null
          try {
            const iso2 = this.getCountryISO2ByName(modal.country)
            if (!iso2) throw new Error('Country not found')
            modal.resForecastData = await this.fetchGenerationResRange(iso2)
          } catch (error) {
            console.error(`Failed to load RES forecast for ${modal.country}:`, error)
            modal.error = error.message || 'Failed to load RES forecast data'
          } finally {
            modal.loading = false
          }
        }
      }

      await nextTick()
      this.createSeparateModalChart(modalId)
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

        const generationByTech = await this.getGenerationByTechnologyAt(iso2, Number(this.currentTimestamp))
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
          generationTimestampLabel: Number.isFinite(this.currentTimestamp)
            ? `Generation at ${new Date(this.currentTimestamp).toLocaleString()}`
            : '',
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
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1,
                callbacks: {
                  label: context => {
                    const index = context.dataIndex
                    const installed = Number(context.chart.$capacityValues?.[index]) || 0
                    const generationValue = Number(context.chart.$generationValues?.[index]) || 0
                    const utilisation = installed > 0 ? (generationValue / installed) * 100 : 0

                    if (context.datasetIndex === 0) {
                      return `Generation: ${formatMwValue(generationValue)} MW`
                    }

                    return `Capacity: ${formatMwValue(installed)} MW (${formatPercentValue(utilisation)})`
                  }
                }
              }
            },
            interaction: { mode: 'index', axis: 'y', intersect: false }
          }
        }))
        modal.chart.$capacityValues = capacityValues
        modal.chart.$generationValues = generationMapped

      } else if (modal.type === 'generation') {
          if (modal.generationView === 'res') {
            const items = Array.isArray(modal.resForecastData)
              ? JSON.parse(JSON.stringify(modal.resForecastData))
              : []

            const resItems = items.filter(item => {
              const tech = (item.psr_name || item.psr_type || '').toString().toLowerCase()
              return tech.includes('wind') || tech.includes('solar')
            })

            const timestamps = Array.from(
              new Set(resItems.map(i => Date.parse(i.datetime_utc)))
            ).filter(Number.isFinite).sort((a, b) => a - b)

            const latestTimestamp = timestamps[timestamps.length - 1] || null
            const xMin = timestamps.length ? timestamps[0] : undefined
            const xMax = timestamps.length ? timestamps[timestamps.length - 1] : undefined

            const byTech = new Map()
            resItems.forEach(i => {
              const tech = i.psr_name || i.psr_type || 'Unknown'
              const time = Date.parse(i.datetime_utc)
              if (!Number.isFinite(time)) return
              const value = Number(i.forecast_mw ?? i.generation_mw ?? i.total_generation_mw ?? i.value)
              if (!Number.isFinite(value)) return
              if (!byTech.has(tech)) byTech.set(tech, new Map())
              byTech.get(tech).set(time, value)
            })

            const techSummaries = []
            const datasets = []
            byTech.forEach((series, tech) => {
              const color = this.psrColors[tech] || { border: 'rgba(0,0,0,0.8)', fill: 'rgba(0,0,0,0.4)' }
              const data = timestamps.map(ts => ({
                x: ts,
                y: series.get(ts) || 0
              }))
              const latestValue = latestTimestamp ? (series.get(latestTimestamp) || 0) : 0
              techSummaries.push({
                name: tech,
                value: latestValue,
                color: color.border
              })
              datasets.push({
                label: tech,
                data,
                borderColor: color.border,
                backgroundColor: color.fill,
                pointRadius: 0,
                borderWidth: 1,
                fill: true,
                stack: 'res',
                tension: 0.25
              })
            })

            const totalGeneration = techSummaries.reduce((sum, entry) => sum + (entry.value || 0), 0)
            const sortedSummaries = techSummaries
              .slice()
              .sort((a, b) => (b.value || 0) - (a.value || 0))

            const legendItems = sortedSummaries.map(entry => ({
              name: entry.name,
              value: entry.value || 0,
              share: totalGeneration > 0 ? (entry.value / totalGeneration) * 100 : 0,
              color: entry.color
            }))

            const timeConfig = this.getGenerationChartTimeConfig(true)

            modal.meta = {
              totalGeneration,
              topTechnologies: legendItems.slice(0, 3),
              legendItems,
              updatedLabel: latestTimestamp
                ? `RES forecast: ${new Date(latestTimestamp).toLocaleString()}`
                : '',
              todayForecastTotal: null,
              todayForecastLabel: ''
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
                scales: {
                  x: {
                    type: 'time',
                    time: timeConfig,
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
            }

            modal.chart = markRaw(new Chart(ctx, cfg))
            this.updateGenerationCursorLines()
            return
          }

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
          const todayForecastRange = this.getTodayRangeDates();
          const forecastSeriesOptions = this.selectedTimeRange === 'days'
            ? { bucket: 'day', aggregation: 'average' }
            : this.selectedTimeRange === 'months'
              ? { bucket: 'month', aggregation: 'average' }
              : this.selectedTimeRange === 'years'
                ? { bucket: 'year', aggregation: 'average' }
                : {
                  startMs: todayForecastRange.start.getTime(),
                  endMs: todayForecastRange.end.getTime(),
                  bucket: 'hour',
                  aggregation: 'average'
                };
          let forecastSeries = this.prepareForecastSeries(modal.forecastData, forecastSeriesOptions);

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

          const timeConfig = this.getGenerationChartTimeConfig();
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
                time: timeConfig,
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
        const timestamps = data.map(point => point.x).filter(Number.isFinite)
        let xMin = timestamps.length ? Math.min(...timestamps) : undefined
        let xMax = timestamps.length ? Math.max(...timestamps) : undefined
        if (['days', 'months', 'years'].includes(this.selectedTimeRange)) {
          const rangeTimeline = this.generatePriceRangeTimestamps()
          if (rangeTimeline.length) {
            xMin = rangeTimeline[0]
            xMax = rangeTimeline[rangeTimeline.length - 1]
          }
        }
        const nowTs = Date.now()
        const endOfDay = new Date()
        endOfDay.setHours(23, 59, 59, 999)
        const endOfDayTs = endOfDay.getTime()

        const pastData = data.filter(point => point.x < nowTs || point.x > endOfDayTs)
        const futureData = data.filter(point => point.x >= nowTs && point.x <= endOfDayTs)

        if (futureData.length && pastData.length) {
          const lastPastPoint = pastData[pastData.length - 1]
          if (lastPastPoint && futureData[0]?.x !== lastPastPoint.x) {
            futureData.unshift(lastPastPoint)
          }
        }

        const datasets = [{
          label: 'Price (EUR/MWh)',
          data: pastData,
          borderColor: 'rgba(102,126,234,1)',
          backgroundColor: 'rgba(102,126,234,0.25)',
          pointRadius: 0,
          borderWidth: 2,
          fill: true,
          tension: 0.25
        }]

        if (futureData.length) {
          datasets.push({
            label: 'Future price (today)',
            data: futureData,
            borderColor: '#facc15',
            backgroundColor: 'rgba(250, 204, 21, 0.18)',
            borderDash: [6, 3],
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
            tension: 0.25,
            spanGaps: true
          })
        }

        const timeConfig = this.getPriceChartTimeConfig()
        const cfg = {
          type: 'line',
          data: {
            datasets
          },
          plugins: [generationCursorPlugin],
          plugins: [generationCursorPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            parsing: { xAxisKey: 'x', yAxisKey: 'y' },
            scales: {
              x: {
                type: 'time',
                time: timeConfig,
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
                display: false
              },
              tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1
              },
              generationCursor: {
                timestamp: this.getGenerationCursorTimestamp(),
                color: '#fb923c',
                lineWidth: 1.5,
                dash: [5, 4]
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        }

        modal.chart = markRaw(new Chart(ctx, cfg))
        this.updateGenerationCursorLines()
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
          plugins: [generationCursorPlugin],
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
                display: false
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
              },
              generationCursor: {
                timestamp: this.getGenerationCursorTimestamp(),
                color: '#fb923c',
                lineWidth: 1.5,
                dash: [5, 4]
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        }

        modal.chart = markRaw(new Chart(ctx, cfg))
        this.updateGenerationCursorLines()
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
      this.playInterval = setInterval(() => {
        if (this.currentTimeIndex >= this.maxTimeIndex) {
          this.pauseAnimation();
        } else {
          this.currentTimeIndex++;
        }
      }, this.playSpeed);
    },
    pauseAnimation() {
      this.isPlaying = false;
      if (this.playInterval) { clearInterval(this.playInterval); this.playInterval = null; }
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

    generateLastNDaysTimestamps(days) {
      const timestamps = []
      const now = new Date()
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

      for (let i = days; i >= 0; i--) {
        const timestamp = new Date(currentDay)
        timestamp.setDate(currentDay.getDate() - i)
        timestamps.push(timestamp.getTime())
      }

      return timestamps
    },

    generateLastNMonthsTimestamps(months) {
      const timestamps = []
      const now = new Date()
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      for (let i = months; i >= 0; i--) {
        const timestamp = new Date(currentMonth)
        timestamp.setMonth(currentMonth.getMonth() - i)
        timestamps.push(timestamp.getTime())
      }

      return timestamps
    },

    generateLastNYearsTimestamps(years) {
      const timestamps = []
      const now = new Date()
      const currentYear = new Date(now.getFullYear(), 0, 1)

      for (let i = years; i >= 0; i--) {
        const timestamp = new Date(currentYear)
        timestamp.setFullYear(currentYear.getFullYear() - i)
        timestamps.push(timestamp.getTime())
      }

      return timestamps
    },

    generatePriceRangeTimestamps() {
      if (this.selectedTimeRange === 'days') {
        return this.generateLastNDaysTimestamps(30)
      }
      if (this.selectedTimeRange === 'months') {
        return this.generateLastNMonthsTimestamps(12)
      }
      if (this.selectedTimeRange === 'years') {
        return this.generateLastNYearsTimestamps(5)
      }
      return this.generateLast48HoursTimestamps()
    },

    getPriceRangeDates() {
      const now = new Date()
      let start

      if (this.selectedTimeRange === 'days') {
        start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
      } else if (this.selectedTimeRange === 'months') {
        start = new Date(now.getFullYear(), now.getMonth() - 12, 1)
      } else if (this.selectedTimeRange === 'years') {
        start = new Date(now.getFullYear() - 5, 0, 1)
      } else {
        start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
      }

      const end = this.selectedTimeRange === 'months'
        ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
        : this.selectedTimeRange === 'years'
          ? new Date(now.getFullYear() + 1, 0, 1)
          : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

      return { start, end }
    },

    getPriceRangeKey() {
      const { start, end } = this.getPriceRangeDates()
      const startKey = start.toISOString().split('T')[0]
      const endKey = end.toISOString().split('T')[0]
      return `${this.selectedTimeRange}_${startKey}_${endKey}`
    },

    normalizePriceTimestamp(timestampMs) {
      const date = new Date(timestampMs)

      if (this.selectedTimeRange === 'months') {
        return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
      }
      if (this.selectedTimeRange === 'years') {
        return new Date(date.getFullYear(), 0, 1).getTime()
      }
      if (this.selectedTimeRange === 'days') {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      }
      if (this.selectedTimeRange === 'hours' && this.currentTimeIndex === this.maxTimeIndex) {
        const quarterMs = 15 * 60 * 1000
        return Math.floor(timestampMs / quarterMs) * quarterMs
      }
      return Math.floor(timestampMs / (60 * 60 * 1000)) * (60 * 60 * 1000)
    },

    getPriceResolutionParam() {
      if (this.selectedTimeRange === 'months' || this.selectedTimeRange === 'month') {
        return '&resolution=m'
      }
      if (this.selectedTimeRange === 'days') {
        return '&resolution=d'
      }
      if (this.selectedTimeRange === 'years') {
        return '&resolution=y'
      }
      return ''
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

    generateLastNDaysGenerationTimestamps(days) {
      const timestamps = []
      const now = new Date()
      const currentDayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)

      for (let i = days; i >= 0; i--) {
        timestamps.push(currentDayUTC - (i * 24 * 60 * 60 * 1000))
      }

      return timestamps
    },

    generateLastNMonthsGenerationTimestamps(months) {
      const timestamps = []
      const now = new Date()
      const currentMonthUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)

      for (let i = months; i >= 0; i--) {
        const d = new Date(currentMonthUTC)
        d.setUTCMonth(d.getUTCMonth() - i)
        timestamps.push(d.getTime())
      }

      return timestamps
    },

    generateLastNYearsGenerationTimestamps(years) {
      const timestamps = []
      const now = new Date()
      const currentYearUTC = Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0)

      for (let i = years; i >= 0; i--) {
        const d = new Date(currentYearUTC)
        d.setUTCFullYear(d.getUTCFullYear() - i)
        timestamps.push(d.getTime())
      }

      return timestamps
    },

    generateGenerationRangeTimestamps() {
      if (this.selectedTimeRange === 'days') {
        return this.generateLastNDaysGenerationTimestamps(30)
      }
      if (this.selectedTimeRange === 'months') {
        return this.generateLastNMonthsGenerationTimestamps(12)
      }
      if (this.selectedTimeRange === 'years') {
        return this.generateLastNYearsGenerationTimestamps(5)
      }
      return this.generateLast48HoursGenerationTimestamps()
    },

    getGenerationRangeDates() {
      const now = new Date()
      let start

      if (this.selectedTimeRange === 'days') {
        start = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
      } else if (this.selectedTimeRange === 'months') {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 1, 0, 0, 0, 0))
      } else if (this.selectedTimeRange === 'years') {
        start = new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1, 0, 0, 0, 0))
      } else {
        start = new Date(now.getTime() - (48 * 60 * 60 * 1000))
      }

      const end = this.selectedTimeRange === 'months'
        ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
        : this.selectedTimeRange === 'years'
          ? new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0))
          : new Date(now.getTime())

      return { start, end }
    },

    getTodayRangeDates() {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      return { start, end }
    },

    normalizeGenerationTimestamp(timestampMs) {
      const date = new Date(timestampMs)
      if (this.selectedTimeRange === 'months') {
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
      }
      if (this.selectedTimeRange === 'years') {
        return Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0)
      }
      if (this.selectedTimeRange === 'days') {
        return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
      }
      return Math.floor(timestampMs / (60 * 60 * 1000)) * (60 * 60 * 1000)
    },


    getGenerationResolutionParam() {
      if (this.selectedTimeRange === 'months' || this.selectedTimeRange === 'month') {
        return '&resolution=m'
      }
      if (this.selectedTimeRange === 'days') {
        return '&resolution=d'
      }
      if (this.selectedTimeRange === 'years') {
        return '&resolution=y'
      }
      return ''
    },

    getGenerationChartTimeConfig(forceHour = false) {
      if (forceHour) {
        return { unit: 'hour', tooltipFormat: 'HH:mm', displayFormats: { hour: 'HH:mm' } }
      }
      if (this.selectedTimeRange === 'years') {
        return { unit: 'year', tooltipFormat: 'yyyy', displayFormats: { year: 'yyyy' } }
      }
      if (this.selectedTimeRange === 'months') {
        return { unit: 'month', tooltipFormat: 'MMM yyyy', displayFormats: { month: 'MMM yyyy' } }
      }
      if (this.selectedTimeRange === 'days') {
        return { unit: 'day', tooltipFormat: 'MMM d', displayFormats: { day: 'MMM d' } }
      }
      return { unit: 'hour', tooltipFormat: 'HH:mm', displayFormats: { hour: 'HH:mm' } }
    },

    getPriceChartTimeConfig() {
      if (this.selectedTimeRange === 'years') {
        return { unit: 'year', tooltipFormat: 'yyyy', displayFormats: { year: 'yyyy' } }
      }
      if (this.selectedTimeRange === 'months') {
        return { unit: 'month', tooltipFormat: 'MMM yyyy', displayFormats: { month: 'MMM yyyy' } }
      }
      if (this.selectedTimeRange === 'days') {
        return { unit: 'day', tooltipFormat: 'MMM d', displayFormats: { day: 'MMM d' } }
      }
      return { unit: 'hour', tooltipFormat: 'dd/MM HH:mm', displayFormats: { hour: 'dd/MM HH:mm' } }
    },
    


    async fetchHistoricalPricesForCountry(iso2) {
      if (!this.priceSupported(iso2)) return null

      const cacheKey = `${iso2}_${this.getPriceRangeKey()}`
      const now = Date.now()
      
      if (this.priceCache.has(cacheKey) && 
          this.cacheTimestamp && 
          (now - this.cacheTimestamp) < this.cacheValidityMs) {
        return this.priceCache.get(cacheKey)
      }

      try {
        const { start, end } = this.getPriceRangeDates()

        const resolutionParam = this.getPriceResolutionParam()
        const url = buildApiUrl(`prices/range/?country=${encodeURIComponent(iso2)}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}${resolutionParam}`)
        console.log('[Price] range endpoint:', url)
        const { data } = await axios.get(url, {
          timeout: 10000,
          signal: this.currentAbortController?.signal
        })
        
        const timeData = {}
        
        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            const timestamp = new Date(item.datetime_utc).getTime()
            if (Number.isFinite(item.price)) {
              const normalizedTimestamp = this.normalizePriceTimestamp(timestamp)
              timeData[normalizedTimestamp] = item.price
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
      
      this.availableTimestamps = this.generatePriceRangeTimestamps()
      this.currentTimeIndex = this.maxTimeIndex
      
      const supportedCountries = []
      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (iso2 && this.priceSupported(iso2, feature)) {
          supportedCountries.push(iso2)
        }
      }
      
      const chunkSize = this.getBulkPriceChunkSize()
      const newHistoricalData = {}
      
      const chunks = []
      for (let i = 0; i < supportedCountries.length; i += chunkSize) {
        chunks.push(supportedCountries.slice(i, i + chunkSize))
      }
      const chunkPromises = chunks.map(async (chunk, index) => {
        if (this.currentAbortController?.signal?.aborted) return {}
        try {
          return await this.fetchBulkHistoricalPricesWithRetry(chunk)
        } catch (error) {
          console.error(`Bulk call ${index + 1} failed:`, error)
          return {}
        }
      })
      const results = await Promise.allSettled(chunkPromises)
      for (const result of results) {
        if (result.status === 'fulfilled') {
          Object.assign(newHistoricalData, result.value)
        }
      }

      this.historicalPriceData = newHistoricalData
      this.updateColorScheme()
      this.$nextTick(() => this.updateMapBadges())

    },

    getBulkPriceChunkSize() {
      if (this.selectedTimeRange === 'hours') return 5
      if (this.selectedTimeRange === 'days') return 10
      return 20
    },

    getBulkPriceTimeoutMs() {
      if (this.selectedTimeRange === 'hours') return 60000
      if (this.selectedTimeRange === 'days') return 60000
      return 30000
    },

    async fetchBulkHistoricalPricesWithRetry(countries) {
      try {
        return await this.fetchBulkHistoricalPrices(countries)
      } catch (error) {
        const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '')
        if (!isTimeout || countries.length <= 1 || this.currentAbortController?.signal?.aborted) {
          throw error
        }

        const splitIndex = Math.ceil(countries.length / 2)
        const firstHalf = countries.slice(0, splitIndex)
        const secondHalf = countries.slice(splitIndex)

        const results = await Promise.allSettled([
          this.fetchBulkHistoricalPricesWithRetry(firstHalf),
          this.fetchBulkHistoricalPricesWithRetry(secondHalf)
        ])

        const merged = {}
        let hasData = false
        for (const result of results) {
          if (result.status === 'fulfilled') {
            Object.assign(merged, result.value)
            hasData = true
          }
        }

        if (hasData) {
          return merged
        }

        throw error
      }
    },

    async fetchBulkHistoricalPrices(countries) {
      if (countries.length === 0) return {}
      
      try {
        const { start, end } = this.getPriceRangeDates()

        const resolutionParam = this.getPriceResolutionParam()
        const url = buildApiUrl(`prices/bulk-range/?countries=${countries.join(',')}&contract=A01&start=${start.toISOString().split('T')[0]}&end=${end.toISOString()}${resolutionParam}`)
        console.log('[Price] bulk-range endpoint:', url)
        const { data } = await axios.get(url, {
          timeout: this.getBulkPriceTimeoutMs(),
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
                  const normalizedTimestamp = this.normalizePriceTimestamp(timestamp)
                  timeData[normalizedTimestamp] = item.price
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
        const { start, end } = this.getGenerationRangeDates()

        const resolutionParam = this.getGenerationResolutionParam()
        const url = buildApiUrl('generation/bulk-range/') +
                    `?countries=${countries.join(',')}` +
                    `&start=${start.toISOString()}` +
                    `&end=${end.toISOString()}${resolutionParam}`

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

                const normalizedTs = this.normalizeGenerationTimestamp(t)
                byTs[normalizedTs] = (byTs[normalizedTs] || 0) + v
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

        const url = buildApiUrl('generation-forecast/bulk-range/') +
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

      this.availableGenerationTimestamps = this.generateGenerationRangeTimestamps()
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
      this.$nextTick(() => this.updateMapBadges())
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
      this.$nextTick(() => this.updateMapBadges())
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
        
        const url = buildApiUrl(`generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`)
       
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

    hasCompleteCapacityCoverage() {
      const entries = this.countryCapacityByISO2 || {}
      if (!Object.keys(entries).length) return false

      for (const iso2 of SUPPORTED_CAPACITY_ISO2) {
        if (!Number.isFinite(entries[iso2])) {
          return false
        }
      }

      return true
    },
    
    generationSupported(iso2) {
      return SUPPORTED_GENERATION_ISO2.has(iso2)
    },
    
    priceSupported(iso2, feature) {
      return SUPPORTED_PRICE_ISO2.has(iso2)
    },

    openModal(payload) { this.selectedFeature = payload; this.isModalOpen = true },
    closeModal() { this.isModalOpen = false; this.sliderFloatingEnabled = false },
    openPanel(payload) { this.selectedFeature = payload; this.isModalOpen = true },
    closePanel() {
      this.isModalOpen = false
      this.sliderFloatingEnabled = false
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
        const url = buildApiUrl(`capacity/latest/?country=${encodeURIComponent(iso2)}`)
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

      const supportedCountries = []
      for (const feature of this.countriesGeoJson.features) {
        const iso2 = this.getCountryISO2(feature)
        if (iso2 && this.capacitySupported(iso2)) {
          supportedCountries.push(iso2)
        }
      }
      if (!supportedCountries.length) return

      const updates = {}
      try {
        const url = buildApiUrl(`capacity/bulk-latest/?countries=${supportedCountries.join(',')}`)
        const { data } = await axios.get(url, { timeout: 30000 })

        for (const [iso2, countryData] of Object.entries(data.data || {})) {
          const totalMW = Array.isArray(countryData.items)
            ? countryData.items.reduce((sum, item) => sum + (item.installed_capacity_mw || 0), 0)
            : 0
          if (Number.isFinite(totalMW) && totalMW > 0) {
            updates[iso2] = totalMW
          }
        }
      } catch (e) {
        console.error('Bulk capacity fetch failed:', e)
      }

      this.countryCapacityByISO2 = { ...this.countryCapacityByISO2, ...updates }
      this.updateColorScheme()
      this.updateMapBadges()
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
          await Promise.all([
            this.refreshAllCapacities(),
            this.refreshAllFlows()
          ])
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
        const response = await axios.get('/data/countries.geojson')
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
        const url = buildApiUrl(`capacity/latest/?country=${encodeURIComponent(iso2)}`)
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
              if (vm.isMobileViewport) {
                vm.sliderFloatingEnabled = true
              }

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

                if (!vm.isLargeModalViewport && capacityModalId !== undefined) {
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
      this.updateFlowsOverlay()
    },

    refreshMapLayout() {
      if (!this.map) return
      this.map.invalidateSize({ pan: false, debounceMoveend: true })
      this.handleMapViewportChange()
      if (this.showWindLayer) void this.onWindMapViewportChange()
    },

    queueMapLayoutRefresh() {
      if (!this.map) return

      if (this.mapLayoutRefreshRaf) {
        cancelAnimationFrame(this.mapLayoutRefreshRaf)
      }
      if (this.mapLayoutRefreshTimeoutId) {
        clearTimeout(this.mapLayoutRefreshTimeoutId)
      }

      this.mapLayoutRefreshRaf = requestAnimationFrame(() => {
        this.mapLayoutRefreshRaf = null
        this.refreshMapLayout()

        // WebKit can settle flex/aspect-ratio layout one tick later on first paint.
        this.mapLayoutRefreshTimeoutId = window.setTimeout(() => {
          this.mapLayoutRefreshTimeoutId = null
          this.refreshMapLayout()
        }, 180)
      })
    },

    bindMapResizeObserver() {
      if (!this.map || this.mapResizeObserver || typeof ResizeObserver === 'undefined') return
      const container = this.map.getContainer()
      if (!container) return

      this.mapResizeObserver = new ResizeObserver(() => {
        this.queueMapLayoutRefresh()
      })
      this.mapResizeObserver.observe(container)
    },

    unbindMapResizeObserver() {
      if (this.mapResizeObserver) {
        this.mapResizeObserver.disconnect()
        this.mapResizeObserver = null
      }
    },

    onMapReady(mapObject) {
      this.map = mapObject
      if (!this.map.getPane('flowsPane')) {
        this.map.createPane('flowsPane')
        this.map.getPane('flowsPane').style.zIndex = 650 // above overlay pane
        this.map.getPane('flowsPane').style.pointerEvents = 'none'
      }
      this.ensureIrradiancePane()
      this.bindMapResizeObserver()

      this.updateResponsiveZoom()
      this.updateMapBadges()
      this.map.on('zoomend moveend', this.handleMapViewportChange)
      this.map.on('moveend zoomend', this.onWindMapViewportChange)
      void this.redrawFlowsWhenReady()
      this.queueMapLayoutRefresh()

      if (this.showIrradianceLayer) {
        this.startIrradianceLayerRefresh()
        void this.refreshIrradianceLayerOverlay()
      }
      if (this.showWindLayer) {
        void this.startWindLayer()
      }

    },

    handleMapViewportChange() {
      this.updateMapBadges()
      this.updateFlowsOverlay()
    },

    ensureIrradiancePane() {
      if (!this.map || this.map.getPane('irradiancePane')) return
      this.map.createPane('irradiancePane')
      this.map.getPane('irradiancePane').style.zIndex = 430
      this.map.getPane('irradiancePane').style.pointerEvents = 'none'
    },

    normalizeIrradianceBulkResponse(payload) {
      const result = {}
      const countries = payload?.data || {}

      Object.entries(countries).forEach(([iso2, countryData]) => {
        const series = Array.isArray(countryData?.items)
          ? countryData.items
              .map((item) => ({
                timestamp: Date.parse(item?.datetime_utc),
                irradiance: Math.round((Number(item?.irradiance_wm2) || 0) * 100) / 100
              }))
              .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.irradiance))
              .sort((a, b) => a.timestamp - b.timestamp)
          : []

        if (series.length) {
          result[iso2] = series
        }
      })

      return result
    },

    getIrradianceValueForTimestamp(series, targetTimestamp) {
      if (!Array.isArray(series) || !series.length) return null

      const target = Number.isFinite(targetTimestamp) ? targetTimestamp : Date.now()
      let nearestPoint = series[0]
      let nearestDistance = Math.abs(series[0].timestamp - target)

      for (const point of series) {
        const distance = Math.abs(point.timestamp - target)
        if (distance < nearestDistance) {
          nearestPoint = point
          nearestDistance = distance
        }
      }

      return nearestPoint?.irradiance ?? null
    },

    buildIrradianceSnapshot() {
      const snapshot = {}
      const targetTimestamp = Number(this.currentTimestamp)

      Object.entries(this.irradianceSeriesByISO2).forEach(([iso2, series]) => {
        const value = this.getIrradianceValueForTimestamp(series, targetTimestamp)
        if (Number.isFinite(value)) {
          snapshot[iso2] = value
        }
      })

      return snapshot
    },

    getIrradianceOverlayColor(value) {
      const normalized = Math.max(0, Math.min(1, value / 800))
      const hue = 52 - normalized * 14
      const saturation = 88
      const lightness = 60 - normalized * 10
      return `hsl(${hue} ${saturation}% ${lightness}%)`
    },

    getIrradianceOverlayPoints() {
      return Object.entries(this.irradianceLayerByISO2)
        .map(([iso2, value]) => {
          const center = this.getCountryCenter(iso2)
          if (!center || !Number.isFinite(value) || value <= 0) return null
          return {
            lat: center[0],
            lng: center[1],
            value
          }
        })
        .filter(Boolean)
    },

    getIrradianceOverlayRgba(value, maxValue) {
      const normalized = maxValue > 0 ? Math.max(0, Math.min(1, value / maxValue)) : 0
      const referenceScale = Math.max(0, Math.min(1, value / 800))
      if (referenceScale < 0.04) return [0, 0, 0, 0]

      let r
      let g
      let b
      if (referenceScale < 0.5) {
        const stage = referenceScale / 0.5
        r = 255
        g = Math.round(248 - stage * 78)
        b = Math.round(220 - stage * 220)
      } else {
        const stage = (referenceScale - 0.5) / 0.5
        r = 255
        g = Math.round(185 - stage * 155)
        b = 0
      }

      const alpha = Math.round(62 + Math.max(normalized, referenceScale) * 155)
      return [r, g, b, alpha]
    },

    renderIrradianceOverlayDataUrl(points) {
      if (!points.length) return null

      const [[south, west], [north, east]] = this.europeBounds
      const canvasWidth = 420
      const canvasHeight = 320
      const maxValue = Math.max(...points.map((point) => point.value), 1)
      const canvas = document.createElement('canvas')
      canvas.width = canvasWidth
      canvas.height = canvasHeight

      const context = canvas.getContext('2d')
      if (!context) return null

      const image = context.createImageData(canvasWidth, canvasHeight)

      for (let py = 0; py < canvasHeight; py += 1) {
        for (let px = 0; px < canvasWidth; px += 1) {
          const lat = north - (py / canvasHeight) * (north - south)
          const lng = west + (px / canvasWidth) * (east - west)

          let weightSum = 0
          let valueSum = 0

          for (const point of points) {
            const dLat = lat - point.lat
            const dLng = lng - point.lng
            const distanceSquared = dLat * dLat + dLng * dLng

            if (distanceSquared < 0.0001) {
              weightSum = 1
              valueSum = point.value
              break
            }

            const weight = 1 / (distanceSquared * distanceSquared)
            weightSum += weight
            valueSum += weight * point.value
          }

          const interpolatedValue = weightSum > 0 ? valueSum / weightSum : 0
          const [r, g, b, a] = this.getIrradianceOverlayRgba(interpolatedValue, maxValue)
          const index = (py * canvasWidth + px) * 4

          image.data[index] = r
          image.data[index + 1] = g
          image.data[index + 2] = b
          image.data[index + 3] = a
        }
      }

      context.putImageData(image, 0, 0)
      return canvas.toDataURL('image/png')
    },

    applyIrradianceOverlay() {
      if (!this.map) return
      this.ensureIrradiancePane()

      if (this.irradianceOverlayLayer) {
        this.irradianceOverlayLayer.remove()
        this.irradianceOverlayLayer = null
      }

      this.irradianceLayerByISO2 = this.buildIrradianceSnapshot()
      const points = this.getIrradianceOverlayPoints()
      if (!points.length) return

      const imageUrl = this.renderIrradianceOverlayDataUrl(points)
      if (!imageUrl) return

      this.irradianceOverlayLayer = L.imageOverlay(imageUrl, this.europeBounds, {
        pane: 'irradiancePane',
        opacity: 0.92,
        interactive: false,
        className: 'irradiance-overlay-image'
      })
      this.irradianceOverlayLayer.addTo(this.map)
    },

    clearIrradianceLayerOverlay() {
      this.irradianceLayerRequestId += 1
      this.irradianceLayerLoading = false
      this.irradianceLayerError = null
      this.irradianceSeriesByISO2 = {}
      this.irradianceLayerByISO2 = {}

      if (this.irradianceOverlayLayer && this.map?.hasLayer(this.irradianceOverlayLayer)) {
        this.map.removeLayer(this.irradianceOverlayLayer)
      }
      this.irradianceOverlayLayer = null
    },

    startIrradianceLayerRefresh() {
      this.stopIrradianceLayerRefresh()
      this.irradianceLayerRefreshTimer = window.setInterval(() => {
        void this.refreshIrradianceLayerOverlay()
      }, IRRADIANCE_LAYER_REFRESH_MS)
    },

    stopIrradianceLayerRefresh() {
      if (this.irradianceLayerRefreshTimer) {
        clearInterval(this.irradianceLayerRefreshTimer)
        this.irradianceLayerRefreshTimer = null
      }
    },

    async refreshIrradianceLayerOverlay() {
      if (!this.showIrradianceLayer || !this.map) return

      const requestId = ++this.irradianceLayerRequestId
      this.irradianceLayerLoading = true
      this.irradianceLayerError = null

      try {
        const url = buildApiUrl('generation-irradiance/bulk-range/?period=today')
        const { data } = await axios.get(url, { timeout: 20000 })

        if (requestId !== this.irradianceLayerRequestId || !this.showIrradianceLayer) return

        this.irradianceSeriesByISO2 = this.normalizeIrradianceBulkResponse(data)
        this.applyIrradianceOverlay()
      } catch (error) {
        if (requestId !== this.irradianceLayerRequestId) return
        this.irradianceLayerError = 'Tilted irradiance overlay is temporarily unavailable'
        console.warn('Failed to load tilted irradiance overlay:', error)
        if (this.irradianceOverlayLayer && this.map?.hasLayer(this.irradianceOverlayLayer)) {
          this.map.removeLayer(this.irradianceOverlayLayer)
        }
        this.irradianceOverlayLayer = null
      } finally {
        if (requestId === this.irradianceLayerRequestId) {
          this.irradianceLayerLoading = false
        }
      }
    },

    ensureMapBadgeLayer() {
      if (!this.map) return null

      if (!this.mapBadgeLayer) {
        this.mapBadgeLayer = L.layerGroup()
        this.mapBadgeLayer.addTo(this.map)
      }

      return this.mapBadgeLayer
    },

    updateMapBadges() {
      const badgeLayer = this.ensureMapBadgeLayer()
      if (!badgeLayer) return

      badgeLayer.clearLayers()

      const shouldShowBadges = ['prices', 'capacity', 'generation'].includes(this.heatmapType)
      if (!shouldShowBadges) return

      const formatValue = this.heatmapType === 'prices'
        ? (val) => val.toFixed(0)
        : (val) => this.formatMegawatts(val)

      Object.entries(this.currentDataByISO2).forEach(([iso2, value]) => {
        if (!Number.isFinite(value)) return

        const center = this.getCountryCenter(iso2)
        if (!center) return

        const badgeHtml = `
          <div class="price-badge price-badge--${this.heatmapType}">
            <div class="price-badge__value" style="font-weight:bold; color: white;">${formatValue(value)}</div>
          </div>
        `

        const marker = L.marker(center, {
          icon: L.divIcon({
            className: 'price-badge-icon',
            html: badgeHtml,
            iconSize: [72, 48],
            iconAnchor: [20, 5]
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
              mode: 'index',
              intersect: false,
              callbacks: {
                label: function(context) {
                  const index = context.dataIndex
                  const installed = Number(capacityValues[index]) || 0
                  const generationValue = Number(generationMapped[index]) || 0
                  const utilisation = installed > 0 ? (generationValue / installed) * 100 : 0

                  if (context.datasetIndex === 0) {
                    return `Generation: ${generationValue.toFixed(0)} MW`
                  }

                  return `Capacity: ${installed.toFixed(0)} MW (${utilisation.toFixed(1)}%)`
                }
              }
            }
          },
          interaction: {
            mode: 'index',
            intersect: false
          }
        }
      }))
    },

    async getGenerationByTechnology(iso2) {
      return this.getGenerationByTechnologyAt(iso2, Date.now())
    },

    findNearestSeriesValue(seriesEntry, timestamp) {
      if (!seriesEntry || !seriesEntry.series || seriesEntry.series.size === 0) return undefined
      const timestamps = seriesEntry.timestamps || []
      if (!timestamps.length) return undefined
      if (seriesEntry.series.has(timestamp)) return seriesEntry.series.get(timestamp)

      let left = 0
      let right = timestamps.length - 1
      while (left <= right) {
        const mid = Math.floor((left + right) / 2)
        const current = timestamps[mid]
        if (current === timestamp) return seriesEntry.series.get(current)
        if (current < timestamp) {
          left = mid + 1
        } else {
          right = mid - 1
        }
      }

      const past = right >= 0 ? timestamps[right] : null
      const future = left < timestamps.length ? timestamps[left] : null
      if (past !== null) return seriesEntry.series.get(past)
      if (future !== null) return seriesEntry.series.get(future)
      return undefined
    },

    async getGenerationByTechnologyAt(iso2, timestamp) {
      if (!iso2 || !Number.isFinite(timestamp)) return {}

      const range = this.selectedTimeRange || 'hours'
      const cacheKey = `${iso2}_${range}`
      const cached = this.generationByTechCache.get(cacheKey)
      const now = Date.now()
      const isStale = !cached || (now - cached.fetchedAt > this.cacheValidityMs)

      if (isStale) {
        await this.fetchGenerationByTechnologySeries(iso2, range)
      }

      const entry = this.generationByTechCache.get(cacheKey)
      if (!entry || !entry.byTech) return {}

      const byTech = {}
      entry.byTech.forEach((seriesEntry, key) => {
        const value = this.findNearestSeriesValue(seriesEntry, timestamp)
        if (value !== undefined) {
          byTech[key] = value
        }
      })

      return byTech
    },

    async fetchGenerationByTechnologySeries(iso2, range) {
      if (!iso2) return

      const effectiveRange = range || this.selectedTimeRange || 'hours'
      const cacheKey = `${iso2}_${effectiveRange}`
      if (this.generationByTechPending.has(cacheKey)) {
        await this.generationByTechPending.get(cacheKey)
        return
      }

      const fetchPromise = (async () => {
        try {
          const { start, end } = this.getGenerationRangeDates()
          const resolutionParam = this.getGenerationResolutionParam()
          const startDate = encodeURIComponent(start.toISOString())
          const endDate = encodeURIComponent(end.toISOString())

          const url = buildApiUrl(`generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}${resolutionParam}`)
          const { data } = await axios.get(url)

          const items = this.applyGenerationPsrOverrides(data.items)
          const byTech = new Map()

          const getEntry = key => {
            if (!byTech.has(key)) {
              byTech.set(key, { series: new Map(), timestamps: [] })
            }
            return byTech.get(key)
          }

          for (const item of items) {
            const timestamp = Date.parse(item.datetime_utc)
            if (!Number.isFinite(timestamp)) continue

            const tech = item.psr_name || item.psr_type || 'Unknown'
            const value = Number(item.generation_mw) || 0

            getEntry(tech).series.set(timestamp, value)

            const normalized = this.normalizeTechnologyKey(tech)
            if (normalized && normalized !== tech) {
              getEntry(normalized).series.set(timestamp, value)
            }
          }

          byTech.forEach(entry => {
            entry.timestamps = Array.from(entry.series.keys()).sort((a, b) => a - b)
          })

          this.generationByTechCache.set(cacheKey, {
            fetchedAt: Date.now(),
            byTech
          })
        } catch (e) {
          console.error(`Failed to get generation for ${iso2}`, e)
        }
      })()

      this.generationByTechPending.set(cacheKey, fetchPromise)
      try {
        await fetchPromise
      } finally {
        this.generationByTechPending.delete(cacheKey)
      }
    },

    async fetchGenerationForecastRange(iso2, rangeOptions = null) {
      if (!iso2) return []

      try {
        const { start, end } = rangeOptions || this.getGenerationRangeDates()
        const resolutionParam = rangeOptions?.resolutionParam ?? this.getGenerationResolutionParam()

        const url = buildApiUrl(`generation-forecast/range/?country=${encodeURIComponent(iso2)}&start=${start.toISOString()}&end=${end.toISOString()}${resolutionParam}`)
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

    async fetchGenerationResRange(iso2) {
      if (!iso2) return []

      try {
        const url = buildApiUrl(`generation-res/range/?country=${encodeURIComponent(iso2)}&period=today`)
        const { data } = await axios.get(url)

        if (!data || !Array.isArray(data.items)) {
          return []
        }

        return data.items
      } catch (error) {
        console.error(`Failed to fetch RES generation forecast for ${iso2}`, error)
        return []
      }
    },

    prepareForecastSeries(forecastItems, options = {}) {
      if (!Array.isArray(forecastItems) || !forecastItems.length) return []

      const HOUR_MS = 60 * 60 * 1000
      const startMs = Number(options.startMs)
      const endMs = Number(options.endMs)
      const hasBounds = Number.isFinite(startMs) && Number.isFinite(endMs)
      const bucket = options.bucket || 'hour'
      const aggregation = options.aggregation || 'sum'
      const hourlyStats = new Map()

      for (const item of forecastItems) {
        const timestamp = Date.parse(item.datetime_utc)
        if (!Number.isFinite(timestamp)) continue
        if (hasBounds && (timestamp < startMs || timestamp >= endMs)) continue
        const value = Number(item.forecast_mw ?? item.generation_mw ?? item.total_generation_mw ?? item.value)
        if (!Number.isFinite(value)) continue

        const hourTs = Math.floor(timestamp / HOUR_MS) * HOUR_MS
        const stats = hourlyStats.get(hourTs) || { sum: 0, count: 0 }
        stats.sum += value
        stats.count += 1
        hourlyStats.set(hourTs, stats)
      }

      if (!hourlyStats.size) return []

      if (bucket === 'hour') {
        return Array.from(hourlyStats.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([x, stats]) => ({
            x,
            y: aggregation === 'average' ? (stats.count ? stats.sum / stats.count : 0) : stats.sum
          }))
      }

      const grouped = new Map()
      for (const [pointTs, hourly] of hourlyStats.entries()) {
        const date = new Date(pointTs)
        let bucketTs = pointTs
        const value = aggregation === 'average'
          ? (hourly.count ? hourly.sum / hourly.count : 0)
          : hourly.sum

        if (bucket === 'day') {
          bucketTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)
        } else if (bucket === 'month') {
          bucketTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
        } else if (bucket === 'year') {
          bucketTs = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0)
        }

        const acc = grouped.get(bucketTs) || { sum: 0, count: 0 }
        acc.sum += value
        acc.count += 1
        grouped.set(bucketTs, acc)
      }

      return Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([x, acc]) => ({
          x,
          y: aggregation === 'average' ? (acc.count ? acc.sum / acc.count : 0) : acc.sum
        }))
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
      if (e.key === 'Escape' && this.showAgentChat) {
        this.closeAgentChat()
        return
      }
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

        const url = buildApiUrl(`generation/range?country=${encodeURIComponent(iso2)}&start=${startDate}&end=${endDate}`)
        const { data } = await axios.get(url)
        this.generationItems = this.applyGenerationPsrOverrides(data.items)
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
      this.queueMapLayoutRefresh()
      if (this.showWindLayer) void this.onWindMapViewportChange()

    },
    autoArrangeSeparateModals() {
      this.repositionSeparateModals()
    },

    destroyGenerationChart() {
      if (this.generationChartInstance?.destroy) this.generationChartInstance.destroy()
      this.generationChartInstance = null
    },

    updateMobileState() {
      const previousMobile = this.isMobileViewport
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0
      this.isMobileViewport = viewportWidth < MODAL_MOBILE_BREAKPOINT
      this.isLargeModalViewport = viewportWidth >= MODAL_DESKTOP_LAYOUT_BREAKPOINT

      if (!this.isLargeModalViewport) {
        this.stackModalsForMobile()
      }

      if (previousMobile && !this.isMobileViewport) {
        this.closeMobilePanel()
        this.sliderFloatingEnabled = false
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
      if (this.isLargeModalViewport) return

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
              display: false
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
      this.sliderFloatingEnabled = false
      if (this.mobilePanelChart) {
        this.mobilePanelChart.destroy()
        this.mobilePanelChart = null
      }
    },

    retryMobilePanel() {
      if (this.mobilePanelISO2) {
        this.openMobilePricePanel(this.mobilePanelCountry, this.mobilePanelISO2)
      }
    },

    // Wind layer
    async startWindLayer() {
      if (!this.map) return
      this.createWindCanvas()
      await this.refreshWindData()
      this.scheduleWindRefresh()
    },

    stopWindLayer() {
      this.windRequestId += 1
      this.stopWindAnimation()
      this.scheduleWindRefresh(false)
      this.windLayerLoading = false
      this.windLayerError = null
      this.windGridSource = []
      this.windField = null
      this.windParticles = []
      if (this.windCtx && this.windCanvas) {
        this.windCtx.clearRect(0, 0, this.windCanvas.width, this.windCanvas.height)
      }
      this.destroyWindCanvas()
    },

    scheduleWindRefresh(on = true) {
      if (this.windRefreshTimer) {
        clearInterval(this.windRefreshTimer)
        this.windRefreshTimer = null
      }
      if (on) {
        this.windRefreshTimer = window.setInterval(() => {
          void this.refreshWindData()
        }, WIND_REFRESH_MS)
      }
    },

    createWindCanvas() {
      if (!this.map || this.windCanvas) return
      const container = this.map.getContainer()
      const canvas = document.createElement('canvas')
      canvas.className = 'wind-particle-canvas'
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:620;mix-blend-mode:screen;border-radius:18px;'
      canvas.width = container.clientWidth || 900
      canvas.height = container.clientHeight || 600
      container.appendChild(canvas)
      this.windCanvas = canvas
      this.windCtx = canvas.getContext('2d')
    },

    destroyWindCanvas() {
      this.stopWindAnimation()
      if (this.windCanvas?.parentElement) {
        this.windCanvas.parentElement.removeChild(this.windCanvas)
      }
      this.windCanvas = null
      this.windCtx = null
    },

    stopWindAnimation() {
      if (this.windAnimFrame) {
        cancelAnimationFrame(this.windAnimFrame)
        this.windAnimFrame = null
      }
    },

    resizeWindCanvas() {
      if (!this.windCanvas || !this.map) return
      const container = this.map.getContainer()
      const width = container.clientWidth || 900
      const height = container.clientHeight || 600
      if (this.windCanvas.width !== width || this.windCanvas.height !== height) {
        this.windCanvas.width = width
        this.windCanvas.height = height
        this.windParticles = []
      }
    },

    async refreshWindData() {
      if (!this.showWindLayer) return
      const requestId = ++this.windRequestId
      this.windLayerLoading = true
      this.windLayerError = null
      try {
        const grid = await this.fetchWindGrid()
        if (requestId !== this.windRequestId) return
        this.windGridSource = grid
        this.resizeWindCanvas()
        this.buildWindField()
        if (!this.windParticles.length) this.initWindParticles()
        if (!this.windAnimFrame) this.animateWind()
      } catch (error) {
        if (requestId !== this.windRequestId) return
        console.warn('Wind layer fetch error:', error)
        this.windLayerError = 'Wind data temporarily unavailable'
      } finally {
        if (requestId === this.windRequestId) this.windLayerLoading = false
      }
    },

    windFindCurrentHourIdx(times) {
      if (!times?.length) return 0
      const nowPrefix = new Date().toISOString().slice(0, 13)
      const exact = times.findIndex(time => time.startsWith(nowPrefix))
      return exact >= 0 ? exact : times.length - 1
    },

    async fetchWindGrid() {
      const lats = WIND_GRID_LATS.flatMap(lat => WIND_GRID_LONS.map(() => lat))
      const lons = WIND_GRID_LATS.flatMap(() => WIND_GRID_LONS)
      const params = new URLSearchParams({
        latitude: lats.join(','),
        longitude: lons.join(','),
        hourly: 'wind_speed_120m,wind_direction_120m',
        wind_speed_unit: 'ms',
        timezone: 'UTC',
        forecast_days: '1',
      })
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 14000)
      try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        const entries = Array.isArray(data) ? data : [data]
        return lats.map((lat, index) => {
          const hourly = entries[index]?.hourly || {}
          const times = hourly.time || []
          const speedSeries = hourly.wind_speed_120m || []
          const directionSeries = hourly.wind_direction_120m || []
          const currentIndex = this.windFindCurrentHourIdx(times)
          const speed = Number(speedSeries[currentIndex]) || 0
          const direction = (Number(directionSeries[currentIndex]) || 0) * Math.PI / 180
          return {
            lat,
            lng: lons[index],
            u: -speed * Math.sin(direction),
            v: -speed * Math.cos(direction),
            spd: speed
          }
        })
      } finally {
        clearTimeout(timeoutId)
      }
    },

    windGridInterp(lat, lng) {
      const points = this.windGridSource
      if (!points.length) return { u: 0, v: 0, spd: 0 }
      const clampedLat = Math.max(WIND_GRID_LATS[0], Math.min(WIND_GRID_LATS[WIND_GRID_LATS.length - 1], lat))
      const clampedLng = Math.max(WIND_GRID_LONS[0], Math.min(WIND_GRID_LONS[WIND_GRID_LONS.length - 1], lng))
      let latIndex = 0
      while (latIndex < WIND_GRID_LATS.length - 2 && WIND_GRID_LATS[latIndex + 1] < clampedLat) latIndex += 1
      let lonIndex = 0
      while (lonIndex < WIND_GRID_LONS.length - 2 && WIND_GRID_LONS[lonIndex + 1] < clampedLng) lonIndex += 1
      const ty = (clampedLat - WIND_GRID_LATS[latIndex]) / (WIND_GRID_LATS[latIndex + 1] - WIND_GRID_LATS[latIndex])
      const tx = (clampedLng - WIND_GRID_LONS[lonIndex]) / (WIND_GRID_LONS[lonIndex + 1] - WIND_GRID_LONS[lonIndex])
      const gridPoint = (rowIndex, colIndex) => points[rowIndex * WIND_GNC + colIndex] || {}
      const bilinear = key => (
        (gridPoint(latIndex, lonIndex)[key] || 0) * (1 - tx) * (1 - ty) +
        (gridPoint(latIndex, lonIndex + 1)[key] || 0) * tx * (1 - ty) +
        (gridPoint(latIndex + 1, lonIndex)[key] || 0) * (1 - tx) * ty +
        (gridPoint(latIndex + 1, lonIndex + 1)[key] || 0) * tx * ty
      )
      return { u: bilinear('u'), v: bilinear('v'), spd: bilinear('spd') }
    },

    buildWindField() {
      if (!this.windGridSource.length || !this.windCanvas || !this.map) return
      const width = this.windCanvas.width
      const height = this.windCanvas.height
      const cols = Math.ceil(width / WIND_FIELD_RES) + 2
      const rows = Math.ceil(height / WIND_FIELD_RES) + 2
      const vx = new Float32Array(cols * rows)
      const vy = new Float32Array(cols * rows)
      const spd = new Float32Array(cols * rows)
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          try {
            const latLng = this.map.containerPointToLatLng([col * WIND_FIELD_RES, row * WIND_FIELD_RES])
            const lat = latLng.lat
            const lng = latLng.lng
            if (lat < 25 || lat > 78 || lng < -28 || lng > 60) continue
            const wind = this.windGridInterp(lat, lng)
            if (wind.spd < 0.15) continue
            const metersPerDegreeLon = 111320 * Math.cos(lat * Math.PI / 180)
            const deltaLat = (wind.v / wind.spd) * 50000 / 111320
            const deltaLon = (wind.u / wind.spd) * 50000 / Math.max(metersPerDegreeLon, 1)
            const startPoint = this.map.latLngToContainerPoint([lat, lng])
            const endPoint = this.map.latLngToContainerPoint([lat + deltaLat, lng + deltaLon])
            const dx = endPoint.x - startPoint.x
            const dy = endPoint.y - startPoint.y
            const length = Math.hypot(dx, dy)
            if (length < 0.01) continue
            const index = row * cols + col
            vx[index] = (dx / length) * wind.spd * WIND_SPEED_SCALE
            vy[index] = (dy / length) * wind.spd * WIND_SPEED_SCALE
            spd[index] = wind.spd
          } catch (_) {
            // Ignore projection errors outside the view.
          }
        }
      }
      this.windField = { vx, vy, spd, cols, rows }
    },

    windFieldAt(x, y) {
      const field = this.windField
      if (!field) return null
      const col = x / WIND_FIELD_RES
      const row = y / WIND_FIELD_RES
      if (col < 0 || row < 0 || col >= field.cols - 1 || row >= field.rows - 1) return null
      const c0 = col | 0
      const r0 = row | 0
      const tx = col - c0
      const ty = row - r0
      const i00 = r0 * field.cols + c0
      const bilinear = array => (
        array[i00] * (1 - tx) * (1 - ty) +
        array[i00 + 1] * tx * (1 - ty) +
        array[(r0 + 1) * field.cols + c0] * (1 - tx) * ty +
        array[(r0 + 1) * field.cols + c0 + 1] * tx * ty
      )
      return { vx: bilinear(field.vx), vy: bilinear(field.vy), spd: bilinear(field.spd) }
    },

    windColor(spd, alpha = 0.9) {
      const [r, g, b] = spd < 3 ? [70, 130, 255]
        : spd < 7 ? [0, 210, 190]
        : spd < 12 ? [100, 220, 70]
        : spd < 18 ? [255, 200, 0]
        : spd < 25 ? [255, 110, 10]
        : [255, 50, 50]
      return `rgba(${r},${g},${b},${Math.min(1, alpha).toFixed(2)})`
    },

    initWindParticles() {
      if (!this.windCanvas) return
      const { width, height } = this.windCanvas
      this.windParticles = Array.from({ length: WIND_N_PARTICLES }, () => {
        const maxAge = 80 + Math.random() * 100
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          age: Math.random() * maxAge,
          maxAge
        }
      })
    },

    animateWind() {
      if (!this.showWindLayer || !this.windCtx || !this.windField || !this.windCanvas) return
      const ctx = this.windCtx
      const { width, height } = this.windCanvas
      ctx.fillStyle = `rgba(0,0,0,${WIND_TRAIL_FADE})`
      ctx.fillRect(0, 0, width, height)
      const resetParticle = (particle) => {
        particle.x = Math.random() * width
        particle.y = Math.random() * height
        particle.age = 0
        particle.maxAge = 80 + Math.random() * 100
      }
      for (const particle of this.windParticles) {
        const wind = this.windFieldAt(particle.x, particle.y)
        if (!wind || Math.abs(wind.vx) + Math.abs(wind.vy) < 0.01) {
          resetParticle(particle)
          continue
        }
        const oldX = particle.x
        const oldY = particle.y
        particle.x += wind.vx
        particle.y += wind.vy
        particle.age += 1
        if (
          particle.x < 0 || particle.x > width ||
          particle.y < 0 || particle.y > height ||
          particle.age >= particle.maxAge
        ) {
          resetParticle(particle)
          continue
        }
        const life = particle.age / particle.maxAge
        const alpha = life < 0.08 ? life / 0.08 : life > 0.85 ? (1 - life) / 0.15 : 1
        ctx.strokeStyle = this.windColor(wind.spd, alpha * 0.9)
        ctx.lineWidth = wind.spd > 20 ? 1.7 : 1
        ctx.beginPath()
        ctx.moveTo(oldX, oldY)
        ctx.lineTo(particle.x, particle.y)
        ctx.stroke()
      }
      this.windAnimFrame = requestAnimationFrame(() => this.animateWind())
    },

    async onWindMapViewportChange() {
      if (!this.showWindLayer || !this.windGridSource.length) return
      this.resizeWindCanvas()
      this.buildWindField()
      if (!this.windParticles.length) this.initWindParticles()
    }
  },

    async mounted() {

      this.updateModalDefaultsFromViewport()
      this.updateResponsiveZoom()
      this.updateMobileState()
      window.addEventListener('resize', this.handleWindowResize)
      window.addEventListener('keydown', this.onKeydown)
      window.addEventListener('pointerdown', this.handleAgentChatPointerDown)
      this.restoreAgentChatSession()
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
      this.persistAgentChatSession()
      this.stopWindLayer()
      this.destroyAgentChatCharts()
      this.unbindMapResizeObserver()
      if (this.mapLayoutRefreshRaf) {
        cancelAnimationFrame(this.mapLayoutRefreshRaf)
        this.mapLayoutRefreshRaf = null
      }
      if (this.mapLayoutRefreshTimeoutId) {
        clearTimeout(this.mapLayoutRefreshTimeoutId)
        this.mapLayoutRefreshTimeoutId = null
      }
      window.removeEventListener('resize', this.handleWindowResize)
      window.removeEventListener('keydown', this.onKeydown)
      window.removeEventListener('pointerdown', this.handleAgentChatPointerDown)
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

    this.stopIrradianceLayerRefresh()
    this.clearIrradianceLayerOverlay()

    if (this.mapBadgeLayer && this.map) {
      this.mapBadgeLayer.remove()
      this.mapBadgeLayer = null
    }
    this.clearFlowsOverlay()
    if (this.map) {
      this.map.off('zoomend moveend', this.handleMapViewportChange)
      this.map.off('moveend zoomend', this.onWindMapViewportChange)
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
/* Font loaded via <link> in index.html for faster initial render */

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

.layout-shell--floating-header {
  padding-top: 126px;
}

.content-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: relative;
  z-index: 1;
  width: 100%;
}

.header-shell {
  width: 100%;
  flex-shrink: 0;
}

.header-shell--floating {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, calc(100% - 24px));
  box-shadow:
    0 12px 30px rgba(15, 23, 42, 0.18),
    0 4px 10px rgba(15, 23, 42, 0.1);
  background: rgba(14, 17, 30, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  z-index: 1250;
  backdrop-filter: blur(10px);
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

.agent-chat-menu {
  position: relative;
}

.agent-chat-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(178, 128, 233, 0.4);
  background: linear-gradient(135deg, rgba(38, 25, 61, 0.94), rgba(79, 47, 121, 0.92));
  color: #f8f3ff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(16, 10, 28, 0.28);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.agent-chat-toggle__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.18);
  border: 1px solid rgba(251, 191, 36, 0.4);
  color: #fde68a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: none;
}

.agent-chat-toggle:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(16, 10, 28, 0.34);
  border-color: rgba(205, 175, 255, 0.58);
}

.agent-chat-toggle--active {
  border-color: rgba(225, 210, 255, 0.76);
  box-shadow: 0 14px 30px rgba(80, 47, 121, 0.38);
}

.agent-chat-popover {
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(14, 17, 30, 0.98), rgba(21, 28, 49, 0.96));
  border: 1px solid rgba(178, 128, 233, 0.24);
  box-shadow: 0 22px 44px rgba(2, 6, 23, 0.48);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.agent-chat-popover--map {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  width: auto;
  max-width: none;
  max-height: calc(100% - 28px);
  display: flex;
  flex-direction: column;
  z-index: 1270;
  overflow: hidden;
}

.agent-chat-popover__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.agent-chat-popover__header strong {
  display: block;
  color: #f8fafc;
  font-size: 14px;
}

.agent-chat-popover__header p {
  margin: 4px 0 0;
  color: rgba(226, 232, 240, 0.72);
  font-size: 11px;
}

.agent-chat-popover__status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.agent-chat-popover__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-chat-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(251, 191, 36, 0.14);
  border: 1px solid rgba(251, 191, 36, 0.34);
  color: #fde68a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.agent-chat-status-badge--muted {
  background: rgba(15, 23, 42, 0.78);
  border-color: rgba(148, 163, 184, 0.18);
  color: #cbd5f5;
}

.agent-chat-popover__clear {
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.88);
  color: #dbeafe;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.agent-chat-popover__close {
  border: none;
  background: transparent;
  color: rgba(226, 232, 240, 0.72);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 4px;
}

.agent-chat-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}

.agent-chat-messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-chat-message {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.agent-chat-message--assistant {
  align-self: flex-start;
  background: rgba(30, 41, 59, 0.92);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.14);
}

.agent-chat-message--user {
  align-self: flex-end;
  background: linear-gradient(135deg, rgba(140, 92, 230, 0.96), rgba(105, 64, 180, 0.96));
  color: #fff;
}

.agent-chat-message--typing {
  color: rgba(226, 232, 240, 0.7);
}

.agent-chat-results {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.agent-chat-clarification {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(42, 31, 8, 0.54);
  border: 1px solid rgba(251, 191, 36, 0.2);
}

.agent-chat-clarification__label {
  color: #fde68a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.agent-chat-clarification p {
  margin: 0;
  color: #fef3c7;
  font-size: 12px;
  line-height: 1.45;
}

.agent-chat-clarification__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-chat-clarification__field {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.45);
  border: 1px solid rgba(251, 191, 36, 0.24);
  color: #fde68a;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.agent-chat-quick-replies {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-chat-quick-replies button {
  border: 1px solid rgba(251, 191, 36, 0.26);
  background: rgba(54, 40, 12, 0.92);
  color: #fef3c7;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.agent-chat-quick-replies button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-chat-query-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-chat-query-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #dbeafe;
  font-size: 11px;
  font-weight: 600;
}

.agent-chat-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-chat-panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.agent-chat-panel__header h4 {
  margin: 0;
  color: #f8fafc;
  font-size: 14px;
}

.agent-chat-panel__header p {
  margin: 4px 0 0;
  color: rgba(226, 232, 240, 0.7);
  font-size: 11px;
}

.agent-chat-panel__unit {
  color: #cbd5f5;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.agent-chat-panel__error {
  padding: 12px;
  border-radius: 14px;
  background: rgba(68, 17, 32, 0.52);
  border: 1px solid rgba(248, 113, 113, 0.22);
  color: #fecaca;
  font-size: 12px;
  line-height: 1.45;
}

.agent-chat-chart-container {
  height: 240px;
  min-height: 240px;
}

.agent-chat-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 12px;
}

.agent-chat-form__input {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(8, 15, 32, 0.9);
  color: #f8fafc;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
}

.agent-chat-form__input::placeholder {
  color: rgba(226, 232, 240, 0.42);
}

.agent-chat-form__submit {
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #b280e9, #7c4ed8);
  color: #fff;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.agent-chat-form__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-chat-pop-enter-active,
.agent-chat-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform-origin: top right;
}

.agent-chat-pop-enter-from,
.agent-chat-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
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
  width:160px;
  text-align: center;
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

.cloud-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 2px 0;
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.cloud-switch__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.cloud-switch__track {
  position: relative;
  width: 42px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  transition: background 0.18s ease, box-shadow 0.18s ease;
}

.cloud-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
  transition: transform 0.18s ease, background 0.18s ease;
}

.cloud-switch__text {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.cloud-switch__label {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #f4f4f4;
}

.cloud-switch__status {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
  transition: color 0.18s ease;
}

.cloud-switch:hover .cloud-switch__track {
  background: rgba(255, 255, 255, 0.24);
}

.cloud-switch--active .cloud-switch__track {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.96), rgba(249, 115, 22, 0.92));
  box-shadow:
    inset 0 0 0 1px rgba(255, 248, 220, 0.28),
    0 0 0 1px rgba(251, 191, 36, 0.18);
}

.cloud-switch--active .cloud-switch__thumb {
  transform: translateX(18px);
  background: #0f172a;
}

.cloud-switch--active .cloud-switch__status {
  color: rgba(255, 255, 255, 0.86);
}

.cloud-switch--loading .cloud-switch__track {
  background: linear-gradient(135deg, rgba(148, 163, 184, 0.4), rgba(203, 213, 225, 0.3));
}

.cloud-switch--loading .cloud-switch__thumb {
  animation: cloud-switch-pulse 1.1s ease-in-out infinite;
}

.cloud-switch__input:focus-visible + .cloud-switch__track {
  outline: 2px solid rgba(255, 255, 255, 0.95);
  outline-offset: 3px;
}

@keyframes cloud-switch-pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
  }
  50% {
    box-shadow: 0 2px 10px rgba(255, 255, 255, 0.45);
  }
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

.separate-modal-title {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.chart-brand-signature {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.2;
  white-space: nowrap;
}

.separate-modal-title .chart-brand-signature {
  color: rgba(15, 23, 42, 0.58);
}

.mobile-panel-titles .chart-brand-signature {
  color: rgba(148, 163, 184, 0.9);
}

.separate-modal--thumbnail .chart-brand-signature {
  display: none;
}

.generation-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.28);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.generation-mode-button {
  border: none;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  color: rgba(15, 23, 42, 0.7);
  background: transparent;
  transition: all 0.2s ease;
}

.generation-mode-button:hover {
  color: rgba(15, 23, 42, 0.9);
  background: rgba(15, 23, 42, 0.08);
}

.generation-mode-button.active {
  color: #f8fafc;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95));
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
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
  position: relative;
  display: flex;
  justify-content: center;
}

.irradiance-legend {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1260;
  min-width: 148px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(10, 14, 28, 0.9);
  border: 1px solid rgba(255, 185, 52, 0.24);
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.34);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.irradiance-legend__title {
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 185, 52, 0.95);
}

.irradiance-legend__bar {
  height: 6px;
  border-radius: 999px;
  margin-bottom: 5px;
  background: linear-gradient(
    to right,
    rgba(255, 255, 220, 0.28),
    rgba(251, 205, 52, 0.76),
    rgba(255, 140, 0, 0.92),
    rgba(230, 60, 0, 1)
  );
  box-shadow: inset 0 0 0 1px rgba(255, 248, 220, 0.12);
}

.irradiance-legend__labels {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.52);
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

.price-badge-icon {
  width: 72px;
  height: 48px;
  transform: translate(6px, 6px);
}

.price-badge {
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
}

.price-badge__value {
  font-weight: 800;
  font-size: 17px;
  color: #ffffff;
  letter-spacing: 0.2px;
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

.time-slider-overlay--floating {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(22px + 14px);
  width: min(900px, calc(100% - 24px));
  max-width: min(900px, calc(100% - 24px));
  margin: 0;
  align-self: center;
  background: rgba(255, 255, 255, 0.92);
  box-shadow:
    0 12px 30px rgba(15, 23, 42, 0.16),
    0 4px 12px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(226, 232, 240, 0.85);
  padding: 8px 12px 10px;
  z-index: 1100;
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

.time-range-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.2);
}

.time-range-button {
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: 10px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.time-range-button.active {
  background: #3182ce;
  color: #fff;
  box-shadow: 0 4px 10px rgba(49, 130, 206, 0.2);
}

.time-range-button:hover:not(.active) {
  background: rgba(49, 130, 206, 0.15);
  color: #2b6cb0;
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

.generation-display {
  font-weight: 600;
  color: #48bb78;
}

.slider-wrapper {
  position: relative;
  flex: 1;
  height: 30px;
  margin: 0 auto;
  min-width: 200px;
  max-width: 80%;
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
  top: 10px;
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
  color: #c4cfff;
  text-align: center;
  white-space: nowrap;
  font-weight: 500;
  transition: color 0.2s ease;
  line-height: 1.1;
}

.time-tick-below:hover .tick-label-below {
  color: #c4cfff;
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
:global(.irradiance-overlay-image),
:global(.leaflet-clickable),
:global(.leaflet-container),
:global(.leaflet-container:focus) {
  outline: none !important;
}

:global(.irradiance-overlay-image) {
  mix-blend-mode: screen;
  filter: saturate(1.08) brightness(1.02);
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

  .time-slider-overlay {
    width: min(760px, 90vw);
  }

  .slider-info {
    flex-direction: column;
    align-items: stretch;
    text-align: center;
    gap: 4px;
  }

  .slider-row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .slider-wrapper {
    min-width: 180px;
  }

  .play-controls {
    justify-content: center;
  }

  .tick-label-below {
    font-size: 9px;
    color: #0b2388;
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
  .layout-shell--floating-header {
    padding-top: 154px;
  }

  .header-shell--floating {
    width: min(720px, calc(100% - 18px));
    top: 8px;
  }

  .agent-chat-popover {
    padding: 12px;
  }

  .agent-chat-popover--map {
    top: 10px;
    left: 10px;
    right: 10px;
  }

  .agent-chat-chart-container {
    height: 210px;
    min-height: 210px;
  }

  .irradiance-legend {
    top: 10px;
    right: 10px;
    min-width: 132px;
    padding: 9px 10px;
  }

  .content-shell {
    padding-bottom: 140px;
  }

  .slider-wrapper {
    height: 23px;
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

  .time-slider-overlay--floating {
    width: min(880px, calc(100% - 20px));
    max-width: min(880px, calc(100% - 20px));
    bottom: calc(22px + 10px);
  }

  .separate-modal-stack {
    padding-bottom: 170px;
  }

  .app-footer {
    height: 22px;
  }

  .footer-content {
    font-size: 10px;
  }
}

@media (max-width: 600px) {
  .layout-shell--floating-header {
    padding-top: 148px;
  }

  .header-shell--floating {
    width: min(520px, calc(100% - 14px));
  }

  .agent-chat-popover {
    padding: 12px;
  }

  .agent-chat-popover--map {
    top: 8px;
    left: 8px;
    right: 8px;
  }

  .agent-chat-panel__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .agent-chat-chart-container {
    height: 180px;
    min-height: 180px;
  }

  .irradiance-legend {
    top: 8px;
    right: 8px;
    min-width: 124px;
    padding: 8px 9px;
  }

  .irradiance-legend__title {
    font-size: 9px;
  }

  .irradiance-legend__labels {
    font-size: 8px;
  }

  .time-slider-overlay {
    width: min(520px, 88vw);
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
    width: min(480px, 92vw);
  }

  .slider-wrapper {
    min-width: 140px;
    max-width: 300px;
    margin-left: 20px;
  }

  .slider-row {
    gap: 6px;
  }

  .slider-info {
    font-size: 11px;
  }

  .time-slider-overlay--floating {
    width: min(820px, calc(100% - 16px));
    max-width: min(820px, calc(100% - 16px));
    bottom: calc(22px + 6px);
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .time-slider-overlay {
    background: rgba(26, 32, 44, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .time-slider-overlay--floating {
    background: rgba(26, 32, 44, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.3),
      0 4px 12px rgba(0, 0, 0, 0.2);
  }
  
  .time-slider-overlay h3 {
    color: #e2e8f0;
  }
  
  .slider-track {
    background: linear-gradient(90deg, #4a5568 0%, #2d3748 100%);
  }
  
  .tick-label-below {
    color: #c4cfff;
  }
  
  .time-tick-below:hover .tick-label-below {
    color: #c4cfff;
  }
  
  .no-data-message {
    color: #c4cfff;
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
  font-size: 15px;
  color: rgba(255, 255, 255, 0.75);
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

:deep(.capacity-flow-route) {
  stroke-dasharray: 14 10;
  animation: capacity-flow-dash 12s linear infinite;
}

:deep(.capacity-flow-route--glow) {
  stroke-dasharray: none;
  animation: none;
}

:deep(.capacity-flow-route--capacity) {
  stroke-dasharray: none;
  animation: none;
}

:deep(.capacity-flow-arrow) {
  filter: drop-shadow(0 0 5px rgba(113, 138, 219, 0.45));
}

@keyframes capacity-flow-dash {
  from {
    stroke-dashoffset: 0;
  }

  to {
    stroke-dashoffset: -48;
  }
}

:deep(.wind-particle-canvas) {
  border-radius: 18px;
}

.wind-legend {
  position: absolute;
  bottom: 14px;
  left: 14px;
  z-index: 1260;
  min-width: 148px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(10, 14, 28, 0.9);
  border: 1px solid rgba(100, 160, 255, 0.22);
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.34);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.wind-legend__title {
  margin-bottom: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(130, 170, 255, 0.95);
}

.wind-legend__bar {
  height: 6px;
  border-radius: 999px;
  margin-bottom: 5px;
  background: linear-gradient(to right,
    rgb(70,130,255), rgb(0,210,190),
    rgb(100,220,70), rgb(255,200,0),
    rgb(255,110,10), rgb(255,50,50));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
}

.wind-legend__labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.52);
}

</style>
