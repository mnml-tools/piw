// Bundle part: lowlight + highlight.js "common" grammars only.
import { common, createLowlight } from 'lowlight'

;(window as unknown as Record<string, unknown>)['__probe'] = createLowlight(common)
