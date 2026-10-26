// Precompiles public/app.js's component templates into plain render
// functions, so nothing needs to compile in the browser at runtime (the
// dashboard's CSP is default-src 'self' — no eval/new Function, which is
// what Vue's usual in-browser template compiler needs).
//
// Run after editing a file in build/templates/:
//   npm install          # pulls in @vue/compiler-dom (devDependency only —
//                         # the shipped page still has zero runtime deps
//                         # besides the vendored public/vue.esm-browser.prod.js)
//   npm run build:ui

import { compile } from '@vue/compiler-dom';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(ROOT, 'templates');
const PUBLIC_DIR = join(ROOT, '..', 'public');

function compileTemplate(name, outName) {
  const template = readFileSync(join(TEMPLATES_DIR, `${name}.html`), 'utf8');
  const { code } = compile(template, { mode: 'module', hoistStatic: true });
  // The compiler emits `from "vue"`; point it at the vendored ESM build instead.
  const fixed = code.replace('from "vue"', 'from "./vue.esm-browser.prod.js"');
  writeFileSync(join(PUBLIC_DIR, outName), fixed);
  console.log('wrote', `public/${outName}`);
}

compileTemplate('app', 'render-app.js');
compileTemplate('character-row', 'render-character-row.js');
compileTemplate('party-card', 'render-party-card.js');
