import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeRows,
  rowsToCsv,
} from "../lib/json-lens.ts"
import {
  rowsToMarkdownTable,
  rowsToNdjson,
  rowsToTsv,
} from "../lib/json-exports.ts"
import {
  detectEnumCandidates,
  detectNullableFields,
  detectOptionalFields,
  inferJsonSchema,
} from "../lib/json-schema-contracts.ts"
import { extractFieldValueGroups } from "../lib/json-field-extraction.ts"
import { applyJsonPatchText, generateJsonPatch } from "../lib/json-diff.ts"
import { runJsonTransformation } from "../lib/json-transformations.ts"

test("field extraction stays exact and case-sensitive", () => {
  const groups = extractFieldValueGroups(
    [{ name: "Maya", Name: "Wrong", user: { name: "Noah" } }],
    "name"
  )

  assert.deepEqual(groups.map((group) => group.path), ["$[].name", "$[].user.name"])
  assert.deepEqual(groups.flatMap((group) => group.values), ["Maya", "Noah"])
})

test("flatten and unflatten transformation round-trips object paths", () => {
  const flattened = runJsonTransformation(
    JSON.stringify({ user: { name: "Maya" }, tags: ["a"] }),
    { operation: "flatten" }
  )
  assert.equal(flattened.ok, true)
  assert.match(flattened.output, /"user.name"/)

  const unflattened = runJsonTransformation(flattened.output, { operation: "unflatten" })
  assert.equal(unflattened.ok, true)
  assert.deepEqual(JSON.parse(unflattened.output), {
    user: { name: "Maya" },
    tags: ["a"],
  })
})

test("json patch generation and application reaches comparison document", () => {
  const patch = generateJsonPatch(
    JSON.stringify({ id: 1, status: "pending" }),
    JSON.stringify({ id: 1, status: "active", plan: "team" })
  )

  assert.equal(patch.ok, true)
  const applied = applyJsonPatchText(
    JSON.stringify({ id: 1, status: "pending" }),
    JSON.stringify(patch.patch)
  )

  assert.equal(applied.ok, true)
  assert.deepEqual(JSON.parse(applied.output), {
    id: 1,
    status: "active",
    plan: "team",
  })
})

test("schema inference reports optional nullable and enum candidate fields", () => {
  const value = [
    { id: 1, status: "active", note: null },
    { id: 2, status: "pending" },
  ]

  assert.equal(inferJsonSchema(value).type, "array")
  assert.ok(detectOptionalFields(value).some((item) => item.path === "$[].note"))
  assert.ok(detectNullableFields(value).some((item) => item.path === "$[0].note"))
  assert.ok(detectEnumCandidates(value).some((item) => item.path.endsWith(".status")))
})

test("exports handle delimiter escaping and row source paths", () => {
  const rows = normalizeRows([{ name: "A,B", note: "hello\nworld" }])

  assert.match(rowsToCsv(rows, ["name", "note"]), /sourcePath/)
  assert.match(rowsToCsv(rows, ["name", "note"]), /"A,B"/)
  assert.match(rowsToTsv(rows, ["name", "note"]), /hello world/)
  assert.match(rowsToMarkdownTable(rows, ["name", "note"]), /\|/)
  assert.equal(rowsToNdjson(rows), JSON.stringify({ name: "A,B", note: "hello\nworld" }))
})
