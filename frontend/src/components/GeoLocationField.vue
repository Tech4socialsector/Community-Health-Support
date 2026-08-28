<template>
  <div>
    <div class="mb-1.5 flex items-center justify-between">
      <label class="text-sm text-gray-700 dark:text-gray-300">{{ field.label }}</label>
      <div class="flex items-center gap-1">
        <span v-if="point" class="text-xs text-gray-400 dark:text-gray-500">
          {{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}
        </span>
        <Tooltip v-if="point" text="Clear location">
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
            @click="clearLocation"
          >
            <FeatherIcon name="x" class="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>

    <div class="relative h-64 w-full overflow-hidden rounded-lg border dark:border-gray-800">
      <div ref="mapEl" class="h-full w-full" />
      <Tooltip text="Use my current location" placement="left">
        <button
          type="button"
          class="absolute right-2 top-2 z-[1000] flex h-9 w-9 items-center justify-center rounded-lg border bg-white text-gray-600 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          @click="captureLocation"
        >
          <LoadingIndicator v-if="locating" class="h-4 w-4" />
          <FeatherIcon v-else name="crosshair" class="h-4 w-4" />
        </button>
      </Tooltip>
    </div>

    <p v-if="locateError" class="mt-1.5 text-xs text-red-500">{{ locateError }}</p>
    <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
      {{ field.description || 'Click the map to set a location, or drag the pin to adjust it.' }}
    </p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { FeatherIcon, Tooltip, LoadingIndicator } from 'frappe-ui'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png'

// Leaflet's default marker icon paths are baked in relative to its own CSS
// origin, which breaks under Vite's asset hashing - point them at the
// actual bundled URLs instead.
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
})

const DEFAULT_CENTER = [19.08, 72.8961] // matches Frappe desk's map_defaults
const DEFAULT_ZOOM = 5
const PIN_ZOOM = 15

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: null },
})
const emit = defineEmits(['update:modelValue'])

const mapEl = ref(null)
const locating = ref(false)
const locateError = ref('')
let map = null
let marker = null

function parsePoint(value) {
  if (!value) return null
  try {
    const geojson = typeof value === 'string' ? JSON.parse(value) : value
    const feature = geojson?.features?.[0]
    const coords = feature?.geometry?.coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      return { lng: coords[0], lat: coords[1] }
    }
  } catch {
    // not valid GeoJSON - treat as unset
  }
  return null
}

function toGeoJSON(point) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      },
    ],
  })
}

const point = ref(parsePoint(props.modelValue))

// Only react to external value changes (e.g. loading an existing record) -
// setPoint() below already keeps `point` and the emitted value in sync for
// changes made through the map itself, so this must not fight that.
watch(
  () => props.modelValue,
  (value) => {
    const next = parsePoint(value)
    if (next?.lat === point.value?.lat && next?.lng === point.value?.lng) return
    point.value = next
    syncMarker()
  },
)

function setPoint(next) {
  point.value = next
  emit('update:modelValue', toGeoJSON(next))
  syncMarker()
}

function clearLocation() {
  point.value = null
  emit('update:modelValue', null)
  if (marker) {
    map.removeLayer(marker)
    marker = null
  }
}

function syncMarker() {
  if (!map || !point.value) return
  const { lat, lng } = point.value
  if (!marker) {
    marker = L.marker([lat, lng], { draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      setPoint({ lat, lng })
    })
  } else {
    marker.setLatLng([lat, lng])
  }
  map.setView([lat, lng], Math.max(map.getZoom(), PIN_ZOOM))
}

function captureLocation() {
  if (!navigator.geolocation) {
    locateError.value = 'Geolocation is not supported by this browser.'
    return
  }
  locating.value = true
  locateError.value = ''
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locating.value = false
      setPoint({ lat: position.coords.latitude, lng: position.coords.longitude })
    },
    (err) => {
      locating.value = false
      locateError.value = err.message || 'Could not get your location.'
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

onMounted(() => {
  map = L.map(mapEl.value).setView(
    point.value ? [point.value.lat, point.value.lng] : DEFAULT_CENTER,
    point.value ? PIN_ZOOM : DEFAULT_ZOOM,
  )
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)

  map.on('click', (e) => setPoint({ lat: e.latlng.lat, lng: e.latlng.lng }))

  if (point.value) syncMarker()

  // If the map's container hasn't finished its own layout yet when
  // L.map() measures it (e.g. it's still inside a CSS multi-column form
  // that reflows after mount), Leaflet bakes in the wrong size and the
  // view renders zoomed out to nearly the whole world instead of
  // DEFAULT_ZOOM - it never self-corrects without an explicit
  // invalidateSize(). Re-measuring on the next frame (after layout has
  // settled) and once more after a short delay (covers slower reflows)
  // fixes this without needing to track the container's size continuously.
  requestAnimationFrame(() => {
    map?.invalidateSize()
    map?.setView(
      point.value ? [point.value.lat, point.value.lng] : DEFAULT_CENTER,
      point.value ? PIN_ZOOM : DEFAULT_ZOOM,
    )
  })
  setTimeout(() => map?.invalidateSize(), 300)
})

onBeforeUnmount(() => {
  if (map) map.remove()
})
</script>
