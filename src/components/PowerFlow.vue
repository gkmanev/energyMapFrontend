<template>
  <div class="pf-card">
    <div class="pf-header">
      <span class="pf-title">
        {{ countryIso }} cross-border flows
      </span>
      <span class="pf-unit">MW</span>
    </div>

    <div v-if="error" class="pf-status pf-error">
      {{ error }}
    </div>
    <div v-else-if="loading" class="pf-status pf-loading">
      Loading latest flows…
    </div>

    <!-- responsive square wrapper -->
    <div v-else class="pf-svg-wrapper">
      <svg
        class="pf-svg"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="pf-arrow-export"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" class="pf-arrow-export" />
          </marker>
          <marker
            id="pf-arrow-import"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" class="pf-arrow-import" />
          </marker>
        </defs>

        <!-- LINKS FIRST -->
        <g v-for="nb in neighboursWithFlow" :key="nb.iso + '-links'">
          <!-- EXPORT: center -> neighbour -->
          <path
            v-if="nb.export > 0"
            class="pf-link pf-link-export"
            :d="linkPath(cx, cy, centerRadius, nb.x, nb.y, neighbourRadius, 2)"
            marker-end="url(#pf-arrow-export)"
          />
          <!-- IMPORT: neighbour -> center -->
          <path
            v-if="nb.import > 0"
            class="pf-link pf-link-import"
            :d="linkPath(nb.x, nb.y, neighbourRadius, cx, cy, centerRadius, 2)"
            marker-end="url(#pf-arrow-import)"
          />

          <!-- labels pushed well to the side of the arrow -->
          <g v-if="nb.export > 0" :transform="labelTransform(nb, 'export')">
            <text class="pf-label-text">EX {{ fmt(nb.export) }}</text>
          </g>
          <g v-if="nb.import > 0" :transform="labelTransform(nb, 'import')">
            <text class="pf-label-text">IM {{ fmt(nb.import) }}</text>
          </g>
        </g>

        <!-- NEIGHBOURS -->
        <g
          v-for="nb in neighboursWithFlow"
          :key="nb.iso + '-node'"
          :transform="`translate(${nb.x},${nb.y})`"
        >
          <circle :r="neighbourRadius" class="pf-node-neighbour-bg" />
          <text class="pf-node-neighbour-iso">{{ nb.iso }}</text>
        </g>

        <!-- CENTER -->
        <g :transform="`translate(${cx},${cy})`">
          <circle :r="centerRadius" class="pf-node-center-bg" />
          <text class="pf-node-center-iso">{{ countryIso }}</text>
          <text class="pf-node-center-label">{{ centerName }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<script>
const EIC_BY_ISO = {
  BG: '10YCA-BULGARIA-R',
  GR: '10YGR-HTSO-----Y',
  MK: '10YMK-MEPSO----8',
  TR: '10YTR-TEIAS----W',
  RO: '10YRO-TEL------P',
  RS: '10YCS-SERBIATSOV',
}

const ISO_BY_EIC = Object.fromEntries(
  Object.entries(EIC_BY_ISO).map(([iso, eic]) => [eic, iso]),
)

const NAME_BY_ISO = {
  BG: 'Bulgaria',
  GR: 'Greece',
  MK: 'North Macedonia',
  TR: 'Türkiye',
  RO: 'Romania',
  RS: 'Serbia',
}

export default {
  name: 'PowerFlow',
  props: {
    countryIso: { type: String, default: 'BG' },
    apiBaseUrl: { type: String, default: 'https://api.visualize.energy' },
  },

  data() {
    return {
      loading: false,
      error: null,
      items: [],
      // square viewBox -> easier responsive layout
      W: 400,
      H: 400,
      cx: 200,
      cy: 125,
      centerRadius: 26,
      neighbourRadius: 14,
    }
  },

  computed: {
    centerEic() {
      return EIC_BY_ISO[this.countryIso]
    },
    centerName() {
      return NAME_BY_ISO[this.countryIso] || this.countryIso
    },
    aggregated() {
      const res = {}
      if (!this.centerEic) return res
      for (const row of this.items) {
        const { out_domain_eic, in_domain_eic, quantity_mw } = row
        if (!quantity_mw) continue
        if (out_domain_eic === this.centerEic) {
          const iso = ISO_BY_EIC[in_domain_eic]
          if (!iso) continue
          if (!res[iso]) res[iso] = { import: 0, export: 0 }
          res[iso].export += quantity_mw
        } else if (in_domain_eic === this.centerEic) {
          const iso = ISO_BY_EIC[out_domain_eic]
          if (!iso) continue
          if (!res[iso]) res[iso] = { import: 0, export: 0 }
          res[iso].import += quantity_mw
        }
      }
      return res
    },
    neighbours() {
      const r = 110
      const isos = Object.keys(EIC_BY_ISO).filter((i) => i !== this.countryIso)
      const step = (2 * Math.PI) / isos.length
      return isos.map((iso, i) => {
        const angle = i * step - Math.PI / 2
        const x = this.cx + Math.cos(angle) * r
        const y = this.cy + Math.sin(angle) * r
        const f = this.aggregated[iso] || { import: 0, export: 0 }
        return { iso, x, y, import: f.import, export: f.export }
      })
    },
    neighboursWithFlow() {
      return this.neighbours.filter((n) => n.import > 0 || n.export > 0)
    },
  },

  mounted() {
    this.fetchFlows()
  },

  watch: {
    countryIso() {
      this.fetchFlows()
    },
  },

  methods: {
    async fetchFlows() {
      this.loading = true
      this.error = null
      try {
        const url = `${this.apiBaseUrl}/api/flows/latest/?country=${encodeURIComponent(
          this.countryIso,
        )}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        this.items = json.items || []
      } catch (e) {
        this.error = e.message || 'Failed to load flows'
      } finally {
        this.loading = false
      }
    },

    fmt(v) {
      return v.toFixed(1)
    },

    // arrow from edge of circle A to edge of circle B, with small offset
    linkPath(x1, y1, r1, x2, y2, r2, offset = 0) {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const ux = dx / len
      const uy = dy / len
      const offX = -uy * offset
      const offY = ux * offset
      const sx = x1 + ux * r1 + offX
      const sy = y1 + uy * r1 + offY
      const ex = x2 - ux * r2 + offX
      const ey = y2 - uy * r2 + offY
      return `M ${sx} ${sy} L ${ex} ${ey}`
    },

    /**
     * Label to the side of the arrow.
     * kind = 'export' | 'import'
     */
    labelTransform(nb, kind) {
      const dx = nb.x - this.cx
      const dy = nb.y - this.cy
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const ux = dx / len
      const uy = dy / len

      // pull export labels outward, but push import labels slightly inward so
      // they stay inside the viewport (e.g. Greece at the very top)
      const radialDir = kind === 'export' ? 1 : -1
      const radialDistance = this.neighbourRadius + 12
      let mx = nb.x + ux * radialDistance * radialDir
      let my = nb.y + uy * radialDistance * radialDir

      // perpendicular offset keeps import/export labels separated
      const nx = -uy
      const ny = ux
      const side = kind === 'export' ? 1 : -1
      const offsetSide = 18
      mx += nx * offsetSide * side
      my += ny * offsetSide * side

      return `translate(${mx},${my})`
    },
  },
}
</script>

<style scoped>
.pf-card {
  background: #020617;
  border-radius: 16px;
  padding: 10px 12px 8px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.9);
  color: #e5e7eb;
}

/* header */
.pf-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  font-weight: 500;
  color: #cbd5f5;
  margin-bottom: 4px;
}

.pf-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-unit {
  font-size: 11px;
  color: #9ca3af;
}

.pf-status {
  font-size: 13px;
  padding: 4px 0 2px;
}

.pf-error {
  color: #fecaca;
}

.pf-loading {
  color: #a5b4fc;
}

/* responsive square area for the diagram */
.pf-svg-wrapper {
  width: 100%;
  aspect-ratio: 1 / 1; /* square → less vertical height, no scroll */
}

.pf-svg {
  width: 100%;
  height: 100%;
}

/* center node */
.pf-node-center-bg {
  fill: #020617;
  stroke: #6b7280;
  stroke-width: 1.4;
}

.pf-node-center-iso {
  font-size: 16px;
  font-weight: 600;
  text-anchor: middle;
  dominant-baseline: central;
  fill: #f9fafb;
}

.pf-node-center-label {
  font-size: 10px;
  text-anchor: middle;
  dominant-baseline: hanging;
  fill: #9ca3af;
  transform: translateY(9px);
}

/* neighbour node */
.pf-node-neighbour-bg {
  fill: #020617;
  stroke: #6b7280;
  stroke-width: 1.2;
}

.pf-node-neighbour-iso {
  font-size: 10px;
  text-anchor: middle;
  dominant-baseline: central;
  fill: #e5e7eb;
}

.pf-label-text {
  font-size: 11px;
  font-weight: 500;
  text-anchor: middle;
  dominant-baseline: middle;
  fill: #f1f5f9;
}

/* arrows */
.pf-link {
  fill: none;
  stroke-linecap: round;
  stroke-width: 1.6;
  opacity: 0.85;
}

.pf-link-export {
  stroke: #22c55e;
  animation: pf-flow-export 2.2s linear infinite;
}

.pf-link-import {
  stroke: #3b82f6;
  stroke-dasharray: 4 6;
  animation: pf-flow-import 2.2s linear infinite;
}

@keyframes pf-flow-export {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: 40;
  }
}

@keyframes pf-flow-import {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -40;
  }
}

.pf-arrow-export {
  fill: #22c55e;
}

.pf-arrow-import {
  fill: #3b82f6;
}

/* labels */
.pf-label-text {
  font-size: 10.5px;
  text-anchor: middle;
  fill: #f9fafb;
}
</style>
