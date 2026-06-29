/**
 * GitHub 同步配置
 *
 * Token 需要在页面打开后通过"设置"按钮手动输入一次（之后保存在 localStorage）
 * 这是出于安全考虑：GitHub 会扫描公开仓库中的 token 并自动撤销
 */
(function (window) {
  "use strict";
  // 不再预置 token — 用户首次使用时通过页面右上角"设置"按钮输入
  // Token 只存在浏览器 localStorage 中，不会出现在代码里
})(window);
