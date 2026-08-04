"use client"

import type { ComponentType, SVGProps } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { displayValue, isRecord, stringifyPretty } from "@/lib/json-lens"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 truncate text-xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}

export function ActionButton({
  children,
  icon: Icon,
  title,
  variant = "outline",
  onClick,
}: {
  children: string
  icon: Icon
  title: string
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive"
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          className="active:!translate-y-0"
          title={title}
          aria-label={title}
          onClick={onClick}
        >
          <Icon data-icon="inline-start" />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

export function JsonValueCell({ value }: { value: unknown }) {
  if (Array.isArray(value) || isRecord(value)) {
    return (
      <details className="group max-w-md">
        <summary className="cursor-pointer truncate text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground">
          {displayValue(value)}
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg border bg-muted p-3 text-xs text-muted-foreground">
          {stringifyPretty(value)}
        </pre>
      </details>
    )
  }

  const text = displayValue(value)

  if (!text) return <span className="text-muted-foreground">blank</span>
  if (value === null) {
    return <span className="font-mono text-xs text-muted-foreground">null</span>
  }

  return <span className="block max-w-md truncate">{text}</span>
}
