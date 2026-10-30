import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindMapTouchGestures } from './mapTouchGestures.js'

function setup() {
  const listeners = new Map()
  const classes = new Set()
  let dragging = true
  let hint = false
  const container = {
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    addEventListener: (type, callback, options) => listeners.set(type, { callback, options }),
    removeEventListener: type => listeners.delete(type)
  }
  const map = {
    getContainer: () => container,
    dragging: {
      enabled: () => dragging,
      disable: () => { dragging = false },
      enable: () => { dragging = true }
    }
  }
  const cleanup = bindMapTouchGestures(map, visible => { hint = visible })
  function emit(type, touches = [], control = false, extra = {}) {
    listeners.get(type).callback({ touches, target: { closest: () => control }, ...extra })
  }
  return { emit, cleanup, listeners, classes, dragging: () => dragging, hint: () => hint }
}

test('one finger scrolls without blocking taps; movement shows a hint', () => {
  const state = setup()
  try {
    assert.equal(state.listeners.get('touchstart').options.capture, true)
    assert.equal(state.listeners.get('touchstart').options.passive, true)
    assert.equal(state.listeners.has('click'), false)
    state.emit('touchstart', [{ clientX: 20, clientY: 20 }])
    assert.equal(state.dragging(), false)
    assert.equal(state.hint(), false)
    state.emit('touchmove', [{ clientX: 22, clientY: 22 }])
    assert.equal(state.hint(), false)
    state.emit('touchmove', [{ clientX: 20, clientY: 40 }])
    assert.equal(state.hint(), true)
    state.emit('touchcancel')
    assert.equal(state.hint(), false)
  } finally { state.cleanup() }
})

test('two fingers remain available to Leaflet touch zoom and pan without a hint', () => {
  const state = setup()
  try {
    state.emit('touchstart', [{ clientX: 0, clientY: 0 }])
    state.emit('touchmove', [{ clientX: 0, clientY: 20 }])
    assert.equal(state.hint(), true)
    const touches = [{ clientX: 0, clientY: 20 }, { clientX: 30, clientY: 20 }]
    state.emit('touchstart', touches)
    state.emit('touchmove', touches)
    assert.equal(state.dragging(), false)
    assert.equal(state.hint(), false)
  } finally { state.cleanup() }
})

test('mouse dragging and controls remain available; cleanup removes listeners', () => {
  const state = setup()
  state.emit('touchstart', [{ clientX: 0, clientY: 0 }], true)
  assert.equal(state.dragging(), true)
  state.emit('touchstart', [{ clientX: 0, clientY: 0 }])
  state.emit('mousedown', [], false, { sourceCapabilities: { firesTouchEvents: true } })
  assert.equal(state.dragging(), false)
  state.emit('mousedown')
  assert.equal(state.dragging(), true)
  state.cleanup()
  assert.equal(state.listeners.size, 0)
  assert.equal(state.classes.size, 0)
  assert.equal(state.hint(), false)
})
