// 渲染测试：假 loader + 迷你 React 钩子运行时 + 假 ctx，真正跑一遍 Panel
// 目的：在没有浏览器的情况下抓住「面板白屏 / 搜索没反应」这类运行时错误。
import { readFile } from 'node:fs/promises'

const ORIGIN = 'http://127.0.0.1:3081'
const code = await readFile('D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js', 'utf8')

/* ---------- 迷你 React ---------- */
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
  const changed = !prev || !deps || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps[i]))
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

/* ---------- 假 DOM / window ---------- */
const fakeDoc = {
  head: { appendChild() {} },
  getElementById: () => null,
  createElement: () => ({ set textContent(v) {}, id: '' })
}
const store = {}
globalThis.document = fakeDoc
globalThis.window = {
  location: { origin: ORIGIN },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) }
  },
  __ModuleLoader__: { load: (spec) => { globalThis.__spec = spec } }
}
const realFetch = globalThis.fetch

/* ---------- 载入插件 ---------- */
new Function(code)()
const mod = globalThis.__spec.factory((name) => (name === 'react' ? reactStub : null))

let Panel = null
const fakeCtx = {
  inject(names, cb) {
    cb({
      sidebarRightTabs: { register: (spec) => { globalThis.__tab = spec; return () => {} } },
      slots: {
        inject: (name, fn) => fn(),
        register: (desc, comp) => { if (desc.name === 'sidebar.right.pane.tab') Panel = comp; return () => {} }
      }
    })
    return () => {}
  }
}
mod.apply(fakeCtx)
console.log('tab 注册:', globalThis.__tab ? `${globalThis.__tab.id} / ${globalThis.__tab.kind}` : 'MISSING')
if (!mod.__test || !mod.__test.Panel) throw new Error('Panel 没导出')
Panel = mod.__test.Panel
console.log('slot 组件:', Panel && Panel.name)

/* ---------- 渲染循环 ---------- */
function render() {
  cursor = 0
  pendingEffects = []
  const tree = Panel()
  const effects = pendingEffects
  pendingEffects = []
  for (const e of effects) {
    try {
      e.fn()
    } catch (err) {
      console.log('!! effect 抛错:', err && err.message)
    }
  }
  return tree
}
function schedule() {
  if (schedule.timer) return
  schedule.timer = setTimeout(() => {
    schedule.timer = null
    rerender()
  }, 30)
}

function walk(node, visit) {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') {
    visit(node)
    return
  }
  if (typeof node !== 'object') return
  visit(node)
  for (const child of node.children || []) walk(child, visit)
}

function texts(node) {
  const out = []
  walk(node, (n) => {
    if (typeof n === 'string' || typeof n === 'number') out.push(String(n))
  })
  return out
}

function allText(node) {
  return texts(node).join(' ').replace(/\s+/g, ' ').trim()
}
async function waitFor(pred, ms) {
  const deadline = Date.now() + (ms || 8000)
  while (Date.now() < deadline) {
    const t = rerender()
    if (pred(t)) return t
    await new Promise((r) => setTimeout(r, 120))
  }
  return rerender()
}
let tree = null
rerender = function () {
  tree = render()
  return tree
}
tree = render()
await new Promise((r) => setTimeout(r, 400))
rerender()

function findBy(node, pred) {
  let found = null
  walk(node, (n) => {
    if (!found && n.type && pred(n)) found = n
  })
  return found
}

/* ---------- 断言 ---------- */
const input = findBy(tree, (n) => n.type === 'input')
console.log('搜索框存在:', Boolean(input))
const chipTexts = texts(tree).filter((t) => t.startsWith('#') || t === '不限标签')
console.log('标签 chips:', chipTexts.join(' | ') || '（空）')
const rowTitles = []
walk(tree, (n) => {
  if (n.props && n.props.className === 'kbs-row-title') {
    walk(n, (m) => { if (typeof m === 'string') rowTitles.push(m) })
  }
})
console.log('列表行数:', rowTitles.length, '前 3:', rowTitles.slice(0, 3).join(' / '))
const errNode = findBy(tree, (n) => n.props && n.props.className === 'kbs-err')
console.log('错误提示:', errNode ? texts(errNode).join('') : '无')

/* 模拟输入并回车 */
if (input && input.props.onChange) {
  realFetch(`${ORIGIN}/kb-api/status`).catch(() => {})
  input.props.onChange({ target: { value: '固溶体' } })
  await new Promise((r) => setTimeout(r, 400))
  tree = await waitFor((t) => Boolean(findBy(t, (n) => n.props && n.props.className === 'kbs-score')), 12000)
  const after = []
  walk(tree, (n) => {
    if (n.props && n.props.className === 'kbs-row-title') walk(n, (m) => { if (typeof m === 'string') after.push(m) })
  })
  console.log('搜索后结果行数:', after.length, '前 3:', after.slice(0, 3).join(' / '))
  const e2 = findBy(tree, (n) => n.props && n.props.className === 'kbs-err')
  console.log('搜索后错误:', e2 ? texts(e2).join('') : '无')

  /* 点第一条结果，进阅读视图 */
  const row = findBy(tree, (n) => n.props && n.props.className === 'kbs-row')
  if (row && row.props.onClick) {
    row.props.onClick()
    tree = await waitFor((t) => Boolean(findBy(t, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0)), 10000)
    const paras = []
    walk(tree, (n) => {
      if (n.props && typeof n.props.className === 'string' && n.props.className.indexOf('kbs-p') === 0) paras.push(n)
    })
    const hl = paras.filter((n) => n.props.className.includes('kbs-hl')).length
    console.log('阅读视图段落数:', paras.length, '高亮段:', hl)
    const outlineBtn = findBy(tree, (n) => n.props && n.props.className === 'kbs-btn' && typeof n.children?.[0] === 'string' && n.children[0].startsWith('目录'))
    console.log('目录按钮:', outlineBtn ? outlineBtn.children[0] : 'MISSING')
    const sub = findBy(tree, (n) => n.props && n.props.className === 'kbs-doc-sub')
    console.log('副标题:', sub ? texts(sub).join('') : 'MISSING')
  }
}

    /* 结果间导航：搜索多条命中时，点「›」应换到下一条结果 */
    const navBox = findBy(tree, (n) => n.props && n.props.className === 'kbs-nav')
    const titleOf = (t) => {
      const el = findBy(t, (n) => n.props && n.props.className === 'kbs-doc-title')
      return el ? texts(el).join('') : ''
    }
    console.log('结果导航:', navBox ? texts(navBox).join(' ') : 'MISSING', '· 当前标题:', titleOf(tree))
    if (navBox) {
      const btns = (navBox.children || []).filter((c) => c && c.type === 'button')
      const before = titleOf(tree)
      btns[btns.length - 1].props.onClick()
      tree = await waitFor((t) => {
        const el = findBy(t, (n) => n.props && n.props.className === 'kbs-doc-title')
        return el && texts(el).join('') !== before
      }, 10000)
      const nav2 = findBy(tree, (n) => n.props && n.props.className === 'kbs-nav')
      console.log('点下一个 → 标题:', titleOf(tree), '· 计数:', nav2 ? texts(nav2).join(' ') : 'MISSING')
      const markCount = []
      walk(tree, (n) => { if (n.props && n.props.className === 'kbs-mark') markCount.push(1) })
      console.log('正文标亮词数:', markCount.length)
    }

process.exit(0)
