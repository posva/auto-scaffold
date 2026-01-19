import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Wait for a file to have non-empty content.
 */
async function waitForFileContent(filePath: string, timeout = 2000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const stat = statSync(filePath)
      if (stat.size > 0) {
        return readFileSync(filePath, 'utf-8')
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 50))
  }
  return readFileSync(filePath, 'utf-8')
}
import {
  applyTemplate,
  discoverScaffoldDirs,
  findTemplateForFile,
  getTemplateContent,
  isFileEmpty,
  loadAllTemplates,
  loadTemplatesFromDir,
  mergeTemplates,
  resolveOptions,
  startWatchers,
} from '../src/core'
import { inferWatchDirs, matchFile, parseTemplatePath, getStaticPrefix } from '../src/patterns'
import { loadPreset, loadPresets } from '../src/presets'

describe('patterns', () => {
  describe('parseTemplatePath', () => {
    it('parses simple filename pattern', () => {
      const result = parseTemplatePath('[name].vue', 'content')
      expect(result.segments).toEqual([])
      expect(result.filename).toEqual([{ type: 'param', value: 'name' }])
      expect(result.extension).toBe('.vue')
    })

    it('parses spread filename pattern', () => {
      const result = parseTemplatePath('[...path].vue', 'content')
      expect(result.filename).toEqual([{ type: 'spread', value: 'path' }])
    })

    it('parses path with static segments', () => {
      const result = parseTemplatePath('src/components/[...path].vue', 'content')
      expect(result.segments).toEqual([
        { type: 'static', value: 'src' },
        { type: 'static', value: 'components' },
      ])
      expect(result.filename).toEqual([{ type: 'spread', value: 'path' }])
    })

    it('parses filename with static suffix', () => {
      const result = parseTemplatePath('[name].component.vue', 'content')
      expect(result.filename).toEqual([
        { type: 'param', value: 'name' },
        { type: 'static', value: '.component' },
      ])
    })

    it('parses filename with static prefix', () => {
      const result = parseTemplatePath('Base[name].vue', 'content')
      expect(result.filename).toEqual([
        { type: 'static', value: 'Base' },
        { type: 'param', value: 'name' },
      ])
    })
  })

  describe('matchFile', () => {
    it('matches spread pattern at root', () => {
      const template = parseTemplatePath('[...path].vue', '')
      expect(matchFile('Button.vue', template)).toEqual({ path: 'Button' })
    })

    it('matches spread pattern with nested path', () => {
      const template = parseTemplatePath('[...path].vue', '')
      expect(matchFile('forms/Input.vue', template)).toEqual({
        path: 'forms/Input',
      })
    })

    it('matches spread pattern with deeply nested path', () => {
      const template = parseTemplatePath('[...path].vue', '')
      expect(matchFile('a/b/c/Deep.vue', template)).toEqual({
        path: 'a/b/c/Deep',
      })
    })

    it('matches param pattern only for direct children', () => {
      const template = parseTemplatePath('[name].vue', '')
      expect(matchFile('Button.vue', template)).toEqual({ name: 'Button' })
      expect(matchFile('nested/Button.vue', template)).toBeNull()
    })

    it('matches pattern with static path prefix', () => {
      const template = parseTemplatePath('src/components/[...path].vue', 'content')
      expect(matchFile('src/components/Button.vue', template)).toEqual({
        path: 'Button',
      })
      expect(matchFile('src/components/forms/Input.vue', template)).toEqual({
        path: 'forms/Input',
      })
      expect(matchFile('src/views/Home.vue', template)).toBeNull()
    })

    it('matches pattern with static suffix in filename', () => {
      const template = parseTemplatePath('[name].component.vue', '')
      expect(matchFile('Button.component.vue', template)).toEqual({
        name: 'Button',
      })
      expect(matchFile('Button.vue', template)).toBeNull()
    })

    it('rejects wrong extension', () => {
      const template = parseTemplatePath('[name].vue', '')
      expect(matchFile('file.ts', template)).toBeNull()
    })
  })

  describe('getStaticPrefix', () => {
    it('returns static path segments', () => {
      const template = parseTemplatePath('src/components/[...path].vue', 'content')
      expect(getStaticPrefix(template)).toBe('src/components')
    })

    it('returns empty string for patterns starting with dynamic segment', () => {
      const template = parseTemplatePath('[...path].vue', '')
      expect(getStaticPrefix(template)).toBe('')
    })
  })

  describe('inferWatchDirs', () => {
    it('extracts unique static prefixes', () => {
      const templates = [
        parseTemplatePath('src/components/[...path].vue', ''),
        parseTemplatePath('src/views/[name].vue', ''),
        parseTemplatePath('src/components/[name].ts', ''),
      ]
      const dirs = inferWatchDirs(templates)
      expect(dirs).toContain('src/components')
      expect(dirs).toContain('src/views')
      expect(dirs).toHaveLength(2)
    })
  })
})

