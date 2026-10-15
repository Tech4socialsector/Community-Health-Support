// Shared look for every page - one place that decides what a card, a
// filter bar, a button or a table looks like, so pages can't drift apart.
//
// Colour rules (brand colours sampled from the logo, see tailwind.config.js):
//   navy   - ink: headings, numbers, selected/active states (and, via the
//            frappe-ui token override in index.css, its solid buttons).
//   forest - actions the user takes: + New, Refresh, Excel, links, and
//            the form icon tiles.
//   green / amber / red / blue - meaning only (status, risk), never
//            decoration. See TONE below.
// Full class strings throughout, so Tailwind's content scan picks them up.

export const PAGE = 'mx-auto w-full max-w-7xl space-y-5'
// Data-heavy pages (the list view) use the whole width of the screen, so
// wide tables show more columns instead of scrolling sideways.
export const PAGE_FULL = 'w-full space-y-5'

export const CARD =
  'rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800'

// A whole-card click target (Home forms, Overview programs, Work Orders
// statuses). Two per row even on a phone, with a smaller min height there,
// so a long list doesn't become one endless column.
// Shape and behaviour only - colour comes from one STAT_TONES entry (see
// ICON_TILE_BASE for why the two are kept apart).
const STAT_CARD_BASE =
  'group relative flex min-h-[8.5rem] flex-col justify-between gap-3 rounded-xl p-4 text-left shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-forest-300 focus-within:ring-2 focus-within:ring-forest-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 dark:hover:ring-forest-700 sm:min-h-[10rem] sm:p-5'

// White card with a thin coloured line along the top edge; the card's
// number takes the same colour (statCountTone). navy / forest are the
// brand pair (alternated on Home and Overview); the rest are meaning
// colours for the Work Orders status cards.
const STAT_TONES = {
  white: 'bg-white ring-gray-200 dark:bg-gray-900 dark:ring-gray-800',
  navy: 'border-t-[3px] border-t-navy-600 bg-white ring-gray-200 dark:border-t-navy-400 dark:bg-gray-900 dark:ring-gray-800',
  forest: 'border-t-[3px] border-t-forest-600 bg-white ring-gray-200 dark:border-t-forest-400 dark:bg-gray-900 dark:ring-gray-800',
  blue: 'border-t-[3px] border-t-blue-500 bg-white ring-gray-200 dark:border-t-blue-400 dark:bg-gray-900 dark:ring-gray-800',
  amber: 'border-t-[3px] border-t-amber-500 bg-white ring-gray-200 dark:border-t-amber-400 dark:bg-gray-900 dark:ring-gray-800',
  red: 'border-t-[3px] border-t-red-500 bg-white ring-gray-200 dark:border-t-red-400 dark:bg-gray-900 dark:ring-gray-800',
  green: 'border-t-[3px] border-t-green-600 bg-white ring-gray-200 dark:border-t-green-400 dark:bg-gray-900 dark:ring-gray-800',
}

const STAT_COUNT_TONES = {
  navy: 'text-navy-700 dark:text-navy-200',
  forest: 'text-forest-700 dark:text-forest-300',
  blue: 'text-blue-600 dark:text-blue-300',
  amber: 'text-amber-600 dark:text-amber-300',
  red: 'text-red-600 dark:text-red-300',
  green: 'text-green-700 dark:text-green-300',
}

// Plain white card - loading placeholders.
export const STAT_CARD = `${STAT_CARD_BASE} ${STAT_TONES.white}`

const toneAt = (index) => (index % 2 === 0 ? 'navy' : 'forest')

// A card in a named tone (Work Orders statuses: 'blue', 'red', ...).
export function statCardTone(tone) {
  return `${STAT_CARD_BASE} ${STAT_TONES[tone] || STAT_TONES.white}`
}

// Alternating navy / forest by position (Home forms, Overview programs).
export function statCardAt(index) {
  return statCardTone(toneAt(index))
}

// The card's number in its card's colour.
export function statCountTone(tone) {
  return `${STAT_COUNT_BASE} ${STAT_COUNT_TONES[tone] || STAT_COUNT_TONES.navy}`
}

export function statCountAt(index) {
  return statCountTone(toneAt(index))
}

// Record page section heading bars, alternating forest / navy by position.
const SECTION_HEAD_TONES = [
  { bar: 'border-b border-forest-100 bg-forest-50/80 dark:border-forest-900 dark:bg-forest-900/25', stripe: 'bg-forest-600', text: 'text-forest-800 dark:text-forest-200' },
  { bar: 'border-b border-navy-100 bg-navy-50/80 dark:border-navy-900 dark:bg-navy-900/30', stripe: 'bg-navy-600', text: 'text-navy-800 dark:text-navy-200' },
]

export function sectionHeadAt(index) {
  return SECTION_HEAD_TONES[index % SECTION_HEAD_TONES.length]
}

export const STAT_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4'
export const STAT_GRID_4 = 'grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'

