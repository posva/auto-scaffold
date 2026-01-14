import type { Options } from "./types";
import { addVitePlugin, addWebpackPlugin, defineNuxtModule } from "@nuxt/kit";
import vite from "./vite";
import webpack from "./webpack";

export interface ModuleOptions extends Options {}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: "nuxt-auto-scaffold",
    configKey: "autoScaffold",
  },
  defaults: {
    // ...default options
  },
  setup(options, _nuxt) {
    addVitePlugin(() => vite(options));
    addWebpackPlugin(() => webpack(options));

    // ...
  },
});
