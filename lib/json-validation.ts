import { parseJson } from "./json-lens"

export type JsonValidationIssueKind =
  | "parse-error"
  | "trailing-comma"
  | "single-quoted-string"
  | "unquoted-key"
  | "comment"
  | "duplicate-key"

export type JsonValidationIssue = {
  id: string
  kind: JsonValidationIssueKind
  severity: "error" | "warning"
  message: string
  line: number
  column: number
  offset: number
  length: number
  path: string
  repairable: boolean
}

export type JsonValidationReport = {
  strictValid: boolean
  repairCandidateValid: boolean
  repairedText: string | null
  issues: JsonValidationIssue[]
  errorCount: number
  warningCount: number
  repairCount: number
  summary: string
}

type TokenKind =
  | "brace-open"
  | "brace-close"
  | "bracket-open"
  | "bracket-close"
  | "colon"
  | "comma"
  | "string"
  | "bare"

type Token = {
  kind: TokenKind
  offset: number
  length: number
  raw: string
  value?: string
  quote?: '"' | "'"
}

type TextEdit = {
  offset: number
  length: number
  replacement: string
}

type AnalysisState = {
  input: string
  issues: JsonValidationIssue[]
  issuesByOffset: Map<number, JsonValidationIssue[]>
  edits: TextEdit[]
  tokens: Token[]
}

export function validateAndRepairJson(input: string): JsonValidationReport {
  const strictResult = parseJson(input)
  const state = tokenizeJsonLike(input)

  detectTrailingCommas(state)
  inspectStructure(state)

  if (strictResult.error) {
    const errorOffset = offsetFromLineColumn(
      input,
      strictResult.line ?? 1,
      strictResult.column ?? 1
    )

    addIssue(state, {
      kind: "parse-error",
      severity: "error",
      message: strictResult.error,
      offset: errorOffset,
      length: 1,
      path: "$",
      repairable: false,
    })
  }

  const repairedText = state.edits.length ? applyTextEdits(input, state.edits) : null
  const repairCandidateValid = repairedText ? !parseJson(repairedText).error : false
  if (repairCandidateValid) {
    state.issues
      .filter((issue) => issue.kind === "parse-error")
      .forEach((issue) => {
        issue.repairable = true
      })
  }
  const issues = state.issues.sort(
    (left, right) => left.offset - right.offset || left.kind.localeCompare(right.kind)
  )
  const errorCount = issues.filter((issue) => issue.severity === "error").length
  const warningCount = issues.length - errorCount
  const repairCount = state.edits.length
  const strictValid = !strictResult.error

  return {
    strictValid,
    repairCandidateValid,
    repairedText,
    issues,
    errorCount,
    warningCount,
    repairCount,
    summary: createSummary({
      strictValid,
      repairCandidateValid,
      repairCount,
      errorCount,
      warningCount,
    }),
  }
}

function tokenizeJsonLike(input: string): AnalysisState {
  const state: AnalysisState = {
    input,
    issues: [],
    issuesByOffset: new Map(),
    edits: [],
    tokens: [],
  }

  let cursor = 0
  while (cursor < input.length) {
    const character = input[cursor]

    if (/\s/.test(character)) {
      cursor += 1
      continue
    }

    if (character === "/" && input[cursor + 1] === "/") {
      const end = findLineCommentEnd(input, cursor + 2)
      const raw = input.slice(cursor, end)
      addIssue(state, {
        kind: "comment",
        severity: "error",
        message: "Line comments are not allowed in strict JSON.",
        offset: cursor,
        length: raw.length,
        path: "$",
        repairable: true,
      })
      state.edits.push({
        offset: cursor,
        length: raw.length,
        replacement: preserveLineBreaks(raw),
      })
      cursor = end
      continue
    }

    if (character === "/" && input[cursor + 1] === "*") {
      const closingOffset = input.indexOf("*/", cursor + 2)
      const end = closingOffset === -1 ? input.length : closingOffset + 2
      const raw = input.slice(cursor, end)
      const repairable = closingOffset !== -1
      addIssue(state, {
        kind: "comment",
        severity: "error",
        message: repairable
          ? "Block comments are not allowed in strict JSON."
          : "This block comment is not closed.",
        offset: cursor,
        length: raw.length,
        path: "$",
        repairable,
      })
      if (repairable) {
        state.edits.push({
          offset: cursor,
          length: raw.length,
          replacement: preserveLineBreaks(raw),
        })
      }
      cursor = end
      continue
    }

    if (character === '"' || character === "'") {
      const stringToken = readStringToken(input, cursor, character)
      state.tokens.push(stringToken.token)

      if (character === "'") {
        const converted = stringToken.closed
          ? decodeSingleQuotedString(stringToken.token.raw)
          : null
        const repairable = converted !== null
        addIssue(state, {
          kind: "single-quoted-string",
          severity: "error",
          message: stringToken.closed
            ? "Strict JSON strings must use double quotes."
            : "This single-quoted string is not closed.",
          offset: cursor,
          length: stringToken.token.length,
          path: "$",
          repairable,
        })
        if (repairable) {
          state.edits.push({
            offset: cursor,
            length: stringToken.token.length,
            replacement: JSON.stringify(converted),
          })
        }
      }

      cursor += stringToken.token.length
      continue
    }

    const punctuationKind = getPunctuationKind(character)
    if (punctuationKind) {
      state.tokens.push({
        kind: punctuationKind,
        offset: cursor,
        length: 1,
        raw: character,
      })
      cursor += 1
      continue
    }

    const end = findBareTokenEnd(input, cursor)
    const raw = input.slice(cursor, end)
    state.tokens.push({ kind: "bare", offset: cursor, length: raw.length, raw })
    cursor = end
  }

  return state
}

