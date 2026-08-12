import { access } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL)
    const candidate = path.resolve(path.dirname(parentPath), `${specifier}.ts`)

    try {
      await access(candidate)
      return {
        shortCircuit: true,
        url: pathToFileURL(candidate).href,
      }
    } catch {
      // Fall through to Node's resolver.
    }
  }

  return nextResolve(specifier, context)
}
