<template>
  <div class="pf-card">
    <div class="pf-header">
      <slot name="title">Power Flow</slot>
      <span class="pf-unit">{{ unit }}</span>
    </div>

    <svg class="pf-svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="xMidYMid meet">
      <!-- defs -->
      <defs>
        <!-- soft node shadow -->
        <filter id="pf-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.2" flood-opacity="0.25" />
        </filter>

        <!-- link glow (thicker blur) -->
        <filter id="pf-glow">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- ring gradients -->
        <linearGradient id="g-solar" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#fbbf24"/>
        </linearGradient>
        <linearGradient id="g-grid" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#60a5fa"/>
          <stop offset="100%" stop-color="#3b82f6"/>
        </linearGradient>
        <linearGradient id="g-batt" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#ec4899"/>
          <stop offset="100%" stop-color="#22c55e"/>
        </linearGradient>
        <linearGradient id="g-home" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#f59e0b"/>
          <stop offset="100%" stop-color="#f97316"/>
        </linearGradient>
      </defs>

      <!-- ===== Links (behind nodes) ===== -->
      <g v-for="ln in visibleLinks" :key="ln.key" class="pf-link">
        <!-- 1) soft glow underlay -->
        <path
          :d="laneCurve(ln.from, ln.to, ln.bend, ln.lane)"
          :stroke="ln.color"
          :stroke-width="ln.sw + 6"
          opacity="0.18"
          filter="url(#pf-glow)"
          class="pf-path-under"
        />

        <!-- 2) animated dashed line -->
        <path
          :id="ln.key"
          :d="laneCurve(ln.from, ln.to, ln.bend, ln.lane)"
          :stroke="ln.color"
          :stroke-width="ln.sw"
          class="pf-path"
          :style="{ strokeDasharray: dashArray(ln.sw) }"
        >
          <animate
            attributeName="stroke-dashoffset"
            :from="dashOffsetFrom(ln.sw)"
            to="0"
            :dur="ln.dur"
            repeatCount="indefinite"
          />
        </path>

        <!-- 3) multiple beads moving along the path -->
        <g v-for="b in ln.beads" :key="ln.key + '-b' + b">
          <circle :r="beadSize(ln.sw)" :fill="ln.color" class="pf-bead">
            <animateMotion :dur="ln.dur" :begin="(b*ln.stagger) + 's'" repeatCount="indefinite">
              <mpath :href="'#' + ln.key" />
            </animateMotion>
          </circle>
        </g>

        <!-- 4) value pill at mid path -->
        <g v-if="ln.showLabel" :transform="midTransform(ln)">
          <rect rx="8" ry="8" class="pf-pill" :width="pillWidth(ln.label)" height="22" x="-8" y="-11"/>
          <text class="pf-pill-text" dy="5">{{ ln.label }}</text>
        </g>
      </g>

      <!-- ===== Nodes ===== -->
      <g class="pf-node" :transform="`translate(${solar.x},${solar.y})`">
        <circle :r="R" class="pf-node-bg" filter="url(#pf-shadow)" />
        <circle :r="R-3" class="pf-ring" stroke="url(#g-solar)"/>
        <text class="pf-emoji">☀️</text>
        <text class="pf-value">{{ fmt(pvGen) }}</text>
        <text class="pf-label">Solar</text>
      </g>

      <g class="pf-node" :transform="`translate(${grid.x},${grid.y})`">
        <circle :r="R" class="pf-node-bg" filter="url(#pf-shadow)" />
        <circle :r="R-3" class="pf-ring" stroke="url(#g-grid)"/>
        <text class="pf-emoji">⚡</text>
        <text class="pf-value">
          <tspan v-if="gridImport>0">↑ {{ fmt(gridImport) }}</tspan>
          <tspan v-if="gridExport>0" x="0" dy="1.15em">↓ {{ fmt(gridExport) }}</tspan>
        </text>
        <text class="pf-label">Grid</text>
      </g>

      <g class="pf-node" :transform="`translate(${battery.x},${battery.y})`">
        <circle :r="R" class="pf-node-bg" filter="url(#pf-shadow)" />
        <circle :r="R-3" class="pf-ring" stroke="url(#g-batt)"/>
        <text class="pf-emoji">🔋</text>
        <text class="pf-value">
          <tspan v-if="batteryDischarge>0">→ {{ fmt(batteryDischarge) }}</tspan>
          <tspan v-if="batteryCharge>0" x="0" dy="1.15em">← {{ fmt(batteryCharge) }}</tspan>
        </text>
        <text class="pf-label">Battery</text>
      </g>

      <g class="pf-node" :transform="`translate(${home.x},${home.y})`">
        <circle :r="R" class="pf-node-bg" filter="url(#pf-shadow)" />
        <circle :r="R-3" class="pf-ring" stroke="url(#g-home)"/>
        <text class="pf-emoji">🏠</text>
        <text class="pf-value">{{ fmt(homeLoad) }}</text>
        <text class="pf-label">Home</text>
      </g>
    </svg>
  </div>
