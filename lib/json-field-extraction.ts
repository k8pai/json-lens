export type ExtractedFieldGroup = {
  path: string
  items: ExtractedValue[]
  values: unknown[]
}

export type ExtractedValue = {
  path: string
  value: unknown
}

export type FieldExtractionMode =
  | "contains-key"
  | "field"
  | "path"
  | "predicate"

export type FieldExtractionLimit = "all" | "first"

type PendingValue = {
  path: string
  sourcePath: string
  value: unknown
}

export function extractFieldValueGroups(
  root: unknown,
  fieldName: string
): ExtractedFieldGroup[] {
  const normalizedFieldName = fieldName.trim()
  if (!normalizedFieldName) return []

  const valuesByPath = new Map<string, ExtractedValue[]>()
  const pending: PendingValue[] = [{ path: "$", sourcePath: "$", value: root }]

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue

    if (Array.isArray(current.value)) {
      const itemPath = `${current.path}[]`

      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          path: itemPath,
          sourcePath: `${current.sourcePath}[${index}]`,
          value: current.value[index],
        })
      }
      continue
    }

    if (!isJsonRecord(current.value)) continue

    const entries = Object.entries(current.value)
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]
      const childPath = appendStructuralPath(current.path, key)
      const sourcePath = appendStructuralPath(current.sourcePath, key)

      if (key === normalizedFieldName) {
        const values = valuesByPath.get(childPath)
        const item = { path: sourcePath, value }
        if (values) values.push(item)
        else valuesByPath.set(childPath, [item])
      }

      pending.push({ path: childPath, sourcePath, value })
    }
  }

  return Array.from(valuesByPath, ([path, items]) => ({
    path,
    items,
    values: items.map((item) => item.value),
  }))
}

export function extractJsonPathValues(
  root: unknown,
  expression: string
): ExtractedFieldGroup[] {
  const normalizedExpression = normalizeJsonPathExpression(expression)
  const tokens = parseJsonPath(normalizedExpression)
  let candidates: PendingValue[] = [{ path: "$", sourcePath: "$", value: root }]

  for (const token of tokens) {
    const next: PendingValue[] = []

    for (const candidate of candidates) {
      if (token.kind === "key") {
        if (isJsonRecord(candidate.value) && token.key in candidate.value) {
          next.push({
            path: appendStructuralPath(candidate.path, token.key),
            sourcePath: appendStructuralPath(candidate.sourcePath, token.key),
            value: candidate.value[token.key],
          })
        }
        continue
      }

      if (token.kind === "index") {
        if (Array.isArray(candidate.value) && token.index < candidate.value.length) {
          next.push({
            path: `${candidate.path}[${token.index}]`,
            sourcePath: `${candidate.sourcePath}[${token.index}]`,
            value: candidate.value[token.index],
          })
        }
        continue
      }

      if (Array.isArray(candidate.value)) {
        candidate.value.forEach((value, index) => {
          next.push({
            path: `${candidate.path}[]`,
            sourcePath: `${candidate.sourcePath}[${index}]`,
            value,
          })
        })
      } else if (isJsonRecord(candidate.value)) {
        Object.entries(candidate.value).forEach(([key, value]) => {
          next.push({
            path: appendStructuralPath(candidate.path, key),
            sourcePath: appendStructuralPath(candidate.sourcePath, key),
            value,
          })
        })
      }
    }

    candidates = next
  }

  if (!candidates.length) return []

  const items = candidates.map(({ sourcePath, value }) => ({
    path: sourcePath,
    value,
  }))

  return [
    {
      path: normalizedExpression,
      items,
      values: items.map((item) => item.value),
    },
  ]
}

export function extractObjectsContainingKey(
  root: unknown,
  fieldName: string
): ExtractedFieldGroup[] {
  const normalizedFieldName = fieldName.trim()
  if (!normalizedFieldName) return []

  const valuesByPath = new Map<string, ExtractedValue[]>()
  const pending: PendingValue[] = [{ path: "$", sourcePath: "$", value: root }]

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          path: `${current.path}[]`,
          sourcePath: `${current.sourcePath}[${index}]`,
          value: current.value[index],
        })
      }
      continue
    }

    if (!isJsonRecord(current.value)) continue

    if (Object.prototype.hasOwnProperty.call(current.value, normalizedFieldName)) {
      const values = valuesByPath.get(current.path)
      const item = { path: current.sourcePath, value: current.value }
      if (values) values.push(item)
      else valuesByPath.set(current.path, [item])
    }

    const entries = Object.entries(current.value)
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]
      pending.push({
        path: appendStructuralPath(current.path, key),
        sourcePath: appendStructuralPath(current.sourcePath, key),
        value,
      })
    }
  }

  return Array.from(valuesByPath, ([path, items]) => ({
    path,
    items,
    values: items.map((item) => item.value),
  }))
}

