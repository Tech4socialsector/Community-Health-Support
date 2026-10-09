<template>
  <!-- Read-only rows of one child table on the record detail page. Columns
  come from the child DocType's own in_list_view fields (falling back to its
  first few visible fields), like Desk's grid. -->
  <div v-if="!rows.length" class="text-sm text-gray-400 dark:text-gray-500">No rows.</div>
  <div v-else-if="metaResource.loading && !metaResource.data" class="space-y-2">
    <Skeleton v-for="i in Math.min(rows.length, 3)" :key="i" height="2rem" />
  </div>
  <div v-else class="overflow-x-auto rounded-lg ring-1 ring-gray-200 dark:ring-gray-800">
    <table class="w-full text-left text-sm">
      <thead class="bg-forest-50 text-[11px] font-semibold uppercase tracking-wider text-forest-800 dark:bg-forest-900/30 dark:text-forest-200">
        <tr>
          <th class="w-10 px-3 py-2 font-medium">#</th>
          <th v-for="col in columns" :key="col.fieldname" class="whitespace-nowrap px-3 py-2 font-medium">
            {{ col.label || col.fieldname }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
        <tr v-for="(row, index) in rows" :key="row.name || index">
          <td class="px-3 py-2 tabular-nums text-gray-400">{{ index + 1 }}</td>
          <td v-for="col in columns" :key="col.fieldname" class="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
            <span v-if="isEmptyValue(row[col.fieldname])" class="text-gray-300 dark:text-gray-600">—</span>
            <template v-else>{{ formatFieldValue(row[col.fieldname], col) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Skeleton from '@/components/Skeleton.vue'
import { useMeta } from '@/data/useMeta'
import { isEmptyValue, formatFieldValue, isLayoutField } from '@/data/recordFormat'

const props = defineProps({
  // The parent's Table DocField - its `options` is the child DocType.
  field: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
})

const metaResource = useMeta(props.field.options)

const columns = computed(() => {
  const fields = (metaResource.data?.fields || []).filter((f) => !f.hidden && !isLayoutField(f))
  const listed = fields.filter((f) => f.in_list_view)
  return listed.length ? listed : fields.slice(0, 5)
})
</script>
