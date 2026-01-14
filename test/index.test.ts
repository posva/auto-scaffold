import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTemplate,
  findTemplateForFile,
  isFileEmpty,
  loadTemplatesFromDir,
  resolveOptions,
  startWatchers,
} from "../src/core";
import type { TemplateConfig } from "../src/types";

describe("core", () => {
  describe("resolveOptions", () => {
    it("uses defaults when no options provided", () => {
      const resolved = resolveOptions(undefined, "/root");
      expect(resolved.watchDirs).toEqual(["src/components"]);
      expect(resolved.scaffoldDir).toBe(".scaffold");
      expect(resolved.enabled).toBe(true);
    });

    it("merges user options with defaults", () => {
      const resolved = resolveOptions(
        { watchDirs: ["src/views"], enabled: false },
        "/root"
      );
      expect(resolved.watchDirs).toEqual(["src/views"]);
      expect(resolved.enabled).toBe(false);
    });
  });

  describe("isFileEmpty", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `auto-scaffold-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns true for empty file", () => {
      const filePath = join(tempDir, "empty.vue");
      writeFileSync(filePath, "");
      expect(isFileEmpty(filePath)).toBe(true);
    });

    it("returns false for non-empty file", () => {
      const filePath = join(tempDir, "content.vue");
      writeFileSync(filePath, "<template></template>");
      expect(isFileEmpty(filePath)).toBe(false);
    });

    it("returns false for non-existent file", () => {
      expect(isFileEmpty(join(tempDir, "nonexistent.vue"))).toBe(false);
    });
  });

  describe("findTemplateForFile", () => {
    const templates: TemplateConfig[] = [
      { extension: ".vue", template: "<template></template>" },
      { extension: ".ts", template: "export {}" },
    ];

    it("finds template by extension", () => {
      const result = findTemplateForFile("/path/to/Component.vue", templates);
      expect(result?.extension).toBe(".vue");
    });

    it("returns undefined for unknown extension", () => {
      const result = findTemplateForFile("/path/to/file.txt", templates);
      expect(result).toBeUndefined();
    });
  });

  describe("loadTemplatesFromDir", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = join(tmpdir(), `auto-scaffold-test-${Date.now()}`);
      mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("loads templates from .scaffold directory", async () => {
      const scaffoldDir = join(tempDir, ".scaffold");
      mkdirSync(scaffoldDir);
      writeFileSync(
        join(scaffoldDir, "component.vue"),
        "<template></template>"
      );

      const templates = await loadTemplatesFromDir(".scaffold", tempDir);
      expect(templates).toHaveLength(1);
      expect(templates[0].extension).toBe(".vue");
      expect(templates[0].template).toBe("<template></template>");
    });

    it("returns empty array if .scaffold does not exist", async () => {
      const templates = await loadTemplatesFromDir(".scaffold", tempDir);
      expect(templates).toEqual([]);
    });
  });
});

describe("e2e", () => {
  let tempDir: string;
  let componentsDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `auto-scaffold-e2e-${Date.now()}`);
    componentsDir = join(tempDir, "src/components");
    mkdirSync(componentsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("scaffolds empty file with template content", async () => {
    // Setup: Create .scaffold folder with vue template
    const scaffoldDir = join(tempDir, ".scaffold");
    mkdirSync(scaffoldDir);
    const templateContent =
      '<script setup lang="ts"></script>\n\n<template>\n  <div></div>\n</template>';
    writeFileSync(join(scaffoldDir, "component.vue"), templateContent);

    // Load templates
    const templates = await loadTemplatesFromDir(".scaffold", tempDir);
    expect(templates).toHaveLength(1);

    // Setup options
    const options = resolveOptions({ watchDirs: ["src/components"] }, tempDir);

    // Start watchers
    const log = vi.fn();
    const ctx = startWatchers(options, tempDir, templates, log);

    // Create empty file
    const testFile = join(componentsDir, "TestComponent.vue");
    writeFileSync(testFile, "");

    // Wait for watcher to process (fs.watch is async)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify template was applied
    const content = readFileSync(testFile, "utf-8");
    expect(content).toBe(templateContent);
    expect(log).toHaveBeenCalledWith(
      "[auto-scaffold] Scaffolding TestComponent.vue"
    );

    // Cleanup
    ctx.stop();
  });

  it("ignores non-empty files", async () => {
    const scaffoldDir = join(tempDir, ".scaffold");
    mkdirSync(scaffoldDir);
    writeFileSync(join(scaffoldDir, "component.vue"), "<template></template>");

    const templates = await loadTemplatesFromDir(".scaffold", tempDir);
    const options = resolveOptions({ watchDirs: ["src/components"] }, tempDir);
    const log = vi.fn();
    const ctx = startWatchers(options, tempDir, templates, log);

    // Create non-empty file
    const testFile = join(componentsDir, "Existing.vue");
    const existingContent = "<script>export default {}</script>";
    writeFileSync(testFile, existingContent);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Content should be unchanged
    const content = readFileSync(testFile, "utf-8");
    expect(content).toBe(existingContent);
    expect(log).not.toHaveBeenCalled();

    ctx.stop();
  });
});
