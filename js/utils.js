/**
 * 工具函數
 */

// ── 全域 fetch 攔截：偵測 401（登入逾時），清除 session 後導向登入頁 ──
(function () {
    var _origFetch = window.fetch;
    var _redirecting = false;
    window.fetch = function () {
        return _origFetch.apply(this, arguments).then(function (response) {
            if (response.status === 401 && !_redirecting) {
                _redirecting = true;
                sessionStorage.clear();
                // 導向登入頁面（而非 reload，避免因 token 失效造成無限迴圈）
                if (!window.location.pathname.endsWith('/login.html')) {
                    window.location.href = '/eServiceA/dashboard/login.html';
                }
            }
            return response;
        });
    };
})();

var CommonUtils = (function() {
    'use strict';
    
    /**
     * 顯示百分比
     */
    function animatePercentage(elementId, targetProgress, duration) {
        duration = duration || 500;
        var element = document.getElementById(elementId);
        if (!element) return;

        var currentProgress = 0;
        var steps = 60;
        var increment = targetProgress / steps;
        var stepDuration = duration / steps;

        var timer = setInterval(function() {
            currentProgress += increment;
            if (currentProgress >= targetProgress) {
                currentProgress = targetProgress;
                clearInterval(timer);
            }
            element.textContent = Math.round(currentProgress) + '%';
        }, stepDuration);
    }

    /**
     */
    function hexToRGBA(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }

    function debounce(func, wait) {
        var timeout;
        return function executedFunction() {
            var context = this;
            var args = arguments;
            var later = function() {
                clearTimeout(timeout);
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 格式化日期
     */
    function formatDate(dateString) {
        if (!dateString) return '';
        var date = new Date(dateString);
        return date.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    /**
     * 取得今天的日期
     */
    function getTodayISO() {
        return new Date().toISOString().split('T')[0];
    }

    return {
        animatePercentage: animatePercentage,
        hexToRGBA: hexToRGBA,
        debounce: debounce,
        formatDate: formatDate,
        getTodayISO: getTodayISO
    };
})();
