import { readFile } from 'node:fs/promises'
const code = await readFile('D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js', 'utf8')
let captured = null
globalThis.window = { __ModuleLoader__: { load: (s) => { captured = s } }, location: { origin: 'http://127.0.0.1:3081' }, localStorage: { getItem: () => null, setItem: () => {} } }
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
new Function(code)()
const react = { createElement: (t, p, ...c) => ({ t, p, c }), useState: (v) => [v, () => {}], useEffect: () => {}, useRef: (v) => ({ current: v }), useCallback: (f) => f }
const mod = captured.factory((n) => (n === 'react' ? react : null))
const { tidy, blocksOf, richText } = mod.__test

// React 树 → 纯文本（把 mark 用【】包起来，便于确认高亮落点）
function flat(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flat).join('')
  if (node.t === 'mark') return '【' + flat(node.c) + '】'
  return flat(node.c)
}

const res = await fetch('http://127.0.0.1:3081/kb-api/doc?id=kmwc8hzkeae96db&offset=1&limit=4000')
const data = await res.json()
const blocks = blocksOf(tidy(data.content))
const terms = ['固溶体']
let shown = 0
for (const b of blocks) {
  if (!/[\\$]/.test(b)) continue
  const out = flat(richText(react.createElement, b, terms))
  console.log('原文:', b.slice(0, 70))
  console.log('渲染:', out.slice(0, 90))
  console.log('---')
  if (++shown >= 6) break
}
const total = blocks.filter((b) => /[\\$]/.test(b)).length
console.log('含 LaTeX 的段落数:', total, '/ 总段数', blocks.length)
const leftover = blocks.filter((b) => /\$[^$]*\\[a-zA-Z]+\$/.test(b)).length
console.log('仍有「$\\命令$」残留的段:', leftover)
