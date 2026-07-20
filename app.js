/**
 * 研究员库 - 前端应用
 */
(function () {
  "use strict";

  var DATA = null;
  var currentResearcher = null;
  var currentTab = "browse";
  var searchQuery = "";
  var sortBy = "count";
  var filterDirection = "";
  var charts = {};

  // ---------- 初始化 ----------
  function init() {
    // 数据仓库已公开，pull 通过 raw URL 直接读取，无需 token
    if (window.GitHubSync) {
      showSyncBar();
      GitHubSync.pull(function (ghData, err) {
        if (ghData) {
          DATA = ghData;
          onLoaded();
          if (GitHubSync.hasToken()) {
            showToast("已从云端同步最新数据");
          }
        } else {
          loadJSON("data/index.json", function (data) {
            DATA = data;
            onLoaded();
            showToast("云同步失败，使用本地数据：" + (err || ""), "error");
            updateSyncStatus("同步失败");
          }, function () {
            showErrorState();
          });
        }
      });
    } else {
      loadJSON("data/index.json", function (data) {
        DATA = data;
        onLoaded();
      }, function () {
        showErrorState();
      });
    }

    bindEvents();
  }

  // 更新同步状态栏的文字
  function updateSyncStatus(text) {
    var el = document.getElementById("sync-status-text");
    if (el) el.textContent = text;
    var timeEl = document.getElementById("sync-last-time");
    if (timeEl && text !== "已连接") timeEl.textContent = text;
  }

  function showErrorState() {
    document.getElementById("content-display").innerHTML =
      '<div class="welcome-state"><h2>数据加载失败</h2><p>请确保 data/index.json 存在</p></div>';
  }

  function onLoaded() {
    updateStatsBadge();
    renderResearcherList();
    renderFilters();
    renderWelcome();
    updateSyncUI();
    checkEditMode();
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // Tab 切换
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.dataset.tab);
      });
    });

    // 搜索
    var searchInput = document.getElementById("search-input");
    var searchTimer = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      var val = this.value.trim();
      document.getElementById("search-clear").style.display = val ? "block" : "none";
      searchTimer = setTimeout(function () {
        searchQuery = val.toLowerCase();
        if (currentTab === "browse") {
          if (searchQuery) { renderSearchResults(); }
          else { renderResearcherList(); if (currentResearcher) { renderResearcherDetail(currentResearcher); } else { renderWelcome(); } }
        }
      }, 200);
    });

    document.getElementById("search-clear").addEventListener("click", function () {
      searchInput.value = "";
      searchQuery = "";
      this.style.display = "none";
      renderResearcherList();
      if (currentResearcher) { renderResearcherDetail(currentResearcher); } else { renderWelcome(); }
    });

    // 排序
    document.getElementById("sort-select").addEventListener("change", function () {
      sortBy = this.value;
      renderResearcherList();
    });

    // 方向筛选
    document.getElementById("filter-direction").addEventListener("change", function () {
      filterDirection = this.value;
      if (currentResearcher) { renderResearcherDetail(currentResearcher); }
      renderResearcherList();
    });
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
    document.querySelector('[data-tab="' + tab + '"]').classList.add("active");
    document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
    document.getElementById("tab-" + tab).classList.add("active");
    if (tab === "stats") { renderStats(); }
  }

  // ---------- 数据加载 ----------
  function loadJSON(url, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try { onSuccess(JSON.parse(xhr.responseText)); }
          catch (e) { if (onError) onError(); }
        } else { if (onError) onError(); }
      }
    };
    xhr.send();
  }

  // ---------- 渲染：统计徽章 ----------
  function updateStatsBadge() {
    var m = DATA.meta;
    document.getElementById("stat-badge").textContent =
      m.total_researchers + " 位研究员 · " + m.total_records + " 条记录 · " + m.total_subjects + " 个标的";
  }

  // ---------- 渲染：欢迎页 ----------
  function renderWelcome() {
    document.getElementById("content-display").innerHTML =
      '<div class="welcome-state">' +
      '<h2>研究员库</h2>' +
      '<p>从左侧选择一位研究员，或使用顶部搜索栏查找</p>' +
      '<div style="margin-top:20px;display:flex;justify-content:center;gap:24px;flex-wrap:wrap">' +
      statItem(DATA.meta.total_researchers, "研究员") +
      statItem(DATA.meta.total_records, "研究记录") +
      statItem(DATA.meta.total_subjects, "覆盖标的") +
      '</div>' +
      '</div>';
  }

  function statItem(num, label) {
    return '<div style="text-align:center"><div style="font-size:28px;font-weight:700;color:var(--accent)">' + num + '</div><div style="font-size:12px;color:var(--text-tertiary)">' + label + '</div></div>';
  }

  // ---------- 渲染：筛选器 ----------
  function renderFilters() {
    var dirs = {};
    DATA.researchers.forEach(function (r) {
      Object.keys(r.subjects).forEach(function (sk) {
        r.subjects[sk].forEach(function (rec) {
          if (rec.direction) { dirs[rec.direction] = true; }
        });
      });
    });
    var sel = document.getElementById("filter-direction");
    Object.keys(dirs).sort().forEach(function (d) {
      var opt = document.createElement("option");
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });
  }

  // ---------- 渲染：研究员列表 ----------
  function renderResearcherList() {
    var list = DATA.researchers.slice();

    if (sortBy === "name") { list.sort(function (a, b) { return a.name.localeCompare(b.name, "zh"); }); }
    else { list.sort(function (a, b) { return b.item_count - a.item_count; }); }

    var html = "";
    list.forEach(function (r) {
      var isActive = currentResearcher && currentResearcher.name === r.name ? " active" : "";
      var ratingHtml = r.rating ? '<span class="researcher-rating-mini">' + escapeHtml(r.rating.split("")[0]) + '</span>' : "";
      html +=
        '<div class="researcher-item' + isActive + '" onclick="window._selectResearcher(\'' + escapeAttr(r.name) + '\')">' +
        '<div class="researcher-name">' + highlightText(r.name) + '</div>' +
        '<div class="researcher-meta">' +
        '<span>' + r.item_count + ' 条记录</span>' +
        '<span>' + Object.keys(r.subjects).length + ' 个标的</span>' +
        '</div>' +
        '</div>';
    });

    document.getElementById("researcher-list").innerHTML = html;
  }

  window._selectResearcher = function (name) {
    var r = DATA.researchers.find(function (x) { return x.name === name; });
    if (r) {
      currentResearcher = r;
      searchQuery = "";
      document.getElementById("search-input").value = "";
      document.getElementById("search-clear").style.display = "none";
      renderResearcherList();
      renderResearcherDetail(r);
    }
  };

  // ---------- 渲染：研究员详情 ----------
  function renderResearcherDetail(r) {
    var html = '<div class="researcher-detail">';
    html += '<h2>' + escapeHtml(r.name) + '</h2>';

    if (r.rating) { html += '<div class="rating">研究员评级：' + escapeHtml(r.rating) + '</div>'; }

    if (r.style) {
      // 从主记录中提取风格
      var styleText = "";
      Object.keys(r.subjects).forEach(function (sk) {
        r.subjects[sk].forEach(function (rec) {
          if (rec.is_main && rec.content) {
            var m = rec.content.match(/研究员定位[：:]\s*(.+)/);
            if (m) { styleText = m[1].trim(); }
          }
        });
      });
      if (styleText) { html += '<div class="style">' + escapeHtml(styleText) + '</div>'; }
    }

    // 提取建档日期
    var dates = [];
    Object.keys(r.subjects).forEach(function (sk) {
      r.subjects[sk].forEach(function (rec) {
        if (rec.date) { dates.push(rec.date); }
      });
    });
    html += '<div class="meta-line">' + r.item_count + ' 条记录 · ' + Object.keys(r.subjects).length + ' 个标的';
    if (dates.length) {
      dates.sort();
      html += ' · 记录日期：' + escapeHtml(dates[0]) + ' ~ ' + escapeHtml(dates[dates.length - 1]);
    }
    html += '</div>';

    // 按标的分组渲染
    Object.keys(r.subjects).forEach(function (subjectKey) {
      var records = r.subjects[subjectKey];

      // 方向筛选
      if (filterDirection) {
        records = records.filter(function (rec) { return rec.direction === filterDirection; });
      }
      if (records.length === 0) { return; }

      var isRealSubj = isRealSubject(subjectKey, r.name);
      html += '<div class="subject-group">';
      html += '<div class="subject-group-title">' + escapeHtml(subjectKey) +
              '<span class="subject-group-count">' + records.length + ' 条</span></div>';

      // 标的操作按钮（只对真实标的显示）
      if (isRealSubj) {
        html += '<div class="subject-actions">';
        html += '<button class="btn-subject rename" onclick="window._renameSubject(\'' + escapeAttr(r.name) + '\',\'' + escapeAttr(subjectKey) + '\')">重命名标的</button>';
        html += '<button class="btn-subject delete" onclick="window._deleteSubject(\'' + escapeAttr(r.name) + '\',\'' + escapeAttr(subjectKey) + '\')">删除标的</button>';
        html += '</div>';
      }

      records.forEach(function (rec, idx) {
        var cardId = r.name + "_" + subjectKey + "_" + idx;
        cardId = cardId.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "_");

        html += '<div class="record-card" id="card_' + cardId + '">';
        html += '<div class="record-header" onclick="window._toggleCard(\'' + cardId + '\')">';
        html += '<span class="record-type-badge ' + (rec.is_main ? "main" : "sub") + '">' + (rec.is_main ? "主记录" : "详情") + '</span>';
        html += '<span class="record-title">' + highlightText(rec.title) + '</span>';
        if (rec.direction) {
          var dirClass = rec.direction.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
          html += '<span class="record-direction ' + dirClass + '">' + escapeHtml(rec.direction) + '</span>';
        }
        if (rec.date) { html += '<span class="record-date">' + escapeHtml(rec.date) + '</span>'; }
        html += '<span class="record-toggle">&#9654;</span>';
        html += '</div>';

        // 记录操作按钮
        html += '<div class="record-actions">';
        html += '<button class="btn-record edit" onclick="window._editRecord(\'' + escapeAttr(r.name) + '\',\'' + escapeAttr(subjectKey) + '\',\'' + escapeAttr(rec.title) + '\', event)">编辑</button>';
        html += '<button class="btn-record delete" onclick="window._deleteRecord(\'' + escapeAttr(r.name) + '\',\'' + escapeAttr(subjectKey) + '\',\'' + escapeAttr(rec.title) + '\', event)">删除</button>';
        html += '</div>';

        html += '<div class="record-body">';
        if (rec.content) {
          html += renderMarkdown(rec.content);
        } else {
          html += '<p style="color:var(--text-tertiary)">（内容为空）</p>';
        }
        html += '</div>';
        html += '</div>';
      });

      html += '</div>';
    });

    html += '</div>';
    document.getElementById("content-display").innerHTML = html;
  }

  window._toggleCard = function (id) {
    var card = document.getElementById("card_" + id);
    if (card) {
      card.classList.toggle("expanded");
      // 自动展开第一个记录
    }
  };

  // 默认展开第一个记录
  window._expandFirst = function (id) {
    var card = document.getElementById("card_" + id);
    if (card && !card.classList.contains("expanded")) {
      card.classList.add("expanded");
    }
  };

  // ---------- 编辑功能 ----------
  var EDIT_MODE = false;
  var HAS_SERVER = false;  // 后端 API 是否可用

  // 检测是否在编辑模式（本地服务器或客户端模式）
  function checkEditMode() {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/rebuild", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status > 0) {
          // 后端 API 可用
          HAS_SERVER = true;
          EDIT_MODE = true;
          showEditBanner("编辑模式（服务端）— 你可以重命名/删除标的和记录。所有操作会自动备份。");
        }
      }
    };
    xhr.onerror = function () {
      // 没有后端服务器 — 启用客户端编辑模式
      HAS_SERVER = false;
      EDIT_MODE = true;
      // 尝试从 localStorage 恢复已编辑的数据
      loadClientEdits();
      showEditBanner("编辑模式（客户端）— 你可以重命名/删除标的和记录。修改保存在浏览器本地，可导出备份。");
    };
    xhr.send("{}");
  }

  function showEditBanner(msg) {
    var banner = document.getElementById("edit-mode-banner");
    if (banner) {
      var textEl = document.getElementById("edit-banner-text");
      if (textEl) textEl.textContent = msg;
      banner.style.display = "flex";
      // 客户端模式显示导出/重置按钮
      var actionsEl = document.getElementById("edit-banner-actions");
      if (actionsEl) actionsEl.style.display = HAS_SERVER ? "none" : "inline-flex";
    }
  }

  // ---------- 客户端编辑（localStorage 模式）----------
  var CLIENT_EDITS = null;  // { renames: [], deletions: [], recordEdits: {} }
  var STORAGE_KEY = "researcher_library_edits";

  function loadClientEdits() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        CLIENT_EDITS = JSON.parse(saved);
        // 应用编辑到 DATA
        applyClientEdits();
      }
    } catch (e) { CLIENT_EDITS = null; }
    if (!CLIENT_EDITS) {
      CLIENT_EDITS = { version: 1, renames: [], deletions: [], recordEdits: {} };
    }
  }

  function saveClientEdits() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(CLIENT_EDITS));
    } catch (e) {}
  }

  function applyClientEdits() {
    if (!CLIENT_EDITS || !DATA) return;
    // 应用删除
    CLIENT_EDITS.deletions.forEach(function (del) {
      var r = DATA.researchers.find(function (x) { return x.name === del.researcher; });
      if (r) {
        if (del.type === "subject") {
          delete r.subjects[del.subject];
          r.item_count = Object.keys(r.subjects).reduce(function (sum, sk) { return sum + r.subjects[sk].length; }, 0);
        } else if (del.type === "record" && r.subjects[del.subject]) {
          r.subjects[del.subject] = r.subjects[del.subject].filter(function (rec) { return rec.title !== del.recordTitle; });
          if (r.subjects[del.subject].length === 0) delete r.subjects[del.subject];
          r.item_count = Object.keys(r.subjects).reduce(function (sum, sk) { return sum + r.subjects[sk].length; }, 0);
        }
      }
    });
    // 应用重命名
    CLIENT_EDITS.renames.forEach(function (rn) {
      var r = DATA.researchers.find(function (x) { return x.name === rn.researcher; });
      if (r && r.subjects[rn.oldSubject]) {
        var records = r.subjects[rn.oldSubject];
        records.forEach(function (rec) { rec.subject = rn.newSubject; });
        delete r.subjects[rn.oldSubject];
        r.subjects[rn.newSubject] = records;
      }
    });
    // 应用记录内容编辑
    Object.keys(CLIENT_EDITS.recordEdits).forEach(function (key) {
      var edit = CLIENT_EDITS.recordEdits[key];
      var r = DATA.researchers.find(function (x) { return x.name === edit.researcher; });
      if (r && r.subjects[edit.subject]) {
        var rec = r.subjects[edit.subject].find(function (rec) { return rec.title === edit.recordTitle; });
        if (rec) rec.content = edit.content;
      }
    });
  }

  // 客户端重命名
  function clientRenameSubject(researcherName, oldSubject, newSubject, onSuccess, onError) {
    try {
      CLIENT_EDITS.renames.push({ researcher: researcherName, oldSubject: oldSubject, newSubject: newSubject });
      saveClientEdits();
      applyClientEdits();
      var r = DATA.researchers.find(function (x) { return x.name === researcherName; });
      var count = r && r.subjects[newSubject] ? r.subjects[newSubject].length : 0;
      onSuccess({ success: true, updated: count, index: DATA });
    } catch (e) { onError(e.message); }
  }

  // 客户端删除标的
  function clientDeleteSubject(researcherName, subject, onSuccess, onError) {
    try {
      CLIENT_EDITS.deletions.push({ type: "subject", researcher: researcherName, subject: subject });
      saveClientEdits();
      var r = DATA.researchers.find(function (x) { return x.name === researcherName; });
      var removed = r && r.subjects[subject] ? r.subjects[subject].length : 0;
      applyClientEdits();
      onSuccess({ success: true, removed: removed, index: DATA });
    } catch (e) { onError(e.message); }
  }

  // 客户端编辑记录
  function clientUpdateRecord(researcherName, subject, recordTitle, content, onSuccess, onError) {
    try {
      var key = researcherName + "/" + subject + "/" + recordTitle;
      CLIENT_EDITS.recordEdits[key] = { researcher: researcherName, subject: subject, recordTitle: recordTitle, content: content };
      saveClientEdits();
      applyClientEdits();
      onSuccess({ success: true, index: DATA });
    } catch (e) { onError(e.message); }
  }

  // 客户端删除记录
  function clientDeleteRecord(researcherName, subject, recordTitle, onSuccess, onError) {
    try {
      CLIENT_EDITS.deletions.push({ type: "record", researcher: researcherName, subject: subject, recordTitle: recordTitle });
      saveClientEdits();
      applyClientEdits();
      onSuccess({ success: true, removed: 1, index: DATA });
    } catch (e) { onError(e.message); }
  }

  // 导出编辑数据（供用户备份）
  window._exportEdits = function () {
    if (!CLIENT_EDITS) { showToast("没有编辑数据"); return; }
    var blob = new Blob([JSON.stringify(CLIENT_EDITS, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "researcher_library_edits_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 重置客户端编辑
  window._resetEdits = function () {
    customConfirm("确定要清除所有本地编辑？\n\n这将恢复到原始数据状态，所有客户端修改将丢失。", function (ok) {
      if (!ok) return;
      localStorage.removeItem(STORAGE_KEY);
      CLIENT_EDITS = null;
      location.reload();
    }, true);
  };

  function isRealSubject(name, researcherName) {
    if (!DATA.subject_index) return true;
    if (name === researcherName) return false;
    var skipKeywords = ["宏观", "研究记录", "公式", "图片", "体系", "方法论", "归档", "旧版", "模板"];
    for (var i = 0; i < skipKeywords.length; i++) {
      if (name.indexOf(skipKeywords[i]) !== -1) return false;
    }
    return DATA.subject_index.some(function (s) { return s.subject === name; });
  }

  // API 调用
  function apiCall(method, url, body, onSuccess, onError) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try {
            var resp = JSON.parse(xhr.responseText);
            if (resp.success) { onSuccess(resp); }
            else { onError(resp.error || "操作失败"); }
          } catch (e) { onError("解析响应失败"); }
        } else {
          try {
            var resp = JSON.parse(xhr.responseText);
            onError(resp.error || "HTTP " + xhr.status);
          } catch (e) { onError("HTTP " + xhr.status); }
        }
      }
    };
    xhr.onerror = function () {
      onError("无法连接服务器。编辑功能仅在本地模式下可用。");
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  // 自定义 prompt（替代被拦截的 native prompt）
  function customPrompt(message, defaultValue, callback) {
    var existing = document.getElementById("prompt-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "prompt-overlay";
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal-content";
    modal.style.maxWidth = "500px";
    modal.innerHTML =
      '<div class="modal-header"><h3>请输入</h3>' +
      '<button class="modal-close" id="prompt-cancel-x">&times;</button></div>' +
      '<div class="modal-body"><p style="margin-bottom:12px;font-size:14px;white-space:pre-wrap;line-height:1.8">' + escapeHtml(message) + '</p>' +
      '<input type="text" id="prompt-input" class="prompt-input" style="width:100%;padding:8px 12px;font-size:14px;border:1px solid var(--border);border-radius:4px;box-sizing:border-box;" value="' + escapeHtml(defaultValue || "") + '">' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn-modal cancel" id="prompt-cancel">取消</button>' +
      '<button class="btn-modal save" id="prompt-ok">确定</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var input = document.getElementById("prompt-input");
    input.focus();
    input.select();

    function close(result) {
      overlay.remove();
      callback(result);
    }

    function onOk() {
      var val = input.value.trim();
      close(val);
    }
    function onCancel() { close(null); }

    document.getElementById("prompt-ok").addEventListener("click", onOk);
    document.getElementById("prompt-cancel").addEventListener("click", onCancel);
    document.getElementById("prompt-cancel-x").addEventListener("click", onCancel);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) onCancel(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    });
  }

  // 自定义 confirm（替代被拦截的 native confirm）
  function customConfirm(message, callback, isDanger) {
    var existing = document.getElementById("confirm-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "confirm-overlay";
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal-content";
    modal.style.maxWidth = "460px";
    modal.innerHTML =
      '<div class="modal-header"><h3>' + (isDanger ? "⚠️ 确认操作" : "确认") + '</h3>' +
      '<button class="modal-close" id="confirm-cancel-x">&times;</button></div>' +
      '<div class="modal-body"><p style="font-size:14px;white-space:pre-wrap;line-height:1.8">' + escapeHtml(message) + '</p></div>' +
      '<div class="modal-footer">' +
      '<button class="btn-modal cancel" id="confirm-cancel">取消</button>' +
      '<button class="btn-modal ' + (isDanger ? "danger" : "save") + '" id="confirm-ok">' + (isDanger ? "确认删除" : "确定") + '</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close(result) {
      overlay.remove();
      callback(result);
    }
    document.getElementById("confirm-ok").addEventListener("click", function () { close(true); });
    document.getElementById("confirm-cancel").addEventListener("click", function () { close(false); });
    document.getElementById("confirm-cancel-x").addEventListener("click", function () { close(false); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(false); });
  }

  // 重命名标的
  window._renameSubject = function (researcherName, subject) {
    customPrompt("重命名跟踪标的 \"" + subject + "\"：\n\n请输入新的标的名称：", subject, function (newName) {
      if (!newName || newName === subject) return;

      customConfirm("确定将 \"" + subject + "\" 重命名为 \"" + newName + "\"？\n\n该研究员下所有相关记录都会更新。", function (ok) {
        if (!ok) return;

        var url = "/api/researcher/" + encodeURIComponent(researcherName) +
                  "/subject/" + encodeURIComponent(subject) + "/rename";
        showLoading("正在重命名标的...");
        
        if (HAS_SERVER) {
          apiCall("PUT", url, { newName: newName }, function (resp) {
            afterRename(resp, researcherName, newName);
          }, function (err) {
            hideLoading();
            showToast("重命名失败：" + err, "error");
          });
        } else {
          clientRenameSubject(researcherName, subject, newName, function (resp) {
            afterRename(resp, researcherName, newName);
          }, function (err) {
            hideLoading();
            showToast("重命名失败：" + err, "error");
          });
        }
      });
    });
  };

  function afterRename(resp, researcherName, newName) {
    if (HAS_SERVER) { DATA = resp.index; onLoaded(); }
    else { DATA = resp.index; rebuildMeta(); onLoaded(); }
    hideLoading();
    showToast("标的已重命名为 " + newName + "（更新 " + resp.updated + " 条记录）");
    currentResearcher = DATA.researchers.find(function (r) { return r.name === researcherName; });
    renderResearcherList();
    renderResearcherDetail(currentResearcher);
    syncPushIfNeeded(true);
  }

  // 删除标的
  window._deleteSubject = function (researcherName, subject) {
    customConfirm("⚠️ 确定删除标的 \"" + subject + "\"？\n\n该研究员下关于此标的的所有记录将被删除。", function (ok) {
      if (!ok) return;

      showLoading("正在删除标的...");
      
      if (HAS_SERVER) {
        var url = "/api/researcher/" + encodeURIComponent(researcherName) +
                  "/subject/" + encodeURIComponent(subject);
        apiCall("DELETE", url, null, function (resp) {
          afterDeleteSubject(resp, researcherName, subject);
        }, function (err) {
          hideLoading();
          showToast("删除失败：" + err, "error");
        });
      } else {
        clientDeleteSubject(researcherName, subject, function (resp) {
          afterDeleteSubject(resp, researcherName, subject);
        }, function (err) {
          hideLoading();
          showToast("删除失败：" + err, "error");
        });
      }
    }, true);
  };

  function afterDeleteSubject(resp, researcherName, subject) {
    if (!HAS_SERVER) { rebuildMeta(); }
    DATA = HAS_SERVER ? resp.index : DATA;
    onLoaded();
    hideLoading();
    showToast("已删除 " + subject + "（移除 " + resp.removed + " 条记录）");
    currentResearcher = DATA.researchers.find(function (r) { return r.name === researcherName; });
    if (currentResearcher && currentResearcher.item_count > 0) {
      renderResearcherList();
      renderResearcherDetail(currentResearcher);
    } else {
      currentResearcher = null;
      renderResearcherList();
      renderWelcome();
    }
    syncPushIfNeeded(true);
  }

  // 编辑记录内容
  window._editRecord = function (researcherName, subject, recordTitle, event) {
    if (event) event.stopPropagation();

    var record = null;
    var r = DATA.researchers.find(function (x) { return x.name === researcherName; });
    if (r && r.subjects[subject]) {
      record = r.subjects[subject].find(function (rec) { return rec.title === recordTitle; });
    }
    if (!record) { showToast("未找到记录", "error"); return; }

    openEditModal(researcherName, subject, recordTitle, record.content || "");
  };

  // 删除单条记录
  window._deleteRecord = function (researcherName, subject, recordTitle, event) {
    if (event) event.stopPropagation();
    
    customConfirm("⚠️ 确定删除记录 \"" + recordTitle + "\"？\n\n此操作不可撤销。", function (ok) {
      if (!ok) return;

      showLoading("正在删除记录...");
      
      if (HAS_SERVER) {
        var url = "/api/researcher/" + encodeURIComponent(researcherName) +
                  "/subject/" + encodeURIComponent(subject) +
                  "/record/" + encodeURIComponent(recordTitle);
        apiCall("DELETE", url, null, function (resp) {
          afterDeleteRecord(resp, researcherName, recordTitle);
        }, function (err) {
          hideLoading();
          showToast("删除失败：" + err, "error");
        });
      } else {
        clientDeleteRecord(researcherName, subject, recordTitle, function (resp) {
          afterDeleteRecord(resp, researcherName, recordTitle);
        }, function (err) {
          hideLoading();
          showToast("删除失败：" + err, "error");
        });
      }
    }, true);
  };

  function afterDeleteRecord(resp, researcherName, recordTitle) {
    if (!HAS_SERVER) { rebuildMeta(); }
    DATA = HAS_SERVER ? resp.index : DATA;
    onLoaded();
    hideLoading();
    showToast("已删除记录 " + recordTitle);
    currentResearcher = DATA.researchers.find(function (x) { return x.name === researcherName; });
    if (currentResearcher && currentResearcher.item_count > 0) {
      renderResearcherList();
      renderResearcherDetail(currentResearcher);
    } else {
      currentResearcher = null;
      renderResearcherList();
      renderWelcome();
    }
    syncPushIfNeeded(true);
  }

  // 编辑模态框
  function openEditModal(researcherName, subject, recordTitle, content) {
    // 移除已有的模态框
    var existing = document.getElementById("edit-modal-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "edit-modal-overlay";
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal-content edit-modal";
    modal.innerHTML =
      '<div class="modal-header">' +
      '<h3>编辑记录</h3>' +
      '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">&times;</button>' +
      '</div>' +
      '<div class="modal-subtitle">' + escapeHtml(researcherName) + ' / ' + escapeHtml(subject) + ' / ' + escapeHtml(recordTitle) + '</div>' +
      '<div class="modal-body">' +
      '<textarea id="edit-textarea" class="edit-textarea">' + escapeHtml(content) + '</textarea>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<span class="modal-hint">Markdown 格式，保存后自动重建索引</span>' +
      '<button class="btn-modal cancel" onclick="this.closest(\'.modal-overlay\').remove()">取消</button>' +
      '<button class="btn-modal save" id="edit-save-btn">保存</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 点击遮罩关闭
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.remove();
    });

    // 保存
    document.getElementById("edit-save-btn").addEventListener("click", function () {
      var newContent = document.getElementById("edit-textarea").value;
      if (newContent === content) {
        showToast("内容未修改");
        overlay.remove();
        return;
      }

      function onSuccess(resp) {
        overlay.remove();
        if (HAS_SERVER) { DATA = resp.index; }
        else { rebuildMeta(); }
        onLoaded();
        hideLoading();
        showToast("记录已保存");
        currentResearcher = DATA.researchers.find(function (x) { return x.name === researcherName; });
        renderResearcherList();
        renderResearcherDetail(currentResearcher);
        syncPushIfNeeded(true);
      }

      function onError(err) {
        hideLoading();
        showToast("保存失败：" + err, "error");
      }

      showLoading("正在保存...");
      
      if (HAS_SERVER) {
        var url = "/api/researcher/" + encodeURIComponent(researcherName) +
                  "/subject/" + encodeURIComponent(subject) +
                  "/record/" + encodeURIComponent(recordTitle);
        apiCall("PUT", url, { content: newContent }, onSuccess, onError);
      } else {
        clientUpdateRecord(researcherName, subject, recordTitle, newContent, onSuccess, onError);
      }
    });
  }

  // Toast 提示
  var toastTimer = null;
  function showToast(msg, type) {
    var existing = document.getElementById("toast");
    if (existing) existing.remove();
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }

    var toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast" + (type === "error" ? " toast-error" : "");
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(function () { toast.classList.add("show"); });
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  // Loading 遮罩
  function showLoading(msg) {
    var existing = document.getElementById("loading-overlay");
    if (existing) existing.remove();
    var overlay = document.createElement("div");
    overlay.id = "loading-overlay";
    overlay.className = "loading-overlay";
    overlay.innerHTML = '<div class="loading-spinner"></div><div class="loading-text">' + escapeHtml(msg || "处理中...") + '</div>';
    document.body.appendChild(overlay);
  }
  function hideLoading() {
    var existing = document.getElementById("loading-overlay");
    if (existing) existing.remove();
  }

  // ---------- 搜索 ----------
  function renderSearchResults() {
    if (!searchQuery) { return; }

    var results = [];
    DATA.researchers.forEach(function (r) {
      Object.keys(r.subjects).forEach(function (sk) {
        r.subjects[sk].forEach(function (rec) {
          var haystack = (
            r.name + " " + rec.title + " " + rec.subject + " " +
            (rec.content || "") + " " + (rec.direction || "")
          ).toLowerCase();
          if (haystack.indexOf(searchQuery) !== -1) {
            results.push({ researcher: r, record: rec, subjectKey: sk });
          }
        });
      });
    });

    var html = '<div class="search-results-info">找到 <strong>' + results.length + '</strong> 条相关记录</div>';
    html += '<div class="researcher-detail">';

    results.slice(0, 100).forEach(function (item, idx) {
      var r = item.researcher;
      var rec = item.record;
      var cardId = "search_" + idx;

      html += '<div class="record-card" id="card_' + cardId + '">';
      html += '<div class="record-header" onclick="window._toggleCard(\'' + cardId + '\')">';
      html += '<span class="record-type-badge ' + (rec.is_main ? "main" : "sub") + '">' + (rec.is_main ? "主记录" : "详情") + '</span>';
      html += '<span class="record-title">' + highlightText(rec.title) + '</span>';
      html += '<span style="font-size:11px;color:var(--accent)">[' + highlightText(r.name) + ']</span>';
      if (rec.direction) {
        var dirClass = rec.direction.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
        html += '<span class="record-direction ' + dirClass + '">' + escapeHtml(rec.direction) + '</span>';
      }
      if (rec.date) { html += '<span class="record-date">' + escapeHtml(rec.date) + '</span>'; }
      html += '<span class="record-toggle">&#9654;</span>';
      html += '</div>';
      html += '<div class="record-body">';
      if (rec.content) { html += renderMarkdown(rec.content); }
      html += '</div>';
      html += '</div>';
    });

    if (results.length > 100) {
      html += '<p style="text-align:center;color:var(--text-tertiary);padding:16px">仅显示前 100 条，请细化搜索</p>';
    }

    html += '</div>';
    document.getElementById("content-display").innerHTML = html;
  }

  // ---------- 统计 ----------
  var QUOTES = null;

  function renderStats() {
    var m = DATA.meta;
    var cardsHtml = "";
    cardsHtml += statCard(m.total_researchers, "研究员总数", "");
    cardsHtml += statCard(m.total_records, "研究记录总数", "主记录 " + m.total_main_records + " · 详情 " + m.total_sub_records);
    cardsHtml += statCard(m.total_subjects, "覆盖标的数", "");

    // 计算方向分布
    var dirCount = {};
    DATA.researchers.forEach(function (r) {
      Object.keys(r.subjects).forEach(function (sk) {
        r.subjects[sk].forEach(function (rec) {
          if (rec.direction) { dirCount[rec.direction] = (dirCount[rec.direction] || 0) + 1; }
        });
      });
    });
    var dirTotal = Object.values(dirCount).reduce(function (a, b) { return a + b; }, 0);
    cardsHtml += statCard(dirTotal, "有方向标记记录", "共 " + Object.keys(dirCount).length + " 种方向");

    document.getElementById("stats-cards").innerHTML = cardsHtml;

    renderResearcherTracking();
    loadStockQuotes();
  }

  function statCard(val, label, sub) {
    return '<div class="stat-card"><div class="label">' + label + '</div><div class="value">' + val + '</div>' +
           (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  // 研究员跟踪标的列表
  function renderResearcherTracking() {
    // 三个月前的日期
    var threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    var threshold = threeMonthsAgo.getTime();

    // 真实股票标的白名单（来自 subject_index，已排除研究员自身/宏观观点）
    var realSubjects = {};
    DATA.subject_index.forEach(function (s) { realSubjects[s.subject] = true; });
    var skipKeywords = ["宏观", "研究记录", "归档", "旧版", "模板", "空白", "公式", ".png", ".jpg", "图片", "体系", "方法论"];

    function isRealSubject(name, researcherName) {
      // 必须在 subject_index 白名单里
      if (!realSubjects[name]) return false;
      return true;
    }

    var html = "";
    DATA.researchers.forEach(function (r) {
      // 提取该研究员跟踪的所有标的及最新更新日期
      var subjectDates = {};
      Object.keys(r.subjects).forEach(function (sk) {
        if (!isRealSubject(sk, r.name)) return;
        var subj = sk;
        // 清理标的名（去掉港股代码后缀）
        subj = subj.replace(/\s*\(HK:\d+\)\s*/g, "").replace(/\s*\(SH:\d+\)\s*/g, "").replace(/\s*\(SZ:\d+\)\s*/g, "").trim();
        if (!subjectDates[subj]) subjectDates[subj] = { latest: 0, count: 0 };
        r.subjects[sk].forEach(function (rec) {
          subjectDates[subj].count++;
          var d = parseDate(rec.date);
          if (d) {
            if (d > subjectDates[subj].latest) subjectDates[subj].latest = d;
          }
        });
      });

      var subjects = Object.keys(subjectDates);
      if (subjects.length === 0) return;

      // 按最新更新日期排序（有日期的在前）
      subjects.sort(function (a, b) {
        return (subjectDates[b].latest || 0) - (subjectDates[a].latest || 0);
      });

      html += '<div class="researcher-tracking-item">';
      html += '<div class="researcher-tracking-name">' + escapeHtml(r.name) + '</div>';
      html += '<div class="researcher-tracking-tags">';
      subjects.forEach(function (subj) {
        var info = subjectDates[subj];
        var isActive = info.latest > 0 && info.latest >= threshold;
        var cls = isActive ? "active" : "inactive";
        var latestStr = info.latest > 0 ? formatDate(new Date(info.latest)) : "无日期";
        html += '<span class="tracking-tag ' + cls + '" title="最近更新: ' + latestStr + ' · ' + info.count + ' 条记录">' +
                escapeHtml(subj) + '</span>';
      });
      html += '</div>';
      html += '</div>';
    });

    document.getElementById("researcher-tracking").innerHTML = html;
  }

  function parseDate(dateStr) {
    if (!dateStr) return null;
    // 尝试多种日期格式
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
    // 尝试 YYYYMMDD 格式
    var m = dateStr.match(/(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
    if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime();
    // 尝试约日期
    m = dateStr.match(/~?(\d{4})/);
    if (m) return new Date(parseInt(m[1]), 5, 1).getTime(); // 默认6月
    return null;
  }

  function formatDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // 加载股票行情数据
  function loadStockQuotes() {
    loadJSON("data/stock_quotes.json", function (data) {
      QUOTES = data;
      var timeEl = document.getElementById("quote-fetch-time");
      if (timeEl && data.fetch_time) {
        timeEl.textContent = "数据更新时间: " + data.fetch_time + " · 共 " + data.total + " 只股票";
      }
      renderStockPerformance();
    }, function () {
      document.getElementById("stock-performance").innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary);padding:20px">行情数据加载失败</td></tr>';
    });
  }

  function renderStockPerformance() {
    if (!QUOTES) return;
    var stocks = QUOTES.stocks;
    var seen = {};

    // 去重（同代码只显示一次，合并研究员信息）
    var rows = [];
    Object.keys(stocks).forEach(function (name) {
      var s = stocks[name];
      if (seen[s.code]) return;
      seen[s.code] = true;
      rows.push(s);
    });

    // 按今年以来表现降序
    rows.sort(function (a, b) {
      return (b.chg_ytd || 0) - (a.chg_ytd || 0);
    });

    var html = "<thead><tr>";
    html += "<th>股票</th>";
    html += "<th>跟踪研究员</th>";
    html += "<th>最新价</th>";
    html += "<th>当日</th>";
    html += "<th>本周(5日)</th>";
    html += "<th>本月(20日)</th>";
    html += "<th>今年以来</th>";
    html += "</tr></thead><tbody>";

    rows.forEach(function (s) {
      var researchers = s.researchers || [];
      var researcherHtml = researchers.map(function (rn) {
        return '<span class="researcher-tag">' + escapeHtml(rn) + '</span>';
      }).join("");

      html += "<tr>";
      html += '<td><span class="stock-name-cell">' + escapeHtml(s.name) + '</span>' +
              '<span class="stock-code-cell">' + escapeHtml(s.code) + '</span></td>';
      html += '<td class="researcher-cell">' + researcherHtml + '</td>';
      html += '<td>' + s.price.toFixed(2) + '</td>';
      html += '<td class="' + pctClass(s.change_percent) + '">' + formatPct(s.change_percent) + '</td>';
      html += '<td class="' + pctClass(s.chg_5d) + '">' + formatPct(s.chg_5d) + '</td>';
      html += '<td class="' + pctClass(s.chg_20d) + '">' + formatPct(s.chg_20d) + '</td>';
      html += '<td class="' + pctClass(s.chg_ytd) + '">' + formatPct(s.chg_ytd) + '</td>';
      html += "</tr>";
    });

    html += "</tbody>";
    document.getElementById("stock-performance").innerHTML = html;
  }

  function pctClass(val) {
    if (val > 0.01) return "pct-up";
    if (val < -0.01) return "pct-down";
    return "pct-flat";
  }

  function formatPct(val) {
    if (val === 0) return "0.00%";
    var sign = val > 0 ? "+" : "";
    return sign + val.toFixed(2) + "%";
  }

  // ---------- 工具函数 ----------

  // 客户端模式：重新计算 meta 统计
  function rebuildMeta() {
    if (!DATA) return;
    var totalMain = 0, totalSub = 0, totalRecords = 0;
    var allSubjects = {};
    DATA.researchers.forEach(function (r) {
      r.item_count = 0;
      Object.keys(r.subjects).forEach(function (sk) {
        r.item_count += r.subjects[sk].length;
        r.subjects[sk].forEach(function (rec) {
          totalRecords++;
          if (rec.is_main) totalMain++; else totalSub++;
          if (rec.subject) { allSubjects[rec.subject] = (allSubjects[rec.subject] || 0) + 1; }
        });
      });
    });
    DATA.meta.total_records = totalRecords;
    DATA.meta.total_main_records = totalMain;
    DATA.meta.total_sub_records = totalSub;
    DATA.meta.total_subjects = Object.keys(allSubjects).length;
    DATA.subject_index = Object.keys(allSubjects).sort(function (a, b) { return allSubjects[b] - allSubjects[a]; })
      .map(function (s) { return { subject: s, count: allSubjects[s] }; });
  }

  function escapeHtml(text) {
    if (!text) { return ""; }
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function highlightText(text) {
    if (!searchQuery || !text) { return escapeHtml(text); }
    var escaped = escapeHtml(text);
    var lowerText = text.toLowerCase();
    var idx = lowerText.indexOf(searchQuery);
    if (idx === -1) { return escaped; }
    // 高亮所有匹配
    var regex = new RegExp("(" + escapeRegExp(searchQuery) + ")", "gi");
    return escaped.replace(regex, function (match) {
      return '<span class="highlight">' + match + '</span>';
    });
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderMarkdown(md) {
    if (!md) { return ""; }
    try {
      if (typeof marked !== "undefined") {
        return marked.parse(md);
      }
    } catch (e) {}
    return "<pre>" + escapeHtml(md) + "</pre>";
  }

  // ============================================================
  // GitHub 云同步集成
  // ============================================================

  function showSyncBar() {
    var bar = document.getElementById("sync-bar");
    if (bar) bar.style.display = "flex";
    // 首次加载时也更新状态文字
    var statusEl = document.getElementById("sync-status-text");
    if (statusEl) statusEl.textContent = "已连接";
    updateSyncUI();
  }

  function updateSyncUI() {
    if (!window.GitHubSync) return;
    var timeEl = document.getElementById("sync-last-time");
    if (timeEl) timeEl.textContent = GitHubSync.getLastSyncText();
  }

  // 每次编辑后自动推送到 GitHub
  function syncPushIfNeeded(silent) {
    if (!window.GitHubSync || !GitHubSync.hasToken() || !DATA) return;
    GitHubSync.push(DATA, function (ok, err) {
      if (ok) {
        updateSyncUI();
        if (!silent) showToast("已自动同步到云端");
      } else {
        if (!silent) showToast("云同步失败：" + (err || "未知错误"), "error");
      }
    });
  }

  // 手动立即同步（先拉后推）
  window._syncNow = function () {
    if (!window.GitHubSync || !GitHubSync.hasToken()) {
      showSyncError("未配置 Token", "你还没有配置 GitHub Token。\\n\\n点击下方「设置」按钮输入 Token，或使用带 ?token= 参数的链接打开页面。");
      return;
    }
    var btn = document.getElementById("sync-now-btn");
    if (btn) { btn.disabled = true; btn.textContent = "同步中..."; }
    showLoading("正在从云端拉取数据...");
    GitHubSync.pull(function (ghData, err) {
      hideLoading();
      if (btn) { btn.disabled = false; btn.textContent = "立即同步"; }
      if (ghData) {
        DATA = ghData;
        onLoaded();
        updateSyncUI();
        showToast("已拉取云端最新数据");
      } else {
        // 根据错误类型给出不同的提示
        if (err && err.indexOf("401") >= 0) {
          showSyncError("Token 已失效", "你的 GitHub Token 已过期或被撤销。\\n\\n这可能是因为 Token 出现在了公开代码中被 GitHub 安全扫描自动撤销。\\n\\n请生成一个新的 Token，然后点击「设置」重新输入。");
        } else if (err === "no token") {
          showSyncError("未配置 Token", "请先配置 GitHub Token。");
        } else {
          showSyncError("同步失败", "错误详情：" + (err || "未知错误") + "\\n\\n请检查网络连接后重试。");
        }
      }
    });
  };

  // 同步错误弹窗（比 toast 更醒目）
  function showSyncError(title, message) {
    var existing = document.getElementById("sync-error-overlay");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "sync-error-overlay";
    overlay.className = "modal-overlay";
    overlay.style.zIndex = 99999;

    var modal = document.createElement("div");
    modal.className = "modal-content";
    modal.style.maxWidth = "460px";
    modal.innerHTML =
      '<div class="modal-header"><h3 style="color:#d93025">⚠️ ' + escapeHtml(title) + '</h3>' +
      '<button class="modal-close" id="sync-err-close">&times;</button></div>' +
      '<div class="modal-body">' +
        '<p style="font-size:13px;color:var(--text-secondary);line-height:1.8;white-space:pre-line">' + escapeHtml(message) + '</p>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn-modal cancel" id="sync-err-ok">知道了</button>' +
        '<button class="btn-modal save" id="sync-err-settings">去设置</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var close = function () { overlay.remove(); };
    document.getElementById("sync-err-close").addEventListener("click", close);
    document.getElementById("sync-err-ok").addEventListener("click", close);
    document.getElementById("sync-err-settings").addEventListener("click", function () {
      close();
      window._openSyncSettings();
    });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
  }

  // 打开同步设置模态框
  window._openSyncSettings = function () {
    var existing = document.getElementById("sync-settings-overlay");
    if (existing) existing.remove();

    var hasToken = window.GitHubSync && GitHubSync.hasToken();
    var maskedToken = "";
    if (hasToken) {
      var t = GitHubSync.getToken();
      maskedToken = t.slice(0, 12) + "..." + t.slice(-4);
    }

    var overlay = document.createElement("div");
    overlay.id = "sync-settings-overlay";
    overlay.className = "modal-overlay";

    var modal = document.createElement("div");
    modal.className = "modal-content";
    modal.style.maxWidth = "520px";
    modal.innerHTML =
      '<div class="modal-header"><h3>☁️ 云同步设置</h3>' +
      '<button class="modal-close" id="sync-close">&times;</button></div>' +
      '<div class="modal-body">' +
        '<div style="margin-bottom:16px">' +
          '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.8">' +
          '配置 GitHub Token 后，所有编辑会自动同步到云端私有仓库。<br>' +
          '换设备时只需输入同样的 Token，即可访问最新数据。<br>' +
          '<strong>仓库：</strong>zerodk2026/researcher-library-data（私有）' +
          '</p>' +
        '</div>' +
        '<div style="margin-bottom:16px">' +
          '<label style="font-size:12px;color:var(--text-tertiary);display:block;margin-bottom:6px">GitHub Token' +
          (hasToken ? '（当前：<code style="font-size:11px;background:var(--bg-tertiary);padding:1px 4px;border-radius:3px">' + maskedToken + '</code>）' : '') +
          '</label>' +
          '<input type="password" id="sync-token-input" placeholder="github_pat_..." ' +
          'style="width:100%;padding:8px 12px;font-size:14px;border:1px solid var(--border);border-radius:4px;box-sizing:border-box;font-family:monospace" />' +
          '<p style="font-size:11px;color:var(--text-tertiary);margin-top:6px;line-height:1.6">' +
          '在 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建<br>' +
          '权限需要：Contents (Read and write)<br>' +
          'Repository access：选择 researcher-library-data 仓库' +
          '</p>' +
        '</div>' +
      '</div>' +
      '<div class="modal-footer">' +
        '<button class="btn-modal cancel danger" id="sync-clear-btn"' + (hasToken ? '' : ' disabled') +
          ' style="' + (hasToken ? '' : 'opacity:0.4;cursor:not-allowed') + '">' +
          '断开同步' +
        '</button>' +
        '<button class="btn-modal save" id="sync-save-btn">保存并同步</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); }

    document.getElementById("sync-close").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

    document.getElementById("sync-save-btn").addEventListener("click", function () {
      var token = document.getElementById("sync-token-input").value.trim();
      if (!token) { showToast("请输入 Token", "error"); return; }
      if (!token.startsWith("github_pat_")) { showToast("Token 格式不对，应以 github_pat_ 开头", "error"); return; }

      GitHubSync.setToken(token);
      close();
      showSyncBar();
      showLoading("正在验证并同步...");

      // 先验证 token — 拉取数据
      GitHubSync.pull(function (ghData, err) {
        if (ghData) {
          DATA = ghData;
          onLoaded();
          hideLoading();
          showToast("Token 已验证，数据已同步");
          // 推送当前数据（如果有本地编辑）
          syncPushIfNeeded(true);
        } else if (err === "no token") {
          hideLoading();
          showToast("Token 为空", "error");
        } else {
          // 拉取失败可能是仓库为空 — 尝试推送当前数据
          hideLoading();
          showToast("拉取失败，尝试推送本地数据...");
          syncPushIfNeeded(false);
        }
      });
    });

    if (hasToken) {
      document.getElementById("sync-clear-btn").addEventListener("click", function () {
        GitHubSync.clearToken();
        var bar = document.getElementById("sync-bar");
        if (bar) bar.style.display = "none";
        close();
        showToast("已断开云同步");
      });
    }
  };

  // 启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
