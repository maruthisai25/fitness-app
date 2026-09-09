/// <reference types="vite-plugin-pwa/client" />

// `virtual:pwa-register` is injected by vite-plugin-pwa. The reference above
// pulls in its module declaration; `apps/web/tsconfig.json` pins
// `compilerOptions.types` to `vite/client`, so it has to be referenced from a
// file inside `include` rather than added to that list.
