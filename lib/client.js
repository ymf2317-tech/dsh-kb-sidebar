/*!
 * dsh-kb-sidebar · 浏览器侧（单文件 / 零构建 / 零依赖）
 *
 * 干什么：在 DSH 右侧边栏注册一个「知识库」标签页，用于速查。
 *   · 搜索框走 /kb-api/search（BM25 + 向量混合检索，与 Agent 的 kb_search 同一套打分）
 *   · 空搜索时列出所选集合的文档，可按集合 / 标签筛选
 *   · 点开文档按「段」渲染，带目录跳转；来自搜索的结果会直接定位并高亮命中的那一段
 *   · 字号可调（A- / A+），记在 localStorage
 *
 * 契约：
 *   · 数据 100% 来自 dsh-knowledge-base-local 的同源 /kb-api，本包不碰 vault 文件；
 *   · 知识库未启用或 /kb-api 不可达时，面板自降级成一句提示，不抛异常；
 *   · 只读：本面板不会写库、不会改配置。
 */
;(function () {
  'use strict'

  var LOADER_ID = 'dsh-kb-sidebar'
  var TAB_ID = '@dsh-kb-sidebar/kb'
  var TAB_KIND = 'knowledgeBase'
  var STYLE_ID = 'dsh-kb-sidebar-styles'
  var PAGE = 40
  var DOC_LIMIT = 4000
  var FS_KEY = 'kbs-font-size'
  var FS_MIN = 13
  var FS_MAX = 21
  var FS_DEFAULT = 16
  var FOCUS_KEY = 'kbs-focus'
  var POS_PREFIX = 'kbs-pos:'
  var LAST_KEY = 'kbs-last'

  var CSS = [
    '.kbs{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;padding:10px 10px 8px;box-sizing:border-box;font-size:var(--kbs-fs,16px);line-height:1.6;color:var(--dsw-alias-label-primary,#e8e8e8)}',
    '.kbs-head{display:flex;align-items:center;gap:6px;flex:none}',
    '.kbs-title{font-weight:600;font-size:1.05em;flex:none}',
    '.kbs-meta{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:.78em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kbs-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#b3b3b3);font:inherit;font-size:.84em;padding:4px 7px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;flex:none;min-height:26px}',
    '.kbs-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#fff)}',
    '.kbs-btn:disabled{opacity:.45;cursor:default}',
    '.kbs-btn[data-on="1"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));color:var(--dsw-alias-label-primary,#fff);box-shadow:inset 0 0 0 1px var(--dsw-alias-label-tertiary,#8a8a8a)}',
    '.kbs-fs{display:flex;align-items:center;gap:0;flex:none;border:1px solid var(--dsw-alias-border-l4,rgba(255,255,255,.14));border-radius:999px;overflow:hidden}',
    '.kbs-fs button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#b3b3b3);font:inherit;font-size:.8em;padding:2px 8px;cursor:pointer;line-height:1.5}',
    '.kbs-fs button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}',
    '.kbs-search{position:relative;flex:none}',
    '.kbs-search input{width:100%;box-sizing:border-box;height:38px;padding:0 32px 0 11px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l4,rgba(255,255,255,.14));background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));color:inherit;font:inherit;font-size:max(16px,1em);outline:none}',
    '.kbs-search input:focus{border-color:var(--dsw-alias-brand-primary,#4d6bfe)}',
    '.kbs-search input::placeholder{color:var(--dsw-alias-label-caption,#777)}',
    '.kbs-clear{position:absolute;right:4px;top:5px;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-tertiary,#888);cursor:pointer;font-size:16px;line-height:1;padding:0}',
    '.kbs-clear:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.09))}',
    '.kbs-chips{display:flex;gap:6px;overflow-x:auto;flex:none;padding-bottom:2px;scrollbar-width:none}',
    '.kbs-chips::-webkit-scrollbar{display:none}',
    '.kbs-chip{flex:none;border:1px solid var(--dsw-alias-border-l3,rgba(255,255,255,.1));background:transparent;color:var(--dsw-alias-label-secondary,#b0b0b0);font:inherit;font-size:.82em;padding:4px 10px;border-radius:999px;cursor:pointer;white-space:nowrap}',
    '.kbs-chip[data-on="1"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.22));border-color:var(--dsw-alias-label-tertiary,#8a8a8a);color:var(--dsw-alias-label-primary,#fff);font-weight:600}',
    '.kbs-chips-tag .kbs-chip{font-size:.78em;padding:3px 9px}',
    '.kbs-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:2px;margin:0 -4px;padding:0 4px;-webkit-overflow-scrolling:touch}',
    '.kbs-row{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;font:inherit;padding:9px 8px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer}',
    '.kbs-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.07))}',
    '.kbs-row-title{font-size:1.02em;font-weight:600;line-height:1.45;word-break:break-word}',
    '.kbs-row-meta{font-size:.76em;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}',
    '.kbs-row-snippet{margin-top:5px;font-size:.9em;color:var(--dsw-alias-label-secondary,#b8b8b8);line-height:1.65;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
    '.kbs-tag{color:var(--dsw-alias-state-business-primary,#7aa2ff)}',
    '.kbs-score{color:var(--dsw-alias-state-business-primary,#7aa2ff)}',
    '.kbs-hint{color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:.85em;padding:16px 8px;text-align:center;line-height:1.7}',
    '.kbs-math{color:var(--dsw-alias-label-primary,#e8e8e8);font-variant-numeric:tabular-nums}',
    '.kbs-code{font-family:ui-monospace,Consolas,"Courier New",monospace;font-size:.9em;padding:0 .3em;border-radius:4px;background:rgba(255,255,255,.08)}',
    '.kbs-mark{background:rgba(255,205,60,.34);color:inherit;border-radius:3px;padding:0 .08em;box-decoration-break:clone;-webkit-box-decoration-break:clone}',
    '.kbs-notice{flex:none;font-size:.78em;color:var(--dsw-alias-label-tertiary,#8a8a8a);padding:0 2px 2px}',
    '.kbs-err{margin:4px 0;padding:8px 10px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-interactive-bg-hover-danger,rgba(255,80,80,.12));color:var(--dsw-alias-state-error-primary,#ff8080);font-size:.85em;word-break:break-word}',
    '.kbs-doc{display:flex;flex-direction:column;gap:6px;min-height:0;flex:1}',
    '.kbs-doc-head{display:flex;align-items:center;gap:6px;flex:none}',
    '.kbs-doc-title{font-size:1.05em;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.kbs-nav{display:flex;align-items:center;gap:0;flex:none}',
    '.kbs-nav-at{font-size:.76em;color:var(--dsw-alias-label-tertiary,#8a8a8a);padding:0 2px}',
    '.kbs-doc-sub{flex:none;font-size:.76em;color:var(--dsw-alias-label-tertiary,#8a8a8a);margin:0 2px 2px}',
    '.kbs-doc-bar{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap}',
    '.kbs-outline{flex:none;max-height:46%;overflow-y:auto;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.05));padding:6px 4px;overscroll-behavior:contain}',
    '.kbs-outline button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#c2c2c2);font:inherit;font-size:.85em;line-height:1.5;padding:6px 8px;border-radius:6px;cursor:pointer}',
    '.kbs-outline button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.09));color:var(--dsw-alias-label-primary,#fff)}',
    '.kbs-text{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-bottom:16px}',
    '.kbs-p{white-space:pre-wrap;word-break:break-word;font-size:1em;line-height:1.95;margin:0 0 .85em;user-select:text;-webkit-user-select:text}',
    '.kbs-p.kbs-h{font-weight:600;color:var(--dsw-alias-label-primary,#fff)}',
    '.kbs-p.kbs-hl{background:rgba(77,107,254,.18);box-shadow:0 0 0 6px rgba(77,107,254,.18);border-radius:6px}',
    '.kbs-pagelink{color:var(--dsw-alias-label-caption,#7d7d7d);font-size:.82em;text-align:center;margin:1em 0}',
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
  ].join('')

  function injectStyles() {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    var tag = document.createElement('style')
    tag.id = STYLE_ID
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  /** /kb-api 调用：同源 GET，返回 JSON；错误统一成可读中文。timeout 毫秒到了就掐断。 */
  function call(route, params, timeout) {
    var url = new URL('/kb-api/' + route, window.location.origin)
    if (params) {
      Object.keys(params).forEach(function (key) {
        var value = params[key]
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
      })
    }
    var controller = typeof AbortController === 'function' && timeout ? new AbortController() : null
    var alarm = controller
      ? setTimeout(function () {
          controller.abort()
        }, timeout)
      : null
    function clear() {
      if (alarm) clearTimeout(alarm)
    }
    return fetch(url.toString(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clear()
      if (res.status === 404) throw new Error('知识库接口不存在（/kb-api/' + route + '）——知识库插件可能已停用')
      if (!res.ok) throw new Error('接口返回 ' + res.status)
      return res.json()
    }).catch(function (err) {
      clear()
      if (err && (err.name === 'AbortError' || /aborted/i.test(String(err.message)))) {
        throw new Error('接口超时（' + Math.round(timeout / 1000) + ' 秒没响应）')
      }
      throw err
    })
  }

  /** 去掉 YAML frontmatter，并把分页锚点换成人能读的分隔。 */
  function tidy(text) {
    var body = String(text || '')
    if (body.slice(0, 3) === '---') {
      var end = body.indexOf('\n---', 3)
      if (end !== -1) body = body.slice(end + 4)
    }
    body = body.replace(/<!--\s*page\s+(\d+)\s*-->/g, '\n\n· · 第 $1 页 · ·\n\n')
    return body.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
  }

  /** 正文切成段：空行分段，段内保留原换行（reflow 之后一段就是一段）。 */
  function blocksOf(text) {
    var raw = String(text || '').split(/\n{2,}/)
    var out = []
    for (var i = 0; i < raw.length; i++) {
      var piece = raw[i].replace(/^\n+|\n+$/g, '')
      if (!piece.trim()) continue
      out.push(piece)
    }
    return out
  }

  var RE_ITEM = /^\s*(?:#{1,6}\s+|第[一二三四五六七八九十百零〇\d]{1,4}[章节]|\d{1,3}\s*[、.．)）]|[（(]\s*\d{1,3}\s*[）)]|[一二三四五六七八九十]{1,3}\s*[、.．]|[•·▪※◇])/
  var RE_PAGELINK = /^· · 第 \d+ 页 · ·$/

  function isHeadingBlock(piece) {
    var first = piece.split('\n')[0]
    if (RE_PAGELINK.test(first.trim())) return false
    if (first.length > 80) return false
    return RE_ITEM.test(first)
  }

  /** 目录：抽段落首行像标题/条目的那些段，点一下就能跳过去。 */
  function outlineOf(blocks) {
    var out = []
    for (var i = 0; i < blocks.length; i++) {
      if (!isHeadingBlock(blocks[i])) continue
      var label = blocks[i].split('\n')[0].replace(/^#{1,6}\s*/, '').trim()
      if (!label) continue
      out.push({ index: i, label: label.length > 34 ? label.slice(0, 34) + '…' : label })
    }
    return out
  }

  function squash(text) {
    return String(text || '').replace(/<!--[\s\S]*?-->/g, '').replace(/[\s\u3000]+/g, '')
  }

  /** 找到要定位的段：优先命中段落包含 focus 的前 14 个非空白字符。 */
  function findFocus(blocks, focus) {
    var needle = squash(focus).slice(0, 14)
    if (!needle) return -1
    for (var i = 0; i < blocks.length; i++) {
      if (squash(blocks[i]).indexOf(needle) !== -1) return i
    }
    if (needle.length > 6) {
      var shorter = needle.slice(0, 6)
      for (var j = 0; j < blocks.length; j++) {
        if (squash(blocks[j]).indexOf(shorter) !== -1) return j
      }
    }
    return -1
  }

  function escapeRe(text) {
    var special = '.*+?^${}()|[]' + String.fromCharCode(92)
    var source = String(text)
    var out = ''
    for (var i = 0; i < source.length; i++) {
      var ch = source.charAt(i)
      out += special.indexOf(ch) === -1 ? ch : String.fromCharCode(92) + ch
    }
    return out
  }

  /** 把搜索词拆成若干可高亮的词：整串 + 空白/标点切开的片段，长的优先。 */
  function queryTerms(query) {
    var text = String(query || '').trim()
    if (!text) return []
    var out = []
    function push(piece) {
      var value = String(piece || '').trim()
      if (value.length >= 2 && out.indexOf(value) === -1) out.push(value)
    }
    push(text)
    text.split(/[\s,，。；;、：:？?！!()（）\[\]【】"“”'']+/).forEach(push)
    out.sort(function (a, b) {
      return b.length - a.length
    })
    return out.slice(0, 8)
  }

  /** 段落里把查词标成 <mark>，返回可以直接渲染的节点数组。 */
  function markText(create, text, terms) {
    if (!terms || !terms.length) return text
    var re = new RegExp('(' + terms.map(escapeRe).join('|') + ')', 'gi')
    var out = []
    var last = 0
    var guard = 0
    var match
    while ((match = re.exec(text)) && guard++ < 800) {
      if (match.index > last) out.push(text.slice(last, match.index))
      out.push(create('mark', { key: 'mk' + match.index + '_' + guard, className: 'kbs-mark' }, match[0]))
      last = match.index + match[0].length
      if (match[0].length === 0) re.lastIndex += 1
    }
    if (last < text.length) out.push(text.slice(last))
    return out.length ? out : text
  }

  /* ---------- 把 OCR 正文里的 LaTeX / 轻量 Markdown 变成人看得懂的样子 ---------- */
  var LATEX_FUNCS = { ln: 1, log: 1, lg: 1, sin: 1, cos: 1, tan: 1, cot: 1, sec: 1, exp: 1, lim: 1, max: 1, min: 1, det: 1, arcsin: 1, arccos: 1, arctan: 1 }

  var LATEX_WORDS = {
    alpha: 'α', beta: 'β', gamma: 'γ', Gamma: 'Γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε',
    zeta: 'ζ', eta: 'η', theta: 'θ', Theta: 'Θ', kappa: 'κ', lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν',
    xi: 'ξ', pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', varphi: 'φ', Phi: 'Φ',
    chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω',
    circ: '°', degree: '°', times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', cdots: '…', ldots: '…', dots: '…',
    leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', propto: '∝', sim: '∼',
    rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', leftrightarrow: '↔', uparrow: '↑', downarrow: '↓',
    infty: '∞', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫', sqrt: '√', angle: '∠', perp: '⊥', parallel: '∥',
    alpha1: 'α', quad: ' ', qquad: '  ', text: '', mathrm: '', mathbf: '', mathit: '', rm: '', it: '', bf: '',
    left: '', right: '', displaystyle: '', limits: '', huge: '', big: '', Big: '',
    '%': '%', '&': '&', '#': '#', '_': '_'
  }

  var SUPER = "0⁰1¹2²3³4⁴5⁵6⁶7⁷8⁸9⁹+⁺-⁻=⁼(⁽)⁾nⁿiⁱaᵃbᵇcᶜdᵈeᵉxˣ"
  var SUB = "0₀1₁2₂3₃4₄5₅6₆7₇8₈9₉+₊-₋=₌(₍)₎nₙiᵢjⱼxₓaₐeₑoₒ"

  function mapChars(text, table) {
    if (!text) return ''
    for (var i = 0; i < text.length; i++) {
      if (table.indexOf(text.charAt(i)) === -1) return text
    }
    var out = ''
    for (var k = 0; k < text.length; k++) {
      var ch = text.charAt(k)
      out += table.charAt(table.indexOf(ch) + 1)
    }
    return out
  }

  function upperChars(text) {
    return mapChars(text, SUPER)
  }

  function lowerChars(text) {
    return mapChars(text, SUB)
  }

  /** LaTeX 片段 → 可读纯文字：希腊字母、°、上下标、常用符号；不做排版只求看懂。 */
  function latexToText(source) {
    var s = String(source || '')
    var out = ''
    var i = 0
    function isLetter(ch) {
      return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
    }
    function readGroup(at) {
      // 返回 { body, next }：at 指向 { 或单个字符
      if (s.charAt(at) === '{') {
        var depth = 0
        var j = at
        var body = ''
        while (j < s.length) {
          var ch = s.charAt(j)
          if (ch === '{') {
            depth++
            if (depth > 1) body += ch
          } else if (ch === '}') {
            depth--
            if (depth === 0) return { body: body, next: j + 1 }
            body += ch
          } else {
            body += ch
          }
          j++
        }
        return { body: body, next: j }
      }
      return { body: s.charAt(at), next: at + 1 }
    }
    while (i < s.length) {
      var ch = s.charAt(i)
      if (ch === '\\') {
        var j = i + 1
        var name = ''
        while (j < s.length && isLetter(s.charAt(j))) {
          name += s.charAt(j)
          j++
        }
        if (!name) {
          // \, \; \! \{ \} 这种单字符命令：直接丢掉命令符
          i = j + 1
          continue
        }
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          var top = readGroup(j)
          var bottom = readGroup(top.next)
          out += latexToText(top.body) + '/' + latexToText(bottom.body)
          i = bottom.next
          continue
        }
        if (name === 'textcircled') {
          /* OCR 常把序号识别成 \textcircled{2}，还原成 ② */
          var circledGroup = readGroup(j)
          var circledText = String(circledGroup.body).trim()
          var circledNum = parseInt(circledText, 10)
          var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
          out += circledNum >= 1 && circledNum <= 20 ? CIRCLED.charAt(circledNum - 1) : circledText
          i = circledGroup.next
          continue
        }
        var mapped = LATEX_WORDS[name]
        if (mapped === undefined) {
          /* ln / log / sin 这类函数名：前一个字符是字母数字时补个空格，免得连成一串。 */
          if (LATEX_FUNCS[name]) {
            var prev = out.charAt(out.length - 1)
            if (prev && /[0-9A-Za-z]/.test(prev)) out += ' '
          }
          out += name
          i = j
          continue
        }
        out += mapped
        i = j
        continue
      }
      if (ch === '^' || ch === '_') {
        var group = readGroup(i + 1)
        var body = latexToText(group.body)
        out += ch === '^' ? upperChars(body) : lowerChars(body)
        i = group.next
        continue
      }
      if (ch === '{' || ch === '}') {
        i++
        continue
      }
      out += ch
      i++
    }
    return out.replace(/\s+/g, ' ').trim()
  }

  /** 正文渲染：$$…$$ / $…$ 走 LaTeX 简化，**粗体** / `代码` 走轻量 Markdown，其余保留原文（含换行）。 */
  function richText(create, text, terms) {
    var raw = String(text || '')
    var out = []
    var parts = raw.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g)
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i]
      if (!part) continue
      if (part.length > 2 && part.charAt(0) === "$" && part.charAt(part.length - 1) === "$") {
        var inner = part.slice(part.charAt(1) === "$" ? 2 : 1, part.charAt(1) === "$" ? -2 : -1)
        out.push(create('span', { key: 'mt' + i, className: 'kbs-math' }, latexToText(inner)))
        continue
      }
      var chunks = part.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g)
      for (var k = 0; k < chunks.length; k++) {
        var chunk = chunks[k]
        if (!chunk) continue
        if (chunk.length > 4 && chunk.slice(0, 2) === "**" && chunk.slice(-2) === "**") {
          out.push(create('strong', { key: 'bd' + i + '_' + k }, markText(create, chunk.slice(2, -2), terms)))
          continue
        }
        if (chunk.length > 2 && chunk.charAt(0) === "`" && chunk.charAt(chunk.length - 1) === "`") {
          out.push(create('code', { key: 'cd' + i + '_' + k, className: 'kbs-code' }, chunk.slice(1, -1)))
          continue
        }
        out.push(markText(create, chunk, terms))
      }
    }
    return out
  }

  function readFont() {
    try {
      var raw = window.localStorage.getItem(FS_KEY)
      var value = Number(raw)
      if (value >= FS_MIN && value <= FS_MAX) return value
    } catch (error) {
      /* 无 localStorage 时用默认 */
    }
    return FS_DEFAULT
  }

  function saveFont(value) {
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
  }

  function score(value) {
    return typeof value === 'number' ? value.toFixed(3) : ''
  }

  function tagText(item) {
    var tags = item && item.tags
    if (!Array.isArray(tags) || !tags.length) return ''
    var skip = { 考研: 1, '北工大875': 1, OCR: 1 }
    var kept = tags.filter(function (t) {
      return !skip[t]
    })
    /* 短的更直观：「背诵本」比「背诵精华295题」更像人话。 */
    kept.sort(function (a, b) {
      return a.length - b.length
    })
    return kept.slice(0, 2).join(' / ')
  }

  try {
    window.__ModuleLoader__.load({
      id: LOADER_ID,
      factory: function factory(require) {
        var module = { exports: {} }
        var exports = module.exports

        var react = require('react')
        if (!react) react = globalThis.React
        if (!react) throw new Error('dsh-kb-sidebar: 拿不到 React 运行时')
        var h = react.createElement
        var useState = react.useState
        var useEffect = react.useEffect
        var useRef = react.useRef
        var useCallback = react.useCallback

        function Panel() {
          injectStyles()

          var [status, setStatus] = useState(null)
          var [q, setQ] = useState('')
          var [collection, setCollection] = useState('')
          var [tag, setTag] = useState('')
          var [tagList, setTagList] = useState([])
          var [results, setResults] = useState(null)
          var [docs, setDocs] = useState(null)
          var [doc, setDoc] = useState(null)
          var [outlineOpen, setOutlineOpen] = useState(false)
          var [hl, setHl] = useState(-1)
          var [hitPos, setHitPos] = useState(0)
          var [nav, setNav] = useState(null)
          var [fs, setFs] = useState(readFont)
          var [focusMode, setFocusMode] = useState(readFocus)
          var [lastDoc, setLastDoc] = useState(readLast)
          var [busy, setBusy] = useState(false)
          var [notice, setNotice] = useState('')
          var [error, setError] = useState('')
          var timer = useRef(null)
          var seq = useRef(0)
          var textRef = useRef(null)
          var blockRefs = useRef([])

          var loadStatus = useCallback(function () {
            call('status').then(function (data) {
              setStatus(data)
            }).catch(function (err) {
              setError(String(err.message || err))
            })
          }, [])

          /* 标签不是独立接口，从文档列表聚合出来（40 篇量级，一次拿全）。 */
          var loadTags = useCallback(function (col) {
            call('docs', { collection: col, limit: 200 }).then(function (data) {
              var counts = {}
              var list = data.docs || []
              for (var i = 0; i < list.length; i++) {
                var tags = list[i].tags || []
                for (var j = 0; j < tags.length; j++) {
                  counts[tags[j]] = (counts[tags[j]] || 0) + 1
                }
              }
              /* 覆盖几乎全部文档的标签（考研 / 北工大875 / OCR 这种 100% 万能标签）筛不出东西，不占位置。
                 阈值 95%：教材占 kaoyan 的 81%，是真筛选器，不能被旧的 75% 规则误杀。 */
              var total = list.length
              var out = Object.keys(counts).filter(function (name) {
                return total ? counts[name] < total * 0.95 : true
              }).map(function (name) {
                return { name: name, count: counts[name] }
              })
              /* 按「区分度」排：一半一半的标签最能筛出东西，一边倒的往后放。 */
              out.sort(function (a, b) {
                var sa = a.count * (total - a.count)
                var sb = b.count * (total - b.count)
                return sb - sa || (a.name < b.name ? -1 : 1)
              })
              /* 真题 / 历年真题 这种包含关系只留短的那个。 */
              out = out.filter(function (item, index) {
                for (var k = 0; k < out.length; k++) {
                  if (k === index) continue
                  if (out[k].name !== item.name && item.name.indexOf(out[k].name) !== -1) return false
                }
                return true
              })
              setTagList(out.slice(0, 14))
            }).catch(function () {
              setTagList([])
            })
          }, [])

          useEffect(function () {
            loadStatus()
            loadTags('')
            return function () {
              if (timer.current) clearTimeout(timer.current)
            }
          }, [loadStatus, loadTags])

          /** 搜索或列目录：谁在跑就认最新的那次（seq 防止慢请求覆盖新结果）。 */
          /* 检索：向量服务（本地 ollama）要是卡住，直接退回纯文字检索，
           * 不能让面板一直转圈——2026-11-12 就是被 embedding runner 卡死拖垮的。 */
          var searchWithFallback = function (query, col, tg, mine) {
            return call('search', { q: query, collection: col, tags: tg, limit: 24 }, 15000).catch(function (err) {
              if (!/超时/.test(String(err && err.message))) throw err
              if (mine !== seq.current) throw err
              setNotice('向量服务没响应，已退回文字检索')
              return call('search', { q: query, collection: col, tags: tg, limit: 24, mode: 'lexical' }, 10000)
            })
          }

          var run = useCallback(function (query, col, tg) {
            var mine = ++seq.current
            setBusy(true)
            setError('')
            setNotice('')
            var promise = query
              ? searchWithFallback(query, col, tg, mine).then(function (data) {
                  if (mine !== seq.current) return
                  setResults({ total: data.total, list: data.results || [] })
                  setDocs(null)
                })
              : call('docs', { collection: col, tag: tg, limit: PAGE, sort: 'title' }, 15000).then(function (data) {
                  if (mine !== seq.current) return
                  setDocs({ total: data.total, list: data.docs || [] })
                  setResults(null)
                })
            promise.catch(function (err) {
              if (mine !== seq.current) return
              setError(String(err.message || err))
              setResults({ total: 0, list: [] })
            }).then(function () {
              if (mine === seq.current) setBusy(false)
            })
          }, [])

          useEffect(function () {
            if (doc) return
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(function () {
              run(q.trim(), collection, tag)
            }, q ? 280 : 0)
          }, [q, collection, tag, doc, run])

          /** 打开一篇：整篇取回（≤4000 行），切成段落做目录，命中处定位高亮。 */
          var openDoc = useCallback(function (id, focus, query, navObj) {
            /* 列表那边的 0/280ms 防抖 run() 还排着队的话先掐掉：
             * 它也会 ++seq，会把这次开篇的响应判成过期、直接丢掉（表现为点了没反应）。 */
            if (timer.current) clearTimeout(timer.current)
            var mine = ++seq.current
            setBusy(true)
            setError('')
            call('doc', { id: id, offset: 1, limit: DOC_LIMIT }).then(function (data) {
              if (mine !== seq.current) return
              var body = tidy(data.content)
              var blocks = blocksOf(body)
              var index = findFocus(blocks, focus || '')
              var terms = queryTerms(query || '')
              var hitIdx = []
              if (terms.length) {
                for (var i = 0; i < blocks.length; i++) {
                  var flat = squash(blocks[i])
                  for (var k = 0; k < terms.length; k++) {
                    if (flat.indexOf(squash(terms[k])) !== -1) {
                      hitIdx.push(i)
                      break
                    }
                  }
                }
              }
              /* 片段对不上（服务端 snippet 可能从句子中间截）就用查词兜底：落到第一个含查词的段。 */
              if (index < 0 && hitIdx.length) index = hitIdx[0]
              setDoc({
                id: data.id,
                title: data.title,
                collection: data.collection,
                tags: data.tags || [],
                totalLines: data.totalLines,
                chars: body.length,
                blocks: blocks,
                outline: outlineOf(blocks),
                focus: focus || '',
                terms: terms,
                hitIdx: hitIdx
              })
              setHl(index)
              setNav(navObj === undefined ? null : navObj)
              setHitPos(index >= 0 && hitIdx.indexOf(index) !== -1 ? hitIdx.indexOf(index) : 0)
              setOutlineOpen(false)
              saveLast({ id: data.id, title: data.title })
              setLastDoc({ id: data.id, title: data.title })
            }).catch(function (err) {
              if (mine !== seq.current) return
              setError(String(err.message || err))
            }).then(function () {
              if (mine === seq.current) setBusy(false)
            })
          }, [])

          /* 打开后的第一屏：有命中滚到命中段；纯阅读（没有查词）就回到上次读到的段。 */
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
          }

          /* 命中在正文里散开时，一个一个跳，不用自己滚。 */
          /* 滚到某一段里的第一个标亮词（没有 mark 就滚到这一段）。 */
          var scrollToHit = function (index) {
            var el = blockRefs.current[index]
            if (!el || typeof el.scrollIntoView !== 'function') return
            var mark = el.querySelector ? el.querySelector('.kbs-mark') : null
            ;(mark || el).scrollIntoView({ block: 'center', behavior: 'smooth' })
          }

          var nextHit = function () {
            if (!doc || !doc.hitIdx || !doc.hitIdx.length) return
            var next = (hitPos + 1) % doc.hitIdx.length
            var target = doc.hitIdx[next]
            setHitPos(next)
            setHl(target)
            setOutlineOpen(false)
            setTimeout(function () {
              scrollToHit(target)
            }, 60)
          }

          /* 搜索结果之间前后走：结果 2/4 这种。 */
          var goResult = function (delta) {
            if (!nav || !nav.list || nav.list.length < 2) return
            var at = (nav.at + delta + nav.list.length) % nav.list.length
            var hit = nav.list[at]
            openDoc(hit.docId, hit.snippet || hit.heading || '', q.trim(), { list: nav.list, at: at })
          }

          var jump = function (index) {
            var el = blockRefs.current[index]
            if (el && typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }
            setHl(-1)
            setOutlineOpen(false)
          }

          var changeFont = function (delta) {
            var next = Math.min(FS_MAX, Math.max(FS_MIN, fs + delta))
            setFs(next)
            saveFont(next)
          }

          var collections = (status && status.collections) || []
          var counts = status ? status.docs + ' 篇 / ' + status.chunks + ' 块' : '加载中…'

          var fontBox = h('div', { className: 'kbs-fs' },
            h('button', { title: '小一点', onClick: function () { changeFont(-1) } }, 'A-'),
            h('button', { title: '大一点', onClick: function () { changeFont(1) } }, 'A+')
          )

          var header = h('div', { className: 'kbs-head' },
            h('span', { className: 'kbs-title' }, '知识库'),
            h('span', { className: 'kbs-meta' }, counts),
            fontBox,
            h('button', {
              className: 'kbs-btn',
              title: '刷新',
              disabled: busy,
              onClick: function () {
                loadStatus()
                loadTags(collection)
                if (doc) return
                run(q.trim(), collection, tag)
              }
            }, '刷新')
          )

          if (doc) {
            var outline = doc.outline || []
            var blocks = doc.blocks || []
            /* 篇间连读：用当前列表（搜索结果 / 文档列表）当顺序，走到头就没了。 */
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
                focusMode ? null : h('div', { className: 'kbs-doc-head' },
                  h('button', {
                    className: 'kbs-btn',
                    onClick: closeDoc
                  }, '← 返回'),
                  h('span', { className: 'kbs-doc-title' }, doc.title),
                  nav && nav.list.length > 1
                    ? h('div', { className: 'kbs-nav' },
                        h('button', { className: 'kbs-btn', title: '上一个搜索结果', onClick: function () { goResult(-1) } }, '‹'),
                        h('span', { className: 'kbs-nav-at' }, (nav.at + 1) + '/' + nav.list.length),
                        h('button', { className: 'kbs-btn', title: '下一个搜索结果', onClick: function () { goResult(1) } }, '›')
                      )
                    : null,
                  h('button', {
                    className: 'kbs-btn',
                    'data-on': outlineOpen ? '1' : '0',
                    disabled: outline.length === 0,
                    onClick: function () {
                      setOutlineOpen(!outlineOpen)
                    }
                  }, '目录 ' + outline.length),
                  h('button', {
                    className: 'kbs-btn',
                    title: '全屏专注阅读：只留正文和字号',
                    onClick: function () {
                      setFocusMode(true)
                      saveFocus(true)
                    }
                  }, '专注'),
                  doc.hitIdx && doc.hitIdx.length
                    ? h('button', {
                        className: 'kbs-btn',
                        title: '跳到下一处命中',
                        onClick: nextHit
                      }, '命中 ' + (Math.min(hitPos, doc.hitIdx.length - 1) + 1) + '/' + doc.hitIdx.length)
                    : null
                ),
                focusMode ? null : h('div', { className: 'kbs-doc-sub' },
                  [doc.collection, tagText(doc), blocks.length + ' 段', doc.chars + ' 字', doc.terms && doc.terms.length ? '命中 ' + (doc.hitIdx || []).length + ' 段' : ''].filter(Boolean).join(' · ')
                ),
                error ? h('div', { className: 'kbs-err' }, error) : null,
                outlineOpen
                  ? h('div', { className: 'kbs-outline' },
                      outline.map(function (item) {
                        return h('button', {
                          key: 'o' + item.index,
                          className: 'kbs-oli',
                          onClick: function () {
                            jump(item.index)
                          }
                        }, item.label)
                      }),
                      outline.length === 0 ? h('div', { className: 'kbs-hint' }, '这篇没识别出小标题') : null
                    )
                  : null,
                h('div', { className: 'kbs-text', ref: textRef, onScroll: remember },
                  blocks.map(function (piece, index) {
                    var isPage = RE_PAGELINK.test(piece.trim())
                    return h('div', {
                      key: 'b' + index,
                      ref: function (el) {
                        blockRefs.current[index] = el
                      },
                      className: 'kbs-p' + (isPage ? ' kbs-pagelink' : '') + (isHeadingBlock(piece) ? ' kbs-h' : '') + (index === hl ? ' kbs-hl' : '')
                    }, richText(h, piece, doc.terms))
                  })
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

          var chips = h('div', { className: 'kbs-chips' },
            h('button', {
              className: 'kbs-chip',
              'data-on': collection === '' ? '1' : '0',
              onClick: function () {
                setCollection('')
                setTag('')
                loadTags('')
              }
            }, '全部 ' + (status ? status.docs : '')),
            collections.map(function (item) {
              return h('button', {
                key: item.name,
                className: 'kbs-chip',
                'data-on': collection === item.name ? '1' : '0',
                onClick: function () {
                  setCollection(item.name)
                  setTag('')
                  loadTags(item.name)
                }
              }, item.name + ' ' + (item.docs == null ? '' : item.docs))
            })
          )

          var tagChips = tagList.length
            ? h('div', { className: 'kbs-chips kbs-chips-tag' },
                h('button', {
                  className: 'kbs-chip',
                  'data-on': tag === '' ? '1' : '0',
                  onClick: function () {
                    setTag('')
                  }
                }, '不限标签'),
                tagList.map(function (item) {
                  return h('button', {
                    key: item.name,
                    className: 'kbs-chip',
                    'data-on': tag === item.name ? '1' : '0',
                    onClick: function () {
                      setTag(tag === item.name ? '' : item.name)
                    }
                  }, '#' + item.name + ' ' + item.count)
                })
              )
            : null

          var list = null
          if (results) {
            list = results.list.length === 0
              ? h('div', { className: 'kbs-hint' }, busy ? '检索中…' : '没有命中。换个说法，或者把集合/标签放宽。')
              : results.list.map(function (hit, index) {
                  return h('button', {
                    key: hit.docId + ':' + hit.chunk + ':' + index,
                    className: 'kbs-row',
                    onClick: function () {
                      openDoc(hit.docId, hit.snippet || hit.heading || '', q.trim(), { list: results.list, at: index })
                    }
                  },
                    h('div', { className: 'kbs-row-title' }, hit.title || hit.docId),
                    h('div', { className: 'kbs-row-meta' },
                      hit.collection ? h('span', null, hit.collection) : null,
                      hit.heading ? h('span', { className: 'kbs-tag' }, hit.heading) : null,
                      hit.score != null ? h('span', { className: 'kbs-score' }, score(hit.score)) : null
                    ),
                    hit.snippet ? h('div', { className: 'kbs-row-snippet' }, tidy(hit.snippet)) : null
                  )
                })
          } else if (docs) {
            list = docs.list.length === 0
              ? h('div', { className: 'kbs-hint' }, busy ? '加载中…' : '这个筛选下没有文档。')
              : docs.list.map(function (item) {
                  return h('button', {
                    key: item.id,
                    className: 'kbs-row',
                    onClick: function () {
                      openDoc(item.id, '', '', null)
                    }
                  },
                    h('div', { className: 'kbs-row-title' }, item.title || item.id),
                    h('div', { className: 'kbs-row-meta' },
                      item.collection ? h('span', null, item.collection) : null,
                      tagText(item) ? h('span', { className: 'kbs-tag' }, tagText(item)) : null,
                      h('span', null, (item.chunkCount || 0) + ' 块'),
                      item.chars ? h('span', null, item.chars + ' 字') : null
                    )
                  )
                })
          }

          return h('div', { className: 'kbs', style: { '--kbs-fs': fs + 'px' } },
            header,
            h('div', { className: 'kbs-search' },
              h('input', {
                value: q,
                placeholder: '搜知识库：概念、题目、年份…',
                onChange: function (event) {
                  setQ(event.target.value)
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') {
                    if (timer.current) clearTimeout(timer.current)
                    run(q.trim(), collection, tag)
                  }
                }
              }),
              q
                ? h('button', {
                    className: 'kbs-clear',
                    title: '清空',
                    onClick: function () {
                      setQ('')
                    }
                  }, '×')
                : null
            ),
            chips,
            tagChips,
            error ? h('div', { className: 'kbs-err' }, error) : null,
            notice ? h('div', { className: 'kbs-notice' }, notice) : null,
            !q && lastDoc
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
            h('div', { className: 'kbs-body' }, list)
          )
        }

        /* 出错边界：面板里任何渲染异常都变成屏上一句话 + window.__KB_SIDEBAR_ERR，
         * 而不是整块白屏（白屏什么都不留，之前就没法查）。 */
        function makeBoundary(React, Inner) {
          var Component = React && React.Component
          if (typeof Component !== 'function') return Inner
          function Boundary(props) {
            Component.call(this, props)
            this.state = { err: '' }
          }
          Boundary.prototype = Object.create(Component.prototype)
          Boundary.prototype.constructor = Boundary
          Boundary.prototype.componentDidCatch = function (error) {
            var text = String((error && (error.stack || error.message)) || error)
            try {
              window.__KB_SIDEBAR_ERR = text
            } catch (ignored) {
              /* 无 window 时忽略 */
            }
            this.setState({ err: String((error && error.message) || error) })
          }
          Boundary.prototype.render = function () {
            if (this.state.err) {
              return h('div', { className: 'kbs-err', style: { margin: '12px' } }, '知识库面板出错：' + this.state.err)
            }
            return h(Inner, this.props)
          }
          return Boundary
        }

        function Title() {
          return h('span', null, '知识库')
        }

        var Slot = makeBoundary(react, Panel)

        function apply(ctx) {
          /* 右侧栏 tab 类型（用户看到的「+」菜单里的那一项）。
           * 契约见 @deepseek-ai/dsh-client-ui-sidebar-right：
           *   sidebarRightTabs.register({ id, kind, title, guide })
           *   正文 slots.register({ name:'sidebar.right.pane.tab', key:id })
           *   chip 标题 slots.register({ name:'sidebar.right.pane.tab.title', key:id })
           * guide 是「添加 tab」菜单里的入口框，不给就不会出现在菜单里。
           */
          ctx.inject(['sidebarRightTabs'], function (c) {
            var disposers = []
            function keep(disposer) {
              if (typeof disposer === 'function') disposers.push(disposer)
            }
            function release() {
              while (disposers.length) {
                try {
                  disposers.pop()()
                } catch (error) {
                  /* 释放失败不影响页面 */
                }
              }
            }
            try {
              if (!c || !c.sidebarRightTabs || typeof c.sidebarRightTabs.register !== 'function') {
                return release
              }
              try {
                console.log('[dsh-kb-sidebar] applied · tab=' + TAB_ID + ' · build=v2')
              } catch (ignored) {
                /* 无 console 时忽略 */
              }
              keep(c.sidebarRightTabs.register({
                id: TAB_ID,
                kind: TAB_KIND,
                title: function () {
                  return '知识库'
                },
                guide: [{
                  id: 'kb-search',
                  order: 20,
                  title: function () {
                    return '知识库'
                  },
                  description: function () {
                    return '按概念/题目/年份搜本地知识库：结果直接跳到命中的那一段，可按「背诵本 / 真题」筛选'
                  }
                }]
              }))
              keep(c.slots.inject('sidebar.right.pane.tab', function () {
                return c.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, Slot)
              }))
              keep(c.slots.inject('sidebar.right.pane.tab.title', function () {
                return c.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, Title)
              }))
            } catch (error) {
              try {
                window.__KB_SIDEBAR_ERR = String((error && error.message) || error)
              } catch (ignored) {
                /* 无 window 时忽略 */
              }
              release()
              return
            }
            return release
          })
        }

        exports.apply = apply
        exports.inject = ['slots']
        exports.TAB_ID = TAB_ID
        /* 纯函数出口：只给本地冒烟测试用，运行时不依赖它。 */
        exports.__test = {
          Panel: Panel,
          latexToText: latexToText,
          richText: richText,
          blocksOf: blocksOf,
          outlineOf: outlineOf,
          findFocus: findFocus,
          tidy: tidy,
          isHeadingBlock: isHeadingBlock
        }
        return module.exports
      }
    })
  } catch (error) {
    var text = String((error && error.message) || error)
    if (!/duplicate factory registration/.test(text)) throw error
  }
})()
