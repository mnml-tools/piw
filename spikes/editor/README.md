# Editor spike (archived)

This is the proof of concept behind [the editor section of the architecture guide](../../docs/architecture.md#documents-and-the-editor). It compares
Tiptap 3 and CodeMirror 6, with golden-file round-trip tests, bundle sizes and timings
(`results/`).

The production editor code was copied from here into [`src/lib/editor`](../../src/lib/editor),
which is where it is maintained and tested. This folder is kept only as evidence for the
decision. It is a standalone package, outside the app's workspace:

```bash
cd spikes/editor && pnpm install --frozen-lockfile && pnpm test
```