export const STAT_LABEL = 'line-clamp-2 text-[13px] font-medium leading-snug text-gray-600 dark:text-gray-300 sm:text-sm'
const STAT_COUNT_BASE = 'block text-[1.625rem] font-bold leading-none tabular-nums sm:text-[2rem]'
export const STAT_COUNT = `${STAT_COUNT_BASE} text-navy-900 dark:text-gray-100`
export const STAT_CTA = 'inline-flex items-center gap-1 text-[13px] font-semibold text-forest-700 dark:text-forest-300 sm:text-sm'

// Shape only - pair it with exactly one colour set (ICON_TILE's brand
// tint, or a TONE). Two colour sets on one element clash unpredictably:
// which wins depends on CSS order, not class order.
export const ICON_TILE_BASE =
  'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ring-1 sm:h-10 sm:w-10'
export const ICON_TILE = `${ICON_TILE_BASE} bg-forest-50 text-forest-700 ring-forest-100 dark:bg-forest-900/40 dark:text-forest-200 dark:ring-forest-800`

export const SECTION_LABEL = 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400'

export const FILTER_BAR = `${CARD} flex flex-wrap items-end gap-3 p-3 sm:p-4`
export const FILTER_FIELD = 'w-full min-[480px]:w-48'
export const FILTER_LABEL = 'mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400'

const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900'

export const BTN_PRIMARY = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-forest-700 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-forest-600 dark:hover:bg-forest-500 ${FOCUS}`
export const BTN_SECONDARY = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-900 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-gray-800 ${FOCUS}`
// The square "+ New" on cards - above the card's stretched link (z-10).
export const BTN_ADD = `relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-forest-700 text-white shadow-sm transition hover:bg-forest-800 dark:bg-forest-600 dark:hover:bg-forest-500 ${FOCUS}`

export const TABLE_WRAP = 'overflow-auto rounded-xl ring-1 ring-gray-200 dark:ring-gray-800'
export const TABLE = 'w-full text-left text-sm'
export const THEAD = 'sticky top-0 z-10 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400'
export const TH = 'whitespace-nowrap px-4 py-3'
export const TBODY = 'divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900'
export const TR = 'cursor-pointer transition hover:bg-forest-50/60 focus:bg-forest-50/60 focus:outline-none dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60'
const TD_BASE = 'whitespace-nowrap px-4 py-3'
export const TD = `${TD_BASE} text-gray-700 dark:text-gray-300`
// The row's identifying column (ID / patient) - its own variant rather than
// TD plus overrides, since TD's text colour would clash with them.
export const TD_STRONG = `${TD_BASE} font-semibold text-navy-900 dark:text-gray-100`

// The full list view, Desk-style: flat (no card frame, just a line top and
// bottom), stretched edge to edge, with tighter cells - more of the
// record visible, none of the inset a framed card adds on both sides.
export const LIST_TABLE_WRAP = 'overflow-auto border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
export const LIST_TH = 'whitespace-nowrap px-3 py-2.5'
export const LIST_TD = 'whitespace-nowrap px-3 py-2.5 text-gray-700 dark:text-gray-300'
export const LIST_TD_STRONG = 'whitespace-nowrap px-3 py-2.5 font-semibold text-navy-900 dark:text-gray-100'

// The phone version of a table row: a stacked card with a light brand tint
// and a coloured stripe down its left edge, alternating navy / forest (the
// same pair as the Connections cards) so rows are easy to tell apart while
// scrolling. Shape and colour are kept apart - see ICON_TILE_BASE for why.
const MOBILE_ROW_BASE =
  'block w-full rounded-xl border-l-4 p-4 text-left shadow-sm ring-1 transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-400'
const MOBILE_ROW_TONES = [
  'border-l-navy-600 bg-navy-50/70 ring-navy-100 dark:border-l-navy-400 dark:bg-navy-900/30 dark:ring-navy-800',
  'border-l-forest-600 bg-forest-50/70 ring-forest-100 dark:border-l-forest-400 dark:bg-forest-900/30 dark:ring-forest-800',
]

export function mobileRowClass(index) {
  return `${MOBILE_ROW_BASE} ${MOBILE_ROW_TONES[index % MOBILE_ROW_TONES.length]}`
}

export const EMPTY_STATE =
  'flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'

export const COUNT_BADGE =
  'rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-navy-700 ring-1 ring-navy-100 dark:bg-navy-900/40 dark:text-navy-200 dark:ring-navy-800'

// Meaning colours, for status / risk pills and status icon tiles only.
export const TONE = {
  green: 'bg-green-50 text-green-700 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-900',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-900',
  red: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-900',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-900',
  navy: 'bg-navy-50 text-navy-700 ring-navy-100 dark:bg-navy-900/40 dark:text-navy-200 dark:ring-navy-800',
  gray: 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
}

export const PILL = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1'
// Compact all-caps flag (e.g. HIGH RISK) beside a name.
export const FLAG = 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1'

export const WARNING_BOX =
  'flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 shadow-sm ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-900'