function inspectStructure(state: AnalysisState) {
  let cursor = 0

  function parseValue(path: string) {
    const token = state.tokens[cursor]
    if (!token) return

    setIssuePath(state, token.offset, path)

    if (token.kind === "brace-open") {
      parseObject(path)
      return
    }

    if (token.kind === "bracket-open") {
      parseArray(path)
      return
    }

    cursor += 1
  }

  function parseObject(path: string) {
    cursor += 1
    const keys = new Map<string, Token>()

    while (cursor < state.tokens.length) {
      const token = state.tokens[cursor]
      if (token.kind === "brace-close") {
        cursor += 1
        return
      }
      if (token.kind === "comma") {
        cursor += 1
        continue
      }

      const colon = state.tokens[cursor + 1]
      if (
        (token.kind !== "string" && token.kind !== "bare") ||
        colon?.kind !== "colon"
      ) {
        cursor += 1
        continue
      }

      const key = token.value ?? token.raw
      const keyPath = appendJsonPath(path, key)
      setIssuePath(state, token.offset, keyPath)

      if (token.kind === "bare") {
        addIssue(state, {
          kind: "unquoted-key",
          severity: "error",
          message: `Object key ${JSON.stringify(key)} must be wrapped in double quotes.`,
          offset: token.offset,
          length: token.length,
          path: keyPath,
          repairable: true,
        })
        state.edits.push({
          offset: token.offset,
          length: token.length,
          replacement: JSON.stringify(key),
        })
      }

      const previous = keys.get(key)
      if (previous) {
        addIssue(state, {
          kind: "duplicate-key",
          severity: "warning",
          message: `Duplicate key ${JSON.stringify(key)} overwrites an earlier value in this object.`,
          offset: token.offset,
          length: token.length,
          path: keyPath,
          repairable: false,
        })
      } else {
        keys.set(key, token)
      }

      cursor += 2
      parseValue(keyPath)
    }
  }

  function parseArray(path: string) {
    cursor += 1
    let index = 0

    while (cursor < state.tokens.length) {
      const token = state.tokens[cursor]
      if (token.kind === "bracket-close") {
        cursor += 1
        return
      }
      if (token.kind === "comma") {
        cursor += 1
        continue
      }

      parseValue(`${path}[${index}]`)
      index += 1
    }
  }

  parseValue("$")
}

function detectTrailingCommas(state: AnalysisState) {
  for (let index = 0; index < state.tokens.length - 1; index += 1) {
    const token = state.tokens[index]
    const next = state.tokens[index + 1]
    if (
      token.kind !== "comma" ||
      (next.kind !== "brace-close" && next.kind !== "bracket-close")
    ) {
      continue
    }

    addIssue(state, {
      kind: "trailing-comma",
      severity: "error",
      message: `Remove the trailing comma before ${next.raw}.`,
      offset: token.offset,
      length: token.length,
      path: "$",
      repairable: true,
    })
    state.edits.push({ offset: token.offset, length: 1, replacement: "" })
  }
}

function addIssue(
  state: AnalysisState,
  issue: Omit<JsonValidationIssue, "id" | "line" | "column">
) {
  if (
    state.issues.some(
      (existing) => existing.kind === issue.kind && existing.offset === issue.offset
    )
  ) {
    return
  }

  const location = lineColumnFromOffset(state.input, issue.offset)
  const nextIssue: JsonValidationIssue = {
    ...issue,
    id: `${issue.kind}-${issue.offset}`,
    ...location,
  }
  state.issues.push(nextIssue)
  const matchingIssues = state.issuesByOffset.get(issue.offset) ?? []
  matchingIssues.push(nextIssue)
  state.issuesByOffset.set(issue.offset, matchingIssues)
}

