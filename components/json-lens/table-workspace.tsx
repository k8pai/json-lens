"use client"

import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type Dispatch,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
} from "react"
import { flushSync } from "react-dom"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ClipboardIcon,
  Columns3Icon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  GripHorizontalIcon,
  SearchIcon,
  Table2Icon,
  XIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  compareValues,
  copyText,
  displayValue,
  flattenValue,
  getColumnValueOptions,
  getColumns,
  isRecord,
  rowsToCsv,
  type FlatRow,
  type RowSourceMode,
  type SortState,
} from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"
import { JsonValueCell } from "./shared"

type TableController = {
  rows: FlatRow[]
  columns: string[]
  visibleColumns: string[]
  columnWidths: Record<string, number>
  filteredRows: FlatRow[]
  pagedRows: FlatRow[]
  columnFilters: Record<string, string>
  columnValueOptions: Record<string, string[]>
  enumColumns: Set<string>
  hiddenColumns: Set<string>
  pageSize: number
  currentPage: number
  totalPages: number
  sortState: SortState
  globalSearch: string
  reorderColumn: (sourceColumn: string, targetColumn: string) => void
  setGlobalSearch: (value: string) => void
  setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>
  setHiddenColumns: Dispatch<SetStateAction<Set<string>>>
  toggleEnumColumn: (column: string) => void
  toggleSort: (column: string) => void
  updateFilter: (column: string, value: string) => void
  setPage: Dispatch<SetStateAction<number>>
  setPageSize: (value: number) => void
}

const DEFAULT_COLUMN_WIDTH = 190
const MIN_COLUMN_WIDTH = 120
const MAX_COLUMN_WIDTH = 720

const ROW_SOURCE_LABELS: Record<RowSourceMode, string> = {
  auto: "Auto",
  "array-items": "Root array rows",
  "object-entries": "Object entries",
  "single-object": "Single object",
  "nested-path": "Nested array path",
}

