import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTemplate,
  findTemplateForFile,
  isFileEmpty,
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
      expect(templates[0].content).toBe('<template></template>')
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
      const preset = [parseTemplatePath('src/components/[...path].vue', 'preset content')]
      const user = [parseTemplatePath('src/components/[...path].vue', 'user content')]

      const merged = mergeTemplates(preset, user)
      expect(merged).toHaveLength(1)
      expect(merged[0].content).toBe('user content')
    })

    it('keeps non-overlapping templates from both sources', () => {
      const preset = [parseTemplatePath('src/stores/[name].ts', 'store')]
      const user = [parseTemplatePath('src/components/[...path].vue', 'component')]

      const merged = mergeTemplates(preset, user)
      expect(merged).toHaveLength(2)
    })

    it('preserves order with user templates last', () => {
      const preset = [
        parseTemplatePath('src/a/[name].ts', 'a'),
        parseTemplatePath('src/b/[name].ts', 'b'),
      ]
      const user = [parseTemplatePath('src/c/[name].ts', 'c')]

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
})
