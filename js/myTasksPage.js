// js/myTasksPage.js
// 「我的任務」頁面模組：跨所有主題，僅顯示登入使用者為負責人的任務

var myTasksPage = (function () {
    'use strict';

    var API_BASE = '/eServiceA/dashboard/api/v2/task';

    var CATEGORY_LABELS = {
        1: { name: '前置作業',           color: '#ef4444' },
        2: { name: '新光資料轉出',        color: '#22c55e' },
        3: { name: '系統切轉/資料轉置',   color: '#eab308' },
        4: { name: '系統驗證/業務補登',   color: '#84cc16' },
        5: { name: '對外營運',            color: '#f97316' }
    };

    // ─── 狀態 ─────────────────────────────────────────────────────────────
    var tasks         = [];
    var currentPage   = 1;
    var tasksPerPage  = 20;
    var currentFilter = 'all';
    var searchQuery   = '';
    var systemCodeFilter = '';   // ← 系統代碼精確篩選
    var pendingTaskId = null;
    var expandedTaskId = null;
    var memoCache      = {};   // tableType_id → [ memo ]
    var prereqCache    = {};   // taskId → [ {memoId, memo, ...} ] | null(loading)
    var pendingPrereqTaskId = null;
    var editingPrereqMemoId = null;

    // ─── 前置任務 Hyperlink 快取 ──────────────────────────────────────────
    var prereqLinkCache = {};
    var PREREQ_CODE_REGEX = /^[A-Za-z]+-\d+$/;

    // ─── 登入使用者 ───────────────────────────────────────────────────────
    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('dashboardUser') || sessionStorage.getItem('dashboardUser') || 'null'); } catch (e) { return null; }
    }
    function getCurrentEmployeeId() {
        var u = getCurrentUser(); return u ? (u.employeeId || '') : '';
    }
    function getCurrentUserId() {
        var u = getCurrentUser(); return u ? (u.userId || null) : null;
    }

    // ─── 工具 ─────────────────────────────────────────────────────────────
    function getUrlParams() {
        var p = {}, qs = window.location.search.substring(1);
        qs.split('&').forEach(function (pair) {
            var parts = pair.split('=');
            if (parts[0]) p[parts[0]] = decodeURIComponent(parts[1] || '');
        });
        return p;
    }

    function formatDateTimeDisplay(str) {
        if (!str) return '';
        var d = new Date(str);
        if (isNaN(d.getTime())) return str;
        return d.getFullYear() + '/' +
            String(d.getMonth() + 1).padStart(2, '0') + '/' +
            String(d.getDate()).padStart(2, '0') + ' ' +
            String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0');
    }

    function escapeHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
    }

    function memoKey(task) { return (task.tableType || '') + '_' + task.id; }

    // ─── API 呼叫 ─────────────────────────────────────────────────────────
    function apiCall(method, url, body, callback) {
        var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        window.authFetch(url, opts)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var ok = json.stat === 'ok';
                callback(ok ? null : (json.errorMsg || '操作失敗'), json);
            })
            .catch(function (err) { callback('網路錯誤：' + err.message, null); });
    }

    function loadMemos(task, callback) {
        var key = memoKey(task);
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/memos';
        window.authFetch(url, { })
            .then(function (r) { return r.json(); })
            .then(function (json) {
                memoCache[key] = json.stat === 'ok' ? (json.result || []) : [];
                if (callback) callback();
            })
            .catch(function () { memoCache[key] = []; if (callback) callback(); });
    }

    // ─── 前置任務 ─────────────────────────────────────────────────────────
    function loadPrerequisites(task, callback) {
        var url = API_BASE + '/' + (task.tableType || '') + '/' + task.id + '/prerequisites';
        window.authFetch(url, { })
            .then(function (r) { return r.json(); })
            .then(function (json) {
                prereqCache[task.id] = json.stat === 'ok' ? (json.result || []) : [];
                if (callback) callback(prereqCache[task.id]);
            })
            .catch(function () { prereqCache[task.id] = []; if (callback) callback([]); });
    }

    function escapeAttr(str) {
        return String(str || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ─── 前置任務代碼 Hyperlink 解析 ─────────────────────────────────────
    function resolvePrereqLink(code) {
        if (!PREREQ_CODE_REGEX.test(code)) return;
        var key = code.toUpperCase();
        if (prereqLinkCache[key] !== undefined) return;
        prereqLinkCache[key] = null;
        window.authFetch(API_BASE + '/resolve-prereq?code=' + encodeURIComponent(code), {})
            .then(function (r) { return r.json(); })
            .then(function (json) {
                prereqLinkCache[key] = (json.stat === 'ok' && json.result) ? json.result : false;
                document.querySelectorAll('.prereq-code[data-prereq-key="' + key + '"]').forEach(function (el) {
                    renderPrereqCodeSpan(el, el.dataset.prereqRaw || code, prereqLinkCache[key]);
                });
            })
            .catch(function () { prereqLinkCache[key] = false; });
    }

    function renderPrereqCodeSpan(el, code, info) {
        if (!el) return;
        var display = escapeHtml(code);
        if (!info || !info.found) { el.innerHTML = display; return; }
        var url  = '/eServiceA/dashboard/page/p' + info.categoryId + '.html?highlight=' + info.taskId;
        var icon = info.completed ? '✅' : (info.status === 'DELAYED' ? '⚠️' : '⏳');
        el.innerHTML =
            '<a class="prereq-task-link" href="' + url + '" target="_blank" title="' + escapeHtml(info.taskName || '') + '">' + display + '</a>' +
            '<span class="prereq-task-status">' + icon + '</span>';
    }

    function applyPrereqLinks(container) {
        (container || document).querySelectorAll('.prereq-code[data-prereq-key]').forEach(function (el) {
            var key  = el.dataset.prereqKey;
            var code = el.dataset.prereqRaw || key;
            var info = prereqLinkCache[key];
            if (info !== undefined && info !== null) {
                renderPrereqCodeSpan(el, code, info);
            } else {
                resolvePrereqLink(code);
            }
        });
    }

    function prereqCodeSpanHtml(memo) {
        var display = escapeHtml(memo);
        if (!PREREQ_CODE_REGEX.test(memo)) {
            return '<span class="prereq-code">' + display + '</span>';
        }
        var key  = memo.toUpperCase();
        var info = prereqLinkCache[key];
        var inner = display;
        if (info && info.found) {
            var url  = '/eServiceA/dashboard/page/p' + info.categoryId + '.html?highlight=' + info.taskId;
            var icon = info.completed ? '✅' : (info.status === 'DELAYED' ? '⚠️' : '⏳');
            inner = '<a class="prereq-task-link" href="' + url + '" target="_blank" title="' +
                escapeHtml(info.taskName || '') + '">' + display + '</a>' +
                '<span class="prereq-task-status">' + icon + '</span>';
        }
        return '<span class="prereq-code" data-prereq-key="' + escapeHtml(key) + '" data-prereq-raw="' + escapeHtml(memo) + '">' + inner + '</span>';
    }

    /** 判斷目前登入使用者是否有任務操作權限（直接負責人 OR 與任一負責人同組別） */
    function isCurrentUserOwner(task) {
        var empId = getCurrentEmployeeId();
        if (!empId) return false;

        // 驗證 1：直接負責人
        if (task.ownerId) {
            if (task.ownerId.split(',').map(function (s) { return s.trim(); }).indexOf(empId.trim()) >= 0) {
                return true;
            }
        }

        // 驗證 2：與任一負責人同組別（比對 ownerDepts 欄位）
        var currentUser = getCurrentUser();
        var currentDept = currentUser ? (currentUser.department || '').trim() : '';
        if (currentDept && task.ownerDepts) {
            var ownerDepts = task.ownerDepts.split(',').map(function (s) { return s.trim(); });
            if (ownerDepts.indexOf(currentDept) >= 0) return true;
        }

        return false;
    }

    /**
     * 組裝前置任務方框內的清單 HTML。
     * 回傳 null → 無資料，方框應隱藏。
     */
    function buildPrereqInner(task, result, isOwner) {
        var ns = 'myTasksPage';
        if (result.length === 0) return null;

        var inner = '<ul class="task-prereq-list">';
        result.forEach(function (p) {
            inner += '<li class="task-prereq-item">' + prereqCodeSpanHtml(p.memo);
            if (isOwner) {
                inner +=
                    '<button class="prereq-btn prereq-edit-btn" ' +
                    'style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:6px;" ' +
                    'onclick="' + ns + '.openPrereqModal(' + task.id + ',' + p.memoId + ',\'' + escapeAttr(p.memo) + '\'); event.stopPropagation();" title="編輯">✏️ 編輯</button>' +
                    '<button class="prereq-btn prereq-del-btn" ' +
                    'style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:4px;" ' +
                    'onclick="' + ns + '.deletePrerequisite(' + p.memoId + ',' + task.id + '); event.stopPropagation();" title="刪除">🗑️ 刪除</button>';
            }
            inner += '</li>';
            if (PREREQ_CODE_REGEX.test(p.memo)) resolvePrereqLink(p.memo);
        });
        inner += '</ul>';
        if (isOwner) {
            inner += '<button class="prereq-add-btn" onclick="' + ns + '.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
        }
        return inner;
    }

    /** 負責人且無資料時，在方框外獨立顯示的新增按鈕 HTML */
    function buildPrereqAddZoneHTML(task, isOwner) {
        if (!isOwner) return '';
        var ns = 'myTasksPage';
        return '<button class="prereq-add-btn" style="margin-top:4px;" ' +
            'onclick="' + ns + '.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
    }

    function loadPrerequisitesForVisibleTasks(list) {
        list.forEach(function (task) {
            if (prereqCache[task.id] !== undefined) return;
            prereqCache[task.id] = null; // 標記載入中
            var isOwner = isCurrentUserOwner(task);
            loadPrerequisites(task, function (result) {
                var sectionEl = document.querySelector('.task-prereq-section[data-task-id="' + task.id + '"]');
                if (!sectionEl) return;
                var wrapperEl = sectionEl.closest('.task-prereq-wrapper');
                var addZoneEl = document.querySelector('.task-prereq-add-zone[data-task-id="' + task.id + '"]');

                var inner = buildPrereqInner(task, result, isOwner);
                if (inner === null) {
                    // 無資料：隱藏方框，負責人顯示獨立新增按鈕
                    if (wrapperEl) wrapperEl.style.display = 'none';
                    if (addZoneEl) {
                        addZoneEl.innerHTML = buildPrereqAddZoneHTML(task, isOwner);
                        addZoneEl.style.display = isOwner ? '' : 'none';
                    }
                } else {
                    // 有資料：顯示方框，隱藏獨立新增按鈕
                    if (wrapperEl) wrapperEl.style.display = '';
                    sectionEl.innerHTML = inner;
                    applyPrereqLinks(sectionEl);
                    if (addZoneEl) addZoneEl.style.display = 'none';
                }
            });
        });
    }

    function openPrereqModal(taskId, memoId, currentMemo) {
        var task = tasks.find(function (t) { return t.id === taskId; });
        if (!task) return;
        pendingPrereqTaskId = taskId;
        editingPrereqMemoId = memoId || null;
        var modal = document.getElementById('prereqModal');
        if (!modal) return;
        document.getElementById('prereqModalTaskName').textContent = task.name || '';
        document.getElementById('prereqModalTitle').textContent = memoId ? '編輯前置任務' : '新增前置任務';
        document.getElementById('prereqMemoInput').value = currentMemo || '';
        modal.classList.add('show');
    }

    function savePrerequisite() {
        var memo = (document.getElementById('prereqMemoInput').value || '').trim();
        if (!memo) { alert('請輸入前置任務代碼！'); return; }
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }
        var task = tasks.find(function (t) { return t.id === pendingPrereqTaskId; });
        if (!task) return;
        var url, method;
        if (editingPrereqMemoId) {
            url    = API_BASE + '/memo/' + editingPrereqMemoId;
            method = 'PUT';
        } else {
            url    = API_BASE + '/' + (task.tableType || '') + '/' + task.id + '/prerequisite';
            method = 'POST';
        }
        apiCall(method, url, { memo: memo }, function (err) {
            if (err) { alert('操作失敗：' + err); return; }
            delete prereqCache[task.id];
            cancelPrerequisite();
            loadPrerequisites(task, function () { renderTasks(); });
        });
    }

    function cancelPrerequisite() {
        var modal = document.getElementById('prereqModal');
        if (modal) modal.classList.remove('show');
        pendingPrereqTaskId = null;
        editingPrereqMemoId = null;
    }

    function deletePrerequisite(memoId, taskId) {
        if (!confirm('確定要刪除此前置任務？')) return;
        if (!getCurrentEmployeeId()) { alert('請先登入'); return; }
        apiCall('DELETE', API_BASE + '/memo/' + memoId, null, function (err) {
            if (err) { alert('刪除失敗：' + err); return; }
            delete prereqCache[taskId];
            var task = tasks.find(function (t) { return t.id === taskId; });
            if (task) loadPrerequisites(task, function () { renderTasks(); });
        });
    }

    // ─── 任務狀態 ─────────────────────────────────────────────────────────
    function getTaskStatus(task) {
        if (task.completed) return 'completed';
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var exp = new Date(task.expectedCompletion); exp.setHours(0, 0, 0, 0);
        if (exp < today) return 'overdue';
        if (!task.actualStart) return 'notStarted';
        return new Date() >= new Date(task.actualStart) ? 'inProgress' : 'notStarted';
    }

    // ─── 資料載入 ─────────────────────────────────────────────────────────
    function loadTasksData() {
        var empId = getCurrentEmployeeId();
        if (!empId) {
            showLoginPrompt();
            return;
        }

        // 取得目前使用者的組別（來自登入時寫入的 localStorage/sessionStorage）
        var currentUser = getCurrentUser();
        var currentDept = currentUser ? (currentUser.department || '').trim() : '';

        DataLoader.loadProjectData(function (err, data) {
            tasks = [];
            if (!err && data.categories) {
                data.categories.forEach(function (cat) {
                    var catLabel = CATEGORY_LABELS[cat.id] || { name: cat.name, color: '#6b7280' };
                    (cat.groups || []).forEach(function (group) {
                        (group.tasks || []).forEach(function (task) {
                            if (!task.ownerId) return;

                            // 驗證 1：使用者是直接負責人
                            var ids = task.ownerId.split(',').map(function (s) { return s.trim(); });
                            var isDirectOwner = ids.indexOf(empId.trim()) >= 0;

                            // 驗證 2：使用者與任一負責人同組別（比對 ownerDepts 欄位）
                            var isSameDept = false;
                            if (!isDirectOwner && currentDept && task.ownerDepts) {
                                var ownerDepts = task.ownerDepts.split(',').map(function (s) { return s.trim(); });
                                isSameDept = ownerDepts.indexOf(currentDept) >= 0;
                            }

                            if (!isDirectOwner && !isSameDept) return;

                            task.categoryId    = cat.id;
                            task.categoryName  = catLabel.name;
                            task.categoryColor = catLabel.color;
                            task.groupId       = group.id;
                            task.groupName     = group.name;
                            tasks.push(task);
                        });
                    });
                });
            }
            updateStats();
            renderTasks();
            populateSystemCodeFilter();
        });
    }

    function showLoginPrompt() {
        var container = document.getElementById('allTaskList');
        if (container) {
            container.innerHTML =
                '<div class="empty-state">' +
                '<div class="empty-state-icon">🔐</div>' +
                '<div class="empty-state-text">請先<a href="../page/login.html" style="color:var(--primary-color);margin:0 4px;">登入</a>以查看您的任務</div>' +
                '</div>';
        }
        updateStats();
    }

    // ─── 系統代碼篩選 datalist ────────────────────────────────────────────
    function populateSystemCodeFilter() {
        var dl = document.getElementById('systemCodeList');
        if (!dl) return;
        var codes = [], seen = {};
        tasks.forEach(function (t) {
            var code = (t.systemCode || '').trim();
            if (code && !seen[code]) { seen[code] = true; codes.push(code); }
        });
        codes.sort();
        dl.innerHTML = '';
        codes.forEach(function (code) {
            var opt = document.createElement('option');
            opt.value = code;
            dl.appendChild(opt);
        });
    }

    // ─── 過濾 ─────────────────────────────────────────────────────────────
    function getFilteredTasks() {
        return tasks.filter(function (task) {
            var status = getTaskStatus(task);
            if (currentFilter === 'notStarted' && status !== 'notStarted') return false;
            if (currentFilter === 'inProgress'  && status !== 'inProgress')  return false;
            if (currentFilter === 'overdue'     && status !== 'overdue')     return false;
            if (currentFilter === 'completed'   && status !== 'completed')   return false;
            if (systemCodeFilter) {
                if ((task.systemCode || '').trim() !== systemCodeFilter) return false;
            }
            if (searchQuery) {
                var q = searchQuery.toLowerCase();
                return (task.name         || '').toLowerCase().includes(q) ||
                       (task.owner        || '').toLowerCase().includes(q) ||
                       (task.systemCode   || '').toLowerCase().includes(q) ||
                       (task.categoryName || '').toLowerCase().includes(q) ||
                       (task.groupName    || '').toLowerCase().includes(q) ||
                       (task.id != null ? String(task.id) : '').includes(q);
            }
            return true;
        });
    }

    // ─── 渲染 ─────────────────────────────────────────────────────────────
    function renderTasks() {
        var filtered = getFilteredTasks();

        var byStatus = {
            notStarted: filtered.filter(function (t) { return getTaskStatus(t) === 'notStarted'; }),
            inProgress:  filtered.filter(function (t) { return getTaskStatus(t) === 'inProgress';  }),
            overdue:     filtered.filter(function (t) { return getTaskStatus(t) === 'overdue';     }),
            completed:   filtered.filter(function (t) { return getTaskStatus(t) === 'completed';   })
        };

        var STATUS_ORDER = { overdue: 0, inProgress: 1, notStarted: 2, completed: 3 };
        var sortFn = function (a, b) {
            var sa = STATUS_ORDER[getTaskStatus(a)];
            var sb = STATUS_ORDER[getTaskStatus(b)];
            if (sa !== sb) return sa - sb;
            return new Date(a.expectedCompletion) - new Date(b.expectedCompletion);
        };
        filtered.sort(sortFn);
        Object.keys(byStatus).forEach(function (k) { byStatus[k].sort(sortFn); });

        var sectionMap = { all: 'allSection', notStarted: 'notStartedSection', inProgress: 'inProgressSection', overdue: 'overdueSection', completed: 'completedSection' };
        Object.keys(sectionMap).forEach(function (key) {
            var el = document.getElementById(sectionMap[key]);
            if (!el) return;
            var active = currentFilter === key;
            el.classList.toggle('hidden', !active);
            el.classList.toggle('full-width', active);
        });

        var start = (currentPage - 1) * tasksPerPage;
        var listMap = {
            all:        { list: filtered,            listId: 'allTaskList',        countId: 'allCount'        },
            notStarted: { list: byStatus.notStarted, listId: 'notStartedTaskList', countId: 'notStartedCount' },
            inProgress:  { list: byStatus.inProgress,  listId: 'inProgressTaskList',  countId: 'inProgressCount'  },
            overdue:     { list: byStatus.overdue,     listId: 'overdueTaskList',     countId: 'overdueCount'     },
            completed:   { list: byStatus.completed,   listId: 'completedTaskList',   countId: 'completedCount'   }
        };
        var cur = listMap[currentFilter];
        if (cur) {
            renderTaskList(cur.list.slice(start, start + tasksPerPage), cur.listId);
            document.getElementById(cur.countId).textContent = cur.list.length;
        }
        updatePagination(cur ? cur.list.length : 0);
    }

    function renderTaskList(list, containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (list.length === 0) {
            var msgs  = { allTaskList: '目前沒有屬於您的任務', notStartedTaskList: '尚無未開始任務', inProgressTaskList: '尚無進行中任務', overdueTaskList: '尚無逾期任務', completedTaskList: '尚無已完成任務' };
            var icons = { allTaskList: '📋', notStartedTaskList: '⏸', inProgressTaskList: '⏳', overdueTaskList: '⚠', completedTaskList: '✅' };
            container.innerHTML =
                '<div class="empty-state">' +
                '<div class="empty-state-icon">' + (icons[containerId] || '') + '</div>' +
                '<div class="empty-state-text">' + (msgs[containerId] || '') + '</div>' +
                '</div>';
            return;
        }

        container.innerHTML = '';
        var ns = 'myTasksPage';
        var userId = getCurrentUserId();

        list.forEach(function (task, index) {
            var status = getTaskStatus(task);
            var item   = document.createElement('div');
            item.className = 'task-item' +
                (status === 'completed' ? ' completed' : '') +
                (status === 'overdue'   ? ' overdue'   : '');
            item.style.animationDelay = (index * 0.05) + 's';
            item.dataset.taskId = task.id;

            var badgeMap = {
                overdue:    '<span class="overdue-badge">⚠ 已逾期</span>',
                inProgress:  '<span class="overdue-ing">⏳ 進行中</span>',
                notStarted: '<span class="overdue-notyet">未開始</span>',
                completed:  '<span class="overdue-ok"> 已完成</span>'
            };
            var statusBadge = badgeMap[status] || '';

            // 主題 Tag
            var catTag = '<span class="my-task-cat-tag" style="background:' + (task.categoryColor || '#6b7280') + ';">' +
                escapeHtml(task.categoryName || '') + '</span>';

            // 實際開始日期
            var actualStartHTML;
            if (task.actualStart) {
                actualStartHTML = '<div class="task-meta-value datetime-display clickable" ' +
                    'onclick="' + ns + '.openStartDateModal(' + task.id + '); event.stopPropagation();">' +
                    formatDateTimeDisplay(task.actualStart) + '</div>';
            } else {
                actualStartHTML = '<div class="task-meta-value">' +
                    '<button class="set-date-btn" onclick="' + ns + '.openStartDateModal(' + task.id + '); event.stopPropagation();">設定開始日期</button>' +
                    '</div>';
            }

            var metaHTML =
                '<div class="task-meta-item"><div class="task-meta-label">主題</div>' +
                '<div class="task-meta-value">' + catTag + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">組別</div>' +
                '<div class="task-meta-value">' + escapeHtml(task.groupName || '') + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">負責人員</div>' +
                '<div class="task-meta-value">' + escapeHtml(task.owner || '') + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">預期開始日期</div>' +
                '<div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedStart) + '</div></div>' +
                '<div class="task-meta-item' + (status === 'overdue' ? ' overdue-date' : '') + '">' +
                '<div class="task-meta-label">預期完成日期</div>' +
                '<div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedCompletion) + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">實際開始日期</div>' + actualStartHTML + '</div>' +
                '<div class="task-meta-item"><div class="task-meta-label">實際完成日期</div>' +
                '<div class="task-meta-value datetime-display">' + (task.actualCompletion ? formatDateTimeDisplay(task.actualCompletion) : '') + '</div></div>';

            // 備忘錄按鈕
            var key   = memoKey(task);
            var memos = memoCache[key] || [];
            var hasMemo = memos.length > 0;
            var noteBtnClass, noteBtnText, noteBtnFn;
            if (!hasMemo) {
                noteBtnClass = 'task-note-btn';
                noteBtnText  = '📝 新增進度說明';
                noteBtnFn    = ns + '.openMemoModal(' + task.id + ')';
            } else {
                noteBtnClass = 'task-note-btn has-note';
                noteBtnText  = '📝 進度說明 (' + memos.length + ')';
                noteBtnFn    = ns + '.openNoteSection(' + task.id + ')';
            }

            var updateBtnHTML =
                '<button class="task-update-btn" onclick="' + ns + '.toggleTask(' + task.id + '); event.stopPropagation();">更新進度</button>';

            var noteHTML = '';
            if (expandedTaskId === task.id) {
                noteHTML = renderMemoList(task, memos, userId);
            }

            item.innerHTML =
                '<div class="task-buttons-container">' +
                '<button class="' + noteBtnClass + '" onclick="' + noteBtnFn + '; event.stopPropagation();">' + noteBtnText + '</button>' +
                updateBtnHTML +
                '</div>' +
                '<div class="task-header"><div class="task-content">' +
                '<div class="task-name">' + statusBadge + (task.taskSeq != null ? '  ' + task.taskSeq : '  -') + '  ' + escapeHtml(task.name || '') + '</div>' +
                '<div class="task-systemCode">系統代碼 : ' + escapeHtml(task.systemCode || '') + '</div>' +
                '<div class="task-systemCode">負責人單位 : ' + escapeHtml(task.ownerUnit || '') + '</div>' +
                '<div class="task-meta-grid">' + metaHTML + '</div>' +
                (function () {
                    var cached = prereqCache[task.id];
                    var isOwner = isCurrentUserOwner(task);
                    var wrapperStyle = '';
                    var sectionContent = '';
                    var addZoneStyle = 'display:none;';
                    var addZoneContent = '';

                    if (cached === undefined || cached === null) {
                        // 非同步載入中：顯示方框 + loading
                        sectionContent = '<div class="task-prereq-loading">⏳ 載入中...</div>';
                    } else {
                        var builtInner = buildPrereqInner(task, cached, isOwner);
                        if (builtInner === null) {
                            // 無資料：隱藏方框，負責人顯示獨立新增按鈕
                            wrapperStyle = 'display:none;';
                            if (isOwner) {
                                addZoneStyle   = '';
                                addZoneContent = buildPrereqAddZoneHTML(task, isOwner);
                            }
                        } else {
                            // 有資料：顯示方框
                            sectionContent = builtInner;
                        }
                    }

                    return '<div class="task-prereq-wrapper" style="' + wrapperStyle + '">' +
                        '<div class="task-prereq-label">🔗 等候前置任務</div>' +
                        '<div class="task-prereq-section" data-task-id="' + task.id + '">' + sectionContent + '</div>' +
                        '</div>' +
                        '<div class="task-prereq-add-zone" data-task-id="' + task.id + '" style="' + addZoneStyle + '">' + addZoneContent + '</div>';
                })() +
                '</div></div>' +
                noteHTML;

            item.addEventListener('click', function (e) {
                if (!e.target.closest('.task-note-btn') &&
                    !e.target.closest('.task-update-btn') &&
                    !e.target.closest('.task-memo-section') &&
                    !e.target.closest('.task-prereq-wrapper') &&
                    e.target.tagName !== 'INPUT' &&
                    e.target.tagName !== 'BUTTON' &&
                    e.target.tagName !== 'TEXTAREA') {
                    toggleNoteExpansion(task.id);
                }
            });

            container.appendChild(item);
        });

        // 非同步載入前置任務（首次才抓 API）
        loadPrerequisitesForVisibleTasks(list);
        // 非同步載入進度說明數量，載入後直接更新按鈕樣式
        loadMemosForVisibleTasks(list);
    }

    // ─── 非同步預載進度說明數量，更新按鈕樣式 ──────────────────────────
    function loadMemosForVisibleTasks(list) {
        list.forEach(function (task) {
            var key = memoKey(task);
            if (memoCache[key] !== undefined) return; // 已快取，跳過
            loadMemos(task, function () {
                var memos = memoCache[key] || [];
                if (memos.length === 0) return;
                // 直接找到對應按鈕並更新，不需重繪整頁
                var taskEl = document.querySelector('[data-task-id="' + task.id + '"]');
                if (!taskEl) return;
                var btn = taskEl.querySelector('.task-note-btn');
                if (!btn) return;
                btn.className = 'task-note-btn has-note';
                btn.textContent = '📝 進度說明 (' + memos.length + ')';
                btn.setAttribute('onclick', 'myTasksPage.openNoteSection(' + task.id + '); event.stopPropagation();');
            });
        });
    }

    function renderMemoList(task, memos, currentUserId) {
        var ns = 'myTasksPage';
        var html = '<div class="task-memo-section" onclick="event.stopPropagation();">';
        html += '<div class="task-note-header">進度說明</div>';
        if (memos.length === 0) {
            html += '<div class="task-note-empty">尚無進度說明</div>';
        } else {
            // 最新建立時間排最前面
            var sortedMemos = memos.slice().sort(function (a, b) {
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
            html += '<div class="task-memo-list">';
            sortedMemos.forEach(function (m) {
                var canDelete = (currentUserId !== null) && (String(m.createdBy) === String(currentUserId));
                var ts = m.createdAt ? m.createdAt.replace('T', ' ').substring(0, 16) : '';
                html += '<div class="task-memo-item" data-memo-id="' + m.memoId + '">';
                html += '<div class="task-memo-time">' + ts + '</div>';
                html += '<div class="task-memo-content">' + escapeHtml(m.memo) + '</div>';
                html += '<div class="task-memo-meta">更新人員：' + escapeHtml(m.createdByName || m.createdBy || '');
                if (canDelete) {
                    html += '<button class="task-memo-del-btn" onclick="' + ns + '.deleteMemo(' + task.id + ',' + m.memoId + '); event.stopPropagation();">✕ 刪除</button>';
                }
                html += '</div></div>';
            });
            html += '</div>';
        }
        html += '<div class="task-memo-add-row">';
        html += '<button class="task-memo-add-btn" onclick="' + ns + '.openMemoModal(' + task.id + '); event.stopPropagation();">＋ 新增進度說明</button>';
        html += '</div>';
        html += '</div>';
        return html;
    }

    // ─── 展開備忘錄 ──────────────────────────────────────────────────────
    function openNoteSection(taskId) {
        if (expandedTaskId === taskId) { expandedTaskId = null; renderTasks(); return; }
        expandedTaskId = taskId;
        var task = tasks.find(function (t) { return t.id === taskId; });
        if (!task) { renderTasks(); return; }
        var key = memoKey(task);
        if (memoCache[key]) { renderTasks(); }
        else { loadMemos(task, function () { renderTasks(); }); }
    }

    function toggleNoteExpansion(taskId) {
        expandedTaskId = expandedTaskId === taskId ? null : taskId;
        if (expandedTaskId) {
            var task = tasks.find(function (t) { return t.id === taskId; });
            if (task && !memoCache[memoKey(task)]) { loadMemos(task, function () { renderTasks(); }); return; }
        }
        renderTasks();
    }

    // ─── 備忘錄 Modal ─────────────────────────────────────────────────────
    function openMemoModal(taskId) {
        pendingTaskId = taskId;
        var task = tasks.find(function (t) { return t.id === taskId; });
        if (task) document.getElementById('memoModalTaskName').textContent = task.name || '';
        var textEl = document.getElementById('memoModalText');
        if (textEl) textEl.value = '';
        document.getElementById('memoModal').classList.add('show');
    }

    function saveMemoModal() {
        var textEl = document.getElementById('memoModalText');
        var text = (textEl ? textEl.value.trim() : '');
        if (!text) { alert('請輸入進度說明內容'); return; }
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }
        var task = tasks.find(function (t) { return t.id === pendingTaskId; });
        if (!task) return;
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/memo';
        apiCall('POST', url, { memo: text }, function (err) {
            if (err) { alert('新增失敗：' + err); return; }
            cancelMemoModal();
            expandedTaskId = task.id;
            delete memoCache[memoKey(task)];
            loadMemos(task, function () { renderTasks(); });
        });
    }

    function cancelMemoModal() {
        var el = document.getElementById('memoModal');
        if (el) el.classList.remove('show');
        pendingTaskId = null;
    }

    function deleteMemo(taskId, memoId) {
        if (!confirm('確定要刪除此進度說明？')) return;
        var url = API_BASE + '/memo/' + memoId;
        apiCall('DELETE', url, null, function (err) {
            if (err) { alert('刪除失敗：' + err); return; }
            var task = tasks.find(function (t) { return t.id === taskId; });
            if (task) { delete memoCache[memoKey(task)]; loadMemos(task, function () { renderTasks(); }); }
        });
    }

    // ─── 實際開始日期 Modal ───────────────────────────────────────────────
    function initCustomDateTimePicker() {
        var hourSelect = document.getElementById('modalStartDate_hour');
        var minSelect  = document.getElementById('modalStartDate_min');
        var timeBlock  = document.getElementById('customTimeSelects');
        if (!hourSelect || !minSelect || !timeBlock) return;
        for (var h = 0; h <= 23; h++) {
            var oh = document.createElement('option');
            oh.value = oh.textContent = String(h).padStart(2, '0');
            hourSelect.appendChild(oh);
        }
        for (var m = 0; m <= 59; m++) {
            var om = document.createElement('option');
            om.value = om.textContent = String(m).padStart(2, '0');
            minSelect.appendChild(om);
        }
        timeBlock.style.display = 'flex';
        document.getElementById('modalStartDate_date').addEventListener('change', syncStartDateHidden);
        hourSelect.addEventListener('change', syncStartDateHidden);
        minSelect.addEventListener('change', syncStartDateHidden);
    }

    function syncStartDateHidden() {
        var d  = document.getElementById('modalStartDate_date').value;
        var h  = document.getElementById('modalStartDate_hour').value;
        var m  = document.getElementById('modalStartDate_min').value;
        if (d && h !== '' && m !== '') {
            var offset = -new Date().getTimezoneOffset();
            var sign   = offset >= 0 ? '+' : '-';
            var absOff = Math.abs(offset);
            var oh = String(Math.floor(absOff / 60)).padStart(2, '0');
            var om = String(absOff % 60).padStart(2, '0');
            document.getElementById('modalStartDate').value = d + 'T' + h + ':' + m + ':00' + sign + oh + ':' + om;
        } else {
            document.getElementById('modalStartDate').value = '';
        }
    }

    function openStartDateModal(taskId) {
        var task = tasks.find(function (t) { return t.id === taskId; });
        if (!task) return;
        pendingTaskId = taskId;
        document.getElementById('startDateModalTaskName').textContent = task.name || '';
        var dateInput  = document.getElementById('modalStartDate_date');
        var hourSelect = document.getElementById('modalStartDate_hour');
        var minSelect  = document.getElementById('modalStartDate_min');
        var timeBlock  = document.getElementById('customTimeSelects');
        timeBlock.style.display = 'flex';
        if (task.actualStart) {
            var dt = new Date(task.actualStart);
            if (!isNaN(dt.getTime())) {
                dateInput.value  = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
                hourSelect.value = String(dt.getHours()).padStart(2, '0');
                minSelect.value  = String(dt.getMinutes()).padStart(2, '0');
            }
        } else {
            var now = new Date();
            dateInput.value  = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
            hourSelect.value = String(now.getHours()).padStart(2, '0');
            minSelect.value  = String(now.getMinutes()).padStart(2, '0');
        }
        syncStartDateHidden();
        document.getElementById('startDateModal').classList.add('show');
    }

    function confirmStartDate() {
        var startDate = document.getElementById('modalStartDate').value;
        if (!startDate || startDate.length < 10) { alert('請完整填入日期！'); return; }
        var task = tasks.find(function (t) { return t.id === pendingTaskId; });
        if (!task) return;
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/actualStart';
        apiCall('POST', url, { actualStart: startDate }, function (err) {
            if (err) { alert('設定失敗：' + err); return; }
            task.actualStart = startDate;
            renderTasks();
        });
        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelStartDate() {
        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 更新進度 Modal ───────────────────────────────────────────────────
    function toggleTask(taskId) {
        var task = tasks.find(function (t) { return t.id === taskId; });
        if (!task) return;
        pendingTaskId = taskId;
        if (!task.completed) {
            document.getElementById('modalTaskName').textContent = task.name || '';
            var now = new Date();
            document.getElementById('modalActualDate').value =
                now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + 'T' +
                String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
            document.getElementById('completeModal').classList.add('show');
        } else {
            document.getElementById('uncompleteModalTaskName').textContent = task.name || '';
            document.getElementById('uncompleteModal').classList.add('show');
        }
    }

    function confirmComplete() {
        var actualDate = document.getElementById('modalActualDate').value;
        if (!actualDate) { alert('請輸入實際完成日期!'); return; }
        var task = tasks.find(function (t) { return t.id === pendingTaskId; });
        if (!task) return;
        if (!getCurrentEmployeeId()) { alert('請先登入'); return; }
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/complete';
        apiCall('POST', url, { completed: true, actualCompletion: actualDate }, function (err) {
            if (err) { alert('更新失敗：' + err); return; }
            task.completed = true; task.actualCompletion = actualDate;
            updateStats(); renderTasks();
        });
        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelComplete() {
        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function confirmUncomplete() {
        var task = tasks.find(function (t) { return t.id === pendingTaskId; });
        if (!task) return;
        if (!getCurrentEmployeeId()) { alert('請先登入'); return; }
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/complete';
        apiCall('POST', url, { completed: false, actualCompletion: null }, function (err) {
            if (err) { alert('更新失敗：' + err); return; }
            task.completed = false; task.actualCompletion = null;
            updateStats(); renderTasks();
        });
        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelUncomplete() {
        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 統計 ─────────────────────────────────────────────────────────────
    function updateStats() {
        var empId = getCurrentEmployeeId();
        var completed = tasks.filter(function (t) { return t.completed; }).length;
        var total     = tasks.length;
        var pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var overdue = tasks.filter(function (t) {
            if (t.completed) return false;
            var exp = new Date(t.expectedCompletion); exp.setHours(0, 0, 0, 0);
            return exp < today;
        }).length;

        // 更新頁首使用者名稱
        var titleEl = document.getElementById('myTasksUserName');
        if (titleEl && empId) {
            var u = getCurrentUser();
            titleEl.textContent = u ? (u.fullName || u.userName || empId) : empId;
        }

        var container = document.getElementById('progressSummaryStats');
        if (!container) return;
        container.innerHTML = '';
        [
            { value: pct + '%',              label: '個人完成度' },
            { value: completed + '/' + total, label: '已完成任務' },
            { value: (total - completed) + '', label: '待處理任務' },
            { value: overdue + '',             label: '已逾期任務' }
        ].forEach(function (s) {
            var card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = '<div class="stat-card__value">' + s.value + '</div><div class="stat-card__label">' + s.label + '</div>';
            container.appendChild(card);
        });
    }

    // ─── 分頁 ─────────────────────────────────────────────────────────────
    // ─── 分頁頁碼輔助 ─────────────────────────────────────────────────────
    function buildPageRange(current, total) {
        if (total <= 7) {
            var arr = [];
            for (var i = 1; i <= total; i++) arr.push(i);
            return arr;
        }
        var pages = [1];
        var start = Math.max(2, current - 2);
        var end   = Math.min(total - 1, current + 2);
        if (start > 2) pages.push('...');
        for (var i = start; i <= end; i++) pages.push(i);
        if (end < total - 1) pages.push('...');
        pages.push(total);
        return pages;
    }

    function updatePagination(total) {
        var totalPages = Math.ceil(total / tasksPerPage) || 1;
        document.getElementById('pageInfo').textContent = '共 ' + totalPages + ' 頁 · 總計 ' + total + ' 項任務';
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage >= totalPages;

        // 渲染頁碼按鈕
        var container = document.getElementById('pageNumbers');
        if (container) {
            container.innerHTML = '';
            buildPageRange(currentPage, totalPages).forEach(function (p) {
                if (p === '...') {
                    var span = document.createElement('span');
                    span.className = 'page-ellipsis';
                    span.textContent = '…';
                    container.appendChild(span);
                } else {
                    var btn = document.createElement('button');
                    btn.className = 'page-number-btn' + (p === currentPage ? ' active' : '');
                    btn.textContent = p;
                    btn.onclick = (function (pg) {
                        return function () { currentPage = pg; renderTasks(); scrollToTasks(); };
                    })(p);
                    container.appendChild(btn);
                }
            });
        }
        var jumpInput = document.getElementById('pageJumpInput');
        if (jumpInput) jumpInput.max = totalPages;
    }

    function prevPage() {
        if (currentPage > 1) { currentPage--; renderTasks(); scrollToTasks(); }
    }

    function nextPage() {
        var total = getFilteredTasks().length;
        if (currentPage < Math.ceil(total / tasksPerPage)) { currentPage++; renderTasks(); scrollToTasks(); }
    }

    function scrollToTasks() {
        var el = document.querySelector('.tasks-section');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ─── 初始化 ───────────────────────────────────────────────────────────
    function init() {
        loadTasksData();
        initCustomDateTimePicker();

        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function (e) {
                searchQuery = e.target.value;
                currentPage = 1;
                renderTasks();
            });
        }

        // ─── 系統代碼 datalist 篩選 ───────────────────────────────────────
        var sysCodeInput = document.getElementById('systemCodeInput');
        var sysCodeClear = document.getElementById('systemCodeClearBtn');
        if (sysCodeInput) {
            sysCodeInput.addEventListener('input', function (e) {
                systemCodeFilter = e.target.value.trim();
                currentPage = 1;
                renderTasks();
            });
        }
        if (sysCodeClear) {
            sysCodeClear.addEventListener('click', function () {
                systemCodeFilter = '';
                if (sysCodeInput) sysCodeInput.value = '';
                currentPage = 1;
                renderTasks();
            });
        }

        document.querySelectorAll('.filter-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                currentPage   = 1;
                renderTasks();
            });
        });

        var prevBtn = document.getElementById('prevPage');
        var nextBtn = document.getElementById('nextPage');
        if (prevBtn) prevBtn.addEventListener('click', prevPage);
        if (nextBtn) nextBtn.addEventListener('click', nextPage);

        var jumpBtn   = document.getElementById('pageJumpBtn');
        var jumpInput = document.getElementById('pageJumpInput');
        if (jumpBtn && jumpInput) {
            function doJump() {
                var pg = parseInt(jumpInput.value, 10);
                var total = getFilteredTasks().length;
                var totalPages = Math.ceil(total / tasksPerPage) || 1;
                if (!isNaN(pg) && pg >= 1 && pg <= totalPages) {
                    currentPage = pg; renderTasks(); scrollToTasks();
                }
            }
            jumpBtn.addEventListener('click', doJump);
            jumpInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doJump(); });
        }

        ['completeModal', 'uncompleteModal', 'startDateModal', 'memoModal', 'prereqModal'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', function (e) {
                if (e.target.id !== id) return;
                if (id === 'completeModal')   cancelComplete();
                if (id === 'uncompleteModal') cancelUncomplete();
                if (id === 'startDateModal')  cancelStartDate();
                if (id === 'memoModal')       cancelMemoModal();
                if (id === 'prereqModal')     cancelPrerequisite();
            });
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────
    return {
        init:               init,
        toggleTask:         toggleTask,
        confirmComplete:    confirmComplete,
        cancelComplete:     cancelComplete,
        confirmUncomplete:  confirmUncomplete,
        cancelUncomplete:   cancelUncomplete,
        openNoteSection:    openNoteSection,
        openMemoModal:      openMemoModal,
        saveMemoModal:      saveMemoModal,
        cancelMemoModal:    cancelMemoModal,
        deleteMemo:         deleteMemo,
        openStartDateModal: openStartDateModal,
        confirmStartDate:   confirmStartDate,
        cancelStartDate:    cancelStartDate,
        openPrereqModal:    openPrereqModal,
        savePrerequisite:   savePrerequisite,
        cancelPrerequisite: cancelPrerequisite,
        deletePrerequisite: deletePrerequisite
    };
})();

document.addEventListener('DOMContentLoaded', function () {
    myTasksPage.init();
});

window.confirmComplete   = myTasksPage.confirmComplete;
window.cancelComplete    = myTasksPage.cancelComplete;
window.confirmUncomplete = myTasksPage.confirmUncomplete;
window.cancelUncomplete  = myTasksPage.cancelUncomplete;
