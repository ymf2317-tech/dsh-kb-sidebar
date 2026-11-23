/* 0.3.0 补丁：修选中态对比度 + 专注模式 + 断点续读 + 篇间连读。
 * 每个锚点都断言「恰好出现一次」，任何一处对不上就整体不写盘（避免写坏半个文件）。
 */
import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(process.cwd(), 'lib/client.js')
let raw = fs.readFileSync(file, 'utf8')
const crlf = raw.includes('\r\n')
let src = crlf ? raw.replace(/\r\n/g, '\n') : raw
const origin = src

const edits = []
function sub(name, from, to) {
  edits.push({ name, from, to })
}

/* ---------- 1. 选中态：不再用 brand-primary 当底色（浅色主题下它是白的，白底白字） ---------- */
sub(
  'css-btn-on',
  `    '.kbs-btn[data-on="1"]{background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}',`,
  `    '.kbs-btn[data-on="1"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary,#fff);box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary,#8a8a8a)}',`
)
sub(
  'css-chip-on',
  `    '.kbs-chip[data-on="1"]{background:var(--dsw-alias-brand-primary,#4d6bfe);border-color:transparent;color:#fff}',`,
  `    '.kbs-chip[data-on="1"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));border-color:var(--dsw-alias-label-tertiary,#8a8a8a);color:var(--dsw-alias-label-primary,#fff);font-weight:600}',`
)

/* ---------- 2. 新样式 ---------- */
sub(
  'css-extra',
  `    '.kbs-pagelink{color:var(--dsw-alias-label-caption,#7d7d7d);font-size:.82em;text-align:center;margin:1em 0}'
  ].join('')`,
  `    '.kbs-pagelink{color:var(--dsw-alias-label-caption,#7d7d7d);font-size:.82em;text-align:center;margin:1em 0}',
    '.kbs-focus{padding:6px 8px 2px}',
    '.kbs-focusbar{display:flex;align-items:center;gap:2px;flex:none;padding-bottom:3px;border-bottom:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.08))}',
    '.kbs-focusbar-title{flex:1;min-width:0;font-size:.82em;font-weight:600;color:var(--dsw-alias-label-secondary,#b3b3b3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kbs-doc-foot{display:flex;gap:8px;flex:none;padding:2px 0 12px}',
    '.kbs-foot-btn{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.1));background:transparent;color:var(--dsw-alias-label-secondary,#b3b3b3);font:inherit;font-size:.8em;padding:9px 10px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}',
    '.kbs-foot-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#fff)}',
    '.kbs-continue{display:block;width:100%;box-sizing:border-box;text-align:left;border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.1));background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));color:inherit;font:inherit;padding:9px 10px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer;flex:none}',
    '.kbs-continue:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}',
    '.kbs-continue-label{font-size:.72em;color:var(--dsw-alias-label-tertiary,#8a8a8a)}',
    '.kbs-continue-title{font-size:.95em;font-weight:600;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  ].join('')`
)

/* ---------- 3. 常量 ---------- */
sub(
  'consts',
  `  var FS_DEFAULT = 16`,
  `  var FS_DEFAULT = 16
  var FOCUS_KEY = 'kbs-focus'
  var POS_PREFIX = 'kbs-pos:'
  var LAST_KEY = 'kbs-last'`
)

/* ---------- 4. 持久化小工具 ---------- */
sub(
  'helpers',
  `  function saveFont(value) {
    try {
      window.localStorage.setItem(FS_KEY, String(value))
    } catch (error) {
      /* 存不了就算了，本次会话照常生效 */
    }
  }`,
  `  function saveFont(value) {
    try {
      window.localStorage.setItem(FS_KEY, String(value))
    } catch (error) {
      /* 存不了就算了，本次会话照常生效 */
    }
  }

  function readFocus() {
    try {
      return window.localStorage.getItem(FOCUS_KEY) === '1'
    } catch (error) {
      return false
    }
  }

  function saveFocus(value) {
    try {
      window.localStorage.setItem(FOCUS_KEY, value ? '1' : '0')
    } catch (error) {
      /* 同上 */
    }
  }

  /* 断点记「读到第几段」而不是 scrollTop：换字号、换屏宽、换设备都还能落回原处。 */
  function savePos(id, index) {
    try {
      window.localStorage.setItem(POS_PREFIX + id, JSON.stringify({ i: index, at: Date.now() }))
    } catch (error) {
      /* 同上 */
    }
  }

  function readPos(id) {
    try {
      var stored = window.localStorage.getItem(POS_PREFIX + id)
      if (!stored) return null
      var parsed = JSON.parse(stored)
      if (parsed && typeof parsed.i === 'number' && parsed.i >= 0) return parsed
    } catch (error) {
      /* 脏数据当没有 */
    }
    return null
  }

  function saveLast(item) {
    try {
      window.localStorage.setItem(LAST_KEY, JSON.stringify({ id: item.id, title: item.title || '' }))
    } catch (error) {
      /* 同上 */
    }
  }

  function readLast() {
    try {
      var stored = window.localStorage.getItem(LAST_KEY)
      if (!stored) return null
      var parsed = JSON.parse(stored)
      if (parsed && parsed.id) return parsed
    } catch (error) {
      /* 同上 */
    }
    return null
  }`
)