export function TableWorkspace() {
  const lens = useJsonLens()
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const lastReorderSignatureRef = useRef<string | null>(null)
  const [subTableColumn, setSubTableColumn] = useState("")
  const [subTableParentColumn, setSubTableParentColumn] = useState("")
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  const effectiveSubTableColumn =
    subTableColumn && lens.arrayColumnCandidates.some((candidate) => candidate.column === subTableColumn)
      ? subTableColumn
      : lens.arrayColumnCandidates[0]?.column ?? ""
  const preferredParentColumn =
    lens.columns.find((column) => /(^id$|\.id$|key|_id$)/i.test(column)) ?? lens.columns[0] ?? ""
  const effectiveSubTableParentColumn =
    subTableParentColumn && lens.columns.includes(subTableParentColumn)
      ? subTableParentColumn
      : preferredParentColumn
  const tableWidth = useMemo(
    () =>
      64 +
      lens.visibleColumns.reduce(
        (total, column) => total + getColumnWidth(lens.columnWidths, column),
        0
      ),
    [lens.columnWidths, lens.visibleColumns]
  )
  const activeColumnFilters = Object.entries(lens.columnFilters).filter(
    ([, value]) => value.trim()
  )

  const subTableRows = useMemo(
    () =>
      buildSubTableRows(
        lens.rows,
        effectiveSubTableColumn,
        effectiveSubTableParentColumn
      ),
    [lens.rows, effectiveSubTableColumn, effectiveSubTableParentColumn]
  )
  const subTableColumns = useMemo(() => getColumns(subTableRows), [subTableRows])

  async function copyVisibleTable() {
    await copyText(rowsToCsv(lens.filteredRows, lens.visibleColumns))
    lens.notify("Visible table copied as CSV.")
  }

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (target && target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft
    }
  }

  function startDragScroll(event: MouseEvent<HTMLDivElement>) {
    const target = tableScrollRef.current
    if (!target) return

    const dragTarget = target
    const startX = event.pageX
    const startScrollLeft = dragTarget.scrollLeft

    function move(pointerEvent: globalThis.MouseEvent) {
      dragTarget.scrollLeft = startScrollLeft - (pointerEvent.pageX - startX)
      if (topScrollRef.current) topScrollRef.current.scrollLeft = dragTarget.scrollLeft
    }

    function stop() {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", stop)
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", stop)
  }

  function reorderColumnLive(sourceColumn: string, targetColumn: string) {
    runColumnMoveTransition(() => lens.reorderColumn(sourceColumn, targetColumn))
  }

  return (
    <section className="min-w-0 space-y-4">
      <JsonSetupPanel />

      <Card>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="block flex-1 text-sm font-medium">
            Search all data
            <div className="relative mt-2">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Try active, Austin, or 1001"
                value={lens.globalSearch}
                onChange={(event) => lens.setGlobalSearch(event.target.value)}
              />
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ColumnVisibilityDropdown />
            <Badge variant="secondary">
              {lens.filteredRows.length.toLocaleString()} of {lens.rows.length.toLocaleString()} rows
            </Badge>
            <Button variant="outline" title="Copy the visible table as CSV" onClick={copyVisibleTable}>
              <ClipboardIcon data-icon="inline-start" />
              Copy CSV
            </Button>
          </div>
        </CardContent>
        {activeColumnFilters.length ? (
          <CardContent className="flex flex-wrap gap-2 border-t pt-3">
            {activeColumnFilters.map(([column, value]) => (
              <Button
                key={column}
                variant="secondary"
                size="sm"
                className="rounded-full"
                title={`Clear ${column} filter`}
                onClick={() => lens.updateFilter(column, "")}
              >
                {column}: {value}
                <XIcon data-icon="inline-end" />
              </Button>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b bg-muted/30 px-4 py-2">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <GripHorizontalIcon className="size-3.5" />
              Drag the x-axis or the table to move sideways
            </div>
            <div
              ref={topScrollRef}
              className="overflow-x-auto"
              onScroll={(event) =>
                syncScroll(event.currentTarget, tableScrollRef.current)
              }
            >
              <div style={{ width: tableWidth, height: 1 }} />
            </div>
          </div>
          <div
            ref={tableScrollRef}
            className="max-h-[64vh] cursor-grab overflow-auto active:cursor-grabbing"
            onMouseDown={startDragScroll}
            onScroll={(event) =>
              syncScroll(event.currentTarget, topScrollRef.current)
            }
          >
            <Table style={{ width: tableWidth, minWidth: tableWidth }}>
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <TableRow className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <TableHead className="sticky left-0 z-20 w-16 bg-muted">#</TableHead>
                  {lens.visibleColumns.map((column) => (
                    <ResizableColumnHead
                      key={column}
                      column={column}
                      columns={lens.visibleColumns}
                      columnWidths={lens.columnWidths}
                      onResize={lens.setColumnWidths}
                      onReorder={reorderColumnLive}
                      onSort={() => lens.toggleSort(column)}
                      draggedColumn={draggedColumn}
                      setDraggedColumn={setDraggedColumn}
                      lastReorderSignatureRef={lastReorderSignatureRef}
                      sortState={lens.sortState}
                      transitionScope="parent"
                    />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lens.pagedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={lens.visibleColumns.length + 1}>
                      <Empty className="border-0">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <SearchIcon />
                          </EmptyMedia>
                          <EmptyTitle>No matching rows</EmptyTitle>
                          <EmptyDescription>
                            Adjust the search or column filters to bring data back.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : (
                  lens.pagedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="sticky left-0 bg-card font-mono text-xs text-muted-foreground">
                        {row.id}
                      </TableCell>
                      {lens.visibleColumns.map((column) => (
                        <TableCell
                          key={column}
                          className="align-top"
                          style={{
                            width: getColumnWidth(lens.columnWidths, column),
                            minWidth: getColumnWidth(lens.columnWidths, column),
                            viewTransitionName: getColumnTransitionName(
                              "parent",
                              column,
                              `row-${row.id}`
                            ),
                          }}
                        >
                          <JsonValueCell value={row.flat[column]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                title="Previous page"
                onClick={() => lens.setPage((current) => Math.max(1, current - 1))}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Previous
              </Button>
              <Button
                variant="outline"
                title="Next page"
                onClick={() =>
                  lens.setPage((current) => Math.min(lens.totalPages, current + 1))
                }
              >
                Next
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <span className="text-muted-foreground">
                Page {lens.currentPage} of {lens.totalPages}
              </span>
            </div>

            <label className="flex items-center gap-2 text-muted-foreground">
              Rows per page
              <Select value={String(lens.pageSize)} onValueChange={(value) => lens.setPageSize(Number(value))}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </CardContent>
      </Card>

      {lens.arrayColumnCandidates.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table2Icon className="size-4" />
              Sub table from array column
            </CardTitle>
            <CardDescription>
              Pick an array-valued column and the parent identifier that links each child row back.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="grid gap-2 text-sm font-medium">
              Array column
              <Select value={effectiveSubTableColumn} onValueChange={setSubTableColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an array column" />
                </SelectTrigger>
                <SelectContent>
                  {lens.arrayColumnCandidates.map((candidate) => (
                    <SelectItem key={candidate.column} value={candidate.column}>
                      {candidate.column} ({candidate.rowsWithArrays} rows)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Parent ID column
              <Select value={effectiveSubTableParentColumn} onValueChange={setSubTableParentColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a parent identifier" />
                </SelectTrigger>
                <SelectContent>
                  {lens.columns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Badge variant="secondary" className="h-9 justify-center">
              {subTableRows.length.toLocaleString()} child rows
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      {effectiveSubTableColumn && subTableRows.length ? (
        <LocalDataTable
          title={`${effectiveSubTableColumn} sub table`}
          description={`Each row includes ${effectiveSubTableParentColumn || "parentRow"} to identify its parent table row.`}
          rows={subTableRows}
          columns={subTableColumns}
          copyToast={(message) => lens.notify(message)}
        />
      ) : null}
    </section>
  )
}

function ResizableColumnHead({
  column,
  columns,
  columnWidths,
  draggedColumn,
  lastReorderSignatureRef,
  onResize,
  onReorder,
  onSort,
  setDraggedColumn,
  sortState,
  transitionScope,
}: {
  column: string
  columns: string[]
  columnWidths: Record<string, number>
  draggedColumn: string | null
  lastReorderSignatureRef: RefObject<string | null>
  onResize: Dispatch<SetStateAction<Record<string, number>>>
  onReorder: (sourceColumn: string, targetColumn: string) => void
  onSort: () => void
  setDraggedColumn: (column: string | null) => void
  sortState: SortState
  transitionScope: string
}) {
  const width = getColumnWidth(columnWidths, column)
  const receivingDrop = Boolean(draggedColumn && draggedColumn !== column)

  function startResize(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = width

    function move(pointerEvent: globalThis.MouseEvent) {
      const nextWidth = clampColumnWidth(startWidth + pointerEvent.clientX - startX)
      onResize((current) => ({ ...current, [column]: nextWidth }))
    }

    function stop() {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", stop)
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", stop)
  }

  function startColumnDrag(event: DragEvent<HTMLDivElement>) {
    event.stopPropagation()
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", column)
    lastReorderSignatureRef.current = null
    setDraggedColumn(column)
  }

  function reorderOnHover(event: DragEvent<HTMLTableCellElement>) {
    const sourceColumn = event.dataTransfer.getData("text/plain") || draggedColumn
    if (!sourceColumn || sourceColumn === column) return

    event.preventDefault()
    event.dataTransfer.dropEffect = "move"

    const sourceIndex = columns.indexOf(sourceColumn)
    const targetIndex = columns.indexOf(column)
    if (sourceIndex < 0 || targetIndex < 0) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const targetMiddle = bounds.left + bounds.width / 2
    const movingRight = sourceIndex < targetIndex
    const crossedTargetMiddle = movingRight
      ? event.clientX > targetMiddle
      : event.clientX < targetMiddle
    const reorderSignature = `${sourceColumn}:${column}:${sourceIndex}:${targetIndex}`

    if (!crossedTargetMiddle || lastReorderSignatureRef.current === reorderSignature) {
      return
    }

    lastReorderSignatureRef.current = reorderSignature
    onReorder(sourceColumn, column)
  }

  function finishColumnDrag(event: DragEvent<HTMLTableCellElement>) {
    event.preventDefault()
    lastReorderSignatureRef.current = null
    setDraggedColumn(null)
  }

  return (
    <TableHead
      className="relative align-top sticky top-0 z-10 bg-muted/95 backdrop-blur"
      style={{ width, minWidth: width }}
      onDragOver={reorderOnHover}
      onDrop={finishColumnDrag}
    >
      <div
        draggable
        className={`flex h-9 cursor-grab items-center gap-1 rounded-md border bg-background px-2 pr-4 transition-colors active:cursor-grabbing ${receivingDrop ? "border-primary/60 bg-primary/5" : ""
          }`}
        title={`Drag ${column} to reorder`}
        style={{
          viewTransitionName: getColumnTransitionName(
            transitionScope,
            column,
            "header"
          ),
        }}
        onDragEnd={() => {
          lastReorderSignatureRef.current = null
          setDraggedColumn(null)
        }}
        onDragStart={startColumnDrag}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="min-w-0 flex-1 truncate font-semibold">{column}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          draggable={false}
          className="shrink-0"
          title={`Sort ${column}`}
          aria-label={`Sort ${column}`}
          onClick={onSort}
          onDragStart={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {sortState?.column === column ? (
            sortState.direction === "asc" ? (
              <ArrowUpIcon className="size-3.5" />
            ) : (
              <ArrowDownIcon className="size-3.5" />
            )
          ) : (
            <ArrowUpDownIcon className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </div>
      <button
        type="button"
        className="absolute bottom-2 right-0 top-2 z-30 w-3 cursor-col-resize touch-none rounded-sm outline-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/40"
        title={`Resize ${column}`}
        aria-label={`Resize ${column}`}
        onMouseDown={startResize}
      >
        <span className="mx-auto block h-full w-px bg-border" />
      </button>
    </TableHead>
  )
}

function getColumnWidth(widths: Record<string, number>, column: string) {
  return clampColumnWidth(widths[column] ?? DEFAULT_COLUMN_WIDTH)
}

function clampColumnWidth(width: number) {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
}

function runColumnMoveTransition(update: () => void) {
  const documentWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => void
  }

  if (documentWithTransition.startViewTransition) {
    documentWithTransition.startViewTransition(() => {
      flushSync(update)
    })
    return
  }

  update()
}

function getColumnTransitionName(scope: string, column: string, part: string) {
  return `json-lens-${scope}-${part}-${safeTransitionIdent(column)}`
}

function safeTransitionIdent(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }

  const label = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "column"

  return `${label}-${hash.toString(36)}`
}

function getOrderedColumns(columns: string[], columnOrder: string[]) {
  const knownColumns = columnOrder.filter((column) => columns.includes(column))
  const newColumns = columns.filter((column) => !knownColumns.includes(column))

  return [...knownColumns, ...newColumns]
}

function reorderColumns(
  columns: string[],
  sourceColumn: string,
  targetColumn: string
) {
  const sourceIndex = columns.indexOf(sourceColumn)
  const targetIndex = columns.indexOf(targetColumn)

  if (sourceIndex < 0 || targetIndex < 0) return columns

  const next = [...columns]
  const [movedColumn] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, movedColumn)
  return next
}

function JsonSetupPanel() {
  const lens = useJsonLens()
  const firstNestedPath = lens.shapeSummary.candidateArrays[0]?.path

  function changeMode(value: string) {
    const mode = value as RowSourceMode
    if (mode === "nested-path" && !lens.rowSourceConfig.nestedPath && firstNestedPath) {
      lens.setNestedPath(firstNestedPath)
    }
    lens.setRowSourceMode(mode)
  }

  return (
    <Card>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm font-medium">
            Paste JSON
            <Textarea
              className="h-[14rem] resize-y font-mono text-xs leading-5"
              rows={10}
              spellCheck={false}
              value={lens.jsonInput}
              onChange={(event) => lens.setJsonInput(event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Rows come from
              <Select value={lens.rowSourceConfig.mode} onValueChange={changeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROW_SOURCE_LABELS).map(([mode, label]) => (
                    <SelectItem key={mode} value={mode}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Nested array
              <Select
                disabled={!lens.shapeSummary.candidateArrays.length}
                value={lens.rowSourceConfig.nestedPath ?? firstNestedPath ?? ""}
                onValueChange={lens.setNestedPath}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No nested arrays found" />
                </SelectTrigger>
                <SelectContent>
                  {lens.shapeSummary.candidateArrays.map((candidate) => (
                    <SelectItem key={candidate.path} value={candidate.path}>
                      {candidate.label} ({candidate.length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          {/* Interpretation panel pattern: explain the detected JSON shape before applying table controls. */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Detected shape
              </p>
              <h2 className="mt-2 text-lg font-semibold">{lens.shapeSummary.rootType}</h2>
            </div>
            <Badge variant="secondary">{ROW_SOURCE_LABELS[lens.shapeSummary.recommendedMode]}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{lens.shapeSummary.description}</p>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2">
              <span className="text-muted-foreground">Current row source</span>
              <span className="font-medium">{ROW_SOURCE_LABELS[lens.rowSourceConfig.mode]}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2">
              <span className="text-muted-foreground">Columns shown</span>
              <span className="font-medium">
                {lens.columns.length.toLocaleString()} / {lens.allColumnCount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2">
              <span className="text-muted-foreground">Nested arrays</span>
              <span className="font-medium">{lens.shapeSummary.candidateArrays.length}</span>
            </div>
          </div>
          {[...lens.shapeSummary.warnings, lens.columnLimitWarning].filter(Boolean).map((warning) => (
            <p key={warning} className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {warning}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ColumnVisibilityDropdown() {
  const lens = useJsonLens()
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" title="Choose which columns are visible">
          <Columns3Icon data-icon="inline-start" />
          Columns
          <Badge variant="secondary" className="ml-1">
            {lens.visibleColumns.length}/{lens.columns.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[30rem] w-[min(34rem,calc(100vw-2rem))]" align="end">
        <DropdownMenuLabel>Columns, enum mode, and filters</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid gap-1 p-1">
          {lens.columns.map((column) => (
            <FieldControlRow
              key={column}
              activeFilterColumn={activeFilterColumn}
              column={column}
              setActiveFilterColumn={setActiveFilterColumn}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FieldControlRow({
  activeFilterColumn,
  column,
  setActiveFilterColumn,
}: {
  activeFilterColumn: string | null
  column: string
  setActiveFilterColumn: (column: string | null) => void
}) {
  const lens = useJsonLens()
  const visible = !lens.hiddenColumns.has(column)
  const enumMode = lens.enumColumns.has(column)
  const filterOpen = activeFilterColumn === column
  const filterValue = lens.columnFilters[column] ?? ""
  const options = lens.columnValueOptions[column] ?? []

  function toggleVisibility() {
    lens.setHiddenColumns((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  return (
    <FieldControl
      activeFilterColumn={activeFilterColumn}
      column={column}
      enumMode={enumMode}
      filterOpen={filterOpen}
      filterValue={filterValue}
      options={options}
      setActiveFilterColumn={setActiveFilterColumn}
      toggleEnum={() => lens.toggleEnumColumn(column)}
      toggleVisibility={toggleVisibility}
      updateFilter={(value) => lens.updateFilter(column, value)}
      visible={visible}
    />
  )
}

function LocalDataTable({
  title,
  description,
  rows,
  columns,
  copyToast,
}: {
  title: string
  description: string
  rows: FlatRow[]
  columns: string[]
  copyToast: (message: string) => void
}) {
  const controller = useLocalTableController(rows, columns)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const lastReorderSignatureRef = useRef<string | null>(null)
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null)
  const tableWidth = useMemo(
    () =>
      64 +
      controller.visibleColumns.reduce(
        (total, column) => total + getColumnWidth(controller.columnWidths, column),
        0
      ),
    [controller.columnWidths, controller.visibleColumns]
  )
  const activeColumnFilters = Object.entries(controller.columnFilters).filter(
    ([, value]) => value.trim()
  )

  async function copyVisibleTable() {
    await copyText(rowsToCsv(controller.filteredRows, controller.visibleColumns))
    copyToast("Sub table copied as CSV.")
  }

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (target && target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft
    }
  }

  function startDragScroll(event: MouseEvent<HTMLDivElement>) {
    const target = tableScrollRef.current
    if (!target) return

    const dragTarget = target
    const startX = event.pageX
    const startScrollLeft = dragTarget.scrollLeft

    function move(pointerEvent: globalThis.MouseEvent) {
      dragTarget.scrollLeft = startScrollLeft - (pointerEvent.pageX - startX)
      if (topScrollRef.current) topScrollRef.current.scrollLeft = dragTarget.scrollLeft
    }

    function stop() {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseup", stop)
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("mouseup", stop)
  }

  function reorderColumnLive(sourceColumn: string, targetColumn: string) {
    runColumnMoveTransition(() => controller.reorderColumn(sourceColumn, targetColumn))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="block flex-1 text-sm font-medium">
          Search sub table
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search child rows"
              value={controller.globalSearch}
              onChange={(event) => controller.setGlobalSearch(event.target.value)}
            />
          </div>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <LocalColumnDropdown controller={controller} />
          <Badge variant="secondary">
            {controller.filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
          </Badge>
          <Button variant="outline" title="Copy the sub table as CSV" onClick={copyVisibleTable}>
            <ClipboardIcon data-icon="inline-start" />
            Copy CSV
          </Button>
        </div>
      </CardContent>
      {activeColumnFilters.length ? (
        <CardContent className="flex flex-wrap gap-2 border-t pt-3">
          {activeColumnFilters.map(([column, value]) => (
            <Button
              key={column}
              variant="secondary"
              size="sm"
              className="rounded-full"
              title={`Clear ${column} filter`}
              onClick={() => controller.updateFilter(column, "")}
            >
              {column}: {value}
              <XIcon data-icon="inline-end" />
            </Button>
          ))}
        </CardContent>
      ) : null}
      <CardContent className="p-0">
        <div className="border-y bg-muted/30 px-4 py-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <GripHorizontalIcon className="size-3.5" />
            Drag the x-axis or the table to move sideways
          </div>
          <div
            ref={topScrollRef}
            className="overflow-x-auto"
            onScroll={(event) => syncScroll(event.currentTarget, tableScrollRef.current)}
          >
            <div style={{ width: tableWidth, height: 1 }} />
          </div>
        </div>
        <div
          ref={tableScrollRef}
          className="max-h-[48vh] cursor-grab overflow-auto active:cursor-grabbing"
          onMouseDown={startDragScroll}
          onScroll={(event) => syncScroll(event.currentTarget, topScrollRef.current)}
        >
          <Table style={{ width: tableWidth, minWidth: tableWidth }}>
            <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <TableRow>
                <TableHead className="sticky left-0 z-20 w-16 bg-muted">#</TableHead>
                {controller.visibleColumns.map((column) => (
                  <ResizableColumnHead
                    key={column}
                    column={column}
                    columns={controller.visibleColumns}
                    columnWidths={controller.columnWidths}
                    onResize={controller.setColumnWidths}
                    onReorder={reorderColumnLive}
                    onSort={() => controller.toggleSort(column)}
                    draggedColumn={draggedColumn}
                    setDraggedColumn={setDraggedColumn}
                    lastReorderSignatureRef={lastReorderSignatureRef}
                    sortState={controller.sortState}
                    transitionScope="subtable"
                  />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {controller.pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={controller.visibleColumns.length + 1}>
                    <Empty className="border-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <SearchIcon />
                        </EmptyMedia>
                        <EmptyTitle>No matching child rows</EmptyTitle>
                        <EmptyDescription>Adjust sub-table search or filters.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                controller.pagedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="sticky left-0 bg-card font-mono text-xs text-muted-foreground">
                      {row.id}
                    </TableCell>
                    {controller.visibleColumns.map((column) => (
                      <TableCell
                        key={column}
                        className="align-top"
                        style={{
                          width: getColumnWidth(controller.columnWidths, column),
                          minWidth: getColumnWidth(controller.columnWidths, column),
                          viewTransitionName: getColumnTransitionName(
                            "subtable",
                            column,
                            `row-${row.id}`
                          ),
                        }}
                      >
                        <JsonValueCell value={row.flat[column]} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              title="Previous sub-table page"
              onClick={() => controller.setPage((current) => Math.max(1, current - 1))}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Previous
            </Button>
            <Button
              variant="outline"
              title="Next sub-table page"
              onClick={() =>
                controller.setPage((current) => Math.min(controller.totalPages, current + 1))
              }
            >
              Next
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <span className="text-muted-foreground">
              Page {controller.currentPage} of {controller.totalPages}
            </span>
          </div>

          <label className="flex items-center gap-2 text-muted-foreground">
            Rows per page
            <Select value={String(controller.pageSize)} onValueChange={(value) => controller.setPageSize(Number(value))}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}

function LocalColumnDropdown({ controller }: { controller: TableController }) {
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" title="Choose which sub-table columns are visible">
          <Columns3Icon data-icon="inline-start" />
          Columns
          <Badge variant="secondary" className="ml-1">
            {controller.visibleColumns.length}/{controller.columns.length}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[30rem] w-[min(34rem,calc(100vw-2rem))]" align="end">
        <DropdownMenuLabel>Columns, enum mode, and filters</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid gap-1 p-1">
          {controller.columns.map((column) => {
            const visible = !controller.hiddenColumns.has(column)
            const enumMode = controller.enumColumns.has(column)
            const filterOpen = activeFilterColumn === column
            const filterValue = controller.columnFilters[column] ?? ""
            const options = controller.columnValueOptions[column] ?? []

            return (
              <FieldControl
                key={column}
                activeFilterColumn={activeFilterColumn}
                column={column}
                enumMode={enumMode}
                filterOpen={filterOpen}
                filterValue={filterValue}
                options={options}
                setActiveFilterColumn={setActiveFilterColumn}
                toggleEnum={() => controller.toggleEnumColumn(column)}
                toggleVisibility={() =>
                  controller.setHiddenColumns((current) => {
                    const next = new Set(current)
                    if (next.has(column)) next.delete(column)
                    else next.add(column)
                    return next
                  })
                }
                updateFilter={(value) => controller.updateFilter(column, value)}
                visible={visible}
              />
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FieldControl({
  column,
  enumMode,
  filterOpen,
  filterValue,
  options,
  setActiveFilterColumn,
  toggleEnum,
  toggleVisibility,
  updateFilter,
  visible,
}: {
  activeFilterColumn: string | null
  column: string
  enumMode: boolean
  filterOpen: boolean
  filterValue: string
  options: string[]
  setActiveFilterColumn: (column: string | null) => void
  toggleEnum: () => void
  toggleVisibility: () => void
  updateFilter: (value: string) => void
  visible: boolean
}) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
        <Button
          type="button"
          variant={visible ? "secondary" : "ghost"}
          size="icon-sm"
          title={visible ? `Hide ${column}` : `Show ${column}`}
          aria-label={visible ? `Hide ${column}` : `Show ${column}`}
          onClick={toggleVisibility}
        >
          {visible ? <EyeIcon /> : <EyeOffIcon />}
        </Button>
        <span className="truncate text-sm font-medium">{column}</span>
        <Button
          type="button"
          variant={enumMode ? "default" : "outline"}
          size="sm"
          className="w-8 px-0 font-semibold"
          title={`${column} is ${enumMode ? "using" : "not using"} enumerated value filtering`}
          aria-label={`Toggle enum mode for ${column}`}
          onClick={toggleEnum}
        >
          E
        </Button>
        <Button
          type="button"
          variant={filterOpen || filterValue ? "secondary" : "outline"}
          size="icon-sm"
          title={`Filter ${column}`}
          aria-label={`Filter ${column}`}
          onClick={() => setActiveFilterColumn(filterOpen ? null : column)}
        >
          <FilterIcon />
        </Button>
      </div>

      {filterOpen ? (
        <div className="mt-2 grid gap-2 border-t pt-2">
          {enumMode ? (
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={filterValue}
              onChange={(event) => updateFilter(event.target.value)}
              title={`Select ${column} value`}
            >
              <option value="">Any value</option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : (
            <Input
              className="h-8"
              autoFocus
              placeholder={`Filter ${column}`}
              value={filterValue}
              onChange={(event) => updateFilter(event.target.value)}
            />
          )}
          {filterValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              title={`Clear ${column} filter`}
              onClick={() => updateFilter("")}
            >
              <XIcon data-icon="inline-start" />
              Clear filter
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function useLocalTableController(rows: FlatRow[], columns: string[]): TableController {
  const [globalSearch, setGlobalSearchValue] = useState("")
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [enumColumns, setEnumColumns] = useState<Set<string>>(new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [sortState, setSortState] = useState<SortState>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeValue] = useState(25)
  const columnValueOptions = useMemo(() => getColumnValueOptions(rows, columns), [rows, columns])
  const orderedColumns = useMemo(
    () => getOrderedColumns(columns, columnOrder),
    [columnOrder, columns]
  )
  const visibleColumns = orderedColumns.filter((column) => !hiddenColumns.has(column))

  const filteredRows = useMemo(() => {
    const search = globalSearch.trim().toLowerCase()

    let nextRows = rows.filter((row) => {
      const values = Object.values(row.flat).map((value) =>
        (displayValue(value) || "(blank)").toLowerCase()
      )
      const globalMatch =
        !search || values.some((value) => value.includes(search))
      const columnMatch = Object.entries(columnFilters).every(([column, filter]) => {
        if (!columns.includes(column)) return true
        const needle = filter.trim().toLowerCase()
        if (!needle) return true

        const haystack = (displayValue(row.flat[column]) || "(blank)").toLowerCase()
        return enumColumns.has(column) ? haystack === needle : haystack.includes(needle)
      })

      return globalMatch && columnMatch
    })

    if (sortState) {
      nextRows = [...nextRows].sort((a, b) => {
        const result = compareValues(a.flat[sortState.column], b.flat[sortState.column])
        return sortState.direction === "asc" ? result : result * -1
      })
    }

    return nextRows
  }, [columnFilters, columns, enumColumns, globalSearch, rows, sortState])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function setGlobalSearch(value: string) {
    setGlobalSearchValue(value)
    setPage(1)
  }

  function setPageSize(value: number) {
    setPageSizeValue(value)
    setPage(1)
  }

  function toggleEnumColumn(column: string) {
    setEnumColumns((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  function updateFilter(column: string, value: string) {
    setColumnFilters((current) => ({ ...current, [column]: value }))
    setPage(1)
  }

  function toggleSort(column: string) {
    setSortState((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" }
      if (current.direction === "asc") return { column, direction: "desc" }
      return null
    })
    setPage(1)
  }

  function reorderColumn(sourceColumn: string, targetColumn: string) {
    if (sourceColumn === targetColumn) return

    setColumnOrder((current) =>
      reorderColumns(getOrderedColumns(columns, current), sourceColumn, targetColumn)
    )
  }

  return {
    rows,
    columns: orderedColumns,
    visibleColumns,
    columnWidths,
    filteredRows,
    pagedRows,
    columnFilters,
    columnValueOptions,
    enumColumns,
    hiddenColumns,
    pageSize,
    currentPage,
    totalPages,
    sortState,
    globalSearch,
    reorderColumn,
    setGlobalSearch,
    setColumnWidths,
    setHiddenColumns,
    toggleEnumColumn,
    toggleSort,
    updateFilter,
    setPage,
    setPageSize,
  }
}

function buildSubTableRows(
  rows: FlatRow[],
  arrayColumn: string,
  parentIdColumn: string
): FlatRow[] {
  if (!arrayColumn) return []

  const childRows: FlatRow[] = []

  rows.forEach((parentRow) => {
    const items = parentRow.flat[arrayColumn]
    if (!Array.isArray(items)) return

    items.forEach((item, itemIndex) => {
      const parentId = parentIdColumn ? parentRow.flat[parentIdColumn] : parentRow.id
      const parentKey = parentIdColumn || "parentRow"
      const childFlat = isRecord(item) ? flattenValue(item) : { value: item }

      // Sub-table pattern: child rows keep a stable parent identifier for later joins/exports.
      childRows.push({
        id: childRows.length + 1,
        original: item,
        flat: {
          [parentKey]: parentId,
          parentRow: parentRow.id,
          itemIndex: itemIndex + 1,
          ...childFlat,
        },
      })
    })
  })

  return childRows
}
