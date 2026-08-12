"use client"

import { useMemo, useState } from "react"
import {
  ClipboardIcon,
  DownloadIcon,
  ListChecksIcon,
  PlayIcon,
  ReplaceIcon,
  RotateCcwIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  copyText,
  downloadText,
} from "@/lib/json-lens"
import {
  getTransformLabel,
  runJsonTransformation,
  type TransformConfig,
  type TransformOperation,
  type TransformResult,
} from "@/lib/json-transformations"

import { JsonCodeEditor } from "./json-code-editor"
import { useJsonLens } from "./json-lens-provider"

const TRANSFORM_OPTIONS: Array<{
  value: TransformOperation
  section: "Keys" | "Shape" | "Arrays" | "Values"
  description: string
}> = [
  { value: "rename-key", section: "Keys", description: "Rename one key everywhere it appears." },
  { value: "bulk-rename", section: "Keys", description: "Apply multiple key rename mappings." },
  { value: "remove", section: "Keys", description: "Remove keys or exact JSON paths." },
  { value: "keep-only", section: "Keys", description: "Build a reduced document from selected paths." },
  { value: "move", section: "Keys", description: "Move a value from one path to another." },
  { value: "flatten", section: "Shape", description: "Flatten objects into path-like keys." },
  { value: "unflatten", section: "Shape", description: "Rebuild nested objects from flattened keys." },
  { value: "object-map-to-array", section: "Shape", description: "Convert an object map into rows." },
  { value: "array-to-object-map", section: "Shape", description: "Convert rows into an object map by identity." },
  { value: "explode-array", section: "Arrays", description: "Explode nested array items into rows." },
  { value: "group-rows", section: "Arrays", description: "Group flat rows into nested child arrays." },
  { value: "sort-arrays", section: "Arrays", description: "Sort object arrays by a chosen field." },
  { value: "dedupe-arrays", section: "Arrays", description: "Remove duplicate array entries recursively." },
  { value: "sort-keys", section: "Shape", description: "Sort object keys recursively." },
  { value: "trim-strings", section: "Values", description: "Trim leading and trailing string whitespace." },
  { value: "regex-replace", section: "Values", description: "Replace text in string values with a regex." },
  { value: "convert-primitives", section: "Values", description: "Convert numeric and boolean strings." },
  { value: "normalize-null", section: "Values", description: "Convert null-like tokens to null." },
  { value: "normalize-dates", section: "Values", description: "Normalize date-like strings to ISO dates." },
  { value: "computed-field", section: "Values", description: "Add a computed field from a row template." },
  { value: "mask-sensitive", section: "Values", description: "Mask sensitive-looking fields and selected keys." },
]

const DEFAULT_CONFIG: TransformConfig = {
  operation: "rename-key",
  fromKey: "user_name",
  toKey: "userName",
  mappingText: "first_name=firstName\nlast_name=lastName",
  selectorsText: "$.debug,password",
  sourcePath: "$.profile.name",
  targetPath: "$.user.name",
  arrayPath: "$.items",
  groupKeys: "id",
  childKey: "items",
  keyField: "id",
  sortField: "id",
  regexPattern: "\\s+",
  regexReplacement: " ",
  nullTokens: ",na,n/a,null,undefined",
  computedField: "displayName",
  computedTemplate: "{{firstName}} {{lastName}}",
  maskSelectors: "password,token,email",
}

