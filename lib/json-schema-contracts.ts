import {
  displayValue,
  generateTypes,
  isRecord,
  parseJson,
  safeInterfaceName,
  safePropertyName,
  stringifyPretty,
  valueType,
} from "./json-lens"

export type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  enum?: Array<string | number | boolean | null>
  additionalProperties?: boolean
  description?: string
}

export type ContractBundle = {
  jsonSchema: JsonSchema
  jsonSchemaText: string
  typeScript: string
  zodSchema: string
  openApiSchema: string
  optionalFields: PathSignal[]
  nullableFields: PathSignal[]
  enumCandidates: EnumCandidate[]
}

export type PathSignal = {
  path: string
  detail: string
}

export type EnumCandidate = {
  path: string
  values: Array<string | number | boolean | null>
}

export type PathListItem = {
  path: string
  type: string
  occurrences: number
  example: string
}

export function buildContractBundle(value: unknown, rootName = "Root"): ContractBundle {
  const jsonSchema = inferJsonSchema(value)

  return {
    jsonSchema,
    jsonSchemaText: stringifyPretty(jsonSchema),
    typeScript: generateTypes(value, rootName),
    zodSchema: generateZodSchema(jsonSchema, rootName),
    openApiSchema: stringifyPretty(createOpenApiComponent(jsonSchema, rootName)),
    optionalFields: detectOptionalFields(value),
    nullableFields: detectNullableFields(value),
    enumCandidates: detectEnumCandidates(value),
  }
}

export function buildContractBundleFromJson(input: string, rootName = "Root") {
  const parsed = parseJson(input)
  if (parsed.error) return { ok: false as const, error: parsed.error, bundle: null }
  return { ok: true as const, error: null, bundle: buildContractBundle(parsed.value, rootName) }
}

export function inferJsonSchema(value: unknown): JsonSchema {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: mergeSchemas(value.map(inferJsonSchema)),
    }
  }

  if (isRecord(value)) {
    return inferObjectSchema([value])
  }

  return primitiveSchema(value)
}

function inferObjectSchema(records: Array<Record<string, unknown>>): JsonSchema {
  const keys = Array.from(
    records.reduce((set, record) => {
      Object.keys(record).forEach((key) => set.add(key))
      return set
    }, new Set<string>())
  ).sort((a, b) => a.localeCompare(b))
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const key of keys) {
    const presentValues = records
      .filter((record) => Object.prototype.hasOwnProperty.call(record, key))
      .map((record) => record[key])

    if (presentValues.length === records.length) required.push(key)
    properties[key] = mergeSchemas(presentValues.map(inferJsonSchema))
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  }
}

function mergeSchemas(schemas: JsonSchema[]): JsonSchema {
  if (!schemas.length) return {}

  const nonEmptyTypes = schemas.flatMap((schema) =>
    Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  )
  const types = Array.from(new Set(nonEmptyTypes)).sort()

  if (types.length === 1 && types[0] === "object") {
    const objectValues = schemas.filter((schema) => schema.type === "object")
    const keys = Array.from(
      objectValues.reduce((set, schema) => {
        Object.keys(schema.properties ?? {}).forEach((key) => set.add(key))
        return set
      }, new Set<string>())
    ).sort((a, b) => a.localeCompare(b))
    const properties: Record<string, JsonSchema> = {}
    const required = keys.filter((key) =>
      objectValues.every((schema) => schema.required?.includes(key))
    )

    for (const key of keys) {
      properties[key] = mergeSchemas(
        objectValues
          .map((schema) => schema.properties?.[key])
          .filter((schema): schema is JsonSchema => Boolean(schema))
      )
    }

    return { type: "object", properties, required, additionalProperties: false }
  }

  if (types.length === 1 && types[0] === "array") {
    return {
      type: "array",
      items: mergeSchemas(
        schemas
          .map((schema) => schema.items)
          .filter((schema): schema is JsonSchema => Boolean(schema))
      ),
    }
  }

  return { type: types.length <= 1 ? types[0] : types }
}

function primitiveSchema(value: unknown): JsonSchema {
  if (value === null) return { type: "null" }
  if (typeof value === "string") return { type: "string" }
  if (typeof value === "number") return { type: "number" }
  if (typeof value === "boolean") return { type: "boolean" }
  return {}
}

