// Rewrite import specifiers in the compiled dist/ so the output runs under
// plain `node dist/index.js` (native ESM, no bundler / no tsx).
//
// Background: tsconfig uses moduleResolution:"bundler", so `tsc` emits BARE
// relative specifiers WITHOUT extensions (e.g. `import "./router"`) and leaves
// the `@/*` path-alias imports untouched. Node's native ESM resolver rejects
// extensionless relative specifiers and knows nothing about the `@/` alias, so
// the emitted dist/ crashes at startup (`ERR_MODULE_NOT_FOUND`). This script
// fixes both:
//   1. `@/foo`            -> relative path to dist/foo.js
//   2. `./foo` / `../foo` -> `./foo.js` / `../foo.js` (append .js)
// Already-extensioned relative imports (.js/.json/.node/.mjs/.cjs) and bare
// package specifiers are left untouched (idempotent).
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";

let count = 0;
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) {
      const c = readFileSync(p, "utf8");
      const pat = /from\s+['"]([^'"]+)['"]/g;
      const n = c.replace(pat, (m, spec) => {
        if (spec.startsWith("@/")) {
          // Source may already carry an extension (e.g. "@/shared/config/index.js");
          // only append ".js" when the specifier has none — otherwise we'd
          // produce "index.js.js".
          const core = spec.slice(2);
          let target;
          if (/\.(js|json|node|mjs|cjs)$/.test(core)) {
            target = join("dist", core);
          } else {
            target = join("dist", core) + ".js";
          }
          let rel = relative(dirname(p), target);
          if (!rel.startsWith(".")) rel = "./" + rel;
          return `from "${rel}"`;
        }
        if (
          (spec.startsWith("./") || spec.startsWith("../")) &&
          !/\.(js|json|node|mjs|cjs)$/.test(spec)
        ) {
          return `from "${spec}.js"`;
        }
        return m;
      });
      if (n !== c) {
        writeFileSync(p, n);
        count++;
      }
    }
  }
}
walk("dist");
console.log(`Fixed ${count} import specifiers in dist/`);
