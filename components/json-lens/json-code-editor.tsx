"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { json } from "@codemirror/lang-json"
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  type Extension,
} from "@codemirror/state"
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as editorPlaceholder,
  type DecorationSet,
} from "@codemirror/view"
import {
  BracesIcon,
  ClipboardIcon,
  KeyRoundIcon,
  RouteIcon,
} from "lucide-react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { copyText } from "@/lib/json-lens"
import {
  buildJsonSourceMap,
  type JsonPathRange,
  type JsonTextRange,
} from "@/lib/json-source-map"
import { cn } from "@/lib/utils"

export type JsonEditorMarkerKind =
  | "validation-error"
  | "validation-warning"
  | "diff-added"
  | "diff-removed"
  | "diff-changed"
  | "diff-type"
  | "diff-null"
  | "diff-array-count"
  | "navigation-match"

export type JsonEditorMarker = {
  id: string
  kind: JsonEditorMarkerKind
  from: number
  to: number
  message?: string
}

export type JsonEditorSelectionContext = {
  from: number
  to: number
  selectedText: string
  path?: string
  valueText?: string
  propertyText?: string
}

export type JsonEditorContextAction = {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  onSelect: (context: JsonEditorSelectionContext) => void
}

const EMPTY_CONTEXT_ACTIONS: JsonEditorContextAction[] = []

type JsonCodeEditorProps = {
  "aria-label": string
  value: string
  markers?: JsonEditorMarker[]
  activeMarkerId?: string
  className?: string
  placeholder?: string
  readOnly?: boolean
  contextActions?: JsonEditorContextAction[]
  onContextCopy?: (message: string) => void
  onChange: (value: string) => void
}

export function JsonCodeEditor({
  "aria-label": ariaLabel,
  value,
  markers = [],
  activeMarkerId,
  className,
  placeholder,
  readOnly = false,
  contextActions = EMPTY_CONTEXT_ACTIONS,
  onContextCopy,
  onChange,
}: JsonCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const [context, setContext] = useState<JsonEditorSelectionContext>({
    from: 0,
    to: 0,
    selectedText: "",
  })
  const editable = !readOnly
  const initialAriaLabelRef = useRef(ariaLabel)
  const initialEditableRef = useRef(editable)
  const initialMarkersRef = useRef(markers)
  const initialPlaceholderRef = useRef(placeholder)
  const initialValueRef = useRef(value)
  const markerHash = useMemo(() => hashMarkers(markers), [markers])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: createEditorExtensions({
          ariaLabel: initialAriaLabelRef.current,
          editable: initialEditableRef.current,
          markers: initialMarkersRef.current,
          placeholder: initialPlaceholderRef.current,
          onChange: (nextValue) => onChangeRef.current(nextValue),
        }),
      }),
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue === value) return

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: markerFacet.reconfigure(createMarkerExtension(markers)),
    })
  }, [markerHash, markers])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: editableFacet.reconfigure(createEditableExtension(editable)),
    })
  }, [editable])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeMarkerId) return

    const marker = markers.find((item) => item.id === activeMarkerId)
    if (!marker) return

    const docLength = view.state.doc.length
    const from = Math.min(Math.max(0, marker.from), docLength)
    const to = Math.min(Math.max(from, marker.to), docLength)

    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    })
  }, [activeMarkerId, markerHash, markers])

  function prepareContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const view = viewRef.current
    if (!view) return

    const clickedPosition = view.posAtCoords({ x: event.clientX, y: event.clientY })
    const currentSelection = view.state.selection.main
    const clickedInsideSelection =
      clickedPosition !== null &&
      !currentSelection.empty &&
      clickedPosition >= currentSelection.from &&
      clickedPosition <= currentSelection.to
    const cursor = clickedPosition ?? currentSelection.head
    const document = view.state.doc.toString()
    const sourceMap = buildJsonSourceMap(document)
    const pathRange = findSmallestPathRange(
      sourceMap ? Array.from(sourceMap.ranges.values()) : [],
      clickedInsideSelection ? currentSelection.from : cursor,
      clickedInsideSelection ? currentSelection.to : cursor
    )

    let from = clickedInsideSelection ? currentSelection.from : cursor
    let to = clickedInsideSelection ? currentSelection.to : cursor

    if (!clickedInsideSelection && pathRange && pathRange.path !== "$") {
      from = pathRange.valueRange.from
      to = pathRange.valueRange.to
      view.dispatch({ selection: { anchor: from, head: to } })
    } else if (!clickedInsideSelection) {
      view.dispatch({ selection: { anchor: cursor } })
    }

    setContext({
      from,
      to,
      selectedText: document.slice(from, to),
      path: pathRange?.path,
      valueText: sliceRange(document, pathRange?.valueRange),
      propertyText: sliceRange(document, pathRange?.propertyRange),
    })
  }

  async function copyContextValue(text: string | undefined, message: string) {
    if (!text) return
    await copyText(text)
    onContextCopy?.(message)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={hostRef}
          className={cn(
            "json-code-editor h-[56vh] min-h-80 max-h-[840px] overflow-auto rounded-md border bg-background font-mono text-sm leading-6",
            className
          )}
          onContextMenu={prepareContextMenu}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="truncate" title={context.path}>
          {context.path ?? "JSON selection"}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!context.selectedText}
          onSelect={() => copyContextValue(context.selectedText, "Selected JSON copied.")}
        >
          <ClipboardIcon />
          Copy selection
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!context.valueText}
          onSelect={() => copyContextValue(context.valueText, "JSON value copied.")}
        >
          <BracesIcon />
          Copy JSON value
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!context.propertyText}
          onSelect={() => copyContextValue(context.propertyText, "JSON property copied.")}
        >
          <KeyRoundIcon />
          Copy property
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!context.path}
          onSelect={() => copyContextValue(context.path, "JSON path copied.")}
        >
          <RouteIcon />
          Copy JSON path
        </ContextMenuItem>
        {contextActions.length ? <ContextMenuSeparator /> : null}
        {contextActions.map((action) => (
          <ContextMenuItem
            key={action.id}
            disabled={action.disabled}
            onSelect={() => action.onSelect(context)}
          >
            {action.icon}
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

const markerFacet = new Compartment()
const editableFacet = new Compartment()

function createEditorExtensions({
  ariaLabel,
  editable,
  markers,
  placeholder,
  onChange,
}: {
  ariaLabel: string
  editable: boolean
  markers: JsonEditorMarker[]
  placeholder?: string
  onChange: (value: string) => void
}): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    json(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
    editableFacet.of(createEditableExtension(editable)),
    EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    placeholder ? editorPlaceholder(placeholder) : [],
    markerFacet.of(createMarkerExtension(markers)),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString())
    }),
    EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "0.875rem",
      },
      ".cm-scroller": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        lineHeight: "1.5rem",
      },
      ".cm-content": {
        minHeight: "100%",
        paddingBlock: "0.75rem",
      },
      ".cm-line": {
        paddingInline: "0.75rem",
      },
      ".cm-gutters": {
        backgroundColor: "color-mix(in oklab, var(--muted) 45%, transparent)",
        borderRight: "1px solid var(--border)",
        color: "var(--muted-foreground)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--muted)",
        color: "var(--foreground)",
      },
      ".cm-selectionBackground": {
        backgroundColor:
          "color-mix(in oklab, var(--primary) 18%, transparent) !important",
      },
      ".cm-placeholder": {
        color: "var(--muted-foreground)",
      },
      ".json-editor-line-marker": {
        boxShadow:
          "inset 3px 0 0 color-mix(in oklab, var(--primary) 40%, transparent)",
      },
      ".json-editor-marker": {
        borderRadius: "3px",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      },
      ".json-editor-marker--validation-error": {
        backgroundColor:
          "color-mix(in oklab, var(--destructive) 16%, transparent)",
        textDecoration: "underline wavy var(--destructive)",
        textUnderlineOffset: "3px",
      },
      ".json-editor-marker--validation-warning": {
        backgroundColor: "hsl(38 92% 50% / 0.18)",
        textDecoration: "underline wavy hsl(38 92% 45%)",
        textUnderlineOffset: "3px",
      },
      ".json-editor-marker--diff-added": {
        backgroundColor: "hsl(151 65% 42% / 0.18)",
      },
      ".json-editor-marker--diff-removed": {
        backgroundColor:
          "color-mix(in oklab, var(--destructive) 14%, transparent)",
      },
      ".json-editor-marker--diff-changed": {
        backgroundColor: "hsl(38 92% 50% / 0.2)",
      },
      ".json-editor-marker--diff-type, .json-editor-marker--diff-null": {
        backgroundColor: "hsl(221 83% 53% / 0.16)",
        outline: "1px solid hsl(221 83% 53% / 0.35)",
      },
      ".json-editor-marker--diff-array-count": {
        backgroundColor: "hsl(188 75% 42% / 0.16)",
        outline: "1px solid hsl(188 75% 42% / 0.32)",
      },
      ".json-editor-marker--navigation-match": {
        backgroundColor:
          "color-mix(in oklab, var(--primary) 22%, transparent)",
        outline: "1px solid color-mix(in oklab, var(--primary) 45%, transparent)",
      },
    }),
  ]
}