export function generateZodSchema(schema: JsonSchema, rootName = "Root") {
  const root = safeInterfaceName(rootName)
  return `import { z } from "zod"\n\nexport const ${root}Schema = ${schemaToZod(schema)}\n\nexport type ${root} = z.infer<typeof ${root}Schema>\n`
}

function schemaToZod(schema: JsonSchema): string {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []

  if (types.length > 1) {
    return `z.union([${types.map((type) => schemaToZod({ ...schema, type })).join(", ")}])`
  }

  const type = types[0]
  if (type === "object") {
    const required = new Set(schema.required ?? [])
    const fields = Object.entries(schema.properties ?? {})
      .map(([key, child]) => {
        const optional = required.has(key) ? "" : ".optional()"
        return `  ${safePropertyName(key)}: ${schemaToZod(child)}${optional}`
      })
      .join(",\n")
    return `z.object({\n${fields}\n})`
  }
  if (type === "array") return `z.array(${schemaToZod(schema.items ?? {})})`
  if (type === "string") return "z.string()"
  if (type === "number") return "z.number()"
  if (type === "boolean") return "z.boolean()"
  if (type === "null") return "z.null()"
  return "z.unknown()"
}

export function createOpenApiComponent(schema: JsonSchema, rootName = "Root") {
  return {
    components: {
      schemas: {
        [safeInterfaceName(rootName)]: schema,
      },
    },
  }
}

export function detectOptionalFields(value: unknown): PathSignal[] {
  const signals: PathSignal[] = []

  function walk(item: unknown, path: string) {
    const records = Array.isArray(item) ? item.filter(isRecord) : isRecord(item) ? [item] : []
    if (records.length > 1) {
      const recordPath = Array.isArray(item) ? `${path}[]` : path
      const keys = new Set(records.flatMap((record) => Object.keys(record)))
      for (const key of Array.from(keys).sort((a, b) => a.localeCompare(b))) {
        const count = records.filter((record) => Object.prototype.hasOwnProperty.call(record, key)).length
        if (count < records.length) {
          signals.push({
            path: appendPath(recordPath, key),
            detail: `${count.toLocaleString()} of ${records.length.toLocaleString()} records`,
          })
        }
      }
    }

    if (Array.isArray(item)) item.forEach((child, index) => walk(child, `${path}[${index}]`))
    else if (isRecord(item)) Object.entries(item).forEach(([key, child]) => walk(child, appendPath(path, key)))
  }

  walk(value, "$")
  return dedupeSignals(signals)
}

export function detectNullableFields(value: unknown): PathSignal[] {
  const signals: PathSignal[] = []

  walkValues(value, "$", (item, path) => {
    if (item === null) signals.push({ path, detail: "Contains explicit null" })
  })

  return dedupeSignals(signals)
}

export function detectEnumCandidates(value: unknown): EnumCandidate[] {
  const frequencies = new Map<string, Map<string, { value: string | number | boolean | null; count: number }>>()

  walkStructuralValues(value, "$", (item, path) => {
    if (!["string", "number", "boolean"].includes(typeof item) && item !== null) return
    const bucket = frequencies.get(path) ?? new Map()
    const key = JSON.stringify(item)
    const current = bucket.get(key) ?? { value: item as string | number | boolean | null, count: 0 }
    current.count += 1
    bucket.set(key, current)
    frequencies.set(path, bucket)
  })

  return Array.from(frequencies.entries())
    .filter(([, bucket]) => bucket.size > 1 && bucket.size <= 8)
    .map(([path, bucket]) => ({
      path,
      values: Array.from(bucket.values())
        .sort((a, b) => b.count - a.count)
        .map((item) => item.value),
    }))
}

export function compareSchemaDocuments(left: JsonSchema, right: JsonSchema) {
  const leftPaths = flattenSchema(left)
  const rightPaths = flattenSchema(right)
  const paths = Array.from(new Set([...leftPaths.keys(), ...rightPaths.keys()])).sort()

  return paths
    .map((path) => {
      const leftValue = leftPaths.get(path)
      const rightValue = rightPaths.get(path)
      if (leftValue === rightValue) return null

      return {
        path,
        left: leftValue ?? "missing",
        right: rightValue ?? "missing",
      }
    })
    .filter((row): row is { path: string; left: string; right: string } => Boolean(row))
}

