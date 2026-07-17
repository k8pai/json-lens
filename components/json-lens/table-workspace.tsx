"use client"

import { useMemo, useRef, useState, type MouseEvent } from "react"
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
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { copyText, rowsToCsv } from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"
import { JsonValueCell } from "./shared"

export function TableWorkspace() {
  const lens = useJsonLens()
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableWidth = useMemo(
    () =>
      64 +
      lens.visibleColumns.reduce(
        (total, column) => total + (lens.columnWidths[column] ?? 190),
        0
      ),
    [lens.columnWidths, lens.visibleColumns]
  )
  const activeColumnFilters = Object.entries(lens.columnFilters).filter(
    ([, value]) => value.trim()
  )

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

  return (
    <section className="min-w-0 space-y-4">
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
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 w-16 bg-muted">#</TableHead>
                    {lens.visibleColumns.map((column) => (
                      <TableHead
                        key={column}
                        className="align-top"
                        style={{
                          width: lens.columnWidths[column] ?? 190,
                          minWidth: lens.columnWidths[column] ?? 190,
                        }}
                      >
                        <Button
                          variant="ghost"
                          className="h-9 w-full justify-between gap-2 rounded-md border bg-background px-2 text-left"
                          title={`Sort ${column}`}
                          onClick={() => lens.toggleSort(column)}
                        >
                          <span className="min-w-0 truncate font-semibold">{column}</span>
                          {lens.sortState?.column === column ? (
                            lens.sortState.direction === "asc" ? (
                              <ArrowUpIcon className="size-3.5 shrink-0" />
                            ) : (
                              <ArrowDownIcon className="size-3.5 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </Button>
                      </TableHead>
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
                          <TableCell key={column} className="align-top">
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
    </section>
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
          onClick={() => lens.toggleEnumColumn(column)}
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
              onChange={(event) => lens.updateFilter(column, event.target.value)}
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
              onChange={(event) => lens.updateFilter(column, event.target.value)}
            />
          )}
          {filterValue ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              title={`Clear ${column} filter`}
              onClick={() => lens.updateFilter(column, "")}
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