/* ---------- 5. 新 state ---------- */
sub(
  'states',
  `          var [fs, setFs] = useState(readFont)`,
  `          var [fs, setFs] = useState(readFont)
          var [focusMode, setFocusMode] = useState(readFocus)
          var [lastDoc, setLastDoc] = useState(readLast)`
)

/* ---------- 6. openDoc 里记住「上次读到的那篇」 ---------- */
sub(
  'openDoc-last',
  `              setOutlineOpen(false)
            }).catch(function (err) {
              if (mine !== seq.current) return
              setError(String(err.message || err))
            }).then(function () {
              if (mine === seq.current) setBusy(false)
            })
          }, [])`,
  `              setOutlineOpen(false)
              saveLast({ id: data.id, title: data.title })
              setLastDoc({ id: data.id, title: data.title })
            }).catch(function (err) {
              if (mine !== seq.current) return
              setError(String(err.message || err))
            }).then(function () {
              if (mine === seq.current) setBusy(false)
            })
          }, [])`
)

/* ---------- 7. 打开后定位：有命中滚命中，没命中回到断点 ---------- */
sub(
  'effect-position',
  `          /* 打开后的第一屏：滚到命中段（没有命中就从头看）。 */
          useEffect(function () {
            if (!doc) return
            if (hl < 0) return
            var el = blockRefs.current[hl]
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ block: 'center' })
            }
          }, [doc, hl])`,
  `          /* 打开后的第一屏：有命中滚到命中段；纯阅读（没有查词）就回到上次读到的段。 */
          useEffect(function () {
            if (!doc) return
            if (hl >= 0) {
              var el = blockRefs.current[hl]
              if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ block: 'center' })
              }
              return
            }
            var saved = readPos(doc.id)
            if (!saved || !saved.i) return
            var back = blockRefs.current[saved.i]
            if (back && typeof back.scrollIntoView === 'function') {
              back.scrollIntoView({ block: 'start' })
            }
          }, [doc, hl])

          /* 滚动时记断点：400ms 节流，只存段索引。 */
          var posTimer = useRef(null)
          var remember = function () {
            if (!doc) return
            if (posTimer.current) clearTimeout(posTimer.current)
            posTimer.current = setTimeout(function () {
              var box = textRef.current
              if (!box) return
              var top = box.scrollTop
              var index = 0
              for (var i = 0; i < doc.blocks.length; i++) {
                var node = blockRefs.current[i]
                if (!node) continue
                if (node.offsetTop - top <= 48) index = i
                else break
              }
              savePos(doc.id, index)
            }, 400)
          }`
)

/* ---------- 8. 文档视图：专注模式 + 篇间连读 ---------- */
sub(
  'doc-view-open',
  `            return h('div', { className: 'kbs', style: { '--kbs-fs': fs + 'px' } },
              header,
              h('div', { className: 'kbs-doc' },
                h('div', { className: 'kbs-doc-head' },`,
  `            /* 篇间连读：用当前列表（搜索结果 / 文档列表）当顺序，走到头就没了。 */
            var siblings = []
            if (nav && nav.list && nav.list.length) {
              siblings = nav.list.map(function (item) {
                return { id: item.docId, title: item.title || item.docId }
              })
            } else if (results && results.list && results.list.length) {
              siblings = results.list.map(function (item) {
                return { id: item.docId, title: item.title || item.docId }
              })
            } else if (docs && docs.list && docs.list.length) {
              siblings = docs.list.map(function (item) {
                return { id: item.id, title: item.title || item.id }
              })
            }
            var here = -1
            for (var si = 0; si < siblings.length; si++) {
              if (siblings[si].id === doc.id) {
                here = si
                break
              }
            }
            var prevSib = here > 0 ? siblings[here - 1] : null
            var nextSib = here >= 0 && here < siblings.length - 1 ? siblings[here + 1] : null
            var closeDoc = function () {
              remember()
              setDoc(null)
              setHl(-1)
            }
            return h('div', { className: 'kbs' + (focusMode ? ' kbs-focus' : ''), style: { '--kbs-fs': fs + 'px' } },
              focusMode ? null : header,
              h('div', { className: 'kbs-doc' },
                focusMode
                  ? h('div', { className: 'kbs-focusbar' },
                      h('button', { className: 'kbs-btn', title: '返回列表', onClick: closeDoc }, '←'),
                      h('span', { className: 'kbs-focusbar-title' }, doc.title),
                      h('button', { className: 'kbs-btn', title: '小一点', onClick: function () { changeFont(-1) } }, 'A-'),
                      h('button', { className: 'kbs-btn', title: '大一点', onClick: function () { changeFont(1) } }, 'A+'),
                      h('button', {
                        className: 'kbs-btn',
                        'data-on': outlineOpen ? '1' : '0',
                        disabled: outline.length === 0,
                        onClick: function () {
                          setOutlineOpen(!outlineOpen)
                        }
                      }, '目录'),
                      h('button', {
                        className: 'kbs-btn',
                        title: '退出专注模式',
                        onClick: function () {
                          setFocusMode(false)
                          saveFocus(false)
                        }
                      }, '退出')
                    )
                  : null,
                focusMode ? null : h('div', { className: 'kbs-doc-head' },`
)

