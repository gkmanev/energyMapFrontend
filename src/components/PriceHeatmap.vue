<template>
  <div class="ph-card">
    <div v-if="stats" class="ph-header">
      <div class="ph-avg">{{ formatPrice(stats.avg) }} <span>€/MWh avg</span></div>
      <div class="ph-range">{{ mode.slotLabel }} range: {{ formatPrice(stats.min) }} – {{ formatPrice(stats.max) }}</div>
    </div>

    <div ref="plot" class="ph-plot">
      <div v-if="loading" class="ph-status">Loading prices…</div>
      <div v-else-if="error" class="ph-status ph-error">{{ error }}</div>
      <div v-else-if="!stats" class="ph-status">No price data for this period</div>
      <div v-show="!loading && !error && stats" class="ph-canvas-stack">
        <canvas ref="canvas"></canvas>
        <canvas
          ref="overlay"
          class="ph-overlay"
          @mousemove="onPointerMove"
          @mouseleave="tooltip = null"
        ></canvas>
      </div>
      <div
        v-if="tooltip"
        class="ph-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="ph-tooltip-title">{{ tooltip.title }}</div>
        <div>{{ tooltip.value }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { scaleLinear } from 'd3-scale'

const MINUTE_MS = 60 * 1000
const QUARTER_MS = 15 * MINUTE_MS
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Per time range: the grid's column unit, its rows, and the summary strips above it
const MODES = {
  hours: {
    column: 'hour',
    slotMs: 15 * MINUTE_MS,
    slotLabel: '15-min',
    gridLabel: '15-min',
    rowTicks: [0, 1, 2, 3],
    rowLabel: row => `:${String(row * 15).padStart(2, '0')}`,
    strips: [{ label: 'Average', unit: 'period' }, { label: 'Hourly', unit: 'hour' }]
  },
  days: {
    column: 'day',
    slotMs: 60 * MINUTE_MS,
    slotLabel: 'hourly',
    gridLabel: 'Hourly',
    rowTicks: [0, 6, 12, 18, 23],
    rowLabel: row => `${String(row).padStart(2, '0')}:00`,
    strips: [{ label: 'Average', unit: 'period' }, { label: 'Daily', unit: 'day' }]
  },
  months: {
    column: 'day',
    slotMs: 60 * MINUTE_MS,
    slotLabel: 'hourly',
    gridLabel: 'Hourly',
    rowTicks: [0, 6, 12, 18, 23],
    rowLabel: row => `${String(row).padStart(2, '0')}:00`,
    strips: [
      { label: 'Average', unit: 'period' },
      { label: 'Monthly', unit: 'month' },
      { label: 'Daily', unit: 'day' }
    ]
  },
  years: {
    column: 'day',
    slotMs: 60 * MINUTE_MS,
    slotLabel: 'hourly',
    gridLabel: 'Hourly',
    rowTicks: [0, 6, 12, 18, 23],
    rowLabel: row => `${String(row).padStart(2, '0')}:00`,
    strips: [
      { label: 'Average', unit: 'period' },
      { label: 'Yearly', unit: 'year' },
      { label: 'Monthly', unit: 'month' }
    ]
  }
}

// Layout (CSS px)
const LEFT = 48
const RIGHT = 56
const SECTION_LABEL = 16
const STRIP = 26
const PERIOD_STRIP = 16
const TICKS = 14
const GAP = 10
const MIN_GRID = 120

const COLORS = {
  negative: '#5b7fd6',
  zero: '#f8f5f2',
  positive: '#8e3b3b',
  empty: '#1f2737',
  text: '#cbd5f5',
  muted: 'rgba(203, 213, 245, 0.6)',
  cursor: '#fb923c'
}

const floorTo = (unit, ts) => {
  const d = new Date(ts)
  if (unit === 'hour') d.setMinutes(0, 0, 0)
  else if (unit === 'day') d.setHours(0, 0, 0, 0)
  else if (unit === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  else if (unit === 'year') return new Date(d.getFullYear(), 0, 1).getTime()
  return d.getTime()
}

const addUnit = (unit, ts, n = 1) => {
  const d = new Date(ts)
  if (unit === 'hour') d.setHours(d.getHours() + n)
  else if (unit === 'day') d.setDate(d.getDate() + n)
  else if (unit === 'month') d.setMonth(d.getMonth() + n)
  else if (unit === 'year') d.setFullYear(d.getFullYear() + n)
  return d.getTime()
}

const bucketStarts = (unit, start, end) => {
  if (unit === 'period') return [start]
  const starts = []
  for (let ts = floorTo(unit, start); ts < end; ts = addUnit(unit, ts)) starts.push(ts)
  return starts
}

// Index of the last bucket starting at or before ts, or -1
const bucketIndex = (starts, ts) => {
  let lo = 0
  let hi = starts.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= ts) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

const pad = n => String(n).padStart(2, '0')

const formatBucket = (unit, ts, end) => {
  const d = new Date(ts)
  switch (unit) {
    case 'hour': return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad(d.getHours())}:00`
    case 'day': return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    case 'month': return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    case 'year': return String(d.getFullYear())
    default: return `${formatBucket('day', ts)} – ${formatBucket('day', end - 1)}`
  }
}

export default {
  name: 'PriceHeatmap',
  props: {
    // Price points at hourly or 15-min resolution: [{ ts, price }]
    items: { type: Array, default: () => [] },
    range: { type: String, default: 'days' },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    // Slider position, outlined on every strip and the grid
    cursor: { type: Number, default: null },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' }
  },

  data() {
    return {
      tooltip: null
    }
  },

  computed: {
    mode() {
      return MODES[this.range] || MODES.days
    },

    model() {
      const { mode, start, end } = this
      const columns = bucketStarts(mode.column, start, end)
      const rowCount = mode.column === 'hour' ? 4 : 24
      const sums = new Float64Array(columns.length * rowCount)
      const counts = new Uint16Array(columns.length * rowCount)

      const slotOf = ts => {
        const col = bucketIndex(columns, ts)
        if (col < 0 || ts >= end) return -1
        const d = new Date(ts)
        const row = mode.column === 'hour' ? Math.floor(d.getMinutes() / 15) : d.getHours()
        return col * rowCount + row
      }

      const points = this.items
        .filter(p => Number.isFinite(p.ts) && Number.isFinite(p.price))
        .sort((a, b) => a.ts - b.ts)

      // The API omits repeated prices (ENTSO-E A03 curves), so each price holds until
      // the next point, but never past its local midnight so missing days stay empty.
      // Filling per quarter-hour makes every slot a time-weighted average.
      points.forEach((point, i) => {
        const next = points[i + 1]
        const midnight = addUnit('day', floorTo('day', point.ts))
        const until = next ? Math.min(next.ts, midnight) : midnight
        for (let t = point.ts; t < until; t += QUARTER_MS) {
          const slot = slotOf(t)
          if (slot < 0) continue
          sums[slot] += point.price
          counts[slot] += 1
        }
      })

      const slots = Array.from(sums, (sum, i) => (counts[i] ? sum / counts[i] : null))

      const strips = mode.strips.map(strip => {
        const starts = bucketStarts(strip.unit, start, end)
        const stripSums = new Float64Array(starts.length)
        const stripCounts = new Uint32Array(starts.length)
        slots.forEach((value, i) => {
          if (value === null) return
          const slotTs = columns[Math.floor(i / rowCount)] + (i % rowCount) * mode.slotMs
          const index = strip.unit === 'period' ? 0 : bucketIndex(starts, slotTs)
          if (index < 0) return
          stripSums[index] += value
          stripCounts[index] += 1
        })
        return {
          ...strip,
          starts,
          values: Array.from(stripSums, (sum, i) => (stripCounts[i] ? sum / stripCounts[i] : null))
        }
      })

      return { columns, rowCount, slots, strips }
    },

    stats() {
      let min = Infinity
      let max = -Infinity
      for (const v of this.model.slots) {
        if (v === null) continue
        if (v < min) min = v
        if (v > max) max = v
      }
      if (min === Infinity) return null
      return { avg: this.model.strips[0].values[0], min, max }
    },

    colorScale() {
      if (!this.stats) return null
      const { min, max } = this.stats
      const top = Math.max(max, 1)
      return min < 0
        ? scaleLinear().domain([min, 0, top]).range([COLORS.negative, COLORS.zero, COLORS.positive]).clamp(true)
        : scaleLinear().domain([0, top]).range([COLORS.zero, COLORS.positive]).clamp(true)
    }
  },

  watch: {
    model() {
      this.$nextTick(this.draw)
    },
    loading() {
      this.$nextTick(this.draw)
    },
    cursor() {
      this.drawCursor()
    }
  },

  mounted() {
    this.resizeObserver = new ResizeObserver(() => this.draw())
    this.resizeObserver.observe(this.$refs.plot)
    this.draw()
  },

  beforeUnmount() {
    this.resizeObserver?.disconnect()
  },

  methods: {
    formatPrice(value) {
      return Number.isFinite(value) ? value.toFixed(1) : '–'
    },

    getLayout(width, height) {
      const plotWidth = Math.max(10, width - LEFT - RIGHT)
      let y = 4
      const strips = this.model.strips.map(strip => {
        const isPeriod = strip.unit === 'period'
        const section = { label: y, top: y + SECTION_LABEL, height: isPeriod ? PERIOD_STRIP : STRIP }
        y = section.top + section.height + (isPeriod ? 0 : TICKS) + GAP
        return section
      })
      const gridTop = y + SECTION_LABEL
      const grid = {
        label: y,
        top: gridTop,
        height: Math.max(MIN_GRID, height - gridTop - TICKS - 4)
      }
      return { plotWidth, strips, grid, totalHeight: grid.top + grid.height + TICKS + 4 }
    },

    // Candidate labels for a row of buckets, thinned so they don't overlap
    getTicks(ctx, unit, starts, cellWidth) {
      const candidates = []
      starts.forEach((ts, i) => {
        const d = new Date(ts)
        let label = null
        let boundary = false
        if (unit === 'hour') {
          if (d.getHours() % 3 === 0) label = `${pad(d.getHours())}:00`
        } else if (unit === 'day') {
          if (starts.length <= 62) {
            label = `${MONTHS[d.getMonth()]} ${d.getDate()}`
          } else if (starts.length <= 800) {
            if (d.getDate() === 1) label = d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()]
            boundary = true
          } else {
            if (d.getDate() === 1 && d.getMonth() === 0) label = String(d.getFullYear())
            boundary = true
          }
        } else if (unit === 'month') {
          if (starts.length <= 24) {
            label = d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()]
          } else {
            if (d.getMonth() === 0) label = String(d.getFullYear())
            boundary = true
          }
        } else if (unit === 'year') {
          label = String(d.getFullYear())
        }
        if (label === null) return
        const x = LEFT + (boundary ? i : i + 0.5) * cellWidth
        candidates.push({ label, x, boundary })
      })

      const ticks = []
      let lastRight = -Infinity
      candidates.forEach(tick => {
        const width = ctx.measureText(tick.label).width
        const left = tick.boundary ? tick.x : tick.x - width / 2
        if (left < lastRight + 8) return
        ticks.push(tick)
        lastRight = left + width
      })
      return ticks
    },

    draw() {
      const canvas = this.$refs.canvas
      const plot = this.$refs.plot
      if (!canvas || !plot || !this.stats || this.loading) return

      const width = plot.clientWidth
      const layout = this.getLayout(width, plot.clientHeight)
      const height = layout.totalHeight
      const dpr = window.devicePixelRatio || 1

      for (const target of [canvas, this.$refs.overlay]) {
        target.width = Math.round(width * dpr)
        target.height = Math.round(height * dpr)
        target.style.width = width + 'px'
        target.style.height = height + 'px'
      }

      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      ctx.textBaseline = 'top'

      const { model, mode } = this
      const { plotWidth } = layout
      const color = v => (v === null ? COLORS.empty : this.colorScale(v))

      const sectionLabel = (text, y) => {
        ctx.fillStyle = COLORS.muted
        ctx.textAlign = 'left'
        ctx.fillText(text, 0, y + 2)
      }

      const drawTicks = (unit, starts, cellWidth, y) => {
        ctx.fillStyle = COLORS.muted
        this.getTicks(ctx, unit, starts, cellWidth).forEach(tick => {
          ctx.textAlign = tick.boundary ? 'left' : 'center'
          ctx.fillText(tick.label, tick.x, y + 3)
        })
      }

      model.strips.forEach((strip, s) => {
        const section = layout.strips[s]
        const cellWidth = plotWidth / strip.values.length
        sectionLabel(strip.label, section.label)
        strip.values.forEach((v, i) => {
          ctx.fillStyle = color(v)
          ctx.fillRect(LEFT + i * cellWidth, section.top, Math.ceil(cellWidth), section.height)
        })
        if (strip.unit !== 'period') {
          drawTicks(strip.unit, strip.starts, cellWidth, section.top + section.height)
        }
      })

      const { grid } = layout
      const columnWidth = plotWidth / model.columns.length
      const rowHeight = grid.height / model.rowCount
      sectionLabel(mode.gridLabel, grid.label)
      for (let c = 0; c < model.columns.length; c++) {
        for (let r = 0; r < model.rowCount; r++) {
          ctx.fillStyle = color(model.slots[c * model.rowCount + r])
          ctx.fillRect(LEFT + c * columnWidth, grid.top + r * rowHeight, Math.ceil(columnWidth), Math.ceil(rowHeight))
        }
      }
      ctx.fillStyle = COLORS.muted
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      mode.rowTicks.forEach(row => {
        ctx.fillText(mode.rowLabel(row), LEFT - 6, grid.top + (row + 0.5) * rowHeight)
      })
      ctx.textBaseline = 'top'
      drawTicks(mode.column, model.columns, columnWidth, grid.top + grid.height)

      this.drawColorBar(ctx, layout, width)
      this.layout = { ...layout, columnWidth, rowHeight, width, height }
      this.drawCursor()
    },

    drawColorBar(ctx, layout, width) {
      const { min, max } = this.stats
      const barX = width - RIGHT + 14
      const barWidth = 10
      const top = layout.strips[0].top
      const bottom = layout.grid.top + layout.grid.height
      const domainMin = Math.min(min, 0)
      const domainMax = Math.max(max, 1)
      const toY = v => bottom - ((v - domainMin) / (domainMax - domainMin)) * (bottom - top)

      for (let y = top; y < bottom; y++) {
        const v = domainMin + ((bottom - y) / (bottom - top)) * (domainMax - domainMin)
        ctx.fillStyle = this.colorScale(v)
        ctx.fillRect(barX, y, barWidth, 1)
      }

      ctx.fillStyle = COLORS.text
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const ticks = [domainMax, domainMin < 0 ? 0 : null, domainMin].filter(v => v !== null)
      ticks.forEach(v => {
        ctx.fillText(Math.round(v).toString(), barX + barWidth + 4, Math.min(bottom - 4, Math.max(top + 4, toY(v))))
      })

      // "No data" swatch
      ctx.fillStyle = COLORS.empty
      ctx.fillRect(barX, bottom + 5, barWidth, barWidth)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
      ctx.lineWidth = 1
      ctx.strokeRect(barX + 0.5, bottom + 5.5, barWidth - 1, barWidth - 1)
      ctx.fillStyle = COLORS.muted
      ctx.fillText('n/a', barX + barWidth + 4, bottom + 5 + barWidth / 2)
      ctx.textBaseline = 'top'
    },

    // Slider position lives on its own canvas so moving it doesn't repaint the grid
    drawCursor() {
      const overlay = this.$refs.overlay
      const layout = this.layout
      if (!overlay || !layout) return

      const dpr = window.devicePixelRatio || 1
      const ctx = overlay.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, layout.width, layout.height)

      const ts = this.cursor
      if (!Number.isFinite(ts) || ts < this.start || ts >= this.end) return

      ctx.strokeStyle = COLORS.cursor
      ctx.lineWidth = 1.5
      const outline = (x, y, w, h) => ctx.strokeRect(x + 0.75, y + 0.75, Math.max(w, 2) - 1.5, h - 1.5)

      this.model.strips.forEach((strip, s) => {
        if (strip.unit === 'period') return
        const index = bucketIndex(strip.starts, ts)
        if (index < 0) return
        const cellWidth = layout.plotWidth / strip.values.length
        const section = layout.strips[s]
        outline(LEFT + index * cellWidth, section.top, cellWidth, section.height)
      })

      const { model } = this
      const col = bucketIndex(model.columns, ts)
      if (col < 0) return
      const d = new Date(ts)
      const row = this.mode.column === 'hour' ? Math.floor(d.getMinutes() / 15) : d.getHours()
      const x = LEFT + col * layout.columnWidth
      ctx.fillStyle = 'rgba(251, 146, 60, 0.18)'
      ctx.fillRect(x, layout.grid.top, Math.max(layout.columnWidth, 1.5), layout.grid.height)
      outline(x, layout.grid.top + row * layout.rowHeight, layout.columnWidth, layout.rowHeight)
    },

    onPointerMove(event) {
      const layout = this.layout
      if (!layout || !this.stats) return
      const rect = this.$refs.overlay.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const offset = x - LEFT
      if (offset < 0 || offset >= layout.plotWidth) {
        this.tooltip = null
        return
      }

      const within = section => y >= section.top && y < section.top + section.height
      const { model, mode } = this
      let title = null
      let value = null

      model.strips.forEach((strip, s) => {
        if (!within(layout.strips[s])) return
        const index = Math.min(strip.values.length - 1, Math.floor(offset / (layout.plotWidth / strip.values.length)))
        title = formatBucket(strip.unit, strip.starts[index], this.end)
        value = strip.values[index]
      })

      if (title === null && within(layout.grid)) {
        const col = Math.min(model.columns.length - 1, Math.floor(offset / layout.columnWidth))
        const row = Math.min(model.rowCount - 1, Math.floor((y - layout.grid.top) / layout.rowHeight))
        const date = new Date(model.columns[col])
        title = mode.column === 'hour'
          ? `${MONTHS[date.getMonth()]} ${date.getDate()}, ${pad(date.getHours())}:${pad(row * 15)}`
          : `${formatBucket('day', model.columns[col])}, ${pad(row)}:00`
        value = model.slots[col * model.rowCount + row]
      }

      if (title === null) {
        this.tooltip = null
        return
      }

      const plot = this.$refs.plot
      const plotRect = plot.getBoundingClientRect()
      const left = event.clientX - plotRect.left
      this.tooltip = {
        title,
        value: value === null ? 'No data' : `${value.toFixed(1)} €/MWh`,
        x: left > plotRect.width - 200 ? left - 190 : left + 12,
        y: event.clientY - plotRect.top + plot.scrollTop + 12
      }
    }
  }
}
</script>

<style scoped>
.ph-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  padding: 12px 12px 8px;
  border-radius: 16px;
  background: linear-gradient(150deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.54));
  border: 1px solid rgba(148, 163, 184, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 18px 40px rgba(8, 15, 32, 0.48);
  color: #e2e8f0;
}

.ph-header {
  text-align: right;
}

.ph-avg {
  font-size: 20px;
  font-weight: 500;
  color: #f8fafc;
}

.ph-avg span {
  font-size: 13px;
  color: rgba(226, 232, 240, 0.8);
}

.ph-range {
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: rgba(203, 213, 245, 0.6);
}

.ph-plot {
  position: relative;
  flex: 1;
  min-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
}

.ph-canvas-stack {
  position: relative;
}

.ph-canvas-stack canvas {
  display: block;
}

.ph-overlay {
  position: absolute;
  top: 0;
  left: 0;
}

.ph-status {
  padding: 40px 0;
  text-align: center;
  font-size: 12px;
  color: #cbd5f5;
}

.ph-error {
  color: #fca5a5;
}

.ph-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.35);
  font-size: 11px;
  color: #e2e8f0;
  white-space: nowrap;
  z-index: 2;
}

.ph-tooltip-title {
  font-weight: 600;
  color: #f8fafc;
}
</style>