export function filterObjectsByPredicate(
  root: unknown,
  expression: string
): ExtractedFieldGroup[] {
  const predicate = parsePredicateExpression(expression)
  const candidates = collectRecordCandidates(root)
  const items = candidates
    .filter((candidate) => evaluatePredicate(candidate.value, predicate))
    .map(({ sourcePath, value }) => ({ path: sourcePath, value }))

  return items.length
    ? [{ path: `filter:${predicate.path} ${predicate.operator}`, items, values: items.map((item) => item.value) }]
    : []
}

export function limitExtractedGroups(
  groups: ExtractedFieldGroup[],
  limit: FieldExtractionLimit
): ExtractedFieldGroup[] {
  if (limit === "all") return groups

  for (const group of groups) {
    const first = group.items[0]
    if (!first) continue
    return [
      {
        path: group.path,
        items: [first],
        values: [first.value],
      },
    ]
  }

  return []
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

function normalizeJsonPathExpression(expression: string) {
  const normalizedExpression = expression.trim()
  if (!normalizedExpression) throw new Error("JSON path is required.")
  if (normalizedExpression.startsWith("$")) return normalizedExpression
  if (normalizedExpression.startsWith(".")) return `$${normalizedExpression}`
  if (normalizedExpression.startsWith("[")) return `$${normalizedExpression}`
  return `$.${normalizedExpression}`
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

type PredicateOperator =
  | "!="
  | "<"
  | "<="
  | "="
  | ">"
  | ">="
  | "contains"
  | "exists"
  | "matches"
  | "missing"
  | "null"

type PredicateExpression = {
  path: string
  operator: PredicateOperator
  expected?: unknown
}

const PREDICATE_PATTERN =
  /^(.+?)\s*(>=|<=|!=|=|>|<|contains|matches|exists|missing|null)(?:\s+(.+))?$/i

function parsePredicateExpression(expression: string): PredicateExpression {
  const match = expression.trim().match(PREDICATE_PATTERN)
  if (!match) {
    throw new Error(
      'Predicate must look like "status = active", "age >= 30", "name contains May", or "email exists".'
    )
  }

  const operator = match[2].toLowerCase() as PredicateOperator
  const expectedText = match[3]?.trim()

  if (!["exists", "missing", "null"].includes(operator) && !expectedText) {
    throw new Error("Predicate value is required for this operator.")
  }

  return {
    path: normalizeJsonPathExpression(match[1].trim()),
    operator,
    expected: expectedText ? parsePredicateLiteral(expectedText) : undefined,
  }
}

function collectRecordCandidates(root: unknown): PendingValue[] {
  const candidates: PendingValue[] = []
  const pending: PendingValue[] = [{ path: "$", sourcePath: "$", value: root }]

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue

    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({
          path: `${current.path}[]`,
          sourcePath: `${current.sourcePath}[${index}]`,
          value: current.value[index],
        })
      }
      continue
    }

    if (!isJsonRecord(current.value)) continue

    candidates.push(current)
    const entries = Object.entries(current.value)
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, value] = entries[index]
      if (Array.isArray(value) || isJsonRecord(value)) {
        pending.push({
          path: appendStructuralPath(current.path, key),
          sourcePath: appendStructuralPath(current.sourcePath, key),
          value,
        })
      }
    }
  }

  return candidates
}

function evaluatePredicate(
  candidate: unknown,
  predicate: PredicateExpression
) {
  const groups = extractJsonPathValues(candidate, predicate.path)
  const values = groups.flatMap((group) => group.values)

  if (predicate.operator === "exists") return values.length > 0
  if (predicate.operator === "missing") return values.length === 0
  if (predicate.operator === "null") return values.some((value) => value === null)

  return values.some((value) =>
    comparePredicateValue(value, predicate.operator, predicate.expected)
  )
}

function comparePredicateValue(
  actual: unknown,
  operator: PredicateOperator,
  expected: unknown
) {
  if (operator === "contains") {
    return String(actual ?? "").includes(String(expected ?? ""))
  }

  if (operator === "matches") {
    try {
      return new RegExp(String(expected ?? "")).test(String(actual ?? ""))
    } catch {
      throw new Error("Predicate regex is invalid.")
    }
  }

  if (operator === "=") return normalizeComparable(actual) === normalizeComparable(expected)
  if (operator === "!=") return normalizeComparable(actual) !== normalizeComparable(expected)

  const actualNumber = Number(actual)
  const expectedNumber = Number(expected)
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
    return false
  }

  if (operator === ">") return actualNumber > expectedNumber
  if (operator === ">=") return actualNumber >= expectedNumber
  if (operator === "<") return actualNumber < expectedNumber
  if (operator === "<=") return actualNumber <= expectedNumber

  return false
}

function parsePredicateLiteral(value: string) {
  if (value === "true") return true
  if (value === "false") return false
  if (value === "null") return null
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function normalizeComparable(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value)
}
