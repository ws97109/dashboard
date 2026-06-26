// js/pPage.js
// 通用 Page 模組，供 p1~p5 共用
// HTML 引入方式：<script src="../js/pPage.js" data-pageid="1"></script>

var pPage = (function() {
    'use strict';

    // ─── 各頁設定 ────────────────────────────────────────────────────────
    var PAGE_CONFIG = {
        1: { categoryId: 1, defaultName: '前置作業',          datesKey: 'taskDates1' },
        2: { categoryId: 2, defaultName: '新光資料轉出',       datesKey: 'taskDates2' },
        3: { categoryId: 3, defaultName: '資料轉置/系統切轉',  datesKey: 'taskDates3' },
        4: { categoryId: 4, defaultName: '系統驗證/業務補登',  datesKey: 'taskDates4' },
        5: { categoryId: 5, defaultName: '對外營運',           datesKey: 'taskDates5' }
    };

    var API_BASE = '/eServiceA/dashboard/api/v2/task';

    // 停用瀏覽器自動還原捲動位置，避免 highlight 捲動被蓋掉
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // ─── 狀態變數 ─────────────────────────────────────────────────────────
    var pageId        = null;
    var config        = null;
    var tasks         = [];
    var allGroups     = [];
    var currentPage   = 1;
    var tasksPerPage  = 20;
    var currentFilter = 'all';
    var searchQuery   = '';
    var systemCodeFilter = '';   // ← 系統代碼精確篩選
    var pendingTaskId = null;
    var selectedCompany   = null;
    var selectedGroupId   = null;
    var selectedTaskType  = null;
    var currentGroupName  = '';
    var expandedTaskId    = null;
    var categoryName      = '';
    var memoCache         = {};   // taskKey → [ {memoId, memo, createdBy, createdAt} ]
    var prereqCache       = {};   // taskId  → [ {memoId, memo, createdBy, createdAt} ] | null(loading)
    var pendingPrereqTaskId = null;
    var editingPrereqMemoId = null;

    // ─── 前置任務 Hyperlink 快取 ──────────────────────────────────────────
    // key: UPPER(code) → { found, categoryId, taskId, taskName, completed, status } | false | null(loading)
    var prereqLinkCache = {};
    var PREREQ_CODE_REGEX = /^[A-Za-z]+-\d+$/;

    // ─── 登入使用者 ───────────────────────────────────────────────────────
    function getCurrentUser() {
        try { return JSON.parse(localStorage.getItem('dashboardUser') || sessionStorage.getItem('dashboardUser') || 'null'); } catch(e) { return null; }
    }

    function getCurrentEmployeeId() {
        var user = getCurrentUser();
        return user ? (user.employeeId || '') : '';
    }

    function getCurrentUserId() {
        var user = getCurrentUser();
        return user ? (user.userId || null) : null;
    }

    /**
     * 判斷目前使用者是否有任務操作權限
     * 條件 1：ownerId 中的直接負責人
     * 條件 2：與任一負責人同組別（ODORG.HR_EMP.DEPT_NM_ACT，由 ownerDepts 欄位傳入）
     */
    function isOwner(task) {
        var empId = getCurrentEmployeeId();
        if (!empId) return false;

        // 驗證 1：直接負責人
        if (task.ownerId) {
            if (task.ownerId.split(',').map(function(s) { return s.trim(); }).indexOf(empId.trim()) >= 0) {
                return true;
            }
        }

        // 驗證 2：與任一負責人同組別（比對 ownerDepts 欄位）
        var currentUser = getCurrentUser();
        var currentDept = currentUser ? (currentUser.department || '').trim() : '';
        if (currentDept && task.ownerDepts) {
            var ownerDepts = task.ownerDepts.split(',').map(function(s) { return s.trim(); });
            if (ownerDepts.indexOf(currentDept) >= 0) return true;
        }

        return false;
    }

    // ─── 工具函式 ─────────────────────────────────────────────────────────
    function getUrlParams() {
        var params = {};
        var queryString = window.location.search.substring(1);
        queryString.split('&').forEach(function(pair) {
            var parts = pair.split('=');
            if (parts[0]) params[parts[0]] = decodeURIComponent(parts[1] || '');
        });
        return params;
    }

    function formatDateTime(date) {
        var Y = date.getFullYear();
        var M = String(date.getMonth() + 1).padStart(2, '0');
        var D = String(date.getDate()).padStart(2, '0');
        var h = String(date.getHours()).padStart(2, '0');
        var m = String(date.getMinutes()).padStart(2, '0');
        return Y + '/' + M + '/' + D + '-' + h + ':' + m;
    }

    function formatDateTimeDisplay(str) {
        if (!str) return '';
        var d = new Date(str);
        if (isNaN(d.getTime())) return str;
        var Y = d.getFullYear();
        var M = String(d.getMonth() + 1).padStart(2, '0');
        var D = String(d.getDate()).padStart(2, '0');
        var h = String(d.getHours()).padStart(2, '0');
        var m = String(d.getMinutes()).padStart(2, '0');
        return Y + '/' + M + '/' + D + ' ' + h + ':' + m;
    }

    function memoKey(task) {
        return (task.tableType || '') + '_' + task.id;
    }

    // ─── API 呼叫工具 ─────────────────────────────────────────────────────
    function apiCall(method, url, body, callback) {
        var opts = {
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);
        window.authFetch(url, opts)
            .then(function(r) { return r.json(); })
            .then(function(json) {
                var ok = json.stat === 'ok';
                callback(ok ? null : (json.errorMsg || '操作失敗'), json);
            })
            .catch(function(err) { callback('網路錯誤：' + err.message, null); });
    }

    // ─── 備忘錄載入 ──────────────────────────────────────────────────────
    function loadMemos(task, callback) {
        var key = memoKey(task);
        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/memos';
        window.authFetch(url, { })
            .then(function(r) { return r.json(); })
            .then(function(json) {
                memoCache[key] = json.stat === 'ok' ? (json.result || []) : [];
                if (callback) callback();
            })
            .catch(function() {
                memoCache[key] = [];
                if (callback) callback();
            });
    }

    // ─── localStorage（實際日期快取，降級備用）────────────────────────────
    function loadTaskDatesFromStorage() {
        var v = localStorage.getItem(config.datesKey);
        return v ? JSON.parse(v) : {};
    }

    function saveDatesToStorage() {
        var dates = {};
        tasks.forEach(function(task) {
            dates[task.id] = { actualStart: task.actualStart || null };
        });
        localStorage.setItem(config.datesKey, JSON.stringify(dates));
    }

    // ─── 任務狀態 ─────────────────────────────────────────────────────────
    function getTaskStatus(task) {
        if (task.completed) return 'completed';

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var exp = new Date(task.expectedCompletion);
        exp.setHours(0, 0, 0, 0);
        if (exp < today) return 'overdue';

        if (!task.actualStart) return 'notStarted';
        return new Date() >= new Date(task.actualStart) ? 'inProgress' : 'notStarted';
    }

    // ─── 資料載入 ─────────────────────────────────────────────────────────
    function loadTasksData() {
        var urlParams = getUrlParams();
        selectedCompany  = urlParams.company || null;
        selectedGroupId  = urlParams.group ? parseInt(urlParams.group) : null;
        selectedTaskType = urlParams.taskType || null;

        DataLoader.loadProjectData(function(err, data) {
            if (err) {
                tasks = []; allGroups = [];
                updatePageTitle(); updateStats(); renderTasks();
                return;
            }

            var category = data.categories.find(function(cat) { return cat.id === config.categoryId; });

            if (!category) {
                tasks = []; allGroups = [];
            } else {
                categoryName = category.name;
                allGroups    = category.groups || [];
                tasks        = [];

                if (!selectedGroupId) {
                    currentGroupName = '全部組別';
                    allGroups.forEach(function(group) {
                        if (!group.tasks) return;
                        group.tasks.forEach(function(task) {
                            if (matchTask(task)) {
                                task.groupId   = group.id;
                                task.groupName = group.name;
                                tasks.push(task);
                            }
                        });
                    });
                } else {
                    var targetGroup = allGroups.find(function(g) { return g.id === selectedGroupId; });
                    if (targetGroup && targetGroup.tasks) {
                        currentGroupName = targetGroup.name;
                        targetGroup.tasks.forEach(function(task) {
                            if (matchTask(task)) {
                                task.groupId   = targetGroup.id;
                                task.groupName = targetGroup.name;
                                tasks.push(task);
                            }
                        });
                    }
                }

                // 本地快取中的實際日期（backup）
                var savedDates = loadTaskDatesFromStorage();
                tasks.forEach(function(task) {
                    // 若 JSON 中已有 actualStart 則優先使用，否則從 localStorage 補
                    if (!task.actualStart && savedDates[task.id] && savedDates[task.id].actualStart) {
                        task.actualStart = savedDates[task.id].actualStart;
                    }
                });
            }

            updatePageTitle();
            updateStats();
            renderTasks();

            // 系統代碼 datalist 填入
            populateSystemCodeFilter();

            // 若 URL 帶 highlight 參數，跳轉到對應任務並高亮
            var hlId = getUrlParams().highlight ? parseInt(getUrlParams().highlight, 10) : null;
            if (hlId) { highlightTask(hlId); }
        });
    }

    function matchTask(task) {
        var matchCompany  = !selectedCompany || task.company === selectedCompany || selectedCompany === '全部';
        var matchTaskType = !selectedTaskType ||
            (selectedTaskType === '資料轉置' && task.task === '資料轉置') ||
            (selectedTaskType === '系統切轉' && task.task === '切轉');
        return matchCompany && matchTaskType;
    }

    // ─── 標題 ─────────────────────────────────────────────────────────────
    function updatePageTitle() {
        var el = document.querySelector('._page_header__title');
        if (!el) return;
        var title = categoryName;
        if (selectedTaskType) title += ' - ' + (selectedTaskType === '資料轉置' ? '資料轉置' : '系統切轉');
        if (selectedCompany && currentGroupName) title += ' - ' + selectedCompany + ' - ' + currentGroupName;
        else if (currentGroupName) title += ' - ' + currentGroupName;
        else if (selectedCompany)  title += ' - ' + selectedCompany;
        el.textContent = title;
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
        return tasks.filter(function(task) {
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
                return (task.name       || '').toLowerCase().includes(q) ||
                       (task.owner      || '').toLowerCase().includes(q) ||
                       (task.systemCode || '').toLowerCase().includes(q) ||
                       (task.id != null ? task.id.toString() : '').includes(q) ||
                       (task.groupName  || '').toLowerCase().includes(q);
            }
            return true;
        });
    }

    // ─── 渲染任務列表 ─────────────────────────────────────────────────────
    function renderTasks() {
        var filtered = getFilteredTasks();

        var byStatus = {
            notStarted: filtered.filter(function(t) { return getTaskStatus(t) === 'notStarted'; }),
            inProgress:  filtered.filter(function(t) { return getTaskStatus(t) === 'inProgress';  }),
            overdue:     filtered.filter(function(t) { return getTaskStatus(t) === 'overdue';     }),
            completed:   filtered.filter(function(t) { return getTaskStatus(t) === 'completed';   })
        };

        var STATUS_ORDER = { overdue: 0, inProgress: 1, notStarted: 2, completed: 3 };
        var sortFn = function(a, b) {
            var sa = STATUS_ORDER[getTaskStatus(a)];
            var sb = STATUS_ORDER[getTaskStatus(b)];
            if (sa !== sb) return sa - sb;
            return new Date(a.expectedCompletion) - new Date(b.expectedCompletion);
        };
        filtered.sort(sortFn);
        Object.keys(byStatus).forEach(function(k) { byStatus[k].sort(sortFn); });

        var sectionIds = { all: 'allSection', notStarted: 'notStartedSection', inProgress: 'inProgressSection', overdue: 'overdueSection', completed: 'completedSection' };
        Object.keys(sectionIds).forEach(function(key) {
            var el = document.getElementById(sectionIds[key]);
            if (!el) return;
            var isActive = currentFilter === key;
            el.classList.toggle('hidden',     !isActive);
            el.classList.toggle('full-width',  isActive);
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

        updatePagination(listMap[currentFilter] ? listMap[currentFilter].list.length : 0);
    }

    function renderTaskList(list, containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (list.length === 0) {
            var msgs  = { allTaskList: '尚無任務資料', notStartedTaskList: '尚無未開始任務', inProgressTaskList: '尚無進行中任務', overdueTaskList: '尚無逾期任務', completedTaskList: '尚無已完成任務' };
            var icons = { allTaskList: '📋', notStartedTaskList: '⏸', inProgressTaskList: '⏳', overdueTaskList: '⚠', completedTaskList: '✅' };
            container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">' + (icons[containerId] || '') + '</div><div class="empty-state-text">' + (msgs[containerId] || '') + '</div></div>';
            return;
        }

        container.innerHTML = '';
        var empId = getCurrentEmployeeId();
        var userId = getCurrentUserId();

        list.forEach(function(task, index) {
            var status  = getTaskStatus(task);
            var owner   = isOwner(task);
            var loggedIn = !!empId;
            var item    = document.createElement('div');
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
            var badge = badgeMap[status] || '';

            var ns = 'pPage';

            // 設定開始日期：僅登入且為負責人
            var actualStartHTML;
            if (task.actualStart) {
                if (owner) {
                    actualStartHTML = '<div class="task-meta-value datetime-display clickable" onclick="' + ns + '.openStartDateModal(' + task.id + '); event.stopPropagation();">' + formatDateTimeDisplay(task.actualStart) + '</div>';
                } else {
                    actualStartHTML = '<div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.actualStart) + '</div>';
                }
            } else {
                if (owner) {
                    actualStartHTML = '<div class="task-meta-value"><button class="set-date-btn" onclick="' + ns + '.openStartDateModal(' + task.id + '); event.stopPropagation();">設定開始日期</button></div>';
                } else {
                    actualStartHTML = '<div class="task-meta-value datetime-display">—</div>';
                }
            }

            var actualCompHTML = '<div class="task-meta-value datetime-display">' + (task.actualCompletion ? formatDateTimeDisplay(task.actualCompletion) : '') + '</div>';

            var metaHTML =
                '<div class="task-meta-item"><div class="task-meta-label">負責人員</div><div class="task-meta-value">' + escapeHtml(task.owner || '') + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">組別</div><div class="task-meta-value">' + escapeHtml(task.groupName || '') + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">預期開始日期</div><div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedStart) + '</div></div>' +
                '<div class="task-meta-item' + (status === 'overdue' ? ' overdue-date' : '') + '"><div class="task-meta-label">預期完成日期</div><div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedCompletion) + '</div></div>' +
                '<div class="task-meta-item"><div class="task-meta-label">實際開始日期</div>' + actualStartHTML + '</div>' +
                '<div class="task-meta-item"><div class="task-meta-label">實際完成日期</div>' + actualCompHTML + '</div>';

            // 按鈕列
            var key = memoKey(task);
            var memos = memoCache[key] || [];
            var hasMemo = memos.length > 0;

            // 進度說明按鈕：
            //   負責人 + 無備忘錄 → "新增進度說明" → 開燈箱 modal
            //   負責人 + 有備忘錄 → "進度說明 (N)" → 展開 inline
            //   非負責人          → "進度說明 (N)" → 展開 inline
            var noteBtnText, noteBtnClass, noteBtnFn;
            if (owner && !hasMemo) {
                noteBtnClass = 'task-note-btn';
                noteBtnText  = '📝 新增進度說明';
                noteBtnFn    = ns + '.openMemoModal(' + task.id + ')';
            } else if (owner && hasMemo) {
                noteBtnClass = 'task-note-btn has-note';
                noteBtnText  = '📝 進度說明 (' + memos.length + ')';
                noteBtnFn    = ns + '.openNoteSection(' + task.id + ')';
            } else {
                noteBtnClass = hasMemo ? 'task-note-btn has-note' : 'task-note-btn';
                noteBtnText  = hasMemo ? '📋 進度說明 (' + memos.length + ')' : '📋 進度說明';
                noteBtnFn    = ns + '.openNoteSection(' + task.id + ')';
            }

            // 更新進度按鈕：僅負責人
            var updateBtnHTML = owner
                ? '<button class="task-update-btn" onclick="' + ns + '.toggleTask(' + task.id + '); event.stopPropagation();">更新進度</button>'
                : '';

            // 展開的備忘錄列表（inline，視 expandedTaskId 決定）
            var noteHTML = '';
            if (expandedTaskId === task.id) {
                noteHTML = renderMemoList(task, memos, owner, userId);
            }

            item.innerHTML =
                '<div class="task-buttons-container">' +
                '<button class="' + noteBtnClass + '" onclick="' + noteBtnFn + '; event.stopPropagation();">' + noteBtnText + '</button>' +
                updateBtnHTML +
                '</div>' +
                '<div class="task-header"><div class="task-content">' +
                '<div class="task-name">' + (task.isImportant === 1 ? '<span class="task-important-star" title="重要任務">⭐</span> ' : '') + badge + (task.taskSeq != null ? '  ' + task.taskSeq : '') + '  ' + escapeHtml(task.name || '') + '</div>' +
                '<div class="task-systemCode">系統代碼 : ' + escapeHtml(task.systemCode || '') + '</div>' +
                '<div class="task-systemCode">負責人單位 : ' + escapeHtml(task.ownerUnit || '') + '</div>' +
                '<div class="task-meta-grid">' + metaHTML + '</div>' +
                (function() {
                    var cached = prereqCache[task.id];
                    var wrapperStyle = '';
                    var sectionContent = '';
                    var addZoneStyle = 'display:none;';
                    var addZoneContent = '';

                    if (cached === undefined || cached === null) {
                        sectionContent = '<div class="task-prereq-loading">⏳ 載入中...</div>';
                    } else if (cached.length === 0) {
                        wrapperStyle = 'display:none;';
                        if (owner) {
                            addZoneStyle   = '';
                            addZoneContent = '<button class="prereq-add-btn" style="margin-top:4px;" onclick="pPage.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
                        }
                    } else {
                        sectionContent = '<ul class="task-prereq-list">';
                        cached.forEach(function(p) {
                            sectionContent += '<li class="task-prereq-item">' + prereqCodeSpanHtml(p.memo);
                            if (owner) {
                                sectionContent +=
                                    '<button class="prereq-btn prereq-edit-btn" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:6px;" ' +
                                    'onclick="pPage.openPrereqModal(' + task.id + ',' + p.memoId + ',\'' + escapeAttr(p.memo) + '\'); event.stopPropagation();" title="編輯">✏️ 編輯</button>' +
                                    '<button class="prereq-btn prereq-del-btn" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:4px;" ' +
                                    'onclick="pPage.deletePrerequisite(' + p.memoId + ',' + task.id + '); event.stopPropagation();" title="刪除">🗑️ 刪除</button>';
                            }
                            sectionContent += '</li>';
                            if (PREREQ_CODE_REGEX.test(p.memo)) resolvePrereqLink(p.memo);
                        });
                        sectionContent += '</ul>';
                        if (owner) {
                            sectionContent += '<button class="prereq-add-btn" onclick="pPage.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
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

            item.addEventListener('click', function(e) {
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
                btn.setAttribute('onclick', 'pPage.openNoteSection(' + task.id + '); event.stopPropagation();');
            });
        });
    }

    /** 渲染備忘錄列表 HTML 字串（inline 展開用）*/
    function renderMemoList(task, memos, owner, currentUserId) {
        var ns = 'pPage';
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
            sortedMemos.forEach(function(m) {
                var canDelete = (currentUserId !== null) && (String(m.createdBy) === String(currentUserId));
                var ts = m.createdAt ? m.createdAt.replace('T', ' ').substring(0, 16) : '';
                var operatorName = escapeHtml(String(m.createdByName || m.createdBy || ''));
                html += '<div class="task-memo-item" data-memo-id="' + m.memoId + '">';
                html += '<div class="task-memo-time">' + ts + '</div>';
                html += '<div class="task-memo-content">' + escapeHtml(m.memo) + '</div>';
                html += '<div class="task-memo-meta">更新人員：' + operatorName;
                if (canDelete) {
                    html += '<button class="task-memo-del-btn" onclick="' + ns + '.deleteMemo(' + task.id + ',' + m.memoId + '); event.stopPropagation();">✕ 刪除</button>';
                }
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        }

        // 負責人：顯示「新增進度說明」按鈕，點擊開燈箱 modal
        if (owner) {
            html += '<div class="task-memo-add-row">';
            html += '<button class="task-memo-add-btn" onclick="' + ns + '.openMemoModal(' + task.id + '); event.stopPropagation();">＋ 新增進度說明</button>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
    }

    // ─── 展開 / 收合備忘錄（inline）──────────────────────────────────────
    function openNoteSection(taskId) {
        if (expandedTaskId === taskId) {
            expandedTaskId = null;
            renderTasks();
            return;
        }
        expandedTaskId = taskId;
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) { renderTasks(); return; }
        var key = memoKey(task);
        if (memoCache[key]) {
            renderTasks();
        } else {
            loadMemos(task, function() { renderTasks(); });
        }
    }

    function toggleNoteExpansion(taskId) {
        expandedTaskId = expandedTaskId === taskId ? null : taskId;
        if (expandedTaskId) {
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task && !memoCache[memoKey(task)]) {
                loadMemos(task, function() { renderTasks(); });
                return;
            }
        }
        renderTasks();
    }

    // ─── 進度說明 Modal（新增專用）───────────────────────────────────────
    function openMemoModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task || !isOwner(task)) return;

        pendingTaskId = taskId;
        document.getElementById('memoModalTaskName').textContent = task.name;
        var textEl = document.getElementById('memoModalText');
        if (textEl) textEl.value = '';
        document.getElementById('memoModal').classList.add('show');
    }

    function renderMemoModalContent(task, memos, owner) {
        var ns = 'pPage';
        var userId = getCurrentUserId();
        var listEl = document.getElementById('memoModalList');
        if (!listEl) return;

        if (memos.length === 0) {
            listEl.innerHTML = '<div style="color:#adb5bd;text-align:center;padding:1rem;">尚無進度說明</div>';
            return;
        }

        var html = '';
        memos.forEach(function(m) {
            var canDelete = (userId !== null) && (String(m.createdBy) === String(userId));
            var ts = m.createdAt ? m.createdAt.replace('T', ' ').substring(0, 16) : '';
            html += '<div class="memo-card">';
            html += '<div class="memo-card__time">' + ts + '</div>';
            html += '<div class="memo-card__text">' + escapeHtml(m.memo) + '</div>';
            html += '<div class="memo-card__footer">';
            html += '<span class="memo-card__operator">操作者：' + escapeHtml(m.createdByName || m.createdBy || '') + '</span>';
            if (canDelete) {
                html += '<button class="memo-card__del-btn" onclick="' + ns + '.deleteMemoModal(' + task.id + ',' + m.memoId + ')">✕ 刪除</button>';
            }
            html += '</div></div>';
        });
        listEl.innerHTML = html;
    }

    function saveMemoModal() {
        var textEl = document.getElementById('memoModalText');
        if (!textEl) return;
        var text = textEl.value.trim();
        if (!text) { alert('請輸入進度說明內容'); return; }

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (!task) return;

        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/memo';
        apiCall('POST', url, { memo: text }, function(err) {
            if (err) { alert('新增失敗：' + err); return; }
            // 關閉 modal，展開 inline 顯示
            cancelMemoModal();
            expandedTaskId = task.id;
            delete memoCache[memoKey(task)];
            loadMemos(task, function() { renderTasks(); });
        });
    }

    function deleteMemoModal(taskId, memoId) {
        if (!confirm('確定要刪除此進度說明？')) return;
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/memo/' + memoId;
        apiCall('DELETE', url, null, function(err) {
            if (err) { alert('刪除失敗：' + err); return; }
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task) {
                delete memoCache[memoKey(task)];
                loadMemos(task, function() { renderTasks(); });
            }
        });
    }

    function cancelMemoModal() {
        var el = document.getElementById('memoModal');
        if (el) el.classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 備忘錄儲存（inline）─────────────────────────────────────────────
    function saveMemoInline(taskId, tableType) {
        var textarea = document.getElementById('memoInput_' + taskId);
        if (!textarea) return;
        var text = textarea.value.trim();
        if (!text) { alert('請輸入進度說明內容'); return; }

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/' + tableType + '/' + taskId + '/memo';
        apiCall('POST', url, { memo: text }, function(err, json) {
            if (err) { alert('新增失敗：' + err); return; }
            // 重新載入備忘錄
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task) {
                delete memoCache[memoKey(task)];
                loadMemos(task, function() { renderTasks(); });
            }
        });
    }

    // ─── 備忘錄刪除 ──────────────────────────────────────────────────────
    function deleteMemo(taskId, memoId) {
        if (!confirm('確定要刪除此進度說明？')) return;
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/memo/' + memoId;
        apiCall('DELETE', url, null, function(err) {
            if (err) { alert('刪除失敗：' + err); return; }
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task) {
                delete memoCache[memoKey(task)];
                loadMemos(task, function() { renderTasks(); });
            }
        });
    }

    // ─── 前置任務 ─────────────────────────────────────────────────────────
    function loadPrerequisites(task, callback) {
        var url = API_BASE + '/' + (task.tableType || '') + '/' + task.id + '/prerequisites';
        window.authFetch(url, { })
            .then(function(r) { return r.json(); })
            .then(function(json) {
                var list = (json.stat === 'ok') ? (json.result || []) : [];
                prereqCache[task.id] = list;
                if (callback) callback(list);
            })
            .catch(function() {
                prereqCache[task.id] = [];
                if (callback) callback([]);
            });
    }

    function buildPrereqSectionHTML(task, owner) {
        var list = prereqCache[task.id];
        var ns = 'pPage';
        var html = '<div class="task-prereq-section">';

        if (list === null || list === undefined) {
            html += '<div class="task-prereq-loading">⏳ 載入中...</div>';
        } else if (list.length === 0) {
            html += '<div class="task-prereq-empty">—</div>';
        } else {
            html += '<ul class="task-prereq-list">';
            list.forEach(function(p) {
                html += '<li class="task-prereq-item">' +
                    '<span class="prereq-code">' + escapeHtml(p.memo) + '</span>';
                if (owner) {
                    html +=
                        '<button class="prereq-btn prereq-edit-btn" ' +
                        'onclick="' + ns + '.openPrereqModal(' + task.id + ',' + p.memoId + ',\'' + escapeAttr(p.memo) + '\'); event.stopPropagation();" ' +
                        'title="編輯">✏</button>' +
                        '<button class="prereq-btn prereq-del-btn" ' +
                        'onclick="' + ns + '.deletePrerequisite(' + p.memoId + ',' + task.id + '); event.stopPropagation();" ' +
                        'title="刪除">🗑</button>';
                }
                html += '</li>';
            });
            html += '</ul>';
        }

        if (owner) {
            html += '<button class="prereq-add-btn" onclick="' + ns + '.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
        }
        html += '</div>';
        return html;
    }

    function escapeAttr(str) {
        // Step1: JS string escaping (\ then '), Step2: HTML attribute escaping (& first, then " < >)
        return String(str || '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ─── 前置任務代碼 Hyperlink 解析 ─────────────────────────────────────
    /**
     * 非同步解析 "BANCS-1" 格式代碼，解析後更新頁面上所有對應的 DOM span。
     */
    function resolvePrereqLink(code) {
        if (!PREREQ_CODE_REGEX.test(code)) return;
        var key = code.toUpperCase();
        if (prereqLinkCache[key] !== undefined) return; // 已在載入中或已完成
        prereqLinkCache[key] = null; // 標記載入中
        window.authFetch(API_BASE + '/resolve-prereq?code=' + encodeURIComponent(code), {})
            .then(function(r) { return r.json(); })
            .then(function(json) {
                prereqLinkCache[key] = (json.stat === 'ok' && json.result) ? json.result : false;
                // 更新頁面上所有對應 span
                document.querySelectorAll('.prereq-code[data-prereq-key="' + key + '"]').forEach(function(el) {
                    renderPrereqCodeSpan(el, code, prereqLinkCache[key]);
                });
            })
            .catch(function() { prereqLinkCache[key] = false; });
    }

    /** 將 prereq-code span 渲染為可點擊的 hyperlink（若已解析）*/
    function renderPrereqCodeSpan(el, code, info) {
        if (!el) return;
        var display = escapeHtml(code);
        if (!info || !info.found) { el.innerHTML = display; return; }
        var url   = '/eServiceA/dashboard/page/p' + info.categoryId + '.html?highlight=' + info.taskId;
        var icon  = info.completed ? '✅' : (info.status === 'DELAYED' ? '⚠️' : '⏳');
        var title = escapeHtml(info.taskName || '');
        el.innerHTML =
            '<a class="prereq-task-link" href="' + url + '" target="_blank" title="' + title + '">' + display + '</a>' +
            '<span class="prereq-task-status" title="' + (info.completed ? '已完成' : (info.status || '')) + '">' + icon + '</span>';
    }

    /** 掃描容器內所有 data-prereq-key span，對尚未解析的代碼發起解析 */
    function applyPrereqLinks(container) {
        (container || document).querySelectorAll('.prereq-code[data-prereq-key]').forEach(function(el) {
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

    /** 建立帶有 data-prereq-key 屬性的 prereq-code span HTML 字串 */
    function prereqCodeSpanHtml(memo) {
        var display = escapeHtml(memo);
        if (!PREREQ_CODE_REGEX.test(memo)) {
            return '<span class="prereq-code">' + display + '</span>';
        }
        var key = memo.toUpperCase();
        var info = prereqLinkCache[key];
        // 若已解析完成，直接嵌入 link；否則先顯示純文字，等 resolvePrereqLink 非同步更新
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

    // ─── 任務 Highlight（從前置任務超連結跳轉後使用）──────────────────────
    function highlightTask(taskId) {
        var numId = Number(taskId);
        var task = tasks.find(function(t) { return Number(t.id) === numId; });
        if (!task) return;

        // 切到全部過濾
        currentFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.filter === 'all');
        });

        // 將任務名稱填入搜尋框，讓該任務出現在最上面
        searchQuery = task.name || '';
        var searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = searchQuery;

        currentPage = 1;
        renderTasks();

        // 等 DOM 更新後高亮並捲到視窗頂
        setTimeout(function() {
            var el = document.querySelector('.task-item[data-task-id="' + numId + '"]');
            if (!el) return;
            el.scrollIntoView({ block: 'start', behavior: 'auto' });
            window.scrollBy(0, -80);
            el.classList.add('task-highlight');
            setTimeout(function() { el.classList.remove('task-highlight'); }, 3800);
        }, 150);
    }

    function loadPrerequisitesForVisibleTasks(list) {
        list.forEach(function(task) {
            if (prereqCache[task.id] !== undefined) return;
            prereqCache[task.id] = null; // mark as loading
            loadPrerequisites(task, function(result) {
                var sectionEl = document.querySelector('.task-prereq-section[data-task-id="' + task.id + '"]');
                if (!sectionEl) return;
                var wrapperEl = sectionEl.closest('.task-prereq-wrapper');
                var addZoneEl = document.querySelector('.task-prereq-add-zone[data-task-id="' + task.id + '"]');
                var owner = isOwner(task);

                if (result.length === 0) {
                    // 無資料：隱藏方框，負責人顯示獨立新增按鈕
                    if (wrapperEl) wrapperEl.style.display = 'none';
                    if (addZoneEl) {
                        if (owner) {
                            addZoneEl.innerHTML = '<button class="prereq-add-btn" style="margin-top:4px;" onclick="pPage.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
                            addZoneEl.style.display = '';
                        } else {
                            addZoneEl.style.display = 'none';
                        }
                    }
                } else {
                    // 有資料：顯示方框
                    if (wrapperEl) wrapperEl.style.display = '';
                    var inner = '<ul class="task-prereq-list">';
                    result.forEach(function(p) {
                        inner += '<li class="task-prereq-item">' + prereqCodeSpanHtml(p.memo);
                        if (owner) {
                            inner +=
                                '<button class="prereq-btn prereq-edit-btn" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:6px;" ' +
                                'onclick="pPage.openPrereqModal(' + task.id + ',' + p.memoId + ',\'' + escapeAttr(p.memo) + '\'); event.stopPropagation();" title="編輯">✏️ 編輯</button>' +
                                '<button class="prereq-btn prereq-del-btn" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:4px;" ' +
                                'onclick="pPage.deletePrerequisite(' + p.memoId + ',' + task.id + '); event.stopPropagation();" title="刪除">🗑️ 刪除</button>';
                        }
                        inner += '</li>';
                    });
                    inner += '</ul>';
                    if (owner) {
                        inner += '<button class="prereq-add-btn" onclick="pPage.openPrereqModal(' + task.id + ',null,null); event.stopPropagation();">＋ 新增前置任務</button>';
                    }
                    sectionEl.innerHTML = inner;
                    applyPrereqLinks(sectionEl);
                    if (addZoneEl) addZoneEl.style.display = 'none';
                }
            });
        });
    }

    // ─── 前置任務 Modal ───────────────────────────────────────────────────
    function openPrereqModal(taskId, memoId, currentMemo) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task || !isOwner(task)) { alert('您不是此任務的負責人，無法操作前置任務'); return; }

        pendingPrereqTaskId  = taskId;
        editingPrereqMemoId  = memoId || null;

        var modal = document.getElementById('prereqModal');
        if (!modal) return;
        document.getElementById('prereqModalTaskName').textContent = task.name;
        document.getElementById('prereqModalTitle').textContent = memoId ? '編輯前置任務' : '新增前置任務';
        document.getElementById('prereqMemoInput').value = currentMemo || '';
        modal.classList.add('show');
    }

    function savePrerequisite() {
        var memo = (document.getElementById('prereqMemoInput').value || '').trim();
        if (!memo) { alert('請輸入前置任務代碼！'); return; }

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var task = tasks.find(function(t) { return t.id === pendingPrereqTaskId; });
        if (!task) return;

        var url, method;
        if (editingPrereqMemoId) {
            url    = API_BASE + '/memo/' + editingPrereqMemoId;
            method = 'PUT';
        } else {
            url    = API_BASE + '/' + (task.tableType || '') + '/' + task.id + '/prerequisite';
            method = 'POST';
        }

        apiCall(method, url, { memo: memo }, function(err) {
            if (err) { alert('操作失敗：' + err); return; }
            delete prereqCache[task.id];
            cancelPrerequisite();
            loadPrerequisites(task, function() { renderTasks(); });
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
        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/memo/' + memoId;
        apiCall('DELETE', url, null, function(err) {
            if (err) { alert('刪除失敗：' + err); return; }
            delete prereqCache[taskId];
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task) loadPrerequisites(task, function() { renderTasks(); });
        });
    }

    // ─── 當下時間 ISO 字串（YYYY-MM-DDTHH:MM）────────────────────────────
    function getNowLocalISO() {
        var now = new Date();
        var Y = now.getFullYear();
        var Mo = String(now.getMonth() + 1).padStart(2, '0');
        var D  = String(now.getDate()).padStart(2, '0');
        var h  = String(now.getHours()).padStart(2, '0');
        var m  = String(now.getMinutes()).padStart(2, '0');
        return Y + '-' + Mo + '-' + D + 'T' + h + ':' + m;
    }

    // ─── 自訂日期時間選擇器 ───────────────────────────────────────────────
    function initCustomDateTimePicker() {
        var hourSelect = document.getElementById('modalStartDate_hour');
        var minSelect  = document.getElementById('modalStartDate_min');
        var dateInput  = document.getElementById('modalStartDate_date');
        var timeBlock  = document.getElementById('customTimeSelects');
        if (!hourSelect || !minSelect || !dateInput || !timeBlock) return;

        // 時：00 ~ 23
        for (var h = 0; h <= 23; h++) {
            var optH = document.createElement('option');
            optH.value = String(h).padStart(2, '0');
            optH.textContent = String(h).padStart(2, '0');
            hourSelect.appendChild(optH);
        }
        // 分：00 ~ 59
        for (var m = 0; m <= 59; m++) {
            var optM = document.createElement('option');
            optM.value = String(m).padStart(2, '0');
            optM.textContent = String(m).padStart(2, '0');
            minSelect.appendChild(optM);
        }

        // 時間選擇器常駐顯示
        timeBlock.style.display = 'flex';
        hourSelect.selectedIndex = 0;
        minSelect.selectedIndex  = 0;

        dateInput.addEventListener('change', syncStartDateHidden);
        hourSelect.addEventListener('change', syncStartDateHidden);
        minSelect.addEventListener('change',  syncStartDateHidden);
    }

    function syncStartDateHidden() {
        var d = document.getElementById('modalStartDate_date').value;
        var h = document.getElementById('modalStartDate_hour').value;
        var m = document.getElementById('modalStartDate_min').value;
        if (d && h !== '' && m !== '') {
            // 加入本地時區偏移，避免伺服器以 UTC 解讀導致顯示差 8 小時
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

    // ─── 開始日期 Modal ───────────────────────────────────────────────────
    function openStartDateModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        if (!isOwner(task)) { alert('您不是此任務的負責人，無法設定開始日期'); return; }

        pendingTaskId = taskId;
        document.getElementById('startDateModalTaskName').textContent = task.name;

        var dateInput  = document.getElementById('modalStartDate_date');
        var hourSelect = document.getElementById('modalStartDate_hour');
        var minSelect  = document.getElementById('modalStartDate_min');
        var timeBlock  = document.getElementById('customTimeSelects');
        var hidden     = document.getElementById('modalStartDate');

        timeBlock.style.display = 'flex';

        if (task.actualStart) {
            // 已有值：以本地時間解析（避免純 UTC 字串造成 +8 小時偏差）
            var dt = new Date(task.actualStart);
            if (!isNaN(dt.getTime())) {
                var Y  = dt.getFullYear();
                var Mo = String(dt.getMonth() + 1).padStart(2, '0');
                var D  = String(dt.getDate()).padStart(2, '0');
                dateInput.value  = Y + '-' + Mo + '-' + D;
                hourSelect.value = String(dt.getHours()).padStart(2, '0');
                minSelect.value  = String(dt.getMinutes()).padStart(2, '0');
            } else {
                dateInput.value = task.actualStart.substring(0, 10);
            }
        } else {
            // 無值：預設當下日期時間
            var now = new Date();
            dateInput.value  = now.getFullYear() + '-' +
                               String(now.getMonth() + 1).padStart(2, '0') + '-' +
                               String(now.getDate()).padStart(2, '0');
            hourSelect.value = String(now.getHours()).padStart(2, '0');
            minSelect.value  = String(now.getMinutes()).padStart(2, '0');
        }
        syncStartDateHidden();

        document.getElementById('startDateModal').classList.add('show');
    }

    function confirmStartDate() {
        var startDate = document.getElementById('modalStartDate').value;
        if (!startDate || startDate.length < 10) {
            alert('請完整填入日期！');
            return;
        }
        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (!task) return;

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/actualStart';
        apiCall('POST', url, { actualStart: startDate }, function(err) {
            if (err) {
                alert('設定失敗：' + err);
            } else {
                task.actualStart = startDate;
                saveDatesToStorage();
                renderTasks();
            }
        });

        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelStartDate() {
        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 完成任務 Modal ───────────────────────────────────────────────────
    function toggleTask(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        if (!isOwner(task)) { alert('您不是此任務的負責人，無法更新進度'); return; }

        pendingTaskId = taskId;
        if (!task.completed) {
            document.getElementById('modalTaskName').textContent = task.name;
            document.getElementById('modalActualDate').value = getNowLocalISO();
            document.getElementById('completeModal').classList.add('show');
        } else {
            document.getElementById('uncompleteModalTaskName').textContent = task.name;
            document.getElementById('uncompleteModal').classList.add('show');
        }
    }

    function confirmComplete() {
        var actualDate = document.getElementById('modalActualDate').value;
        if (!actualDate) { alert('請輸入實際完成日期!'); return; }

        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (!task) return;

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/complete';
        apiCall('POST', url, { completed: true, actualCompletion: actualDate }, function(err) {
            if (err) {
                alert('更新失敗：' + err);
            } else {
                task.completed        = true;
                task.actualCompletion = actualDate;
                task.status           = 'COMPLETED';
                updateStats();
                renderTasks();
            }
        });

        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelComplete() {
        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function confirmUncomplete() {
        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (!task) return;

        var empId = getCurrentEmployeeId();
        if (!empId) { alert('請先登入'); return; }

        var url = API_BASE + '/' + task.tableType + '/' + task.id + '/complete';
        apiCall('POST', url, { completed: false, actualCompletion: null }, function(err) {
            if (err) {
                alert('更新失敗：' + err);
            } else {
                task.completed        = false;
                task.actualCompletion = null;
                task.status           = task.actualStart ? 'IN_PROGRESS' : 'PENDING';
                updateStats();
                renderTasks();
            }
        });

        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelUncomplete() {
        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 進度說明 Modal（保留相容性，但主要使用 inline）─────────────────
    function openNoteModal(taskId) {
        openNoteSection(taskId);
    }

    function saveNote() {
        // 已改為 inline，此方法保留供舊 HTML 呼叫
    }

    function cancelNote() {
        document.getElementById('noteModal') && document.getElementById('noteModal').classList.remove('show');
        pendingTaskId = null;
    }

    // ─── 完成日期 Modal（保留供外部呼叫）────────────────────────────────
    function openCompletionDateModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        pendingTaskId = taskId;
        document.getElementById('completionDateModalTaskName').textContent = task.name;
        document.getElementById('modalCompletionDate').value = task.actualCompletion || CommonUtils.getTodayISO();
    }

    function confirmCompletionDate() {
        var completionDate = document.getElementById('modalCompletionDate').value;
        if (!completionDate) { alert('請輸入實際完成日期時間!'); return; }
        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (task) {
            task.actualCompletion = completionDate;
            task.completed        = true;
            updateStats();
            renderTasks();
        }
    }

    // ─── 統計 ─────────────────────────────────────────────────────────────
    function updateStats() {
        var completed = tasks.filter(function(t) { return t.completed; }).length;
        var total     = tasks.length;
        var pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

        var today = new Date(); today.setHours(0, 0, 0, 0);
        var overdue = tasks.filter(function(t) {
            if (t.completed) return false;
            var exp = new Date(t.expectedCompletion); exp.setHours(0, 0, 0, 0);
            return exp < today;
        }).length;

        renderProgressSummary([
            { value: pct + '%',               label: currentGroupName === '全部組別' ? '整體完成度' : '組別完成度' },
            { value: completed + '/' + total,  label: '已完成任務' },
            { value: (total - completed).toString(), label: '待處理任務' },
            { value: overdue.toString(),        label: '已逾期任務' }
        ]);
    }

    function renderProgressSummary(stats) {
        var container = document.getElementById('progressSummaryStats');
        if (!container) return;
        container.innerHTML = '';
        stats.forEach(function(s) {
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
        var totalPages = Math.ceil(total / tasksPerPage);
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
        var script = document.currentScript ||
            (function() {
                var scripts = document.querySelectorAll('script[data-pageid]');
                return scripts[scripts.length - 1];
            })();

        pageId = script ? parseInt(script.dataset.pageid) : null;
        config = PAGE_CONFIG[pageId];

        if (!config) {
            return;
        }

        categoryName = config.defaultName;

        loadTasksData();
        initCustomDateTimePicker();

        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                searchQuery  = e.target.value;
                currentPage  = 1;
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

        document.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
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

        ['completeModal', 'uncompleteModal', 'noteModal', 'startDateModal', 'memoModal', 'prereqModal'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('click', function(e) {
                if (e.target.id !== id) return;
                if (id === 'completeModal')   cancelComplete();
                if (id === 'uncompleteModal') cancelUncomplete();
                if (id === 'noteModal')       cancelNote();
                if (id === 'startDateModal')  cancelStartDate();
                if (id === 'memoModal')       cancelMemoModal();
                if (id === 'prereqModal')     cancelPrerequisite();
            });
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────
    return {
        init: init,
        toggleTask: toggleTask,
        confirmComplete: confirmComplete,
        cancelComplete: cancelComplete,
        confirmUncomplete: confirmUncomplete,
        cancelUncomplete: cancelUncomplete,
        openNoteModal: openNoteModal,
        openNoteSection: openNoteSection,
        saveNote: saveNote,
        cancelNote: cancelNote,
        saveMemoInline: saveMemoInline,
        deleteMemo: deleteMemo,
        openMemoModal: openMemoModal,
        cancelMemoModal: cancelMemoModal,
        saveMemoModal: saveMemoModal,
        deleteMemoModal: deleteMemoModal,
        openStartDateModal: openStartDateModal,
        confirmStartDate: confirmStartDate,
        cancelStartDate: cancelStartDate,
        openCompletionDateModal: openCompletionDateModal,
        confirmCompletionDate: confirmCompletionDate,
        openPrereqModal: openPrereqModal,
        savePrerequisite: savePrerequisite,
        cancelPrerequisite: cancelPrerequisite,
        deletePrerequisite: deletePrerequisite,
        highlightTask: highlightTask,
        updateActualStart: function(taskId, value) {
            var task = tasks.find(function(t) { return t.id === taskId; });
            if (task) { task.actualStart = value || null; saveDatesToStorage(); }
        }
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    pPage.init();
});

window.confirmComplete   = pPage.confirmComplete;
window.cancelComplete    = pPage.cancelComplete;
window.confirmUncomplete = pPage.confirmUncomplete;
window.cancelUncomplete  = pPage.cancelUncomplete;