</template>

<script>
export default {
  name: "PowerFlow",
  props: {
    pvGen: { type: Number, default: 0 },
    homeLoad: { type: Number, default: 0 },
    gridImport: { type: Number, default: 0 },
    gridExport: { type: Number, default: 0 },
    batteryCharge: { type: Number, default: 0 },
    batteryDischarge: { type: Number, default: 0 },

    pvToHome: { type: Number, default: 0 },
    pvToGrid: { type: Number, default: 0 },
    pvToBattery: { type: Number, default: 0 },
    gridToHome: { type: Number, default: 0 },
    gridToBattery: { type: Number, default: 0 },
    batteryToHome: { type: Number, default: 0 },

    unit: { type: String, default: "MW" },
    minStroke: { type: Number, default: 2.5 },
    maxStroke: { type: Number, default: 10 },
    homeToPv: { type: Number, default: 0 },
  },
  data() {
    const W = 1000, H = 520, R = 58
    return {
      W, H, R,
      solar:   { x: W/2,   y: 110 },
      grid:    { x: 150,   y: H/2 },
      home:    { x: W-150, y: H/2 },
      battery: { x: W/2,   y: H-110 }
    }
  },
  computed: {
    flows() {
      const f = {
        pvToHome: this.pvToHome,
        pvToGrid: this.pvToGrid,
        pvToBattery: this.pvToBattery,
        gridToHome: this.gridToHome,
        gridToBattery: this.gridToBattery,
        batteryToHome: this.batteryToHome,
        homeToGrid: Math.max(0, this.gridExport),
        homeToPv: this.homeToPv
      }
      if (Object.values(f).some(v => v > 0)) return f

      // fallback inference
      const pv_to_home = Math.min(this.pvGen, this.homeLoad)
      const pv_left = Math.max(0, this.pvGen - pv_to_home)
      const bat_to_home = Math.min(this.batteryDischarge, Math.max(0, this.homeLoad - pv_to_home))
      const home_gap = Math.max(0, this.homeLoad - pv_to_home - bat_to_home)
      const grid_to_home = home_gap
      const pv_to_batt = Math.min(pv_left, this.batteryCharge)
      const pv_to_grid = Math.max(0, pv_left - pv_to_batt)
      const grid_to_batt = Math.max(0, this.batteryCharge - pv_to_batt)

      return {
        pvToHome: pv_to_home,
        pvToBattery: pv_to_batt,
        pvToGrid: pv_to_grid,
        gridToHome: grid_to_home,
        gridToBattery: grid_to_batt,
        batteryToHome: bat_to_home,
        homeToGrid: this.gridExport
      }
    },
    maxFlow() {
      const vals = Object.values(this.flows)
      return Math.max(1, Math.max(...vals))
    },
    visibleLinks() {
    const L = []
    //              key,  from,   to,   value,  color,   bend, showLabel=false, lane=0
    const add = (key, from, to, value, color,  bend=0,  showLabel=false, lane=0) => {
        if (value <= 0) return
        const sw = this.sw(value)
        const norm = Math.min(1, value / this.maxFlow)
        const dur = (3.4 - 2.2 * norm).toFixed(2) + 's'
        const beads = Math.max(2, Math.round(3 + norm * 3))
        const stagger = (parseFloat(dur) / beads) * 0.6
        const label = this.fmt(value, true)
        L.push({ key, from, to, color, bend, sw, dur, beads, stagger, showLabel, label, lane })
    }

    // Give opposite lanes (+1 / -1) so they never overlap
    add('pv-home', this.solar, this.home,  this.flows.pvToHome, '#f59e0b', -0.65, true,  +1)
    add('home-pv', this.home,  this.solar, this.flows.homeToPv, '#f97316',  0.65, true,  -1)

    // others stay single-lane (0)
    add('pv-grid',  this.solar, this.grid,    this.flows.pvToGrid,    '#f59e0b',  0.65, true, 0)
    add('pv-bat',   this.solar, this.battery, this.flows.pvToBattery, '#f59e0b',  0,    false,0)
    add('grid-home',this.grid,  this.home,    this.flows.gridToHome,  '#3b82f6',  0,    true, 0)
    add('grid-bat', this.grid,  this.battery, this.flows.gridToBattery,'#60a5fa', 0.45, false,0)
    add('bat-home', this.battery,this.home,   this.flows.batteryToHome,'#22c55e', 0,    false,0)
    add('home-grid',this.home,  this.grid,    this.flows.homeToGrid,  '#f97316',  0,    true, 0)

    return L
    }
  },
  methods: {

    angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) },

    anchorOnRing(center, baseAngle, lane=0, laneRad=0.22) {
    // laneRad ≈ 12.5°; tweak to separate lanes more/less
    const ang = baseAngle + lane * laneRad
    const r = Math.max(24, this.R - 2)
    return { x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) }
    },

    fmt(v, compact=false) {
      if (typeof v !== 'number') return `- ${this.unit}`
      if (compact) {
        return (Math.abs(v) >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(0)) + ' ' + this.unit
      }
      const n = Math.abs(v) >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toFixed(0)
      return `${n} ${this.unit}`
    },
    laneCurve(a, b, bend=0, lane=0) {
    const theta = this.angle(a, b)
    // start at ring of "from" with positive lane offset; end at ring of "to" with negative lane offset
    const p0 = this.anchorOnRing(a, theta, +lane)
    const p1 = this.anchorOnRing(b, theta + Math.PI, +lane * -1)

    // mid control point (same as before) + small normal offset to keep lanes apart along the whole curve
    const dx = p1.x - p0.x, dy = p1.y - p0.y
    const cx0 = p0.x + dx * 0.5 + (-dy) * 0.25 * bend
    const cy0 = p0.y + dy * 0.5 + ( dx) * 0.25 * bend

    // push control point along curve normal depending on lane
    const normal = Math.atan2(-dx, dy) // 90° to the tangent
    const lanePush = 10 * lane // tweak separation along the span
    const cx = cx0 + lanePush * Math.cos(normal)
    const cy = cy0 + lanePush * Math.sin(normal)

    return `M ${p0.x} ${p0.y} Q ${cx} ${cy} ${p1.x} ${p1.y}`
    },

    sw(val) {
      const t = Math.min(1, Math.max(0, val / this.maxFlow))
      return this.minStroke + t * (this.maxStroke - this.minStroke)
    },

    dashArray(sw) {
      // dash length scales with thickness
      const dash = Math.max(10, sw * 2.2)
      const gap  = dash * 1.1
      return `${dash} ${gap}`
    },
    dashOffsetFrom(sw) {
      return Math.max(12, sw*4)
    },
    beadSize(sw) {
      return Math.max(2.2, Math.min(5.5, sw * 0.35))
    },
    // label pill helpers
    midPoint(a, b, bend=0) {
      const dx = b.x - a.x, dy = b.y - a.y
      const cx = a.x + dx * 0.5 + (-dy) * 0.25 * bend
      const cy = a.y + dy * 0.5 + ( dx) * 0.25 * bend
      // quadratic at t=0.5 -> midpoint
      const x = ( (a.x + 2*cx + b.x) / 4 )
      const y = ( (a.y + 2*cy + b.y) / 4 )
      return { x, y }
    },
    midTransform(ln) {
      const p = this.midPoint(ln.from, ln.to, ln.bend)
      return `translate(${p.x},${p.y})`
    },
    pillWidth(label) { return Math.max(54, 10 + label.length * 7.4) }
  }
}
</script>

