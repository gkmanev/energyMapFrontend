// Leaflet's touchZoom handler already supports both two-finger pan and pinch.
// Disable its single-finger drag before it sees a touch, while preserving mouse drag.
export function bindMapTouchGestures(map, onHint) {
  const container = map.getContainer()
  const draggingEnabled = map.dragging.enabled()
  let start = null
  let hintTimer = null

  function hideHint() {
    clearTimeout(hintTimer)
    hintTimer = null
    onHint(false)
  }

  function onTouchStart(event) {
    if (event.target.closest('.leaflet-control, .leaflet-popup')) return
    map.dragging.disable()
    hideHint()
    start = event.touches.length === 1
      ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
      : null
  }

  function onTouchMove(event) {
    if (!start || event.touches.length !== 1) return
    const touch = event.touches[0]
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) < 10) return
    start = null
    onHint(true)
    hintTimer = setTimeout(hideHint, 1500)
  }

  function onTouchEnd() {
    start = null
  }

  function onTouchCancel() {
    start = null
    hideHint()
  }

  function onMouseDown(event) {
    if (event.sourceCapabilities?.firesTouchEvents) return
    if (draggingEnabled) map.dragging.enable()
    hideHint()
  }

  // Set this before the gesture begins so the browser can scroll with one finger.
  container.classList.add('map--two-finger-touch')
  container.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  container.addEventListener('touchmove', onTouchMove, { passive: true })
  container.addEventListener('touchend', onTouchEnd, { passive: true })
  container.addEventListener('touchcancel', onTouchCancel, { passive: true })
  container.addEventListener('mousedown', onMouseDown, true)

  return () => {
    container.removeEventListener('touchstart', onTouchStart, true)
    container.removeEventListener('touchmove', onTouchMove)
    container.removeEventListener('touchend', onTouchEnd)
    container.removeEventListener('touchcancel', onTouchCancel)
    container.removeEventListener('mousedown', onMouseDown, true)
    container.classList.remove('map--two-finger-touch')
    hideHint()
    if (draggingEnabled) map.dragging.enable()
  }
}
