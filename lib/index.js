// dsh-kb-sidebar —— 宿主侧最小壳
//
// 这个插件不提供任何 HTTP 路由，也不碰知识库数据：
//   · 面板在浏览器侧（lib/client.js），通过同源 /kb-api 调用
//     dsh-knowledge-base-local 的接口；
//   · 知识库没装或被禁用时，面板自己会提示「/kb-api 不可达」。
//
// 所以这里只声明身份，让 cordis 能把这个包挂进 profile。

export const name = 'kb-sidebar'
export const inject = []

export function apply() {
  // 无宿主侧行为。保留函数是为了让 cordis 的加载日志里能看到本插件已生效。
}