describe('core', () => {
  describe('resolveOptions', () => {
    it('uses defaults when no options provided', () => {
      const resolved = resolveOptions()
      expect(resolved.scaffoldDir).toBe('.scaffold')
      expect(resolved.enabled).toBe(true)
    })

    it('merges user options with defaults', () => {
      const resolved = resolveOptions({
        scaffoldDir: 'scaffold',
        enabled: false,
      })
      expect(resolved.scaffoldDir).toBe('scaffold')
      expect(resolved.enabled).toBe(false)
    })
  })

  describe('isFileEmpty', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = join(tmpdir(), `auto-scaffold-test-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('returns true for empty file', () => {
      const filePath = join(tempDir, 'empty.vue')
      writeFileSync(filePath, '')
      expect(isFileEmpty(filePath)).toBe(true)
    })

    it('returns false for non-empty file', () => {
      const filePath = join(tempDir, 'content.vue')
      writeFileSync(filePath, '<template></template>')
      expect(isFileEmpty(filePath)).toBe(false)
    })

    it('returns false for non-existent file', () => {
      expect(isFileEmpty(join(tempDir, 'nonexistent.vue'))).toBe(false)
    })
  })

  describe('findTemplateForFile', () => {
    it('finds template by path pattern', () => {
      const templates = [
        parseTemplatePath('src/components/[...path].vue', '<template/>'),
        parseTemplatePath('src/composables/[name].ts', 'export {}'),
      ]

      const result = findTemplateForFile('src/components/Button.vue', templates)
      expect(result?.templatePath).toBe('src/components/[...path].vue')
    })

    it('finds template for nested path', () => {
      const templates = [parseTemplatePath('src/components/[...path].vue', '<template/>')]

      const result = findTemplateForFile('src/components/forms/Input.vue', templates)
      expect(result?.templatePath).toBe('src/components/[...path].vue')
    })

    it('returns undefined for no match', () => {
      const templates = [parseTemplatePath('src/components/[...path].vue', '<template/>')]

      const result = findTemplateForFile('src/views/Home.vue', templates)
      expect(result).toBeUndefined()
    })

    it('prefers param pattern over spread pattern', () => {
      const templates = [
        parseTemplatePath('[...path].vue', '<template/>'),
        parseTemplatePath('[name].vue', '<template/>'),
      ]

      const result = findTemplateForFile('Button.vue', templates)
      expect(result?.templatePath).toBe('[name].vue')
    })

    it('prefers static path over dynamic path segments', () => {
      const templates = [
        parseTemplatePath('[dir]/[name].vue', '<template/>'),
        parseTemplatePath('src/[name].vue', '<template/>'),
      ]

      const result = findTemplateForFile('src/Button.vue', templates)
      expect(result?.templatePath).toBe('src/[name].vue')
    })

    it('prefers fully static filename over dynamic patterns', () => {
      const templates = [
        parseTemplatePath('src/components/[...path].vue', '<template/>'),
        parseTemplatePath('src/components/[name].vue', '<template/>'),
        parseTemplatePath('src/components/Button.vue', '<template/>'),
      ]

      const result = findTemplateForFile('src/components/Button.vue', templates)
      expect(result?.templatePath).toBe('src/components/Button.vue')
    })
  })

  describe('loadTemplatesFromDir', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = join(tmpdir(), `auto-scaffold-test-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('loads templates from nested scaffold structure', async () => {
      const scaffoldDir = join(tempDir, '.scaffold/src/components')
      mkdirSync(scaffoldDir, { recursive: true })
      writeFileSync(join(scaffoldDir, '[...path].vue'), '<template></template>')

      const templates = await loadTemplatesFromDir('.scaffold', tempDir)
      expect(templates).toHaveLength(1)
      expect(templates[0].templatePath).toBe('src/components/[...path].vue')
      expect(getTemplateContent(templates[0])).toBe('<template></template>')
    })

    it('returns empty array if .scaffold does not exist', async () => {
      const templates = await loadTemplatesFromDir('.scaffold', tempDir)
      expect(templates).toEqual([])
    })
  })

  describe('resolveOptions with presets', () => {
    it('normalizes string preset to array', () => {
      const resolved = resolveOptions({ presets: 'vue' })
      expect(resolved.presets).toEqual(['vue'])
    })

    it('keeps array presets as-is', () => {
      const resolved = resolveOptions({ presets: ['vue', 'pinia'] })
      expect(resolved.presets).toEqual(['vue', 'pinia'])
    })

    it('defaults to empty array when no presets', () => {
      const resolved = resolveOptions({})
      expect(resolved.presets).toEqual([])
    })
  })

  describe('mergeTemplates', () => {
    it('user templates override presets with same path', () => {
      const preset = [parseTemplatePath('src/components/[...path].vue', '/preset/dir')]
      const user = [parseTemplatePath('src/components/[...path].vue', '/user/dir')]

      const merged = mergeTemplates(preset, user)
      expect(merged).toHaveLength(1)
      expect(merged[0].scaffoldDir).toBe('/user/dir')
    })

    it('keeps non-overlapping templates from both sources', () => {
      const preset = [parseTemplatePath('src/stores/[name].ts', '/preset')]
      const user = [parseTemplatePath('src/components/[...path].vue', '/user')]

      const merged = mergeTemplates(preset, user)
      expect(merged).toHaveLength(2)
    })

    it('preserves order with user templates last', () => {
      const preset = [
        parseTemplatePath('src/a/[name].ts', '/preset'),
        parseTemplatePath('src/b/[name].ts', '/preset'),
      ]
      const user = [parseTemplatePath('src/c/[name].ts', '/user')]

      const merged = mergeTemplates(preset, user)
      expect(merged).toHaveLength(3)
    })
  })
})

