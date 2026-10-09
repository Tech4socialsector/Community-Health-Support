<template>
  <!-- Desk's Signature control: sign with a finger or mouse on the pad, Clear
  to start again. Saved in Desk's own format - a PNG data URL, as Desk's
  jSignature pad writes it - so a signature taken here shows in Desk and
  the other way round. -->
  <div>
    <div class="mb-1.5 flex items-center justify-between gap-2">
      <label class="text-sm text-gray-700 dark:text-gray-300">
        {{ field.label }}<span v-if="field.reqd" class="text-red-500"> *</span>
      </label>
      <button
        v-if="modelValue && !readOnly"
        type="button"
        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-navy-900 dark:hover:bg-gray-800"
        @click="clear"
      >
        <LucideIcon name="rotate-ccw" class="h-3.5 w-3.5" />
        Clear
      </button>
    </div>

    <img
      v-if="readOnly"
      :src="modelValue || undefined"
      :alt="field.label"
      class="h-36 w-full rounded-lg bg-white object-contain ring-1 ring-gray-200 dark:ring-gray-700"
    />
    <div v-else class="relative">
      <!-- touch-none: a stroke must draw, not scroll the form. -->
      <canvas
        ref="canvas"
        class="block h-36 w-full touch-none rounded-lg bg-white ring-1 ring-gray-200 dark:ring-gray-700"
        :aria-label="`${field.label} - sign here`"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
        @pointerleave="end"
      />
      <span
        v-if="!modelValue && !drawing"
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400"
      >
        Sign here
      </span>
    </div>
    <p v-if="field.description" class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{{ field.description }}</p>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LucideIcon from '@/components/LucideIcon.vue'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: String, default: null },
  readOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const canvas = ref(null)
const drawing = ref(false)
let ctx = null
let last = null
let dirty = false
// The last value this pad emitted - when the form hands it back, there's
// nothing to redraw (redrawing would blur the strokes just drawn).
let emitted = null

// Size the bitmap to the box (and the screen's pixel density) so strokes
// are sharp and land exactly under the finger.
function setup() {
  const el = canvas.value
  if (!el) return
  const ratio = window.devicePixelRatio || 1
  const rect = el.getBoundingClientRect()
  el.width = Math.max(1, Math.round(rect.width * ratio))
  el.height = Math.max(1, Math.round(rect.height * ratio))
  ctx = el.getContext('2d')
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.2
  ctx.strokeStyle = '#111827'
  paintValue()
}

// Show a saved signature on the pad (fitted, centred), or a blank pad.
function paintValue() {
  if (!ctx || !canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
  if (!props.modelValue) return
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(rect.width / img.width, rect.height / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h)
  }
  img.src = props.modelValue
}

function point(e) {
  const rect = canvas.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function start(e) {
  if (props.readOnly || !ctx) return
  canvas.value.setPointerCapture?.(e.pointerId)
  drawing.value = true
  last = point(e)
  ctx.beginPath()
  ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
  dirty = true
}

function move(e) {
  if (!drawing.value || !ctx) return
  const p = point(e)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  last = p
}

// One value per stroke: the whole pad as a PNG.
function end() {
  if (!drawing.value) return
  drawing.value = false
  last = null
  if (dirty) {
    dirty = false
    emitted = canvas.value.toDataURL('image/png')
    emit('update:modelValue', emitted)
  }
}

function clear() {
  emitted = null
  emit('update:modelValue', '')
  if (ctx && canvas.value) {
    const rect = canvas.value.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (value && value === emitted) return
    paintValue()
  },
)

// The pad's width follows the form's layout (phone / two columns).
let observer = null
onMounted(async () => {
  await nextTick()
  setup()
  if (window.ResizeObserver && canvas.value) {
    observer = new ResizeObserver(() => setup())
    observer.observe(canvas.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.readOnly,
  async () => {
    await nextTick()
    setup()
  },
)
</script>
