// 冒烟测试：用假 loader + 假 React 载入 lib/client.js，拿 exports.__test 跑真实知识库文本
import { readFile } from 'node:fs/promises'

const path = 'D:/dsh-workspace/packages/dsh-kb-sidebar/lib/client.js'
const code = await readFile(path, 'utf8')

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load: (spec) => { captured = spec }
  }
}
// eslint-disable-next-line no-new-func
new Function(code)()

if (!captured) throw new Error('loader 没被调用')
const reactStub = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn
}
const mod = captured.factory((name) => (name === 'react' ? reactStub : null))
const T = mod.__test
console.log('exports:', Object.keys(mod).join(','))
if (!T) throw new Error('__test 缺失')

// 拿真实文档：一篇背诵本 + 一篇真题
const ids = {
  beisong: 'kmwc8hzkeae96db', // 第8章 固态相变
  zhenti: 'kmwc8tq4w1ab6bf'   // 2018 年真题
}
for (const [label, id] of Object.entries(ids)) {
  const res = await fetch(`http://127.0.0.1:3081/kb-api/doc?id=${id}&offset=1&limit=4000`)
  const data = await res.json()
  const body = T.tidy(data.content)
  const blocks = T.blocksOf(body)
  const outline = T.outlineOf(blocks)
  console.log(`\n=== ${label} (${data.title}) 行 ${data.totalLines} 字 ${body.length}`)
  console.log(`段数 ${blocks.length} · 目录 ${outline.length}`)
  console.log('目录前 8 条：')
  for (const item of outline.slice(0, 8)) console.log(`  [${item.index}] ${item.label}`)
  // 命中定位：用第 3 条目录的后半段去反查，应回到同一条
  const probe = outline[2]
  if (probe) {
    const idx = T.findFocus(blocks, probe.label)
    console.log(`定位测试：label="${probe.label}" → 段 ${idx}（期望 ${probe.index}）`, idx === probe.index ? 'OK' : 'MISMATCH')
  }
  // 分页锚点渲染
  const pageHits = blocks.filter((b) => /第 \d+ 页/.test(b)).length
  console.log('页码锚点段：', pageHits)
}
