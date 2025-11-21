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
  AL: '10YAL-KESH-----5',
  AT: '10YAT-APG------L',
  BA: '10YBA-JPCC-----D',
  BE: '10YBE----------2',
  BG: '10YCA-BULGARIA-R',
  BY: '10Y1001A1001A51S',
  CH: '10YCH-SWISSGRIDZ',
  CY: '10YCY-1001A0003J',
  CZ: '10YCZ-CEPS-----N',
  DE: [
    '10YDE-VE-------2', // 50Hertz
    '10YDE-RWENET---I', // Amprion
    '10YDE-EON------1', // TenneT GER
    '10YDE-ENBW-----N', // TransnetBW
  ],
  DK: ['10YDK-1--------W', '10YDK-2--------M'],
  EE: '10Y1001A1001A39I',
  ES: '10YES-REE------0',
  FI: '10YFI-1--------U',
  FR: '10YFR-RTE------C',
  GB: '10YGB----------A',
  GR: '10YGR-HTSO-----Y',
  HR: '10YHR-HEP------M',
  HU: '10YHU-MAVIR----U',
  IE: '10YIE-1001A00010',
  LT: '10YLT-1001A0008Q',
  LU: '10YLU-CEGEDEL-NQ',
  LV: '10YLV-1001A00074',
  MD: '10Y1001A1001A990',
  ME: '10YCS-CG-TSO---S',
  MK: '10YMK-MEPSO----8',
  MT: '10Y1001A1001A93C',
  NL: '10YNL----------L',
  NO: [
    '10YNO-1--------2', // NO1
    '10YNO-2--------T', // NO2
    '10YNO-3--------J', // NO3
    '10YNO-4--------9', // NO4
    '10Y1001A1001A48H', // NO5
  ],
  PL: '10YPL-AREA-----S',
  PT: '10YPT-REN------W',
  RO: '10YRO-TEL------P',
  RS: '10YCS-SERBIATSOV',
  SE: [
    '10Y1001A1001A44P', // SE1
    '10Y1001A1001A45N', // SE2
    '10Y1001A1001A46L', // SE3
    '10Y1001A1001A47J', // SE4
  ],
  SI: '10YSI-ELES-----O',
  SK: '10YSK-SEPS-----K',
  TR: '10YTR-TEIAS----W',
  UA: '10Y1001C--00003F',
  XK: '10Y1001C--00100H',
  GE: '10Y1001A1001B012',
}

const ISO_BY_EIC = Object.entries(EIC_BY_ISO).reduce((acc, [iso, eic]) => {
  const codes = Array.isArray(eic) ? eic : [eic]
  for (const code of codes) acc[code] = iso
  return acc
}, {})

const COUNTRY_NEIGHBOURS = {
  AD: ['FR', 'ES'],
  AL: ['ME', 'XK', 'MK', 'GR'],
  AM: ['GE', 'AZ', 'TR', 'IR'],
  AT: ['DE', 'CZ', 'SK', 'HU', 'SI', 'IT', 'CH', 'LI'],
  AZ: ['RU', 'GE', 'AM', 'IR', 'TR'],
  BA: ['HR', 'RS', 'ME'],
  BE: ['FR', 'DE', 'NL', 'LU', 'UK'],
  BG: ['RO', 'GR', 'TR', 'RS', 'MK'],
  BY: ['PL', 'LT', 'LV', 'RU', 'UA'],
  CH: ['FR', 'DE', 'AT', 'IT', 'LI'],
  CY: [],
  CZ: ['DE', 'PL', 'SK', 'AT'],
  DE: ['DK', 'PL', 'CZ', 'AT', 'CH', 'FR', 'LU', 'BE', 'NL'],
  DK: ['DE', 'SE', 'NO'],
  EE: ['LV', 'RU', 'FI'],
  ES: ['PT', 'FR', 'AD'],
  FI: ['SE', 'NO', 'RU', 'EE'],
  FR: ['BE', 'LU', 'DE', 'CH', 'IT', 'ES', 'AD', 'UK'],
  GE: ['RU', 'AM', 'AZ', 'TR'],
  GR: ['AL', 'MK', 'BG', 'TR'],
  HR: ['SI', 'HU', 'RS', 'BA', 'ME'],
  HU: ['AT', 'SK', 'UA', 'RO', 'RS', 'HR', 'SI'],
  IE: ['UK'],
  IS: [],
  IT: ['FR', 'CH', 'AT', 'SI'],
  LI: ['AT', 'CH'],
  LT: ['LV', 'PL', 'BY', 'RU'],
  LU: ['BE', 'FR', 'DE'],
  LV: ['EE', 'LT', 'RU', 'BY'],
  MC: ['FR'],
  MD: ['RO', 'UA'],
  ME: ['HR', 'BA', 'RS', 'XK', 'AL'],
  MK: ['AL', 'GR', 'RS', 'BG', 'XK'],
  MT: ['IT'],
  NL: ['BE', 'DE', 'UK'],
  NO: ['SE', 'FI', 'RU', 'DK', 'UK'],
  PL: ['DE', 'CZ', 'SK', 'UA', 'BY', 'LT', 'SE'],
  PT: ['ES'],
  RO: ['UA', 'MD', 'BG', 'RS', 'HU'],
  RS: ['HU', 'RO', 'BG', 'MK', 'XK', 'BA', 'HR', 'ME'],
  SE: ['NO', 'FI', 'DK', 'PL', 'LT'],
  SI: ['IT', 'AT', 'HU', 'HR'],
  SK: ['CZ', 'PL', 'UA', 'HU', 'AT'],
  TR: ['BG', 'GR', 'GE', 'AM'],
  UA: ['PL', 'SK', 'HU', 'RO', 'MD', 'BY', 'RU'],
  UK: ['IE', 'FR', 'NL', 'BE', 'NO'],
  XK: ['AL', 'ME', 'MK', 'RS'],
}

