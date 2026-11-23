import { readFile } from 'node:fs/promises'
const code = await readFile('D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js', 'utf8')
let captured = null
globalThis.window = { __ModuleLoader__: { load: (s) => { captured = s } }, location: { origin: 'http://127.0.0.1:3081' }, localStorage: { getItem: () => null, setItem: () => {} } }
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
new Function(code)()
const react = { createElement: (t, p, ...c) => ({ t, p, c }), useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }), useCallback: (f) => f }
const mod = captured.factory((n) => (n === 'react' ? react : null))
const L = mod.__test.latexToText
const cases = [
  '\\gamma', '\\gamma-Fe', '300^{\\circ}\\mathrm{C}', 'M_n=\\sum N_i M_i / \\sum N_i',
  '\\Delta G = -RT\\ln K', 'a \\times b \\leq c', '\\frac{\\partial C}{\\partial x}',
  '10^{-3} \\mathrm{s}^{-1}', '\\alpha+\\beta', '\\mathrm{Fe_3C}', '\\theta_{max}', 'x^{2}+y^{2}'
]
for (const c of cases) console.log(JSON.stringify(c), '→', JSON.stringify(L(c)))
// richText 走一遍
const out = mod.__test.richText(react.createElement, '在 $300^{\\circ}\\mathrm{C}$ 时 $\\gamma$-Fe 与 **粗体** 和 `code` 混排', ['粗体'])
console.log('richText 节点数', out.length, JSON.stringify(out).slice(0, 300))
