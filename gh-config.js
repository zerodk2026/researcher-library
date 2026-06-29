/**
 * GitHub 同步配置
 *
 * Token 不写在代码里（公开仓库会被 GitHub 安全扫描拦截）。
 * 首次访问时通过 URL 参数传入，例如：
 *   https://zerodk2026.github.io/researcher-library/?token=github_pat_xxx
 *
 * 传入后自动保存到 localStorage，之后访问无需再带参数。
 * 你可以把带 token 的完整链接收藏起来，换设备时打开即可。
 */
(function (window) {
  "use strict";
  try {
    // 1. 检查 URL 中是否携带 token 参数
    var params = new URLSearchParams(window.location.search);
    var urlToken = params.get("token");
    if (urlToken && urlToken.startsWith("github_pat_")) {
      localStorage.setItem("gh_sync_token", urlToken);
      // 清除 URL 中的 token 参数（防止泄露到浏览历史/分享链接）
      var cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (e) {}
})(window);
