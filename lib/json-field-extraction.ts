export type ExtractedFieldGroup = {
  path: string
  values: unknown[]
}

type PendingValue = {
  path: string
  value: unknown
}

export function extractFieldValueGroups(
  root: unknown,
  fieldName: string
): ExtractedFieldGroup[] {
  const normalizedFieldName = fieldName.trim()
  if (!normalizedFieldName) return []

  const valuesByPath = new Map<string, unknown[]>()
  const pending: PendingValue[] = [{ path: "$", value: root }]

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue

    if (Array.isArray(current.value)) {
      const itemPath = `${current.path}[]`

      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ path: itemPath, value: current.value[index] })
      }
      continue
    }

    if (!isJsonRecord(current.value)) continue

    const entries = Object.entries(current.value)
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]
      const childPath = appendStructuralPath(current.path, key)

      if (key === normalizedFieldName) {
        const values = valuesByPath.get(childPath)
        if (values) values.push(value)
        else valuesByPath.set(childPath, [value])
      }

      pending.push({ path: childPath, value })
    }
  }

  return Array.from(valuesByPath, ([path, values]) => ({ path, values }))
}

function appendStructuralPath(path: string, key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