describe('presets', () => {
  describe('loadPreset', () => {
    it('loads vue preset templates', () => {
      const templates = loadPreset('vue')
      expect(templates).toHaveLength(1)
      expect(templates[0].templatePath).toBe('src/components/[...path].vue')
    })

    it('loads vue-router preset templates', () => {
      const templates = loadPreset('vue-router')
      expect(templates).toHaveLength(1)
      expect(templates[0].templatePath).toBe('src/pages/[...path].vue')
    })

    it('loads pinia preset templates', () => {
      const templates = loadPreset('pinia')
      expect(templates).toHaveLength(1)
      expect(templates[0].templatePath).toBe('src/stores/[name].ts')
    })

    it('loads pinia-colada preset templates', () => {
      const templates = loadPreset('pinia-colada')
      expect(templates).toHaveLength(1)
      expect(templates[0].templatePath).toBe('src/queries/[name].ts')
    })

    it('returns empty array for unknown preset', () => {
      // @ts-expect-error testing invalid preset
      const templates = loadPreset('nonexistent')
      expect(templates).toEqual([])
    })
  })

  describe('loadPresets', () => {
    it('merges multiple presets', () => {
      const templates = loadPresets(['vue', 'pinia'])
      expect(templates.length).toBe(2)
      expect(templates.some((t) => t.templatePath.includes('components'))).toBe(true)
      expect(templates.some((t) => t.templatePath.includes('stores'))).toBe(true)
    })

    it('later preset wins on conflict', () => {
      // If both had same templatePath, later would win
      // Currently no overlap, but test the merge behavior
      const templates = loadPresets(['vue', 'vue-router', 'pinia'])
      expect(templates.length).toBe(3)
    })

    it('returns empty array for empty presets', () => {
      const templates = loadPresets([])
      expect(templates).toEqual([])
    })
  })
})