<style scoped>
.pf-card{
  background:#0b0f1a;
  border-radius:16px;
  padding:12px 16px 6px 16px;
  color:#e5e7eb;
  box-shadow:0 8px 26px rgba(0,0,0,.35);
}
.pf-header{
  display:flex; justify-content:space-between; align-items:center;
  font-weight:700; font-size:20px; letter-spacing:.2px;
  margin-bottom:6px;
}
.pf-unit{ font-weight:600; opacity:.7; font-size:12px; }
.pf-svg{ width:100%; height:360px; display:block; }

/* nodes */
.pf-node{ text-anchor:middle; dominant-baseline:middle; }
.pf-node-bg{ fill:#0f172a; stroke:#111827; stroke-width:2; }
.pf-ring{ fill:none; stroke-width:6; }
.pf-emoji{ font-size:20px; fill:#fff; transform:translateY(-10px); }
.pf-value{ font-size:13px; fill:#e5e7eb; transform:translateY(6px); }
.pf-label{ font-size:12px; fill:#9ca3af; transform:translateY(20px); }

/* links */
.pf-path{ fill:none; stroke-linecap:round; opacity:.98; }
.pf-path-under{ fill:none; stroke-linecap:round; }
.pf-bead{ filter: drop-shadow(0 0 4px rgba(0,0,0,.35)); }

/* pill label on line */
.pf-pill{ fill: rgba(15,23,42,.75); stroke: rgba(255,255,255,.08); stroke-width:1; }
.pf-pill-text{ fill:#e5e7eb; font-size:12px; text-anchor:middle; }
</style>
