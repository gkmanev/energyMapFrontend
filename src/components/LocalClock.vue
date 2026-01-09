<template>
  <div class="flex items-center text-sm font-medium text-gray-200">
    <span class="mr-1">CET </span>
    <span>{{ timeString }}</span>
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
  },
  data() {
    return {
      liveTimestamp: Date.now(),
      timer: null,
    }
  },
  computed: {
    timeString() {
      const source = Number.isFinite(this.timestamp) ? this.timestamp : this.liveTimestamp
      return this.formatTime(new Date(source))
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
  },
}
</script>

<style scoped>
/* optional slight glow to distinguish in dark headers */
span {
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}
</style>
