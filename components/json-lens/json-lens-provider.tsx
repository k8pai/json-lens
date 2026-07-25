"use client"

import {
  createContext,
  useEffect,
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
  createJsonLensProcessedData,
  createJsonLensProcessedDataWithConfig,
  displayValue,
  parseJson,
  SAMPLE_JSON,
  stringifyPretty,
  type FlatRow,
  type JsonLensProcessedData,
  type ProcessingUpdate,
  type RowSourceConfig,
  type RowSourceMode,
  type SortState,
} from "@/lib/json-lens"
import type { WorkerResponse } from "@/lib/json-lens.worker"

const LARGE_INPUT_BYTES = 5 * 1024 * 1024
const PREVIEW_ROW_LIMIT = 1000
const WORKSPACE_STORAGE_PREFIX = "json-lens:view"
const initialProcessedData = createJsonLensProcessedData(SAMPLE_JSON)

type SavedWorkspaceView = {
  columnFilters?: Record<string, string>
  columnOrder?: string[]
  columnWidths?: Record<string, number>
  enumColumns?: string[]
  globalSearch?: string
  hiddenColumns?: string[]
  pageSize?: number
  processFullDataset?: boolean
  rowSourceConfig?: RowSourceConfig
}

type JsonLensContextValue = {
  jsonInput: string
  setJsonInput: Dispatch<SetStateAction<string>>
  parseResult: JsonLensProcessedData["parseResult"]
  rows: FlatRow[]
  columns: string[]
  allColumnCount: number
  arrayColumnCandidates: JsonLensProcessedData["arrayColumnCandidates"]
  orderedColumns: string[]
  visibleColumns: string[]
  columnFilters: Record<string, string>
  columnLimitWarning: string | null
  columnValueOptions: Record<string, string[]>
  columnWidths: Record<string, number>
  currentPage: number
  filteredRows: FlatRow[]
  globalSearch: string
  hiddenColumns: Set<string>
  enumColumns: Set<string>
  jsonStats: JsonLensProcessedData["jsonStats"]
  isProcessing: boolean
  inputBytes: number
  inputSizeLabel: string
  largeInputWarning: string | null
  largeDataMode: boolean
  pageSize: number
  pagedRows: FlatRow[]
  processFullDataset: boolean
  processingProgress: ProcessingUpdate | null
  processingProgressLabel: string
  rowSourceConfig: RowSourceConfig
  sortState: SortState
  stats: JsonLensProcessedData["stats"]
  deferredStats: boolean
  isPreview: boolean
  processingWarnings: string[]
  toast: string
  totalPages: number
  totalRows: number
  typeScript: string
  sourceSummary: string
  shapeSummary: JsonLensProcessedData["shapeSummary"]
  fileInputRef: RefObject<HTMLInputElement | null>
  beautifyJson: () => void
  handleFile: (file: File) => void
  loadSample: () => void
  minifyJson: () => void
  moveColumn: (column: string, direction: -1 | 1) => void
  notify: (message: string) => void
  reorderColumn: (sourceColumn: string, targetColumn: string) => void
  setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>
  setGlobalSearch: (value: string) => void
  setHiddenColumns: Dispatch<SetStateAction<Set<string>>>
  setNestedPath: (path: string) => void
  setProcessFullDataset: Dispatch<SetStateAction<boolean>>
  setRowSourceMode: (mode: RowSourceMode) => void
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
  const [appliedGlobalSearchValue, setAppliedGlobalSearchValue] = useState("")
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [sortState, setSortState] = useState<SortState>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [enumColumns, setEnumColumns] = useState<Set<string>>(new Set())
  const [columnOrder, setColumnOrder] = useState<string[]>([])
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [pageSizeValue, setPageSizeValue] = useState(25)
  const [toast, setToast] = useState("")
  const [processedData, setProcessedData] =
    useState<JsonLensProcessedData>(initialProcessedData)
  const [rowSourceConfig, setRowSourceConfig] = useState<RowSourceConfig>({
    mode: "auto",
    columnLimit: 200,
  })
  const [processFullDataset, setProcessFullDataset] = useState(false)
  const [processingProgress, setProcessingProgress] =
    useState<ProcessingUpdate | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)

  const inputBytes = useMemo(() => new Blob([jsonInput]).size, [jsonInput])
  const inputSizeLabel = useMemo(() => formatBytes(inputBytes), [inputBytes])
  const largeInputWarning =
    inputBytes >= LARGE_INPUT_BYTES
      ? `Large input (${inputSizeLabel}). JSON Lens will process it in the background; filtering and exports may still take longer.`
      : null
  const largeDataMode = inputBytes >= LARGE_INPUT_BYTES
  const effectiveRowSourceConfig = useMemo<RowSourceConfig>(
    () => ({
      ...rowSourceConfig,
      deferHeavyWork: largeDataMode && !processFullDataset,
      previewRowLimit:
        largeDataMode && !processFullDataset ? PREVIEW_ROW_LIMIT : undefined,
    }),
    [largeDataMode, processFullDataset, rowSourceConfig]
  )
  const processingProgressLabel = processingProgress
    ? `${processingProgress.message} (${processingProgress.progress}%)`
    : isProcessing
      ? "Processing JSON"
      : "Idle"
  const workspaceStorageKey = useMemo(
    () => `${WORKSPACE_STORAGE_PREFIX}:${fingerprintJsonInput(jsonInput)}`,
    [jsonInput]
  )

  useEffect(() => {
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return

      const savedView = readSavedWorkspaceView(workspaceStorageKey)
      if (!savedView) return

      setColumnFilters(savedView.columnFilters ?? {})
      setColumnOrder(savedView.columnOrder ?? [])
      setColumnWidths(savedView.columnWidths ?? {})
      setEnumColumns(new Set(savedView.enumColumns ?? []))
      setGlobalSearchValue(savedView.globalSearch ?? "")
      setHiddenColumns(new Set(savedView.hiddenColumns ?? []))
      setPageSizeValue(savedView.pageSize ?? 25)
      setProcessFullDataset(Boolean(savedView.processFullDataset))
      setRowSourceConfig(savedView.rowSourceConfig ?? { mode: "auto", columnLimit: 200 })
      setPage(1)
    })

    return () => {
      cancelled = true
    }
  }, [workspaceStorageKey])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeSavedWorkspaceView(workspaceStorageKey, {
        columnFilters,
        columnOrder,
        columnWidths,
        enumColumns: Array.from(enumColumns),
        globalSearch: globalSearchValue,
        hiddenColumns: Array.from(hiddenColumns),
        pageSize: pageSizeValue,
        processFullDataset,
        rowSourceConfig,
      })
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [
    columnFilters,
    columnOrder,
    columnWidths,
    enumColumns,
    globalSearchValue,
    hiddenColumns,
    pageSizeValue,
    processFullDataset,
    rowSourceConfig,
    workspaceStorageKey,
  ])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setAppliedGlobalSearchValue(globalSearchValue)
    }, 180)

    return () => window.clearTimeout(timeout)
  }, [globalSearchValue])

  useEffect(() => {
    let cancelled = false
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const delay = inputBytes >= LARGE_INPUT_BYTES ? 450 : 120
    const timeout = window.setTimeout(() => {
      setIsProcessing(true)
      setProcessingProgress({
        stage: "parse",
        message: "Queued JSON processing",
        progress: 1,
      })

      if (typeof Worker === "undefined") {
        window.setTimeout(() => {
          if (cancelled) return
          setProcessedData(
            createJsonLensProcessedDataWithConfig(
              jsonInput,
              effectiveRowSourceConfig,
              setProcessingProgress
            )
          )
          setIsProcessing(false)
        }, 0)
        return
      }

      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL("../../lib/json-lens.worker.ts", import.meta.url),
          { type: "module" }
        )
      }

      const worker = workerRef.current
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data
        if (cancelled || response.id !== requestId) return

        if (response.ok && response.type === "progress") {
          setProcessingProgress(response.progress)
          return
        }

        if (response.ok && response.type === "result") {
          setProcessedData(response.data)
        } else {
          setProcessedData(createErrorProcessedData(response.error, effectiveRowSourceConfig))
        }
        setIsProcessing(false)
      }
      worker.onerror = (event) => {
        if (cancelled) return
        setProcessedData(createErrorProcessedData(event.message, effectiveRowSourceConfig))
        setIsProcessing(false)
      }
      worker.postMessage({
        id: requestId,
        input: jsonInput,
        config: effectiveRowSourceConfig,
      })
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [effectiveRowSourceConfig, inputBytes, jsonInput])

  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  const {
    parseResult,
    rows,
    totalRows,
    columns,
    allColumnCount,
    arrayColumnCandidates,
    columnLimitWarning,
    columnValueOptions,
    deferredStats,
    isPreview,
    processingWarnings,
    shapeSummary,
    stats,
    typeScript,
    jsonStats,
    sourceSummary,
  } = processedData
  const orderedColumns = useMemo(() => {
    const known = columnOrder.filter((column) => columns.includes(column))
    const newColumns = columns.filter((column) => !known.includes(column))

    return [...known, ...newColumns]
  }, [columnOrder, columns])
  const visibleColumns = orderedColumns.filter((column) => !hiddenColumns.has(column))
  const filteredRows = useMemo(() => {
    const search = appliedGlobalSearchValue.trim().toLowerCase()

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
  }, [appliedGlobalSearchValue, columnFilters, enumColumns, rows, sortState])

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

  function resetTableControls() {
    setColumnFilters({})
    setHiddenColumns(new Set())
    setEnumColumns(new Set())
    setColumnOrder([])
    setPage(1)
  }

  function setRowSourceMode(mode: RowSourceMode) {
    setRowSourceConfig((current) => ({ ...current, mode }))
    resetTableControls()
  }

  function setNestedPath(path: string) {
    setRowSourceConfig((current) => ({ ...current, nestedPath: path }))
    resetTableControls()
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

  function reorderColumn(sourceColumn: string, targetColumn: string) {
    if (sourceColumn === targetColumn) return

    setColumnOrder(() => {
      const sourceIndex = orderedColumns.indexOf(sourceColumn)
      const targetIndex = orderedColumns.indexOf(targetColumn)

      if (sourceIndex < 0 || targetIndex < 0) return orderedColumns

      const next = [...orderedColumns]
      const [movedColumn] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, movedColumn)
      return next
    })
  }

  function beautifyJson() {
    if (inputBytes >= LARGE_INPUT_BYTES) {
      notify("Beautify is disabled for large JSON to keep the page responsive.")
      return
    }

    const result = parseJson(jsonInput)
    if (result.error) {
      notify("Fix the JSON before beautifying.")
      return
    }

    setJsonInput(stringifyPretty(result.value))
  }

  function minifyJson() {
    if (inputBytes >= LARGE_INPUT_BYTES) {
      notify("Minify is disabled for large JSON to keep the page responsive.")
      return
    }

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
        allColumnCount,
        arrayColumnCandidates,
        orderedColumns,
        visibleColumns,
        columnFilters,
        columnLimitWarning,
        columnValueOptions,
        columnWidths,
        currentPage,
        filteredRows,
        globalSearch: globalSearchValue,
        hiddenColumns,
        enumColumns,
        jsonStats,
        isProcessing,
        inputBytes,
        inputSizeLabel,
        largeInputWarning,
        largeDataMode,
        pageSize: pageSizeValue,
        pagedRows,
        processFullDataset,
        processingProgress,
        processingProgressLabel,
        rowSourceConfig,
        sortState,
        stats,
        deferredStats,
        isPreview,
        processingWarnings,
        toast,
        totalPages,
        totalRows,
        typeScript,
        sourceSummary,
        shapeSummary,
        fileInputRef,
        beautifyJson,
        handleFile,
        loadSample,
        minifyJson,
        moveColumn,
        notify,
        reorderColumn,
        setColumnWidths,
        setGlobalSearch,
        setHiddenColumns,
        setNestedPath,
        setProcessFullDataset,
        setRowSourceMode,
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

function createErrorProcessedData(
  message: string,
  rowSource: RowSourceConfig
): JsonLensProcessedData {
  return {
    parseResult: { value: null, error: message },
    rows: [],
    totalRows: 0,
    columns: [],
    allColumnCount: 0,
    arrayColumnCandidates: [],
    columnLimitWarning: null,
    columnValueOptions: {},
    deferredStats: false,
    isPreview: false,
    processingWarnings: [],
    rowSource,
    shapeSummary: {
      rootType: "Needs JSON",
      description: message,
      recommendedMode: "auto",
      candidateArrays: [],
      warnings: [],
    },
    stats: [],
    typeScript: "",
    jsonStats: null,
    sourceSummary: "Needs JSON",
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fingerprintJsonInput(input: string) {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `${input.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

function readSavedWorkspaceView(key: string): SavedWorkspaceView | null {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as SavedWorkspaceView) : null
  } catch {
    return null
  }
}

function writeSavedWorkspaceView(key: string, value: SavedWorkspaceView) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Persistence pattern: local storage is opportunistic and must not block table use.
  }
}
