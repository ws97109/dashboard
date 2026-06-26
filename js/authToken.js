/**
 * authToken.js — JWT Token 管理工具
 *
 * 提供統一的 token 儲存/讀取/清除，以及帶 token 的 fetch 封裝。
 * 所有需要登入的 API 呼叫都應使用 window.authFetch 取代原生 fetch。
 */
(function () {
    var TOKEN_KEY = 'dashboardToken';

    /** 儲存 token */
    window.saveAuthToken = function (token) {
        if (token) localStorage.setItem(TOKEN_KEY, token);
    };

    /** 取得 token */
    window.getAuthToken = function () {
        return localStorage.getItem(TOKEN_KEY);
    };

    /** 清除 token */
    window.clearAuthToken = function () {
        localStorage.removeItem(TOKEN_KEY);
    };

    /**
     * Cross-Site Request Forgery 防護：
     * 讀取 Spring Security 設定的 XSRF-TOKEN cookie，用於所有 state-changing 請求的標頭驗證。
     * @returns {string} CSRF token（若 cookie 不存在則回傳空字串）
     */
    window.getCsrfToken = function () {
        var match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    };

    /**
     * 帶 JWT 的 fetch 封裝
     * 自動附加 Authorization header，自動從 response header 更新 token
     */
    window.authFetch = function (url, opts) {
        opts = opts || {};
        opts.headers = opts.headers || {};

        var token = window.getAuthToken();
        if (token) {
            opts.headers['Authorization'] = 'Bearer ' + token;
        }

        // Cross-Site Request Forgery 防護：附加 XSRF-TOKEN cookie 值作為 CSRF 驗證標頭
        var csrfToken = window.getCsrfToken();
        if (csrfToken) {
            opts.headers['X-XSRF-TOKEN'] = csrfToken;
        }

        return fetch(url, opts).then(function (resp) {
            // 自動從 response 更新滑動過期的新 token
            var newToken = resp.headers.get('Authorization');
            if (newToken && newToken.startsWith('Bearer ')) {
                window.saveAuthToken(newToken.substring(7));
            }
            // 若 401，清除 token 並導向登入頁
            if (resp.status === 401) {
                window.clearAuthToken();
                localStorage.clear();
                window.location.href = '/eServiceA/dashboard/login.html';
                return Promise.reject(new Error('Unauthorized'));
            }
            return resp;
        });
    };
})();
