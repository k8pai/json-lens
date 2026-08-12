export type JsonTextRange = {
  from: number
  to: number
  line: number
  column: number
}

export type JsonPathRange = {
  path: string
  valueRange: JsonTextRange
  keyRange?: JsonTextRange
  propertyRange?: JsonTextRange
}

export type JsonSourceMap = {
  ranges: Map<string, JsonPathRange>
}

type ParserState = {
  input: string
  cursor: number
  ranges: Map<string, JsonPathRange>
}

type ParsedRange = {
  from: number
  to: number
}

export function buildJsonSourceMap(input: string): JsonSourceMap | null {
  try {
    const state: ParserState = {
      input,
      cursor: 0,
      ranges: new Map(),
    }

    skipWhitespace(state)
    parseValue(state, "$")
    skipWhitespace(state)

    if (state.cursor !== input.length) return null
    return { ranges: state.ranges }
  } catch {
    return null
  }
}

export function appendJsonSourcePath(path: string, key: string) {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`

  if (path === "$") return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
  return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
}

export function getRangeForDiffKind(
  range: JsonPathRange | undefined,
  mode: "property" | "value"
) {
  if (!range) return undefined
  return mode === "property" ? range.propertyRange ?? range.valueRange : range.valueRange
}

function parseValue(state: ParserState, path: string): ParsedRange {
  skipWhitespace(state)
  const start = state.cursor
  const character = state.input[start]

  if (character === "{") return parseObject(state, path)
  if (character === "[") return parseArray(state, path)
  if (character === "\"") return parseStringValue(state, path)
  if (character === "-" || isDigit(character)) return parseNumberValue(state, path)
  if (state.input.startsWith("true", start)) return parseLiteralValue(state, path, "true")
  if (state.input.startsWith("false", start)) return parseLiteralValue(state, path, "false")
  if (state.input.startsWith("null", start)) return parseLiteralValue(state, path, "null")

  throw new Error("Unsupported JSON value.")
}

function parseObject(state: ParserState, path: string): ParsedRange {
  const start = state.cursor
  state.cursor += 1
  skipWhitespace(state)

  if (state.input[state.cursor] === "}") {
    state.cursor += 1
    return recordValueRange(state, path, start, state.cursor)
  }

  while (state.cursor < state.input.length) {
    skipWhitespace(state)
    const propertyStart = state.cursor
    const keyRange = readString(state)
    const key = JSON.parse(state.input.slice(keyRange.from, keyRange.to)) as string

    skipWhitespace(state)
    expectCharacter(state, ":")

    const childPath = appendJsonSourcePath(path, key)
    const valueRange = parseValue(state, childPath)
    const childEntry = state.ranges.get(childPath)
    if (childEntry) {
      childEntry.keyRange = createTextRange(state.input, keyRange.from, keyRange.to)
      childEntry.propertyRange = createTextRange(
        state.input,
        propertyStart,
        valueRange.to
      )
    }

    skipWhitespace(state)
    const next = state.input[state.cursor]
    if (next === "}") {
      state.cursor += 1
      return recordValueRange(state, path, start, state.cursor)
    }
    expectCharacter(state, ",")
  }

  throw new Error("Unclosed JSON object.")
}

function parseArray(state: ParserState, path: string): ParsedRange {
  const start = state.cursor
  state.cursor += 1
  skipWhitespace(state)

  if (state.input[state.cursor] === "]") {
    state.cursor += 1
    return recordValueRange(state, path, start, state.cursor)
  }

  let index = 0
  while (state.cursor < state.input.length) {
    parseValue(state, `${path}[${index}]`)
    index += 1

    skipWhitespace(state)
    const next = state.input[state.cursor]
    if (next === "]") {
      state.cursor += 1
      return recordValueRange(state, path, start, state.cursor)
    }
    expectCharacter(state, ",")
  }

  throw new Error("Unclosed JSON array.")
}

function parseStringValue(state: ParserState, path: string): ParsedRange {
  const range = readString(state)
  recordValueRange(state, path, range.from, range.to)
  return range
}

function parseNumberValue(state: ParserState, path: string): ParsedRange {
  const start = state.cursor
  if (state.input[state.cursor] === "-") state.cursor += 1
  readDigits(state)

  if (state.input[state.cursor] === ".") {
    state.cursor += 1
    readDigits(state)
  }

  const exponent = state.input[state.cursor]
  if (exponent === "e" || exponent === "E") {
    state.cursor += 1
    const sign = state.input[state.cursor]
    if (sign === "+" || sign === "-") state.cursor += 1
    readDigits(state)
  }

  recordValueRange(state, path, start, state.cursor)
  return { from: start, to: state.cursor }
}

function parseLiteralValue(
  state: ParserState,
  path: string,
  literal: "true" | "false" | "null"
): ParsedRange {
  const start = state.cursor
  state.cursor += literal.length
  recordValueRange(state, path, start, state.cursor)
  return { from: start, to: state.cursor }
}

function recordValueRange(
  state: ParserState,
  path: string,
  from: number,
  to: number
): ParsedRange {
  state.ranges.set(path, {
    path,
    valueRange: createTextRange(state.input, from, to),
  })
  return { from, to }
}

function readString(state: ParserState): ParsedRange {
  const start = state.cursor
  expectCharacter(state, "\"")
  let escaped = false

  while (state.cursor < state.input.length) {
    const character = state.input[state.cursor]
    state.cursor += 1

    if (escaped) {
      escaped = false
      continue
    }

    if (character === "\\") {
      escaped = true
      continue
    }

    if (character === "\"") {
      return { from: start, to: state.cursor }
    }
  }

  throw new Error("Unclosed JSON string.")
}

function readDigits(state: ParserState) {
  const start = state.cursor
  while (isDigit(state.input[state.cursor])) state.cursor += 1
  if (state.cursor === start) throw new Error("Expected digits.")
}

function skipWhitespace(state: ParserState) {
  while (/\s/.test(state.input[state.cursor] ?? "")) state.cursor += 1
}

function expectCharacter(state: ParserState, expected: string) {
  if (state.input[state.cursor] !== expected) {
    throw new Error(`Expected ${expected}.`)
  }
  state.cursor += 1
}

function isDigit(character: string | undefined) {
  return Boolean(character && character >= "0" && character <= "9")
}

function createTextRange(input: string, from: number, to: number): JsonTextRange {
  const location = lineColumnFromOffset(input, from)
  return {
    from,
    to,
    ...location,
  }
}

function lineColumnFromOffset(input: string, offset: number) {
  const before = input.slice(0, Math.max(0, offset))
  const lines = before.split("\n")
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}
