"use client"

import { useMemo, useState } from "react"
import {
  BracesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  CornerDownRightIcon,
  EyeIcon,
  ListCollapseIcon,
  ListTreeIcon,
  RouteIcon,
  SearchIcon,
  TextCursorInputIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { copyText, displayValue, isRecord, parseJson, stringifyPretty } from "@/lib/json-lens"
import { appendJsonSourcePath } from "@/lib/json-source-map"
import { cn } from "@/lib/utils"

type SearchMode = "keys" | "values"
type JsonTreeNode = {
  key: string
  path: string
  depth: number
  value: unknown
  type: JsonNodeType
  childCount: number
  children: JsonTreeNode[]
}
type JsonNodeType =
  | "array"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string"

const TREE_NODE_LIMIT = 1200
const LARGE_TREE_NODE_LIMIT = 350
const NAV_BUTTON_CLASS = "h-8 rounded-full px-2.5 text-xs active:!translate-y-0"
const INDENT_OPTIONS = [2, 4, 8]
const DEPTH_OPTIONS = [1, 2, 3, 4, 6]

export function JsonNavigationPanel({
  activePath,
  indentationWidth,
  isLargeDataMode,
  jsonInput,
  onIndentationWidthChange,
  onSelectPath,
  notify,
}: {
  activePath?: string
  indentationWidth: number
  isLargeDataMode: boolean
  jsonInput: string
  onIndentationWidthChange: (value: number) => void
  onSelectPath: (path: string) => void
  notify: (message: string) => void
}) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [searchMode, setSearchMode] = useState<SearchMode>("keys")
  const [jumpPath, setJumpPath] = useState("")
  const parseResult = useMemo(() => parseJson(jsonInput), [jsonInput])
  const treeState = useMemo(() => {
    if (parseResult.error) return null

    return buildTreeState(
      parseResult.value,
      isLargeDataMode ? LARGE_TREE_NODE_LIMIT : TREE_NODE_LIMIT
    )
  }, [isLargeDataMode, parseResult.error, parseResult.value])
  const matches = useMemo(() => {
    if (!treeState) return new Set<string>()

    const needle = search.trim().toLowerCase()
    if (!needle) return new Set<string>()

    return new Set(
      treeState.nodes
        .filter((node) =>
          searchMode === "keys"
            ? node.key.toLowerCase().includes(needle)
            : stringifySearchValue(node.value).toLowerCase().includes(needle)
        )
        .map((node) => node.path)
    )
  }, [search, searchMode, treeState])
  const matchedAncestors = useMemo(() => {
    if (!treeState || !matches.size) return new Set<string>()

    const next = new Set<string>()
    for (const path of matches) {
      for (const ancestor of getAncestorPaths(path)) next.add(ancestor)
    }
    return next
  }, [matches, treeState])
  const selectedNode = treeState?.nodes.find((node) => node.path === activePath)
  const visibleCount = treeState?.nodes.length ?? 0

  function expandToDepth(depth: number) {
    if (!treeState) return

    const nextCollapsed = new Set<string>()
    for (const node of treeState.nodes) {
      if (node.childCount > 0 && node.depth >= depth) {
        nextCollapsed.add(node.path)
      }
    }

    setCollapsedPaths(nextCollapsed)
  }

  function collapseAll() {
    if (!treeState) return

    setCollapsedPaths(
      new Set(
        treeState.nodes
          .filter((node) => node.childCount > 0 && node.path !== "$")
          .map((node) => node.path)
      )
    )
  }

  function expandAll() {
    setCollapsedPaths(new Set())
  }

  function togglePath(path: string) {
    setCollapsedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function jumpToPath() {
    const path = jumpPath.trim()
    if (!path) {
      notify("Enter a JSON path first.")
      return
    }

    const node = treeState?.nodes.find((item) => item.path === path)
    if (!node) {
      notify("Path not found in the current JSON.")
      return
    }

    onSelectPath(node.path)
    setCollapsedPaths((current) => {
      const next = new Set(current)
      for (const ancestor of getAncestorPaths(node.path)) next.delete(ancestor)
      return next
    })
    notify("Jumped to JSON path.")
  }

  async function copySelectedPath() {
    if (!selectedNode) return
    await copyText(selectedNode.path)
    notify("JSON path copied.")
  }

  async function copySelectedSubtree() {
    if (!selectedNode) return

    await copyText(stringifyPretty(selectedNode.value, indentationWidth))
    notify("JSON subtree copied.")
  }

  return (
    <Card size="sm">
      <CardHeader className="gap-3 xl:grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2">
          <ListTreeIcon className="size-4" />
          JSON navigation
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={String(indentationWidth)}
            onValueChange={(value) => onIndentationWidthChange(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-full"
              title="Choose indentation width for beautified JSON"
            >
              <TextCursorInputIcon data-icon="inline-start" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {INDENT_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} spaces
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={NAV_BUTTON_CLASS}
            title="Collapse all nested JSON nodes"
            disabled={!treeState}
            onClick={collapseAll}
          >
            <ListCollapseIcon data-icon="inline-start" />
            Collapse
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={NAV_BUTTON_CLASS}
            title="Expand every visible JSON node"
            disabled={!treeState}
            onClick={expandAll}
          >
            <EyeIcon data-icon="inline-start" />
            Expand
          </Button>
          <Select
            value=""
            onValueChange={(value) => expandToDepth(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-full"
              title="Expand JSON tree to depth"
              disabled={!treeState}
            >
              <CornerDownRightIcon data-icon="inline-start" />
              <SelectValue placeholder="Depth" />
            </SelectTrigger>
            <SelectContent align="end">
              {DEPTH_OPTIONS.map((depth) => (
                <SelectItem key={depth} value={String(depth)}>
                  Depth {depth}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                placeholder={searchMode === "keys" ? "Search keys" : "Search values"}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              value={searchMode}
              onValueChange={(value) => setSearchMode(value as SearchMode)}
            >
              <SelectTrigger size="sm" className="h-8 sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="keys">Keys</SelectItem>
                <SelectItem value="values">Values</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form
            className="flex min-w-0 flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              jumpToPath()
            }}
          >
            <div className="relative min-w-0 flex-1">
              <RouteIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 font-mono text-xs"
                value={jumpPath}
                placeholder="$.user.name"
                onChange={(event) => setJumpPath(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="h-8 active:!translate-y-0"
              disabled={!treeState}
              title="Jump to JSON path"
            >
              <RouteIcon data-icon="inline-start" />
              Jump
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-full px-2 text-xs">
            {visibleCount.toLocaleString()} nodes
          </Badge>
          {treeState?.truncated ? (
            <Badge variant="outline" className="rounded-full px-2 text-xs">
              Previewing first {visibleCount.toLocaleString()} nodes
            </Badge>
          ) : null}
          {matches.size ? (
            <Badge variant="outline" className="rounded-full px-2 text-xs">
              {matches.size.toLocaleString()} match(es)
            </Badge>
          ) : null}
          {selectedNode ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={NAV_BUTTON_CLASS}
                title="Copy selected JSON path"
                onClick={copySelectedPath}
              >
                <CopyIcon data-icon="inline-start" />
                Path
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={NAV_BUTTON_CLASS}
                title="Copy selected JSON subtree"
                onClick={copySelectedSubtree}
              >
                <ClipboardIcon data-icon="inline-start" />
                Subtree
              </Button>
            </>
          ) : null}
        </div>

        {selectedNode ? (
          <Breadcrumb path={selectedNode.path} onSelectPath={onSelectPath} />
        ) : null}

        {parseResult.error ? (
          <Empty className="min-h-40 rounded-lg border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BracesIcon />
              </EmptyMedia>
              <EmptyTitle>Valid JSON required</EmptyTitle>
              <EmptyDescription>{parseResult.error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : treeState ? (
          <div className="max-h-[420px] overflow-auto rounded-lg border bg-background p-2">
            <JsonTreeRows
              activePath={activePath}
              collapsedPaths={collapsedPaths}
              matchedAncestors={matchedAncestors}
              matches={matches}
              nodes={[treeState.root]}
              onSelectPath={onSelectPath}
              onTogglePath={togglePath}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function JsonTreeRows({
  activePath,
  collapsedPaths,
  matchedAncestors,
  matches,
  nodes,
  onSelectPath,
  onTogglePath,
}: {
  activePath?: string
  collapsedPaths: Set<string>
  matchedAncestors: Set<string>
  matches: Set<string>
  nodes: JsonTreeNode[]
  onSelectPath: (path: string) => void
  onTogglePath: (path: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = node.childCount > 0
        const collapsed = collapsedPaths.has(node.path)
        const active = activePath === node.path
        const matched = matches.has(node.path)
        const forceVisible = matched || matchedAncestors.has(node.path)

        if (matches.size && !forceVisible) return null

        return (
          <div key={node.path}>
            <div
              className={cn(
                "grid h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-muted",
                active && "bg-primary/10 text-primary",
                matched && "ring-1 ring-primary/35"
              )}
              style={{ paddingLeft: `${node.depth * 16 + 6}px` }}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-6 active:!translate-y-0"
                title={hasChildren ? "Collapse or expand this JSON node" : "Leaf node"}
                disabled={!hasChildren}
                onClick={() => onTogglePath(node.path)}
              >
                {hasChildren ? (
                  collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />
                ) : (
                  <span className="size-4" />
                )}
              </Button>
              <button
                type="button"
                className="min-w-0 text-left"
                title={node.path}
                onClick={() => onSelectPath(node.path)}
              >
                <span className="font-mono font-medium">{node.key}</span>
                <span className="ml-2 text-muted-foreground">
                  {summarizeNodeValue(node)}
                </span>
              </button>
              <Badge variant="outline" className="rounded-full px-1.5 text-[10px]">
                {node.type}
              </Badge>
            </div>
            {hasChildren && !collapsed ? (
              <JsonTreeRows
                activePath={activePath}
                collapsedPaths={collapsedPaths}
                matchedAncestors={matchedAncestors}
                matches={matches}
                nodes={node.children}
                onSelectPath={onSelectPath}
                onTogglePath={onTogglePath}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Breadcrumb({
  path,
  onSelectPath,
}: {
  path: string
  onSelectPath: (path: string) => void
}) {
  const crumbs = createBreadcrumbs(path)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-2 text-xs">
      {crumbs.map((crumb, index) => (
        <div key={crumb.path} className="flex min-w-0 items-center gap-1">
          {index ? <ChevronRightIcon className="size-3 text-muted-foreground" /> : null}
          <button
            type="button"
            className="max-w-44 truncate rounded px-1.5 py-0.5 font-mono hover:bg-background"
            title={crumb.path}
            onClick={() => onSelectPath(crumb.path)}
          >
            {crumb.label}
          </button>
        </div>
      ))}
    </div>
  )
}

function buildTreeState(value: unknown, limit: number) {
  const nodes: JsonTreeNode[] = []
  let truncated = false

  function visit(nodeValue: unknown, key: string, path: string, depth: number): JsonTreeNode {
    if (nodes.length >= limit) truncated = true

    const shouldCollect = nodes.length < limit
    const children: JsonTreeNode[] = []
    const node: JsonTreeNode = {
      key,
      path,
      depth,
      value: nodeValue,
      type: getNodeType(nodeValue),
      childCount: getChildEntries(nodeValue).length,
      children,
    }

    if (shouldCollect) nodes.push(node)
    if (!shouldCollect) return node

    for (const child of getChildEntries(nodeValue)) {
      if (nodes.length >= limit) {
        truncated = true
        break
      }
      children.push(
        visit(
          child.value,
          child.key,
          child.pathSegment(child.key, path),
          depth + 1
        )
      )
    }

    return node
  }

  const root = visit(value, "$", "$", 0)

  return { root, nodes, truncated }
}

function getChildEntries(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      key: `[${index}]`,
      value: item,
      pathSegment: (_entryKey: string, parentPath: string) => `${parentPath}[${index}]`,
    }))
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([key, child]) => ({
      key,
      value: child,
      pathSegment: (entryKey: string, parentPath: string) =>
        appendJsonSourcePath(parentPath, entryKey),
    }))
  }

  return []
}

function getNodeType(value: unknown): JsonNodeType {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  if (isRecord(value)) return "object"
  return typeof value as JsonNodeType
}

function summarizeNodeValue(node: JsonTreeNode) {
  if (node.type === "array") return `${node.childCount.toLocaleString()} item(s)`
  if (node.type === "object") return `${node.childCount.toLocaleString()} field(s)`
  return displayValue(node.value)
}

function stringifySearchValue(value: unknown) {
  if (Array.isArray(value) || isRecord(value)) return ""
  return displayValue(value)
}

function getAncestorPaths(path: string) {
  const ancestors: string[] = []
  let current = path

  while (current && current !== "$") {
    const next = current.replace(/(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^\]]+\])$/, "")
    if (!next || next === current) break
    ancestors.push(next)
    current = next
  }

  return ancestors
}

function createBreadcrumbs(path: string) {
  const ancestors = getAncestorPaths(path).reverse()

  return [...ancestors, path].map((crumbPath) => ({
    path: crumbPath,
    label: crumbPath === "$" ? "$" : crumbPath.split(/(?=\.|\[)/).at(-1) ?? crumbPath,
  }))
}