const NAME_BY_ISO = {
  AD: 'Andorra',
  AL: 'Albania',
  AM: 'Armenia',
  AT: 'Austria',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BE: 'Belgium',
  BG: 'Bulgaria',
  BY: 'Belarus',
  CH: 'Switzerland',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DK: 'Denmark',
  EE: 'Estonia',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GB: 'Great Britain',
  GE: 'Georgia',
  GR: 'Greece',
  HR: 'Croatia',
  HU: 'Hungary',
  IE: 'Ireland',
  IS: 'Iceland',
  IT: 'Italy',
  LI: 'Liechtenstein',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MK: 'North Macedonia',
  MT: 'Malta',
  NL: 'Netherlands',
  NO: 'Norway',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  RS: 'Serbia',
  SE: 'Sweden',
  SI: 'Slovenia',
  SK: 'Slovakia',
  TR: 'Türkiye',
  UA: 'Ukraine',
  UK: 'United Kingdom',
  XK: 'Kosovo',
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
    latestTimestamp() {
      let latest = null
      for (const row of this.items) {
        if (!row.datetime_utc) continue
        const ts = new Date(row.datetime_utc).getTime()
        if (Number.isNaN(ts)) continue
        if (latest === null || ts > latest) latest = ts
      }
      return latest
    },
    latestItems() {
      const ts = this.latestTimestamp
      if (ts === null) return []
      return this.items.filter((row) => {
        if (!row.datetime_utc) return false
        const rowTs = new Date(row.datetime_utc).getTime()
        return !Number.isNaN(rowTs) && rowTs === ts
      })
    },
    aggregated() {
      const res = {}
      if (!this.centerEic) return res
      for (const row of this.latestItems) {
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
      const configured = COUNTRY_NEIGHBOURS[this.countryIso] || []
      const dynamic = Object.keys(this.aggregated).filter(
        (iso) => iso !== this.countryIso && !configured.includes(iso),
      )
      const isos = [...configured, ...dynamic]
      if (isos.length === 0) return []
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
        const params = new URLSearchParams({ country: this.countryIso, neighbors: '1' })
        const url = `${this.apiBaseUrl}/api/flows/latest/?${params.toString()}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const rawItems = Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.data)
            ? json.data
            : []
        this.items = rawItems
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

      // keep labels hugging the neighbour nodes: export labels sit just
      // outside the circle, import labels tuck just inside
      const radialDir = kind === 'export' ? 1 : -1
      const radialOffset = this.neighbourRadius + 17
      let mx = nb.x + ux * radialOffset * radialDir
      let my = nb.y + uy * radialOffset * radialDir

      // perpendicular offset keeps import/export labels separated
      const nx = -uy
      const ny = ux
      const side = kind === 'export' ? 1 : -1
      const offsetSide = 26
      mx += nx * offsetSide * side
      my += ny * offsetSide * side

      return `translate(${mx},${my})`
    },

  },
}
</script>

<style scoped>
.pf-card {
  background: transparent;
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
  stroke-dasharray: 6 6;
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
    stroke-dashoffset: -40;
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
