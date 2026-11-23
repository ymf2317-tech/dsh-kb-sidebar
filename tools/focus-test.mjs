// 0.3.0 功能测试：专注模式 / 继续读 / 篇间连读
// 假 loader + 迷你 React 钩子 + 假 ctx 真跑 Panel；不依赖浏览器。
import { readFile } from 'node:fs/promises'

const ORIGIN = 'http://127.0.0.1:3081'
const code = await readFile('D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js', 'utf8')

/* ---------- 迷你 React（与 render-test.mjs 同款） ---------- */
let hooks = []
let cursor = 0
let pendingEffects = []
let rerender = null

function useState(init) {
  const idx = cursor++
  if (!(idx in hooks)) hooks[idx] = typeof init === 'function' ? init() : init
  const set = (value) => {
    const next = typeof value === 'function' ? value(hooks[idx]) : value
    if (Object.is(next, hooks[idx])) return
    hooks[idx] = next
    schedule()
  }
  return [hooks[idx], set]
}
function useRef(init) {
  const idx = cursor++
  if (!(idx in hooks)) hooks[idx] = { current: init }
  return hooks[idx]
}
function useEffect(fn, deps) {
  const idx = cursor++
  const prev = hooks[idx]
  const changed = !prev || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps[i]))
  if (changed) pendingEffects.push({ idx, fn, deps })
  hooks[idx] = prev || {}
  hooks[idx].deps = deps
}
function useCallback(fn, deps) {
  const i = cursor++
  const prev = hooks[i]
  if (prev && deps && prev.deps && prev.deps.length === deps.length && prev.deps.every((d, k) => Object.is(d, deps[k]))) return prev.fn
  hooks[i] = { fn, deps }
  return fn
}
function createElement(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) }
}
const reactStub = { createElement, useState, useEffect, useRef, useCallback }

const store = {}
globalThis.document = { head: { appendChild() {} }, getElementById: () => null, createElement: () => ({ set textContent(v) {}, id: '' }) }
globalThis.window = {
  location: { origin: ORIGIN },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  __ModuleLoader__: { load: (spec) => { globalThis.__spec = spec } }
}

new Function(code)()
const mod = globalThis.__spec.factory((name) => (name === 'react' ? reactStub : null))
mod.apply({
  inject(names, cb) {
    cb({ sidebarRightTabs: { register: () => () => {} }, slots: { inject: (n, fn) => fn(), register: () => () => {} } })
    return () => {}
  }
})
const Panel = mod.__test.Panel

function render() {
  cursor = 0
  pendingEffects = []
  const tree = Panel()
  const effects = pendingEffects
  pendingEffects = []
  for (const e of effects) {
    try { e.fn() } catch (err) { console.log('!! effect 抛错:', err && err.message) }
  }
  return tree
}
function schedule() {
  if (schedule.timer) return
  schedule.timer = setTimeout(() => { schedule.timer = null; rerender() }, 30)
}
function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') { visit(node); return }
  if (typeof node !== 'object') return
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}
function texts(node) {
  const out = []
  walk(node, (n) => { if (typeof n === 'string' || typeof n === 'number') out.push(String(n)) })
  return out
}
function allText(node) { return texts(node).join(' ').replace(/\s+/g, ' ').trim() }
function findBy(node, pred) {
  let found = null
  walk(node, (n) => { if (!found && n && n.type && pred(n)) found = n })
  return found
}
function findAll(node, pred) {
  const out = []
  walk(node, (n) => { if (n && n.type && pred(n)) out.push(n) })
  return out
}
let tree = null
rerender = () => { tree = render(); return tree }
async function waitFor(pred, ms) {
  const deadline = Date.now() + (ms || 8000)
  while (Date.now() < deadline) {
    const t = rerender()
    if (pred(t)) return t
    await new Promise((r) => setTimeout(r, 120))
  }
  return rerender()
}
const byClass = (cls) => (n) => n.props && n.props.className === cls
const say = (label, value) => console.log(label.padEnd(22, ' '), value)

