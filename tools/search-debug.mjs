// 调试：为什么 harness 里输入后不出搜索结果
import { readFile } from 'node:fs/promises'

const code = await readFile('D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js', 'utf8')
let cap = null
globalThis.window = { __ModuleLoader__: { load: (s) => { cap = s } }, location: { origin: 'http://127.0.0.1:3081' }, localStorage: { getItem: () => null, setItem: () => {} } }
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
new Function(code)()

const req = []
const realFetch = globalThis.fetch
globalThis.fetch = (u, o) => { req.push(String(u)); return realFetch(u, o) }

let hooks = []
let cursor = 0
let effects = []
let pending = false
function useState(init) {
  const i = cursor++
  if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
  return [hooks[i], (v) => {
    hooks[i] = typeof v === 'function' ? v(hooks[i]) : v
    if (!pending) { pending = true; setTimeout(() => { pending = false; render() }, 20) }
  }]
}
function useRef(v) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: v }; return hooks[i] }
function useEffect(fn, deps) {
  const i = cursor++
  const prev = hooks[i]
  const changed = !prev || !prev.deps || deps.some((d, k) => !Object.is(d, prev.deps[k]))
  if (changed) effects.push(fn)
  hooks[i] = { deps }
}
function useCallback(fn, deps) {
  const i = cursor++
  const prev = hooks[i]
  if (prev && deps && prev.deps && prev.deps.length === deps.length && prev.deps.every((d, k) => Object.is(d, deps[k]))) return prev.fn
  hooks[i] = { fn, deps }
  return fn
}
function Component() {}
const react = { createElement: (t, p, ...c) => ({ type: t, props: p || {}, children: c.flat(Infinity).filter((x) => x != null && x !== false) }), useState, useEffect, useRef, useCallback, Component }

const mod = cap.factory((n) => (n === 'react' ? react : null))
let Panel = null
mod.apply({ inject: (names, cb) => { cb({ sidebarRightTabs: { register: () => () => {} }, slots: { inject: (n, f) => f(), register: (d, c) => { if (d.name === 'sidebar.right.pane.tab') Panel = c; return () => {} } } }) } })

Panel = mod.__test.Panel
let tree = null
function render() {
  cursor = 0
  effects = []
  tree = Panel()
  const snapshot = effects
  effects = []
  for (const fn of snapshot) {
    try { fn() } catch (err) { console.log('!! effect 抛错:', err && err.message) }
  }
  return tree
}
function find(node, pred) {
  let found = null
  ;(function w(x) {
    if (!x || typeof x !== 'object') return
    if (x.type && pred(x) && !found) found = x
    for (const c of x.children || []) w(c)
  })(node)
  return found
}

render()
await new Promise((r) => setTimeout(r, 900))
render()
console.log('初始 fetch:', req.map((u) => u.split('/kb-api/')[1]))
const input = find(tree, (n) => n.type === 'input')
console.log('input value:', JSON.stringify(input.props.value), 'onChange:', typeof input.props.onChange)
input.props.onChange({ target: { value: '间隙固溶体' } })
await new Promise((r) => setTimeout(r, 200))
console.log('改动后 200ms:', req.map((u) => u.split('/kb-api/')[1]))
render()
console.log('render 后 input value:', JSON.stringify(find(tree, (n) => n.type === 'input').props.value))
await new Promise((r) => setTimeout(r, 2000))
render()
console.log('2s 后 fetch:', req.map((u) => u.split('/kb-api/')[1]))
const scores = []
;(function w(x) { if (!x || typeof x !== 'object') return; if (x.props && x.props.className === 'kbs-score') scores.push(1); for (const c of x.children || []) w(c) })(tree)
console.log('结果行数:', scores.length)
const err = find(tree, (n) => n.props && n.props.className === 'kbs-err')
console.log('错误:', err ? JSON.stringify(err.children) : '无')
process.exit(0)
