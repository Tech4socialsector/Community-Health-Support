// Groups a DocType's fields the way Desk actually lays them out: one
// section per Section/Tab Break, and within a section, Desk's own Column
// Break positions preserved as real column groups - not an auto-flowing
// layout that ignores which fields Desk placed side by side. Shared by
// DoctypeForm.vue (the main record form) and ChildTable.vue (a child
// table's row-edit dialog), so both stay in step with the same rules.
//
// Returns: [{ key, label, collapsible, blocks: [block, ...] }, ...]
// A block is one of:
//   { kind: 'table', key, field }
//   { kind: 'columns', columns: [[item, item, ...], [...], ...] }
// where an item inside a column is one of:
//   { kind: 'field', key, field }
//   { kind: 'heading', key, label }
//   { kind: 'html', key, html }
//   { kind: 'checkboxGroup', key, items: [{ kind: 'field', key, field }, ...],
//     stacked, heading?, headingKey? }
// A Heading or HTML field is just another item in whichever column it sits
// in - e.g. a second heading further down the same column (like "NT Scan"
// under "Dating Ultrasounds") stays paired with whatever's alongside it in
// the next column, same as Desk. Only a Table field forces a full-width
// break, since Desk never renders a child table squeezed into a column.
//
// A run of 2+ checkboxes becomes one checkboxGroup (taking the heading just
// above it along), stacked one per line as in Desk. The "Pregnancy
// Assessment" checkboxes specifically (and only that named group) render as
// a small 2-column grid instead -
// Desk packs these onto the same row by pixel width; a plain one-per-line
// stack (correct for every other checkbox run in the app) reads as a long,
// sparse list for this one, and cramming them onto a single unbroken line
// is unreadable the other way.
export function buildFormSections(fields, { formByName, tableByName = new Map(), visibleNames }) {
  const sections = []
  let current = null
  let columnsBlock = null

  function startSection(key, label, collapsible) {
    current = { key, label, collapsible, blocks: [] }
    columnsBlock = null
  }
  function closeSection() {
    const hasContent = current.blocks.some(
      (b) => b.kind === 'table' || (b.kind === 'columns' && b.columns.some((c) => c.length)),
    )
    if (hasContent) sections.push(current)
  }
  function ensureColumnsBlock() {
    if (!columnsBlock) {
      columnsBlock = { kind: 'columns', columns: [[]] }
      current.blocks.push(columnsBlock)
    }
    return columnsBlock
  }
  function pushItem(item) {
    ensureColumnsBlock().columns.at(-1).push(item)
  }

  startSection('__top', '', false)
  for (const f of fields || []) {
    if (f.fieldtype === 'Section Break' || f.fieldtype === 'Tab Break') {
      closeSection()
      startSection(f.fieldname, f.label || '', !!f.collapsible)
    } else if (f.fieldtype === 'Column Break') {
      ensureColumnsBlock().columns.push([])
    } else if (f.fieldtype === 'Heading') {
      // Labels like "<h5>Cardiovascular</h5>" - Desk renders the tag; here
      // the heading style does that job, so only the text is kept.
      const label = (f.label || '').replace(/<[^>]*>/g, '').trim()
      if (label && !f.hidden && visibleNames.has(f.fieldname)) {
        pushItem({ kind: 'heading', key: f.fieldname, label })
      }
    } else if (f.fieldtype === 'HTML') {
      // Fixed text from the form's design (e.g. the Palliative consent
      // wording, English + Hindi) - Desk shows it as written.
      if (f.options && !f.hidden && visibleNames.has(f.fieldname)) {
        pushItem({ kind: 'html', key: f.fieldname, html: f.options })
      }
    } else if (tableByName.has(f.fieldname) && visibleNames.has(f.fieldname)) {
      current.blocks.push({ kind: 'table', key: f.fieldname, field: tableByName.get(f.fieldname) })
      columnsBlock = null
    } else if (formByName.has(f.fieldname) && visibleNames.has(f.fieldname)) {
      pushItem({ kind: 'field', key: f.fieldname, field: formByName.get(f.fieldname) })
    }
  }
  closeSection()

  // A Column Break hit before anything else in a section (or between two
  // Column Breaks with nothing typed between them) leaves an empty column -
  // rendering it as its own grid track would waste a chunk of the row as
  // visible blank space for no reason, so it's dropped here rather than
  // carried into the columns count every block/row renders with.
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.kind === 'columns') block.columns = block.columns.filter((col) => col.length)
    }
    sec.blocks = sec.blocks.filter((b) => b.kind !== 'columns' || b.columns.length)
  }

  // A run of two or more consecutive Check fields in the same column (no
  // Column Break/Heading/HTML/Table between them) collapses into one
  // checkboxGroup item (see groupConsecutiveCheckboxes), so the run sits
  // together in one cell instead of each checkbox claiming a full row.
  for (const sec of sections) {
    for (const block of sec.blocks) {
      if (block.kind !== 'columns') continue
      block.columns = block.columns.map(groupConsecutiveCheckboxes)
    }
  }

  return sections
}

function isCheckFieldItem(item) {
  return item.kind === 'field' && item.field.fieldtype === 'Check'
}

// Only the "Pregnancy Assessment" checkbox group (Feeling well / Good
// energy / Pink tongue / Good fetal Movement, under that exact heading) is
// re-laid-out as a 2-up grid - every other checkbox run in the app keeps
// Desk's one-per-line stacking, unchanged.
const CHECKBOX_GRID_HEADING = 'Pregnancy Assessment'

function groupConsecutiveCheckboxes(column) {
  const result = []
  let run = []
  let runEligible = false
  let lastHeadingLabel = null
  // Every other run of 2+ checkboxes stays one per line as in Desk, but as
  // one item (with the heading right above it, if any): the two sides' rows
  // line up, so loose checkboxes would each be stretched to the height of
  // the field beside them and float far apart.
  const flushRun = () => {
    if (run.length > 1) {
      const group = { kind: 'checkboxGroup', key: run[0].key, items: run, stacked: !runEligible }
      if (result.at(-1)?.kind === 'heading') {
        const heading = result.pop()
        Object.assign(group, { heading: heading.label, headingKey: heading.key })
      }
      result.push(group)
    } else {
      result.push(...run)
    }
    run = []
    runEligible = false
  }
  for (const item of column) {
    if (isCheckFieldItem(item)) {
      if (!run.length) runEligible = lastHeadingLabel === CHECKBOX_GRID_HEADING
      run.push(item)
    } else {
      flushRun()
      result.push(item)
      if (item.kind === 'heading') lastHeadingLabel = item.label
    }
  }
  flushRun()
  return result
}

// Whether a section contains a given fieldname, in any of its columns or as
// a table/html/heading block's own key.
export function sectionHasField(sec, fieldname) {
  const itemMatches = (i) =>
    i.key === fieldname ||
    (i.kind === 'checkboxGroup' && (i.headingKey === fieldname || i.items.some((sub) => sub.key === fieldname)))
  return sec.blocks.some((b) => (b.kind === 'columns' ? b.columns.some((col) => col.some(itemMatches)) : b.key === fieldname))
}
