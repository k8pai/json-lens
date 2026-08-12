import { stringifyPretty } from "@/lib/json-lens"

export type StressFixtureOptions = {
  rows: number
  nestedItems: number
}

export function generateStressFixture({ rows, nestedItems }: StressFixtureOptions) {
  return Array.from({ length: rows }, (_, index) => ({
    id: index + 1,
    status: index % 5 === 0 ? "pending" : index % 7 === 0 ? "disabled" : "active",
    account: {
      name: `Account ${index + 1}`,
      email: `user${index + 1}@example.com`,
      region: ["NA", "EU", "APAC"][index % 3],
    },
    metrics: {
      visits: index * 3,
      score: Number(((index % 100) / 10).toFixed(1)),
      enabled: index % 2 === 0,
    },
    tags: [`tier-${index % 4}`, `segment-${index % 9}`],
    events: Array.from({ length: nestedItems }, (_, eventIndex) => ({
      eventId: `${index + 1}-${eventIndex + 1}`,
      type: ["created", "updated", "viewed"][eventIndex % 3],
      at: `2026-08-${String((eventIndex % 28) + 1).padStart(2, "0")}`,
    })),
  }))
}

export function generateStressFixtureJson(options: StressFixtureOptions) {
  return stringifyPretty(generateStressFixture(options), 2)
}

export function estimateOperationCost({
  bytes,
  columns,
  rows,
}: {
  bytes: number
  columns: number
  rows: number
}) {
  const cells = rows * Math.max(columns, 1)
  const large = bytes >= 5 * 1024 * 1024 || rows >= 1000 || cells >= 120_000

  return {
    cells,
    large,
    recommendation: large
      ? "Use preview mode, workers, and cancelable exports before processing the full dataset."
      : "This payload is small enough for normal interactive operations.",
  }
}