/* 返回按钮：顺手记断点 */
sub(
  'doc-back',
  `                  h('button', {
                    className: 'kbs-btn',
                    onClick: function () {
                      setDoc(null)
                      setHl(-1)
                    }
                  }, '← 返回'),`,
  `                  h('button', {
                    className: 'kbs-btn',
                    onClick: closeDoc
                  }, '← 返回'),`
)

/* 专注按钮（普通视图里） */
sub(
  'doc-focus-btn',
  `                  }, '目录 ' + outline.length),`,
  `                  }, '目录 ' + outline.length),
                  h('button', {
                    className: 'kbs-btn',
                    title: '全屏专注阅读：只留正文和字号',
                    onClick: function () {
                      setFocusMode(true)
                      saveFocus(true)
                    }
                  }, '专注'),`
)

/* 专注模式下不显示那行元信息 */
sub(
  'doc-sub',
  `                h('div', { className: 'kbs-doc-sub' },`,
  `                focusMode ? null : h('div', { className: 'kbs-doc-sub' },`
)

/* 正文容器加 onScroll */
sub(
  'text-scroll',
  `                h('div', { className: 'kbs-text', ref: textRef },`,
  `                h('div', { className: 'kbs-text', ref: textRef, onScroll: remember },`
)

/* 正文末尾加「上一篇 / 下一篇」 */
sub(
  'doc-foot',
  `                  })
                )
              )
            )
          }

          var chips = h('div', { className: 'kbs-chips' },`,
  `                  })
                ),
                prevSib || nextSib
                  ? h('div', { className: 'kbs-doc-foot' },
                      prevSib
                        ? h('button', {
                            className: 'kbs-foot-btn',
                            title: prevSib.title,
                            onClick: function () {
                              openDoc(prevSib.id, '', '', null)
                            }
                          }, '‹ ' + prevSib.title)
                        : null,
                      nextSib
                        ? h('button', {
                            className: 'kbs-foot-btn',
                            style: { textAlign: 'right' },
                            title: nextSib.title,
                            onClick: function () {
                              openDoc(nextSib.id, '', '', null)
                            }
                          }, nextSib.title + ' ›')
                        : null
                    )
                  : null
              )
            )
          }

          var chips = h('div', { className: 'kbs-chips' },`
)

/* ---------- 9. 列表页「继续读」 ---------- */
sub(
  'list-continue',
  `            h('div', { className: 'kbs-body' }, list)`,
  `            !q && lastDoc
              ? h('button', {
                  className: 'kbs-continue',
                  onClick: function () {
                    openDoc(lastDoc.id, '', '', null)
                  }
                },
                  h('div', { className: 'kbs-continue-label' }, '继续读上次的位置'),
                  h('div', { className: 'kbs-continue-title' }, lastDoc.title || lastDoc.id)
                )
              : null,
            h('div', { className: 'kbs-body' }, list)`
)

/* ---------- 落地：逐条断言「恰好一次」 ---------- */
const applied = []
for (const edit of edits) {
  const count = src.split(edit.from).length - 1
  if (count !== 1) {
    console.error(`[FAIL] ${edit.name}: 锚点出现 ${count} 次（需要 1 次）`)
    process.exit(2)
  }
  src = src.replace(edit.from, () => edit.to)
  applied.push(edit.name)
}

if (src === origin) {
  console.error('[FAIL] 没有任何变化')
  process.exit(3)
}

fs.writeFileSync(file, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8')
console.log('PATCH_OK ' + applied.length + ' edits: ' + applied.join(', '))
