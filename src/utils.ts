import { readdirSync } from 'node:fs'
import { join, relative } from 'pathe'

/**
 * Recursively scan directory for all files.
 */
export function scanDirSync(dir: string, base: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanDirSync(fullPath, base))
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath))
    }
  }

  return files
}
