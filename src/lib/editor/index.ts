// Headless editor kit (framework-agnostic). React bindings live in ./react.
export {
  isSameDoc,
  jsonToMarkdown,
  jsonToPlainText,
  serializeDoc,
  type DocJSON,
} from './serialization';
export { applyExternalContent } from './sync';
