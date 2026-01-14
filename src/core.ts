import type { FSWatcher } from "node:fs";
import type { Options, ResolvedOptions } from "./types";
import type { ParsedTemplate } from "./patterns";
import {
  existsSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { inferWatchDirs, matchFile, parseTemplatePath } from "./patterns";

export function resolveOptions(options: Options = {}): ResolvedOptions {
  return {
    watchDirs: options.watchDirs,
    scaffoldDir: options.scaffoldDir ?? ".scaffold",
    enabled: options.enabled ?? true,
  };
}

/**
 * Recursively scan a directory and return all file paths relative to the base
 */
async function scanDir(dir: string, base: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanDir(fullPath, base)));
    } else if (entry.isFile()) {
      files.push(relative(base, fullPath));
    }
  }

  return files;
}

/**
 * Load templates from scaffold directory, parsing paths into patterns
 */
export async function loadTemplatesFromDir(
  scaffoldDir: string,
  root: string
): Promise<ParsedTemplate[]> {
  const dir = resolve(root, scaffoldDir);
  if (!existsSync(dir)) {
    return [];
  }

  const files = await scanDir(dir, dir);
  const templates: ParsedTemplate[] = [];

  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    templates.push(parseTemplatePath(file, content));
  }

  return templates;
}

export function isFileEmpty(filePath: string): boolean {
  try {
    const s = statSync(filePath);
    return s.size === 0;
  } catch {
    return false;
  }
}

/**
 * Find matching template for a file path
 */
export function findTemplateForFile(
  filePath: string,
  templates: ParsedTemplate[]
): ParsedTemplate | undefined {
  for (const template of templates) {
    const match = matchFile(filePath, template);
    if (match !== null) {
      return template;
    }
  }
  return undefined;
}

export async function applyTemplate(
  filePath: string,
  template: ParsedTemplate
): Promise<void> {
  writeFileSync(filePath, template.content, "utf-8");
}

export interface WatcherContext {
  watchers: FSWatcher[];
  stop: () => void;
}

export function startWatchers(
  options: ResolvedOptions,
  root: string,
  templates: ParsedTemplate[],
  log: (msg: string) => void
): WatcherContext {
  const watchers: FSWatcher[] = [];

  // Infer watch dirs from templates if not explicitly provided
  const watchDirs = options.watchDirs ?? inferWatchDirs(templates);

  for (const watchDir of watchDirs) {
    const dir = resolve(root, watchDir);
    if (!existsSync(dir)) {
      continue;
    }

    const watcher = watch(
      dir,
      { recursive: true },
      async (eventType, filename) => {
        if (!filename || eventType !== "rename") {
          return;
        }

        const filePath = join(dir, filename);

        // Check file exists and is empty
        if (!existsSync(filePath) || !isFileEmpty(filePath)) {
          return;
        }

        // Build full path relative to root for matching
        const relativePath = relative(root, filePath);
        const template = findTemplateForFile(relativePath, templates);
        if (!template) {
          return;
        }

        log(`[auto-scaffold] Scaffolding ${filename}`);
        await applyTemplate(filePath, template);
      }
    );

    watchers.push(watcher);
  }

  return {
    watchers,
    stop: () => {
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}
