/**
 * operationLogPage.js — 操作歷程記錄查詢頁面邏輯
 */
(function () {
    'use strict';

    var API_BASE    = '/eServiceA/dashboard/api/v2/operation-log';
    var currentPage = 0;
    var pageSize    = 50;
    var totalPages  = 0;
    var isLoading   = false;

    // ─────────────────────────────────────────────
    // 初始化
    // ─────────────────────────────────────────────
    function init() {
        loadFilters();
        bindEvents();
        search(0);
    }

    // ─────────────────────────────────────────────
    // 載入下拉選單選項
    // ─────────────────────────────────────────────
    function loadFilters() {
        window.authFetch(API_BASE + '/entity-types')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.stat !== 'ok') return;
                var sel = document.getElementById('filterEntityType');
                (res.result || []).forEach(function (v) {
                    var opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    sel.appendChild(opt);
                });
            })
            .catch(function () {});

        window.authFetch(API_BASE + '/actions')
            .then(function (r) { return r.json(); })
            .then(function (res) {
                if (res.stat !== 'ok') return;
                var sel = document.getElementById('filterAction');
                (res.result || []).forEach(function (v) {
                    var opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v;
                    sel.appendChild(opt);
                });
            })
            .catch(function () {});
    }

    // ─────────────────────────────────────────────
    // 事件綁定
    // ─────────────────────────────────────────────
    function bindEvents() {
        document.getElementById('btnSearch').addEventListener('click', function () {
            search(0);
        });
        document.getElementById('btnReset').addEventListener('click', function () {
            document.getElementById('filterEntityType').value = '';
            document.getElementById('filterAction').value     = '';
            document.getElementById('filterOperatedBy').value = '';
            document.getElementById('filterKeyword').value    = '';
            document.getElementById('filterDateFrom').value   = '';
            document.getElementById('filterDateTo').value     = '';
            search(0);
        });
        document.getElementById('btnPrev').addEventListener('click', function () {
            if (currentPage > 0) search(currentPage - 1);
        });
        document.getElementById('btnNext').addEventListener('click', function () {
            if (currentPage < totalPages - 1) search(currentPage + 1);
        });

        // 鍵盤 Enter 觸發搜尋
        ['filterKeyword', 'filterOperatedBy', 'filterDateFrom', 'filterDateTo'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') search(0);
            });
        });
    }

    // ─────────────────────────────────────────────
    // 執行搜尋
    // ─────────────────────────────────────────────
    function search(page) {
        if (isLoading) return;
        isLoading = true;
        currentPage = page;

        var params = new URLSearchParams();
        var entityType  = document.getElementById('filterEntityType').value;
        var action      = document.getElementById('filterAction').value;
        var operatedBy  = document.getElementById('filterOperatedBy').value.trim();
        var keyword     = document.getElementById('filterKeyword').value.trim();
        var dateFrom    = document.getElementById('filterDateFrom').value;
        var dateTo      = document.getElementById('filterDateTo').value;

        if (entityType)  params.append('entityType',         entityType);
        if (action)      params.append('action',             action);
        if (operatedBy)  params.append('operatorEmployeeId', operatedBy);
        if (keyword)     params.append('keyword',            keyword);
        if (dateFrom)    params.append('dateFrom',    dateFrom);
        if (dateTo)      params.append('dateTo',      dateTo);
        params.append('page', page);
        params.append('size', pageSize);

        showLoading(true);

        window.authFetch(API_BASE + '/list?' + params.toString())
            .then(function (r) {
                if (r.status === 401) {
                    window.location.href = '../login.html';
                    throw new Error('UNAUTHORIZED');
                }
                if (r.status === 403) {
                    throw new Error('FORBIDDEN');
                }
                return r.json();
            })
            .then(function (res) {
                if (res.stat !== 'ok') {
                    showError(res.errorMsg || '查詢失敗');
                    return;
                }
                renderTable(res.result.content);
                totalPages  = res.result.totalPages;
                currentPage = res.result.page;
                updatePagination(res.result.totalElements);
            })
            .catch(function (err) {
                if (err.message === 'FORBIDDEN') {
                    showError('權限不足，僅 ADMIN / MANAGER 可查看操作歷程');
                } else if (err.message !== 'UNAUTHORIZED') {
                    showError('查詢發生錯誤，請稍後再試');
                }
            })
            .finally(function () {
                isLoading = false;
                showLoading(false);
            });
    }

    // ─────────────────────────────────────────────
    // 渲染資料表格
    // ─────────────────────────────────────────────
    function renderTable(rows) {
        var tbody = document.getElementById('logTableBody');
        tbody.innerHTML = '';

        if (!rows || rows.length === 0) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="10" class="log-empty">查無符合條件的記錄</td>';
            tbody.appendChild(tr);
            return;
        }

        rows.forEach(function (row) {
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td class="log-td log-td--id">'         + esc(row.logId)      + '</td>' +
                '<td class="log-td log-td--time">'        + fmtTime(row.operatedAt) + '</td>' +
                '<td class="log-td">'                     + badge(row.action)  + '</td>' +
                '<td class="log-td">'                     + esc(row.entityType)+ '</td>' +
                '<td class="log-td">'                     + esc(row.entityId)  + '</td>' +
                '<td class="log-td">'                     + esc(row.fieldName) + '</td>' +
                '<td class="log-td log-td--value">'       + esc(row.oldValue)  + '</td>' +
                '<td class="log-td log-td--value">'       + esc(row.newValue)  + '</td>' +
                '<td class="log-td">'                     + esc(row.operatorEmployeeId) + '</td>' +
                '<td class="log-td">'                     + esc(row.clientIp)  + '</td>';
            tbody.appendChild(tr);
        });
    }

    // ─────────────────────────────────────────────
    // 更新分頁資訊
    // ─────────────────────────────────────────────
    function updatePagination(total) {
        document.getElementById('pageInfo').textContent =
            '第 ' + (currentPage + 1) + ' / ' + (totalPages || 1) + ' 頁，共 ' + total + ' 筆';
        document.getElementById('btnPrev').disabled = (currentPage <= 0);
        document.getElementById('btnNext').disabled = (currentPage >= totalPages - 1);
    }

    // ─────────────────────────────────────────────
    // 工具函數
    // ─────────────────────────────────────────────
    function esc(v) {
        if (v == null || v === '') return '<span class="log-null">—</span>';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtTime(v) {
        if (!v) return '<span class="log-null">—</span>';
        // LocalDateTime 格式：[2025,5,8,14,30,0] 或 "2025-05-08T14:30:00"
        if (Array.isArray(v)) {
            var pad = function(n){ return String(n).padStart(2,'0'); };
            return v[0]+'-'+pad(v[1])+'-'+pad(v[2])+' '+pad(v[3])+':'+pad(v[4])+':'+pad(v[5] || 0);
        }
        return String(v).replace('T', ' ').substring(0, 19);
    }

    var ACTION_COLORS = {
        'CREATE':          '#22c55e',
        'UPDATE':          '#3b82f6',
        'DELETE':          '#ef4444',
        'LOGIN':           '#a855f7',
        'CHANGE_PASSWORD': '#f97316',
        'LOGOUT':          '#6b7280'
    };
    function badge(action) {
        if (!action) return '<span class="log-null">—</span>';
        var color = ACTION_COLORS[action] || '#64748b';
        return '<span class="log-badge" style="background:' + color + '">' + esc(action) + '</span>';
    }

    function showLoading(show) {
        var el = document.getElementById('loadingOverlay');
        if (el) el.style.display = show ? 'flex' : 'none';
    }

    function showError(msg) {
        var el = document.getElementById('errorMsg');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 5000);
    }

    // ─────────────────────────────────────────────
    // 啟動
    // ─────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
