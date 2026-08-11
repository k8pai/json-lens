const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"])

type ImportUrlRequest = {
  url?: unknown
}

export async function POST(request: Request) {
  let body: ImportUrlRequest

  try {
    body = (await request.json()) as ImportUrlRequest
  } catch {
    return Response.json({ ok: false, error: "Request body must be JSON." }, { status: 400 })
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return Response.json({ ok: false, error: "URL is required." }, { status: 400 })
  }

  const url = parseImportUrl(body.url)
  if (!url.ok) {
    return Response.json({ ok: false, error: url.error }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url.value, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    })

    if (!response.ok) {
      return Response.json(
        { ok: false, error: `URL returned HTTP ${response.status}.` },
        { status: 502 }
      )
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0")
    if (contentLength > MAX_IMPORT_BYTES) {
      return Response.json(
        { ok: false, error: "Remote JSON is larger than the 5 MB import limit." },
        { status: 413 }
      )
    }

    const text = await readLimitedText(response)
    if (!text.ok) {
      return Response.json({ ok: false, error: text.error }, { status: 413 })
    }

    return Response.json({
      ok: true,
      text: text.value,
      bytes: text.bytes,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: response.url,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? "URL import timed out."
        : "URL import failed."

    return Response.json({ ok: false, error: message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}

function parseImportUrl(
  value: string
): { ok: true; value: string } | { ok: false; error: string } {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return { ok: false, error: "Enter a valid URL." }
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only HTTP and HTTPS URLs are supported." }
  }

  const hostname = url.hostname.toLowerCase()
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.")
  ) {
    return { ok: false, error: "Local and private network URLs are not supported." }
  }

  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) {
    return { ok: false, error: "Local and private network URLs are not supported." }
  }

  return { ok: true, value: url.toString() }
}

async function readLimitedText(
  response: Response
): Promise<{ ok: true; value: string; bytes: number } | { ok: false; error: string }> {
  if (!response.body) {
    const value = await response.text()
    const bytes = new TextEncoder().encode(value).byteLength

    if (bytes > MAX_IMPORT_BYTES) {
      return { ok: false, error: "Remote JSON is larger than the 5 MB import limit." }
    }

    return { ok: true, value, bytes }
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    bytes += value.byteLength
    if (bytes > MAX_IMPORT_BYTES) {
      await reader.cancel()
      return { ok: false, error: "Remote JSON is larger than the 5 MB import limit." }
    }
    chunks.push(value)
  }

  const buffer = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, value: new TextDecoder().decode(buffer), bytes }
}