/* ---------- 1. 列表页 ---------- */
tree = render()
await new Promise((r) => setTimeout(r, 500))
tree = await waitFor((t) => findAll(t, byClass('kbs-row')).length > 0, 10000)
say('列表行数', findAll(tree, byClass('kbs-row')).length)
say('挂载时「继续读」', findBy(tree, byClass('kbs-continue')) ? '有（不该有）' : '无（正确）')

/* ---------- 2. 点开一篇（纯阅读，无查词） ---------- */
const firstRow = findAll(tree, byClass('kbs-row'))[0]
firstRow.props.onClick()
tree = await waitFor((t) => Boolean(findBy(t, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0)), 10000)
const paras = findAll(tree, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0)
say('段落数', paras.length)
say('普通视图 header', findBy(tree, byClass('kbs-head')) ? '在' : '不在（不该）')
say('普通视图 专注钮', findBy(tree, (n) => n.props && n.props.className === 'kbs-btn' && texts(n).join('') === '专注') ? '有' : 'MISSING')
say('last 已记住', store['kbs-last'] || '（空）')

const footBtns = findAll(tree, byClass('kbs-foot-btn'))
say('篇间连读按钮', footBtns.length ? footBtns.map((b) => texts(b).join('')).join(' | ') : '无')

/* ---------- 3. 进专注模式 ---------- */
findBy(tree, (n) => n.props && n.props.className === 'kbs-btn' && texts(n).join('') === '专注').props.onClick()
tree = await waitFor((t) => Boolean(findBy(t, byClass('kbs-focusbar'))), 4000)
const bar = findBy(tree, byClass('kbs-focusbar'))
say('专注 bar', bar ? texts(bar).join(' ') : 'MISSING')
say('专注时 header', findBy(tree, byClass('kbs-head')) ? '还在（不该）' : '已隐藏')
say('专注时 副标题', findBy(tree, byClass('kbs-doc-sub')) ? '还在（不该）' : '已隐藏')
say('专注态写入', store['kbs-focus'])
say('专注时仍有正文', findAll(tree, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0).length)

/* ---------- 4. 退出专注 ---------- */
findBy(tree, (n) => n.props && n.props.className === 'kbs-btn' && texts(n).join('') === '退出').props.onClick()
tree = await waitFor((t) => Boolean(findBy(t, byClass('kbs-head'))), 4000)
say('退出后 header', findBy(tree, byClass('kbs-head')) ? '回来了' : 'MISSING')
say('专注态写入', store['kbs-focus'])

/* ---------- 5. 篇间连读：点「下一篇」 ---------- */
const titleOf = (t) => {
  const el = findBy(t, byClass('kbs-doc-title'))
  return el ? texts(el).join('') : ''
}
const before = titleOf(tree)
const foot = findAll(tree, byClass('kbs-foot-btn'))
if (foot.length) {
  foot[foot.length - 1].props.onClick()
  tree = await waitFor((t) => titleOf(t) !== before && titleOf(t) !== '', 10000)
}
say('连读前 → 后', before + ' → ' + titleOf(tree))

/* ---------- 6. 返回列表，看「继续读」 ---------- */
findBy(tree, (n) => n.props && n.props.className === 'kbs-btn' && texts(n).join('') === '← 返回').props.onClick()
tree = await waitFor((t) => Boolean(findBy(t, byClass('kbs-continue'))), 4000)
const cont = findBy(tree, byClass('kbs-continue'))
say('返回后「继续读」', cont ? texts(cont).join(' · ') : 'MISSING')

/* ---------- 7. 断点续读：预置 kbs-pos 再打开同一篇 ---------- */
let opened = JSON.parse(store['kbs-last'])
store['kbs-pos:' + opened.id] = JSON.stringify({ i: 5, at: Date.now() })
cont.props.onClick()
tree = await waitFor((t) => Boolean(findBy(t, byClass('kbs-doc-head'))), 10000)
say('续读后错误', findBy(tree, byClass('kbs-err')) ? allText(findBy(tree, byClass('kbs-err'))) : '无')
say('续读后段落数', findAll(tree, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0).length)

process.exit(0)
