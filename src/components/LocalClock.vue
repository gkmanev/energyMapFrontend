<template>
  <div class="flex items-center text-sm font-medium text-gray-200">
    <span class="mr-1">CET </span>
    <span>{{ timeString }}</span>
    <span v-if="showDate" class="mx-2">•</span>
    <span v-if="showDate">{{ dateString }}</span>
  </div>
</template>

<script>
export default {
  name: "LocalClock",
  props: {
    timestamp: {
      type: Number,
      default: null,
    },
    showDate: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      liveTimestamp: Date.now(),
      timer: null,
    }
  },
  computed: {
    sourceDate() {
      const source = Number.isFinite(this.timestamp) ? this.timestamp : this.liveTimestamp
      return new Date(source)
    },
    timeString() {
      return this.formatTime(this.sourceDate)
    },
    dateString() {
      return this.formatDate(this.sourceDate)
    },
  },
  mounted() {
    if (!Number.isFinite(this.timestamp)) {
      this.timer = setInterval(() => {
        this.liveTimestamp = Date.now()
      }, 1000)
    }
  },
  beforeUnmount() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  },
  methods: {
    formatTime(date) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    },
    formatDate(date) {
      return date.toLocaleDateString('en-GB', { weekday: "short", day: "2-digit", month: "2-digit" })
    },
  },
}
</script>

<style scoped>
/* optional slight glow to distinguish in dark headers */
span {
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}
</style>