function setIssuePath(state: AnalysisState, offset: number, path: string) {
  state.issuesByOffset.get(offset)?.forEach((issue) => {
    issue.path = path
  })
}

function applyTextEdits(input: string, edits: TextEdit[]) {
  return [...edits]
    .sort((left, right) => right.offset - left.offset)
    .reduce(
      (output, edit) =>
        `${output.slice(0, edit.offset)}${edit.replacement}${output.slice(
          edit.offset + edit.length
        )}`,
      input
    )
}

function readStringToken(input: string, offset: number, quote: '"' | "'") {
  let cursor = offset + 1
  let escaped = false

  while (cursor < input.length) {
    const character = input[cursor]
    if (!escaped && character === quote) {
      cursor += 1
      break
    }
    if (!escaped && character === "\\") escaped = true
    else escaped = false
    cursor += 1
  }

  const raw = input.slice(offset, cursor)
  const closed = raw.length > 1 && raw.at(-1) === quote
  let value: string | undefined

  if (closed) {
    if (quote === '"') {
      try {
        value = JSON.parse(raw) as string
      } catch {
        value = undefined
      }
    } else {
      value = decodeSingleQuotedString(raw) ?? undefined
    }
  }

  return {
    closed,
    token: {
      kind: "string" as const,
      offset,
      length: raw.length,
      raw,
      value,
      quote,
    },
  }
}

function decodeSingleQuotedString(raw: string) {
  if (raw.length < 2 || raw[0] !== "'" || raw.at(-1) !== "'") return null

  let result = ""
  for (let cursor = 1; cursor < raw.length - 1; cursor += 1) {
    const character = raw[cursor]
    if (character !== "\\") {
      result += character
      continue
    }

    const escaped = raw[cursor + 1]
    if (escaped === undefined) return null
    cursor += 1

    const simpleEscapes: Record<string, string> = {
      "'": "'",
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    }
    if (escaped in simpleEscapes) {
      result += simpleEscapes[escaped]
      continue
    }

    if (escaped === "u") {
      const hex = raw.slice(cursor + 1, cursor + 5)
      if (!/^[\da-fA-F]{4}$/.test(hex)) return null
      result += String.fromCharCode(Number.parseInt(hex, 16))
      cursor += 4
      continue
    }

    return null
  }

  return result
}

function getPunctuationKind(character: string): TokenKind | null {
  const kinds: Record<string, TokenKind> = {
    "{": "brace-open",
    "}": "brace-close",
    "[": "bracket-open",
    "]": "bracket-close",
    ":": "colon",
    ",": "comma",
  }
  return kinds[character] ?? null
}

function findBareTokenEnd(input: string, offset: number) {
  let cursor = offset
  while (cursor < input.length && !/[\s{}\[\]:,]/.test(input[cursor])) {
    cursor += 1
  }
  return Math.max(offset + 1, cursor)
}

function findLineCommentEnd(input: string, offset: number) {
  const lineBreak = input.indexOf("\n", offset)
  return lineBreak === -1 ? input.length : lineBreak
}

function preserveLineBreaks(value: string) {
  return value.replace(/[^\r\n]/g, " ")
}

function appendJsonPath(path: string, key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}

function lineColumnFromOffset(input: string, offset: number) {
  const before = input.slice(0, Math.max(0, offset))
  const lines = before.split("\n")
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
}

function offsetFromLineColumn(input: string, line: number, column: number) {
  const lines = input.split("\n")
  let offset = 0
  for (let index = 0; index < Math.max(0, line - 1); index += 1) {
    offset += (lines[index]?.length ?? 0) + 1
  }
  return Math.min(input.length, offset + Math.max(0, column - 1))
}

function createSummary({
  strictValid,
  repairCandidateValid,
  repairCount,
  errorCount,
  warningCount,
}: Pick<
  JsonValidationReport,
  | "strictValid"
  | "repairCandidateValid"
  | "repairCount"
  | "errorCount"
  | "warningCount"
>) {
  if (strictValid && !warningCount) return "Valid strict JSON with no warnings."
  if (strictValid) {
    return `Valid strict JSON with ${warningCount.toLocaleString()} warning(s).`
  }
  if (repairCandidateValid) {
    return `${errorCount.toLocaleString()} error(s) and ${warningCount.toLocaleString()} warning(s). ${repairCount.toLocaleString()} safe edit(s) produce valid JSON.`
  }
  return `${errorCount.toLocaleString()} error(s) and ${warningCount.toLocaleString()} warning(s). Manual changes are still required.`
}
