<template>
  <div class="flex items-center text-sm font-medium text-gray-200">
    <span class="mr-1">🕒 </span>
    <span>{{ timeString }}</span>
  </div>
</template>

<script>
export default {
  name: "LocalClock",
  data() {
    return { timeString: this.formatTime(new Date()) }
  },
  mounted() {
    this.timer = setInterval(() => {
      this.timeString = this.formatTime(new Date())
    }, 1000)
  },
  beforeUnmount() {
    clearInterval(this.timer)
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