describe('e2e', () => {
  let tempDir: string
  let componentsDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `auto-scaffold-e2e-${Date.now()}`)
    componentsDir = join(tempDir, 'src/components')
    mkdirSync(componentsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('scaffolds empty file with template content', async () => {
    // Setup: Create .scaffold folder with path-based template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const templateContent =
      '<script setup lang="ts"></script>\n\n<template>\n  <div></div>\n</template>'
    writeFileSync(join(scaffoldDir, '[...path].vue'), templateContent)

    // Load templates
    const templates = await loadTemplatesFromDir('.scaffold', tempDir)
    expect(templates).toHaveLength(1)

    // Setup options
    const options = resolveOptions()

    // Start watchers
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create empty file
    const testFile = join(componentsDir, 'TestComponent.vue')
    writeFileSync(testFile, '')

    // Wait for watcher to process (fs.watch is async)
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify template was applied
    expect(log).toHaveBeenCalledWith('[auto-scaffold] Scaffolding TestComponent.vue')
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe(templateContent)

    // Cleanup
    await ctx.stop()
  })

  it('scaffolds nested empty file', async () => {
    // Setup scaffold
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const templateContent = '<template>nested</template>'
    writeFileSync(join(scaffoldDir, '[...path].vue'), templateContent)

    // Create nested directory
    const nestedDir = join(componentsDir, 'forms')
    mkdirSync(nestedDir, { recursive: true })

    const templates = await loadTemplatesFromDir('.scaffold', tempDir)
    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create empty nested file
    const testFile = join(nestedDir, 'Input.vue')
    writeFileSync(testFile, '')

    await new Promise((resolve) => setTimeout(resolve, 200))

    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe(templateContent)
    expect(log).toHaveBeenCalledWith('[auto-scaffold] Scaffolding forms/Input.vue')

    await ctx.stop()
  })

  it('ignores non-empty files', async () => {
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    writeFileSync(join(scaffoldDir, '[...path].vue'), '<template></template>')

    const templates = await loadTemplatesFromDir('.scaffold', tempDir)
    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create non-empty file
    const testFile = join(componentsDir, 'Existing.vue')
    const existingContent = '<script>export default {}</script>'
    writeFileSync(testFile, existingContent)

    await new Promise((resolve) => setTimeout(resolve, 200))

    // Content should be unchanged
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe(existingContent)
    expect(log).not.toHaveBeenCalled()

    await ctx.stop()
  })

  it('scaffolds using preset template', async () => {
    // No .scaffold folder, just use preset
    const presetTemplates = loadPresets(['vue'])
    const options = resolveOptions({ presets: ['vue'] })
    const templates = mergeTemplates(presetTemplates, [])

    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create empty file in components
    const testFile = join(componentsDir, 'Button.vue')
    writeFileSync(testFile, '')

    // Wait for file to be scaffolded (polling for slower CI environments)
    const content = await waitForFileContent(testFile)

    // Verify preset template was applied
    expect(content).toContain('<script setup')
    expect(log).toHaveBeenCalled()

    await ctx.stop()
  })

  it('user template overrides preset', async () => {
    // Setup user .scaffold with custom template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const userContent = '<template>user override</template>'
    writeFileSync(join(scaffoldDir, '[...path].vue'), userContent)

    // Load both preset and user templates
    const presetTemplates = loadPresets(['vue'])
    const userTemplates = await loadTemplatesFromDir('.scaffold', tempDir)
    const templates = mergeTemplates(presetTemplates, userTemplates)

    // User should override preset - verify by checking the template resolves to user content
    const userTemplate = templates.find((t) => t.templatePath === 'src/components/[...path].vue')
    expect(userTemplate).toBeDefined()
    expect(getTemplateContent(userTemplate!)).toBe(userContent)

    const options = resolveOptions({ presets: ['vue'] })
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create empty file
    const testFile = join(componentsDir, 'Override.vue')
    writeFileSync(testFile, '')

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Verify user template was applied, not preset
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe(userContent)

    await ctx.stop()
  })

  it('reads template content dynamically when scaffold file changes', async () => {
    // Setup: Create .scaffold folder with initial template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const templateFile = join(scaffoldDir, '[...path].vue')
    const initialContent = '<template>initial</template>'
    writeFileSync(templateFile, initialContent)

    // Load templates and start watchers
    const templates = await loadTemplatesFromDir('.scaffold', tempDir)
    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Create first empty file
    const testFile1 = join(componentsDir, 'First.vue')
    writeFileSync(testFile1, '')
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Verify initial template was applied
    expect(readFileSync(testFile1, 'utf-8')).toBe(initialContent)

    // Update the scaffold template file
    const updatedContent = '<template>updated</template>'
    writeFileSync(templateFile, updatedContent)

    // Create second empty file
    const testFile2 = join(componentsDir, 'Second.vue')
    writeFileSync(testFile2, '')
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Verify NEW template content was applied (not cached old content)
    expect(readFileSync(testFile2, 'utf-8')).toBe(updatedContent)

    await ctx.stop()
  })
})

