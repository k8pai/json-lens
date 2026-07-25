"use client"

import Link from "next/link"
import { AlertTriangleIcon, BarChart3Icon, FilterIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { useJsonLens } from "./json-lens-provider"

export function InsightsWorkspace() {
  const lens = useJsonLens()

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3Icon className="size-4" />
            Column insights
          </CardTitle>
          <CardDescription>
            Frequencies are calculated from {lens.rows.length.toLocaleString()} normalized rows.
            {lens.isPreview ? ` Previewing ${lens.totalRows.toLocaleString()} total rows.` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      {lens.deferredStats ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent>
            <h2 className="font-semibold">Insights are deferred in preview mode</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Process the full dataset from the table page when you are ready to compute
              complete frequencies, missing values, and warnings.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {lens.stats.map((stat) => (
          <Card key={stat.column}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="break-words">{stat.column}</CardTitle>
                  <CardDescription>
                    {stat.type} · {stat.uniqueCount} unique · {stat.emptyCount} empty
                  </CardDescription>
                </div>
                {stat.warnings.length ? (
                  <Badge variant="destructive">
                    <AlertTriangleIcon className="size-3" />
                    Check
                  </Badge>
                ) : null}
              </div>
              {stat.warnings.length ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {stat.warnings.map((warning) => (
                    <Badge key={warning} variant="secondary">
                      {warning}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Value</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Percent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stat.values.map((item) => (
                      <TableRow key={`${stat.column}-${item.value}`}>
                        <TableCell>
                          <Button
                            asChild
                            variant="link"
                            className="h-auto max-w-xs justify-start truncate px-0"
                            title={`Filter ${stat.column} by ${item.value}`}
                            onClick={() =>
                              lens.updateFilter(stat.column, item.value === "(blank)" ? "" : item.value)
                            }
                          >
                            <Link href="/table">
                              <FilterIcon data-icon="inline-start" />
                              {item.value}
                            </Link>
                          </Button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.percentage}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