export function TransformationWorkspace() {
  const lens = useJsonLens()
  const [config, setConfig] = useState<TransformConfig>(DEFAULT_CONFIG)
  const [result, setResult] = useState<TransformResult | null>(null)
  const selectedOption = useMemo(
    () => TRANSFORM_OPTIONS.find((option) => option.value === config.operation),
    [config.operation]
  )

  function updateConfig(patch: Partial<TransformConfig>) {
    setConfig((current) => ({ ...current, ...patch }))
  }

  function runTransform() {
    const nextResult = runJsonTransformation(lens.jsonInput, config, lens.indentationWidth)
    setResult(nextResult)
    lens.notify(nextResult.ok ? getTransformLabel(config.operation) : "Transformation failed.")
  }

  async function copyOutput() {
    if (!result) return
    await copyText(result.output)
    lens.notify("Transformation output copied.")
  }

  function downloadOutput() {
    if (!result) return
    downloadText("json-lens-transform-output.json", result.output, "application/json")
    lens.notify("Transformation output downloaded.")
  }

  function applyOutputToSource() {
    if (!result?.ok) return
    lens.setJsonInput(result.output)
    lens.notify("Transformation output applied to source JSON.")
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReplaceIcon className="size-4" />
            Transformation
          </CardTitle>
          <CardDescription>
            Preview changes first, inspect affected paths, then apply only when the result is correct.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-2 text-sm font-medium">
            Operation
            <Select
              value={config.operation}
              onValueChange={(operation) => updateConfig({ operation: operation as TransformOperation })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Keys", "Shape", "Arrays", "Values"].map((section, index) => (
                  <SelectGroup key={section}>
                    {index > 0 ? <SelectSeparator /> : null}
                    <SelectLabel>{section}</SelectLabel>
                    {TRANSFORM_OPTIONS.filter((option) => option.section === section).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {getTransformLabel(option.value)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </label>

          {selectedOption ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {selectedOption.description}
            </p>
          ) : null}

          <TransformControls config={config} onChange={updateConfig} />

          <div className="flex flex-wrap gap-2">
            <Button title="Run transformation preview" onClick={runTransform}>
              <PlayIcon data-icon="inline-start" />
              Preview
            </Button>
            <Button
              variant="outline"
              title="Copy transformation output"
              disabled={!result}
              onClick={copyOutput}
            >
              <ClipboardIcon data-icon="inline-start" />
              Copy
            </Button>
            <Button
              variant="outline"
              title="Download transformation output"
              disabled={!result}
              onClick={downloadOutput}
            >
              <DownloadIcon data-icon="inline-start" />
              Download
            </Button>
            <Button
              variant="secondary"
              title="Apply output to source JSON"
              disabled={!result?.ok}
              onClick={applyOutputToSource}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Apply
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
            <CardTitle className="flex items-center gap-2">
              <ListChecksIcon className="size-4" />
              Preview result
            </CardTitle>
            {result ? (
              <Badge variant={result.ok ? "secondary" : "destructive"}>
                {result.ok ? `${result.affectedPaths.length.toLocaleString()} affected` : "Blocked"}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {result ? (
              <>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {result.summary}
                </p>
                <JsonCodeEditor
                  aria-label="Transformation output JSON"
                  value={result.output}
                  onChange={() => undefined}
                  onContextCopy={lens.notify}
                />
              </>
            ) : (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Run a preview to generate output without changing the active source.
              </p>
            )}
          </CardContent>
        </Card>

        {result?.affectedPaths.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Affected paths</CardTitle>
              <CardDescription>First 80 changed paths reported by the operation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
                {result.affectedPaths.slice(0, 80).map((path) => (
                  <div key={path}>{path}</div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}

function TransformControls({
  config,
  onChange,
}: {
  config: TransformConfig
  onChange: (patch: Partial<TransformConfig>) => void
}) {
  if (config.operation === "rename-key") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Source key" value={config.fromKey} onChange={(fromKey) => onChange({ fromKey })} />
        <TextInput label="Target key" value={config.toKey} onChange={(toKey) => onChange({ toKey })} />
      </div>
    )
  }

  if (config.operation === "bulk-rename") {
    return (
      <TextBlock
        label="Mappings"
        placeholder="old_key=newKey"
        value={config.mappingText}
        onChange={(mappingText) => onChange({ mappingText })}
      />
    )
  }

  if (config.operation === "remove" || config.operation === "keep-only") {
    return (
      <TextBlock
        label="Keys or paths"
        placeholder="$.debug,password"
        value={config.selectorsText}
        onChange={(selectorsText) => onChange({ selectorsText })}
      />
    )
  }

  if (config.operation === "move") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Source path" value={config.sourcePath} onChange={(sourcePath) => onChange({ sourcePath })} />
        <TextInput label="Target path" value={config.targetPath} onChange={(targetPath) => onChange({ targetPath })} />
      </div>
    )
  }

  if (config.operation === "explode-array") {
    return <TextInput label="Array path" value={config.arrayPath} onChange={(arrayPath) => onChange({ arrayPath })} />
  }

  if (config.operation === "group-rows") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Group keys" value={config.groupKeys} onChange={(groupKeys) => onChange({ groupKeys })} />
        <TextInput label="Child array key" value={config.childKey} onChange={(childKey) => onChange({ childKey })} />
      </div>
    )
  }

  if (config.operation === "object-map-to-array" || config.operation === "array-to-object-map") {
    return <TextInput label="Identity key field" value={config.keyField} onChange={(keyField) => onChange({ keyField })} />
  }

  if (config.operation === "sort-arrays") {
    return <TextInput label="Sort field" value={config.sortField} onChange={(sortField) => onChange({ sortField })} />
  }

  if (config.operation === "regex-replace") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Regex pattern" value={config.regexPattern} onChange={(regexPattern) => onChange({ regexPattern })} />
        <TextInput label="Replacement" value={config.regexReplacement} onChange={(regexReplacement) => onChange({ regexReplacement })} />
      </div>
    )
  }

  if (config.operation === "normalize-null") {
    return <TextInput label="Null-like tokens" value={config.nullTokens} onChange={(nullTokens) => onChange({ nullTokens })} />
  }

  if (config.operation === "computed-field") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Computed field" value={config.computedField} onChange={(computedField) => onChange({ computedField })} />
        <TextInput label="Template" value={config.computedTemplate} onChange={(computedTemplate) => onChange({ computedTemplate })} />
      </div>
    )
  }

  if (config.operation === "mask-sensitive") {
    return (
      <TextBlock
        label="Optional mask selectors"
        placeholder="password,token,$.user.email"
        value={config.maskSelectors}
        onChange={(maskSelectors) => onChange({ maskSelectors })}
      />
    )
  }

  return null
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextBlock({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Textarea
        className="min-h-28 font-mono text-xs"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
