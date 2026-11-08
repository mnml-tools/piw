// Builds each probe in bundle/ with Vite (production, minified) and reports
// raw and gzip sizes of the emitted JS. Results → results/bundle-sizes.json.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync, constants } from 'node:zlib'

import react from '@vitejs/plugin-react'
import { build, version as viteVersion } from 'vite'

const root = resolve(import.meta.dirname, '..')
const probes = [
  { name: 'tiptap', entry: 'bundle/tiptap.ts', external: [] },
  { name: 'tiptap-react', entry: 'bundle/tiptap-react.tsx', external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
  { name: 'part-tiptap-starterkit', entry: 'bundle/tiptap-starterkit.ts', external: [] },
  { name: 'part-lowlight-common', entry: 'bundle/lowlight-common.ts', external: [] },
  { name: 'part-lowlight-curated', entry: 'bundle/lowlight-curated.ts', external: [] },
  { name: 'part-marked', entry: 'bundle/marked.ts', external: [] },
  { name: 'codemirror', entry: 'bundle/codemirror.ts', external: [] },
  { name: 'codemirror-basic', entry: 'bundle/codemirror-basic.ts', external: [] },
]

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })

const results = { vite: viteVersion, gzipLevel: constants.Z_DEFAULT_COMPRESSION, probes: {} }
for (const probe of probes) {
  const outDir = join(root, 'dist', probe.name)
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    mode: 'production',
    plugins: [react()],
    build: {
      outDir,
      emptyOutDir: true,
      minify: true,
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: { input: join(root, probe.entry), external: probe.external },
    },
  })
  const js = files(outDir).filter((f) => f.endsWith('.js'))
  const code = Buffer.concat(js.map((f) => readFileSync(f)))
  results.probes[probe.name] = {
    entry: probe.entry,
    external: probe.external,
    chunks: js.length,
    minifiedBytes: code.length,
    gzipBytes: gzipSync(code).length,
    minifiedKiB: +(code.length / 1024).toFixed(1),
    gzipKiB: +(gzipSync(code).length / 1024).toFixed(1),
  }
}
mkdirSync(join(root, 'results'), { recursive: true })
writeFileSync(join(root, 'results', 'bundle-sizes.json'), `${JSON.stringify(results, null, 2)}\n`)
console.table(
  Object.fromEntries(Object.entries(results.probes).map(([k, v]) => [k, { chunks: v.chunks, 'min KiB': v.minifiedKiB, 'gzip KiB': v.gzipKiB }])),
)