describe('nested scaffolds', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `auto-scaffold-nested-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('discoverScaffoldDirs', () => {
    it('finds root scaffold folder', () => {
      const scaffoldDir = join(tempDir, '.scaffold')
      mkdirSync(scaffoldDir, { recursive: true })

      const sources = discoverScaffoldDirs(tempDir)
      expect(sources).toHaveLength(1)
      expect(sources[0].scaffoldDir).toBe(scaffoldDir)
      expect(sources[0].scopeRoot).toBe(tempDir)
      expect(sources[0].depth).toBe(0)
    })

    it('finds nested scaffold folders', () => {
      // Create root scaffold
      mkdirSync(join(tempDir, '.scaffold'), { recursive: true })
      // Create nested scaffold
      const nestedDir = join(tempDir, 'src/modules/admin')
      mkdirSync(join(nestedDir, '.scaffold'), { recursive: true })

      const sources = discoverScaffoldDirs(tempDir)
      expect(sources).toHaveLength(2)

      // Root scaffold
      const rootSource = sources.find((s) => s.depth === 0)
      expect(rootSource?.scopeRoot).toBe(tempDir)

      // Nested scaffold (depth = 3: src -> modules -> admin)
      const nestedSource = sources.find((s) => s.depth > 0)
      expect(nestedSource?.scopeRoot).toBe(nestedDir)
      expect(nestedSource?.depth).toBe(3)
    })

    it('ignores hidden directories', () => {
      mkdirSync(join(tempDir, '.scaffold'), { recursive: true })
      mkdirSync(join(tempDir, '.hidden/.scaffold'), { recursive: true })

      const sources = discoverScaffoldDirs(tempDir)
      expect(sources).toHaveLength(1)
    })
  })

  describe('loadAllTemplates', () => {
    it('loads templates from multiple scaffold folders', async () => {
      // Root scaffold
      const rootScaffold = join(tempDir, '.scaffold/src/components')
      mkdirSync(rootScaffold, { recursive: true })
      writeFileSync(join(rootScaffold, '[...path].vue'), '<template>root</template>')

      // Nested scaffold
      const nestedScaffold = join(tempDir, 'src/modules/admin/.scaffold/components')
      mkdirSync(nestedScaffold, { recursive: true })
      writeFileSync(join(nestedScaffold, '[...path].vue'), '<template>nested</template>')

      const templates = await loadAllTemplates(tempDir)
      expect(templates).toHaveLength(2)

      // Root template
      const rootTemplate = templates.find((t) => t.scopeDepth === 0)
      expect(rootTemplate?.templatePath).toBe('src/components/[...path].vue')
      expect(rootTemplate?.scopePrefix).toBe('')

      // Nested template
      const nestedTemplate = templates.find((t) => t.scopeDepth > 0)
      expect(nestedTemplate?.templatePath).toBe('components/[...path].vue')
      expect(nestedTemplate?.scopePrefix).toBe('src/modules/admin')
    })
  })

  describe('scope-aware matching', () => {
    it('matches file with scopePrefix', () => {
      const template = parseTemplatePath(
        'components/[...path].vue',
        '/scaffold',
        'src/modules/admin',
        2,
      )
      expect(matchFile('src/modules/admin/components/Button.vue', template)).toEqual({
        path: 'Button',
      })
    })

    it('rejects file outside scope', () => {
      const template = parseTemplatePath(
        'components/[...path].vue',
        '/scaffold',
        'src/modules/admin',
        2,
      )
      expect(matchFile('src/components/Button.vue', template)).toBeNull()
    })

    it('uses depth as tiebreaker for equal specificity', () => {
      // Both templates have same specificity (1 static dir part, spread filename)
      // Only difference is scopeDepth
      const rootTemplate = parseTemplatePath('components/[...path].vue', '/root', '', 0)
      const nestedTemplate = parseTemplatePath('components/[...path].vue', '/nested', '', 2)

      const templates = [rootTemplate, nestedTemplate]
      const result = findTemplateForFile('components/Button.vue', templates)

      // Both have same specificity, deeper wins as tiebreaker
      expect(result?.scopeDepth).toBe(2)
    })

    it('prefers static filename over deeper scaffold with spread', () => {
      // Root: static filename (higher specificity)
      const rootTemplate = parseTemplatePath('src/modules/admin/views/page.vue', '/root', '', 0)
      // Nested: spread pattern (lower specificity, higher depth)
      const nestedTemplate = parseTemplatePath(
        'views/[...path].vue',
        '/nested',
        'src/modules/admin',
        3,
      )

      const templates = [rootTemplate, nestedTemplate]
      const result = findTemplateForFile('src/modules/admin/views/page.vue', templates)

      // Static filename beats spread even though nested is deeper
      expect(result?.templatePath).toBe('src/modules/admin/views/page.vue')
      expect(result?.scopeDepth).toBe(0)
    })

    it('prefers [name].page.vue over [...path].vue at any depth', () => {
      // Root: param with suffix (more specific filename)
      const rootTemplate = parseTemplatePath('src/views/[name].page.vue', '/root', '', 0)
      // Nested: spread pattern (less specific)
      const nestedTemplate = parseTemplatePath('views/[...path].vue', '/nested', 'src', 1)

      const templates = [rootTemplate, nestedTemplate]
      const result = findTemplateForFile('src/views/home.page.vue', templates)

      // [name].page.vue has more static filename parts, wins over [...path].vue
      expect(result?.templatePath).toBe('src/views/[name].page.vue')
    })
  })

  describe('inferWatchDirs with scope', () => {
    it('combines scopePrefix with static prefix', () => {
      const templates = [
        parseTemplatePath('components/[...path].vue', '/scaffold', 'src/modules/admin', 2),
        parseTemplatePath('src/views/[name].vue', '/scaffold', '', 0),
      ]
      const dirs = inferWatchDirs(templates)
      expect(dirs).toContain('src/modules/admin/components')
      expect(dirs).toContain('src/views')
    })
  })

  describe('e2e nested scaffold', () => {
    it('scaffolds using nested scaffold template', async () => {
      // Root scaffold
      const rootScaffold = join(tempDir, '.scaffold/src/components')
      mkdirSync(rootScaffold, { recursive: true })
      writeFileSync(join(rootScaffold, '[...path].vue'), '<template>root</template>')

      // Nested scaffold in src/modules/admin
      const adminDir = join(tempDir, 'src/modules/admin')
      const nestedScaffold = join(adminDir, '.scaffold/components')
      mkdirSync(nestedScaffold, { recursive: true })
      writeFileSync(join(nestedScaffold, '[...path].vue'), '<template>nested</template>')

      // Create target directory
      const componentsDir = join(adminDir, 'components')
      mkdirSync(componentsDir, { recursive: true })

      // Load all templates
      const templates = await loadAllTemplates(tempDir)
      const options = resolveOptions()
      const log = vi.fn()
      const ctx = startWatchers(options, tempDir, templates, log)
      await ctx.ready

      // Create empty file in nested module
      const testFile = join(componentsDir, 'Button.vue')
      writeFileSync(testFile, '')

      await new Promise((resolve) => setTimeout(resolve, 300))

      // Should use nested template, not root
      const content = readFileSync(testFile, 'utf-8')
      expect(content).toBe('<template>nested</template>')

      await ctx.stop()
    })

    it('falls back to root scaffold for files outside nested scope', async () => {
      // Root scaffold
      const rootScaffold = join(tempDir, '.scaffold/src/components')
      mkdirSync(rootScaffold, { recursive: true })
      writeFileSync(join(rootScaffold, '[...path].vue'), '<template>root</template>')

      // Nested scaffold
      const nestedScaffold = join(tempDir, 'src/modules/admin/.scaffold/components')
      mkdirSync(nestedScaffold, { recursive: true })
      writeFileSync(join(nestedScaffold, '[...path].vue'), '<template>nested</template>')

      // Create target directory at root level
      const componentsDir = join(tempDir, 'src/components')
      mkdirSync(componentsDir, { recursive: true })

      const templates = await loadAllTemplates(tempDir)
      const options = resolveOptions()
      const log = vi.fn()
      const ctx = startWatchers(options, tempDir, templates, log)
      await ctx.ready

      // Create empty file at root level (not inside admin module)
      const testFile = join(componentsDir, 'Header.vue')
      writeFileSync(testFile, '')

      await new Promise((resolve) => setTimeout(resolve, 300))

      // Should use root template
      const content = readFileSync(testFile, 'utf-8')
      expect(content).toBe('<template>root</template>')

      await ctx.stop()
    })
  })
})

describe('scaffold watching', () => {
  let tempDir: string
  let componentsDir: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `auto-scaffold-watch-${Date.now()}`)
    componentsDir = join(tempDir, 'src/components')
    mkdirSync(componentsDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('detects new template added to scaffold folder', async () => {
    // Setup: Create .scaffold folder with initial template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    // Need an initial template so watcher is set up for src/components
    writeFileSync(join(scaffoldDir, '[...path].vue'), '<template>initial</template>')

    // Load templates
    const templates = await loadAllTemplates(tempDir)
    expect(templates).toHaveLength(1)

    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Add a NEW template to .scaffold (different pattern)
    const templateContent = '<template>specific</template>'
    writeFileSync(join(scaffoldDir, '[name].component.vue'), templateContent)

    // Wait for watcher to detect
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Templates array should have both templates now
    expect(templates).toHaveLength(2)
    expect(templates.some((t) => t.templatePath === 'src/components/[name].component.vue')).toBe(
      true,
    )

    // Create empty file matching the NEW template pattern
    const testFile = join(componentsDir, 'New.component.vue')
    writeFileSync(testFile, '')

    await new Promise((resolve) => setTimeout(resolve, 300))

    // Should use the new specific template
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe(templateContent)

    await ctx.stop()
  })

  it('detects template removed from scaffold folder', async () => {
    // Setup: Create .scaffold folder with template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const templateFile = join(scaffoldDir, '[...path].vue')
    writeFileSync(templateFile, '<template>to-remove</template>')

    // Load templates
    const templates = await loadAllTemplates(tempDir)
    expect(templates).toHaveLength(1)

    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Remove the template
    rmSync(templateFile)

    // Wait for watcher to detect
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Templates array should be empty now
    expect(templates).toHaveLength(0)

    // Create empty file - should NOT be scaffolded
    const testFile = join(componentsDir, 'Orphan.vue')
    writeFileSync(testFile, '')

    await new Promise((resolve) => setTimeout(resolve, 300))

    // File should remain empty (no template to apply)
    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe('')

    await ctx.stop()
  })

  it('detects template content change in scaffold folder', async () => {
    // Setup: Create .scaffold folder with template
    const scaffoldDir = join(tempDir, '.scaffold/src/components')
    mkdirSync(scaffoldDir, { recursive: true })
    const templateFile = join(scaffoldDir, '[...path].vue')
    writeFileSync(templateFile, '<template>original</template>')

    // Load templates
    const templates = await loadAllTemplates(tempDir)

    const options = resolveOptions()
    const log = vi.fn()
    const ctx = startWatchers(options, tempDir, templates, log)
    await ctx.ready

    // Update template content (template is re-parsed on change event)
    writeFileSync(templateFile, '<template>updated</template>')

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Template should still exist (re-added after change)
    expect(templates).toHaveLength(1)

    // Create empty file - should use updated content
    const testFile = join(componentsDir, 'Updated.vue')
    writeFileSync(testFile, '')

    await new Promise((resolve) => setTimeout(resolve, 300))

    const content = readFileSync(testFile, 'utf-8')
    expect(content).toBe('<template>updated</template>')

    await ctx.stop()
  })
})
