// One stable identity per child-table row, shared by ChildTable (list keys,
// tick boxes) and DoctypeForm (telling which row changed). Saved rows have
// a `name`; a new row gets a key here, held in a WeakMap so no extra field
// is sent with the document on save. Keying by position instead made a
// deleted row look like every later row had "changed".
const keys = new WeakMap()
let counter = 0

export function rowKey(row) {
  if (row?.name) return row.name
  if (!keys.has(row)) keys.set(row, `new-${counter++}`)
  return keys.get(row)
}
