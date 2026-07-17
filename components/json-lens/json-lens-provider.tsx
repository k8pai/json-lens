"use client"

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type ReactNode,
  type SetStateAction,
} from "react"

import {
  compareValues,
  computeStats,
  countJsonStats,
  displayValue,
  generateTypes,
  getColumns,
  normalizeRows,
  parseJson,
  SAMPLE_JSON,
  stringifyPretty,
  type FlatRow,
  type SortState,
} from "@/lib/json-lens"

type JsonLensContextValue = {
  jsonInput: string
  setJsonInput: Dispatch<SetStateAction<string>>
  parseResult: ReturnType<typeof parseJson>
  rows: FlatRow[]
  columns: string[]
  orderedColumns: string[]
  visibleColumns: string[]
  columnFilters: Record<string, string>
  columnValueOptions: Record<string, string[]>
  columnWidths: Record<string, number>
  currentPage: number
  filteredRows: FlatRow[]
  globalSearch: string
  hiddenColumns: Set<string>
  enumColumns: Set<string>
  jsonStats: ReturnType<typeof countJsonStats> | null
  pageSize: number
  pagedRows: FlatRow[]
  sortState: SortState
  stats: ReturnType<typeof computeStats>
  toast: string
  totalPages: number
  typeScript: string
  fileInputRef: RefObject<HTMLInputElement | null>
  beautifyJson: () => void
  handleFile: (file: File) => void
  loadSample: () => void
  minifyJson: () => void
  moveColumn: (column: string, direction: -1 | 1) => void
  notify: (message: string) => void
  setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>
  setGlobalSearch: (value: string) => void
  setHiddenColumns: Dispatch<SetStateAction<Set<string>>>
  toggleEnumColumn: (column: string) => void
  setPage: Dispatch<SetStateAction<number>>
  setPageSize: (value: number) => void
  toggleSort: (column: string) => void
  updateFilter: (column: string, value: string) => void
}

const JsonLensContext = createContext<JsonLensContextValue | null>(null)

export function JsonLensProvider({ children }: { children: ReactNode }) {
  const [jsonInput, setJsonInput] = useState(SAMPLE_JSON)
  const [globalSearchValue, setGlobalSearchValue] = useState("")
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [sortState, setSortState] = useState<SortState>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [enumColumns, setEnumColumns] = useState<Set<string>>(new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [pageSizeValue, setPageSizeValue] = useState(25)
  const [toast, setToast] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const parseResult = useMemo(() => parseJson(jsonInput), [jsonInput])
  const rows = useMemo(
    () => (parseResult.error ? [] : normalizeRows(parseResult.value)),
    [parseResult]
  )
  const columns = useMemo(() => getColumns(rows), [rows])
  const orderedColumns = useMemo(() => {
    const known = columnOrder.filter((column) => columns.includes(column))
    const newColumns = columns.filter((column) => !known.includes(column))

    return [...known, ...newColumns]
  }, [columnOrder, columns])
  const visibleColumns = orderedColumns.filter((column) => !hiddenColumns.has(column))
  // Data-grid pattern: compute enum choices once per parsed dataset so filter controls stay presentation-only.
  const columnValueOptions = useMemo(() => {
    return Object.fromEntries(
      columns.map((column) => {
        const values = Array.from(
          rows.reduce((set, row) => {
            const value = displayValue(row.flat[column]) || "(blank)"
            set.add(value)
            return set
          }, new Set<string>())
        )
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .slice(0, 250)

        return [column, values]
      })
    )
  }, [columns, rows])
  const stats = useMemo(() => computeStats(rows, columns), [rows, columns])
  const typeScript = useMemo(
    () => (parseResult.error ? "" : generateTypes(parseResult.value, "Root")),
    [parseResult]
  )
  const jsonStats = useMemo(
    () => (parseResult.error ? null : countJsonStats(parseResult.value)),
    [parseResult]
  )

  const filteredRows = useMemo(() => {
    const search = globalSearchValue.trim().toLowerCase()

    let nextRows = rows.filter((row) => {
      const values = Object.values(row.flat).map((value) =>
        (displayValue(value) || "(blank)").toLowerCase()
      )
      const globalMatch =
        !search || values.some((value) => value.includes(search))
      const columnMatch = Object.entries(columnFilters).every(([column, filter]) => {
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
  }, [columnFilters, enumColumns, globalSearchValue, rows, sortState])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSizeValue))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * pageSizeValue,
    currentPage * pageSizeValue
  )

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(""), 2200)
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".json")) {
      notify("Please choose a .json file.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setJsonInput(String(reader.result ?? ""))
      setPage(1)
      notify(`Loaded ${file.name}`)
    }
    reader.readAsText(file)
  }

  function loadSample() {
    setJsonInput(SAMPLE_JSON)
    setPage(1)
    notify("Sample JSON loaded.")
  }

  function updateFilter(column: string, value: string) {
    setColumnFilters((current) => ({ ...current, [column]: value }))
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

  function setGlobalSearch(value: string) {
    setGlobalSearchValue(value)
    setPage(1)
  }

  function setPageSize(value: number) {
    setPageSizeValue(value)
    setPage(1)
  }

  function toggleSort(column: string) {
    setSortState((current) => {
      if (!current || current.column !== column) {
        return { column, direction: "asc" }
      }
      if (current.direction === "asc") {
        return { column, direction: "desc" }
      }
      return null
    })
    setPage(1)
  }

  function moveColumn(column: string, direction: -1 | 1) {
    setColumnOrder(() => {
      const index = orderedColumns.indexOf(column)
      const target = index + direction
      if (index < 0 || target < 0 || target >= orderedColumns.length) {
        return orderedColumns
      }

      const next = [...orderedColumns]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function beautifyJson() {
    const result = parseJson(jsonInput)
    if (result.error) {
      notify("Fix the JSON before beautifying.")
      return
    }

    setJsonInput(stringifyPretty(result.value))
  }

  function minifyJson() {
    const result = parseJson(jsonInput)
    if (result.error) {
      notify("Fix the JSON before minifying.")
      return
    }

    setJsonInput(JSON.stringify(result.value))
  }

  return (
    <JsonLensContext.Provider
      value={{
        jsonInput,
        setJsonInput,
        parseResult,
        rows,
        columns,
        orderedColumns,
        visibleColumns,
        columnFilters,
        columnValueOptions,
        columnWidths,
        currentPage,
        filteredRows,
        globalSearch: globalSearchValue,
        hiddenColumns,
        enumColumns,
        jsonStats,
        pageSize: pageSizeValue,
        pagedRows,
        sortState,
        stats,
        toast,
        totalPages,
        typeScript,
        fileInputRef,
        beautifyJson,
        handleFile,
        loadSample,
        minifyJson,
        moveColumn,
        notify,
        setColumnWidths,
        setGlobalSearch,
        setHiddenColumns,
        toggleEnumColumn,
        setPage,
        setPageSize,
        toggleSort,
        updateFilter,
      }}
    >
      {children}
    </JsonLensContext.Provider>
  )
}

export function useJsonLens() {
  const context = useContext(JsonLensContext)

  if (!context) {
    throw new Error("useJsonLens must be used inside JsonLensProvider")
  }

  return context
}