function flattenSchema(schema: JsonSchema, path = "$", target = new Map<string, string>()) {
  target.set(path, Array.isArray(schema.type) ? schema.type.join(" | ") : schema.type ?? "unknown")

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([key, child]) =>
      flattenSchema(child, appendPath(path, key), target)
    )
  }

  if (schema.items) flattenSchema(schema.items, `${path}[]`, target)
  return target
}

export function createMockPayload(schema: JsonSchema): unknown {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  const type = types.find((item) => item !== "null") ?? types[0]

  if (schema.enum?.length) return schema.enum[0]
  if (type === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [key, createMockPayload(child)])
    )
  }
  if (type === "array") return [createMockPayload(schema.items ?? {})]
  if (type === "number") return 1
  if (type === "boolean") return true
  if (type === "null") return null
  if (type === "string") return "string"
  return null
}

export function generateFetchSnippet(payload: unknown, url = "https://api.example.com/resource") {
  return `const response = await fetch(${JSON.stringify(url)}, {\n  method: "POST",\n  headers: {\n    "content-type": "application/json",\n  },\n  body: JSON.stringify(${stringifyPretty(payload, 2).replace(/\n/g, "\n  ")}),\n})\n\nif (!response.ok) {\n  throw new Error(\`Request failed: \${response.status}\`)\n}\n\nconst data = await response.json()\n`
}

export function generateFixtureFile(payload: unknown, fixtureName = "payload") {
  return `export const ${safeInterfaceName(fixtureName).charAt(0).toLowerCase()}${safeInterfaceName(fixtureName).slice(1)} = ${stringifyPretty(payload, 2)} as const\n`
}

export function generatePathAssertions(value: unknown) {
  return generatePathList(value)
    .slice(0, 80)
    .map((item) => `expect(getByPath(payload, ${JSON.stringify(item.path)})).toEqual(${item.example})`)
    .join("\n")
}

export function generatePathList(value: unknown): PathListItem[] {
  const paths = new Map<string, { type: string; occurrences: number; example: string }>()

  walkValues(value, "$", (item, path) => {
    const current = paths.get(path)
    if (current) {
      current.occurrences += 1
      return
    }
    paths.set(path, {
      type: valueType(item),
      occurrences: 1,
      example: JSON.stringify(displayValue(item)),
    })
  })

  return Array.from(paths.entries()).map(([path, item]) => ({ path, ...item }))
}

export function inspectWebhookPayload(value: unknown) {
  const record = isRecord(value) ? value : {}
  const eventType = findFirstValue(record, ["type", "event", "eventType", "event_type"])
  const objectId = findFirstValue(record, ["id", "objectId", "object_id", "data.id"])
  const timestamp = findFirstValue(record, ["created", "createdAt", "created_at", "timestamp"])

  return {
    eventType: eventType ? String(eventType) : "unknown",
    objectId: objectId ? String(objectId) : "unknown",
    timestamp: timestamp ? String(timestamp) : "unknown",
    pathCount: generatePathList(value).length,
  }
}

function findFirstValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((current, segment) => {
      if (isRecord(current)) return current[segment]
      return undefined
    }, record)
    if (value !== undefined && value !== null && value !== "") return value
  }
  return undefined
}

function walkValues(value: unknown, path: string, visit: (value: unknown, path: string) => void) {
  visit(value, path)

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValues(item, `${path}[${index}]`, visit))
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) => walkValues(child, appendPath(path, key), visit))
  }
}

function walkStructuralValues(value: unknown, path: string, visit: (value: unknown, path: string) => void) {
  visit(value, path)

  if (Array.isArray(value)) {
    value.forEach((item) => walkStructuralValues(item, `${path}[]`, visit))
  } else if (isRecord(value)) {
    Object.entries(value).forEach(([key, child]) => walkStructuralValues(child, appendPath(path, key), visit))
  }
}

function appendPath(path: string, key: string) {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`

  if (path === "$") return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
  return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
}

function dedupeSignals(signals: PathSignal[]) {
  return Array.from(new Map(signals.map((signal) => [signal.path, signal])).values())
}
