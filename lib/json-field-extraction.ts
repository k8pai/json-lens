export type ExtractedFieldGroup = {
  path: string
  values: unknown[]
}

export type FieldExtractionMode = "field" | "path"

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

export function extractJsonPathValues(
  root: unknown,
  expression: string
): ExtractedFieldGroup[] {
  const normalizedExpression = expression.trim()
  const tokens = parseJsonPath(normalizedExpression)
  let candidates: PendingValue[] = [{ path: "$", value: root }]

  for (const token of tokens) {
    const next: PendingValue[] = []

    for (const candidate of candidates) {
      if (token.kind === "key") {
        if (isJsonRecord(candidate.value) && token.key in candidate.value) {
          next.push({
            path: appendStructuralPath(candidate.path, token.key),
            value: candidate.value[token.key],
          })
        }
        continue
      }

      if (token.kind === "index") {
        if (Array.isArray(candidate.value) && token.index < candidate.value.length) {
          next.push({
            path: `${candidate.path}[${token.index}]`,
            value: candidate.value[token.index],
          })
        }
        continue
      }

      if (Array.isArray(candidate.value)) {
        candidate.value.forEach((value, index) => {
          next.push({ path: `${candidate.path}[${index}]`, value })
        })
      } else if (isJsonRecord(candidate.value)) {
        Object.entries(candidate.value).forEach(([key, value]) => {
          next.push({ path: appendStructuralPath(candidate.path, key), value })
        })
      }
    }

    candidates = next
  }

  return candidates.length
    ? [{ path: normalizedExpression, values: candidates.map(({ value }) => value) }]
    : []
}

type JsonPathToken =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number }
  | { kind: "wildcard" }

function parseJsonPath(expression: string): JsonPathToken[] {
  if (!expression.startsWith("$")) {
    throw new Error("JSON path must start with $.")
  }

  const tokens: JsonPathToken[] = []
  let cursor = 1

  while (cursor < expression.length) {
    if (expression[cursor] === ".") {
      cursor += 1
      const start = cursor
      while (cursor < expression.length && !".[".includes(expression[cursor])) {
        cursor += 1
      }
      const key = expression.slice(start, cursor)
      if (!key) throw new Error("JSON path contains an empty property segment.")
      tokens.push(key === "*" ? { kind: "wildcard" } : { kind: "key", key })
      continue
    }

    if (expression[cursor] === "[") {
      const closing = findBracketEnd(expression, cursor + 1)
      const segment = expression.slice(cursor + 1, closing).trim()

      if (segment === "*") {
        tokens.push({ kind: "wildcard" })
      } else if (/^\d+$/.test(segment)) {
        tokens.push({ kind: "index", index: Number(segment) })
      } else if (segment.startsWith('"') && segment.endsWith('"')) {
        tokens.push({ kind: "key", key: JSON.parse(segment) as string })
      } else {
        throw new Error(
          'Bracket paths support numeric indexes, [*], or double-quoted keys.'
        )
      }

      cursor = closing + 1
      continue
    }

    throw new Error(`Unexpected JSON path token at character ${cursor + 1}.`)
  }

  return tokens
}

function findBracketEnd(expression: string, start: number) {
  let quoted = false
  let escaped = false

  for (let cursor = start; cursor < expression.length; cursor += 1) {
    const character = expression[cursor]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\" && quoted) {
      escaped = true
      continue
    }
    if (character === '"') quoted = !quoted
    if (character === "]" && !quoted) return cursor
  }

  throw new Error("JSON path contains an unclosed bracket.")
}

function appendStructuralPath(path: string, key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