function createEditableExtension(editable: boolean) {
  return [EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]
}

function createMarkerExtension(markers: JsonEditorMarker[]) {
  return EditorView.decorations.compute(["doc"], (state): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>()
    const docLength = state.doc.length
    const decorations = markers
      .flatMap((marker) => {
        const from = Math.min(Math.max(0, marker.from), docLength)
        const to = Math.min(Math.max(from + 1, marker.to), docLength)
        if (from >= to) return []

        const line = state.doc.lineAt(from)
        return [
          {
            from: line.from,
            to: line.from,
            decoration: Decoration.line({ class: "json-editor-line-marker" }),
          },
          {
            from,
            to,
            decoration: Decoration.mark({
              class: cn("json-editor-marker", `json-editor-marker--${marker.kind}`),
              attributes: marker.message ? { title: marker.message } : undefined,
            }),
          },
        ]
      })
      .sort((left, right) => left.from - right.from || left.to - right.to)

    for (const item of decorations) {
      builder.add(item.from, item.to, item.decoration)
    }

    return builder.finish()
  })
}

function hashMarkers(markers: JsonEditorMarker[]) {
  return markers
    .map((marker) => `${marker.id}:${marker.kind}:${marker.from}:${marker.to}`)
    .join("|")
}

function findSmallestPathRange(
  ranges: JsonPathRange[],
  from: number,
  to: number
) {
  return ranges
    .filter((range) => {
      const enclosingRange = range.propertyRange ?? range.valueRange
      return enclosingRange.from <= from && enclosingRange.to >= to
    })
    .sort((left, right) => {
      const leftRange = left.propertyRange ?? left.valueRange
      const rightRange = right.propertyRange ?? right.valueRange
      return leftRange.to - leftRange.from - (rightRange.to - rightRange.from)
    })[0]
}

function sliceRange(document: string, range: JsonTextRange | undefined) {
  return range ? document.slice(range.from, range.to) : undefined
}
