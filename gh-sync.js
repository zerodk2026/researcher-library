/**
 * GitHub 同步模块
 * 使用 GitHub Contents API 实现跨设备数据同步
 *
 * 数据存储在: zerodk2026/researcher-library-data 仓库的 data/index.json
 */
(function (window) {
  "use strict";

  var GH_CONFIG = {
    owner: "zerodk2026",
    repo: "researcher-library-data",
    branch: "main",
    dataPath: "data/index.json"
  };

  var TOKEN_KEY = "gh_sync_token";
  var LAST_SYNC_KEY = "gh_last_sync";
  var pushLock = false;
  var pushQueue = false;

  // ---------- Token 管理 ----------

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; }
    catch (e) { return ""; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); }
    catch (e) {}
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LAST_SYNC_KEY);
    } catch (e) {}
  }

  function hasToken() {
    return !!getToken();
  }

  // ---------- GitHub API ----------

  function apiBase() {
    return "https://api.github.com/repos/" + GH_CONFIG.owner + "/" + GH_CONFIG.repo;
  }

  function rawUrl() {
    return "https://raw.githubusercontent.com/" + GH_CONFIG.owner + "/" +
           GH_CONFIG.repo + "/" + GH_CONFIG.branch + "/" + GH_CONFIG.dataPath +
           "?t=" + Date.now(); // cache buster
  }

  /**
   * 从 GitHub 拉取最新数据（私有仓库必须用 API + token）
   * callback(data, error)
   */
  function pull(onDone) {
    var token = getToken();
    if (!token) { onDone(null, "no token"); return; }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", apiBase() + "/contents/" + GH_CONFIG.dataPath + "?ref=" + GH_CONFIG.branch, true);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText);
            // 正确解码 base64 → UTF-8（atob 默认按 Latin-1 解码，中文会乱码）
            var binary = atob(resp.content.replace(/\n/g, ""));
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
            var content = new TextDecoder("utf-8").decode(bytes);
            var data = JSON.parse(content);
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
            onDone(data, null);
          } catch (e) {
            onDone(null, "parse error: " + e.message);
          }
        } else if (xhr.status === 404) {
          onDone(null, "file not found");
        } else {
          onDone(null, "HTTP " + xhr.status);
        }
      }
    };
    xhr.onerror = function () { onDone(null, "network error"); };
    xhr.send();
  }

  /**
   * 推送数据到 GitHub
   * data: JSON object to push
   * callback(success, error)
   *
   * 内置防抖：如果正在推送，标记 queue=true，推送完成后自动再推一次
   */
  function push(data, onDone) {
    if (pushLock) {
      pushQueue = true;
      if (onDone) onDone(true, "queued");
      return;
    }
    pushLock = true;

    var token = getToken();
    if (!token) {
      pushLock = false;
      if (onDone) onDone(false, "no token");
      return;
    }

    // Step 1: 获取当前文件的 sha（用于更新）
    var xhr = new XMLHttpRequest();
    xhr.open("GET", apiBase() + "/contents/" + GH_CONFIG.dataPath + "?ref=" + GH_CONFIG.branch, true);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var sha = null;
        if (xhr.status === 200) {
          try { sha = JSON.parse(xhr.responseText).sha; } catch (e) {}
        }
        // Step 2: 推送内容（sha 可有可无，有则是更新，无则是创建）
        pushContent(data, sha, onDone);
      }
    };
    xhr.onerror = function () {
      pushLock = false;
      if (onDone) onDone(false, "network error on get sha");
    };
    xhr.send();
  }

  function pushContent(data, sha, onDone) {
    var token = getToken();
    var content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    var payload = {
      message: "Auto-sync " + new Date().toISOString().replace("T", " ").slice(0, 19),
      content: content,
      branch: GH_CONFIG.branch
    };
    if (sha) payload.sha = sha;

    var xhr = new XMLHttpRequest();
    xhr.open("PUT", apiBase() + "/contents/" + GH_CONFIG.dataPath, true);
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        pushLock = false;
        if (xhr.status === 200 || xhr.status === 201) {
          localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
          if (onDone) onDone(true, null);
          // 处理排队的推送
          if (pushQueue) {
            pushQueue = false;
            setTimeout(function () { push(data, null); }, 500);
          }
        } else {
          var msg = "HTTP " + xhr.status;
          try {
            var resp = JSON.parse(xhr.responseText);
            if (resp.message) msg = resp.message;
          } catch (e) {}
          if (onDone) onDone(false, msg);
          pushQueue = false;
        }
      }
    };
    xhr.onerror = function () {
      pushLock = false;
      if (onDone) onDone(false, "network error on push");
    };
    xhr.send(JSON.stringify(payload));
  }

  /**
   * 获取最后同步时间（格式化）
   */
  function getLastSyncText() {
    try {
      var ts = localStorage.getItem(LAST_SYNC_KEY);
      if (!ts) return "未同步";
      var d = new Date(ts);
      var now = new Date();
      var diff = (now - d) / 1000;
      if (diff < 60) return Math.floor(diff) + " 秒前同步";
      if (diff < 3600) return Math.floor(diff / 60) + " 分钟前同步";
      if (diff < 86400) return Math.floor(diff / 3600) + " 小时前同步";
      return d.getMonth() + 1 + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    } catch (e) { return "未同步"; }
  }

  // ---------- 导出 ----------
  window.GitHubSync = {
    config: GH_CONFIG,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    hasToken: hasToken,
    pull: pull,
    push: push,
    getLastSyncText: getLastSyncText
  };
})(window);
