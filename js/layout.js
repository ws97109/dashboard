/**
 * layout.js — 共用 Header / NavBar / Footer 注入
 *
 * 使用方式（在 layout.js 之前定義）：
 *   window._layoutConfig = {
 *     root: '',        // '' 代表根目錄頁面；'../' 代表 page/ 子目錄頁面
 *     navBar: {        // 可選，有值才會渲染頁面導覽列
 *       title: '頁面標題',
 *       backLinks: [   // 返回按鈕陣列
 *         { href: '../index.html', text: '← 返回總覽' }
 *       ]
 *     }
 *   };
 */
(function () {
    var cfg  = window._layoutConfig || {};
    var root = cfg.root !== undefined ? cfg.root : '';

    /** HTML 特殊字元跳脫，防止 DOM XSS */
    function _escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── 從 localStorage 取出登入使用者（localStorage 可跨分頁共享）──────
    var user = null;
    try { user = JSON.parse(localStorage.getItem('dashboardUser') || 'null'); } catch (e) {}

    // ── 主動驗證 token 是否仍有效（防止 F5 重整後 token 已過期卻停留在當頁）──
    // 若使用者已登入且目前不在登入頁，呼叫後端 keepLogin 驗證；
    // 若 token 已失效（401），authFetch 會自動清除 session 並導向登入頁。
    if (user && user.employeeId && !window.location.pathname.endsWith('/login.html')) {
        if (window.authFetch) {
            window.authFetch('/eServiceA/dashboard/auth/keepLogin', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': window.getCsrfToken() }
            }).catch(function () { /* authFetch 已處理 401 導向 */ });
        }
    }

    // ── 注入 Header ───────────────────────────────────────────────────────
    var headerEl = document.getElementById('_layout_header');
    if (headerEl) {
        var isLoggedIn = !!(user && user.employeeId);
        var isAdmin    = isLoggedIn && (user.role === 'ADMIN' || localStorage.getItem('role') === 'ADMIN');
        var rawName = isLoggedIn
            ? ((user.fullName || user.userName || user.employeeId) + '[' + user.employeeId + ']')
            : '';
        var displayName = _escHtml(rawName);

        // ── ADMIN 專用導覽連結 ──
        var adminNavHtml = '';
        if (isAdmin) {
            adminNavHtml =
                '<nav class="_page_header__admin_nav">'
                + '<a class="_btn _btn--sm _btn--admin" href="' + root + 'import.html">📥 資料匯入</a>'
                + '<a class="_btn _btn--sm _btn--admin" href="' + root + 'page/operation-log.html">📋 操作記錄</a>'
                + '</nav>';
        }

        // ── 桌機版右側使用者區（DOM XSS 防護：使用者名稱以空白佔位，避免 innerHTML 注入）──
        var userAreaHtml = '';
        if (isLoggedIn) {
            userAreaHtml =
                '<div class="_page_header__user" id="_header_user_area">'
                + '<span class="_header_username" id="_dyn_header_username"></span>'
                + '<a class="_btn _btn--sm" href="/eServiceA/dashboard/page/all-tasks.html">全部任務</a>'
                + '<a class="_btn _btn--sm" href="/eServiceA/dashboard/page/my-tasks.html">我的任務</a>'
                + '<button class="_btn _btn--sm" id="_header_logout_btn" type="button">登出</button>'
                + '</div>';
        } else {
            userAreaHtml =
                '<div class="_page_header__user" id="_header_user_area">'
                + '<a class="_btn _btn--sm" id="_header_login_btn" href="' + root + 'login.html">登入</a>'
                + '</div>';
        }

        // ── 漢堡選單區（行動版）──
        var statusDotClass = isLoggedIn ? '_header_status_dot--online' : '_header_status_dot--offline';
        // ADMIN 行動版額外選單項目
        var adminMobileItems = isAdmin
            ? '<div class="_header_mobile_menu_divider"></div>'
              + '<a class="_header_mobile_menu_item" href="' + root + 'import.html">📥 資料匯入（管理員）</a>'
              + '<a class="_header_mobile_menu_item" href="' + root + 'page/operation-log.html">📋 操作記錄（管理員）</a>'
            : '';
        // DOM XSS 防護：行動版使用者名稱以空白佔位（id="_dyn_mobile_username"），不插入 innerHTML
        var mobileMenuBody = isLoggedIn
            ? '<div class="_header_mobile_user">'
              + '<span class="_header_mobile_avatar _header_mobile_avatar--in">👤</span>'
              + '<div class="_header_mobile_user_info">'
              + '<div class="_header_mobile_user_name" id="_dyn_mobile_username"></div>'
              + '<div class="_header_mobile_user_status online">● 已登入</div>'
              + '</div></div>'
              + '<div class="_header_mobile_menu_divider"></div>'
              + '<a class="_header_mobile_menu_item" href="/eServiceA/dashboard/page/my-tasks.html">📋 我的任務</a>'
              + adminMobileItems
              + '<button class="_header_mobile_menu_item" id="_mobile_logout_btn">🚪 登出</button>'
            : '<div class="_header_mobile_user">'
              + '<span class="_header_mobile_avatar _header_mobile_avatar--out">👤</span>'
              + '<div class="_header_mobile_user_info">'
              + '<div class="_header_mobile_user_name" style="color:#adb5bd;">訪客</div>'
              + '<div class="_header_mobile_user_status offline">● 未登入</div>'
              + '</div></div>'
              + '<div class="_header_mobile_menu_divider"></div>'
              + '<a class="_header_mobile_menu_item" href="' + root + 'login.html">🔑 登入</a>';

        // DOM XSS 防護：狀態點 title 以 id="_dyn_status_dot" 標記，於 innerHTML 後由 setAttribute 設定
        var hamburgerHtml =
            '<div class="_header_hamburger_area">'
            + '<span class="_header_status_dot ' + statusDotClass + '" id="_dyn_status_dot"></span>'
            + '<button class="_header_hamburger" id="_header_hamburger_btn" aria-label="選單">'
            + '<span></span><span></span><span></span>'
            + '</button>'
            + '</div>'
            + '<div class="_header_mobile_menu" id="_header_mobile_menu">'
            + mobileMenuBody
            + '</div>';

        headerEl.innerHTML =
            '<div class="_page_header">'
            +   '<div class="_page_header__container">'
            +     '<div class="_page_header__top">'
            +       '<div class="_page_header__logo">'
            +         '<a href="/eServiceA/dashboard/">'
            +           '<img src="' + root + 'img/ts-430.png" alt="台新銀行 Logo">'
            +         '</a>'
            +       '</div>'
            +       adminNavHtml
            +       userAreaHtml
            +       hamburgerHtml
            +     '</div>'
            +   '</div>'
            + '</div>';

        // ── DOM XSS 防護：使用者名稱透過 textContent / setAttribute 安全設定 ──
        // localStorage 來源的 rawName 不直接插入 innerHTML，消除 taint flow
        if (isLoggedIn) {
            var dynUsername = document.getElementById('_dyn_header_username');
            if (dynUsername) {
                dynUsername.textContent = rawName;          // textContent 自動跳脫，無 XSS 風險
                dynUsername.setAttribute('title', rawName); // setAttribute 正確跳脫屬性值
            }
            var dynMobileUsername = document.getElementById('_dyn_mobile_username');
            if (dynMobileUsername) {
                dynMobileUsername.textContent = rawName;
            }
        }
        var dynStatusDot = document.getElementById('_dyn_status_dot');
        if (dynStatusDot) {
            dynStatusDot.setAttribute('title', isLoggedIn ? ('已登入：' + rawName) : '未登入');
        }

        // ── 登出（桌機）──
        if (isLoggedIn) {
            var logoutBtn = document.getElementById('_header_logout_btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', function () {
                    window.authFetch('/eServiceA/dashboard/auth/logout', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': window.getCsrfToken() }
                    })
                        .catch(function () {})
                        .finally(function () { window.clearAuthToken(); localStorage.clear(); window.location.href = root + 'login.html'; });
                });
            }
            // ── 登出（行動版）──
            var mobileLogoutBtn = document.getElementById('_mobile_logout_btn');
            if (mobileLogoutBtn) {
                mobileLogoutBtn.addEventListener('click', function () {
                    window.authFetch('/eServiceA/dashboard/auth/logout', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': window.getCsrfToken() }
                    })
                        .catch(function () {})
                        .finally(function () { window.clearAuthToken(); localStorage.clear(); window.location.href = root + 'login.html'; });
                });
            }
        }

        // ── 漢堡按鈕開關 ──
        var hamburgerBtn  = document.getElementById('_header_hamburger_btn');
        var mobileMenu    = document.getElementById('_header_mobile_menu');
        if (hamburgerBtn && mobileMenu) {
            hamburgerBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = mobileMenu.classList.toggle('open');
                hamburgerBtn.classList.toggle('open', open);
            });
            document.addEventListener('click', function (e) {
                if (!mobileMenu.contains(e.target) && e.target !== hamburgerBtn) {
                    mobileMenu.classList.remove('open');
                    hamburgerBtn.classList.remove('open');
                }
            });
        }
    }

    // ── 注入 NavBar（頁面標題 + 返回按鈕列）────────────────────────────────
    var navBarEl = document.getElementById('_page_navBar');
    if (navBarEl && cfg.navBar) {
        var title     = cfg.navBar.title || '';
        var backLinks = cfg.navBar.backLinks || [];
        var linksHtml = backLinks.map(function (l) {
            return '<a href="' + _escHtml(l.href) + '" class="_btn">' + _escHtml(l.text) + '</a>';
        }).join('');
        navBarEl.innerHTML =
            '<div class="page-nav-bar">'
            +   '<div class="page-nav-bar__inner">'
            +     '<h1 class="page-nav-bar__title">' + _escHtml(title) + '</h1>'
            +     '<div class="page-nav-bar__actions">' + linksHtml + '</div>'
            +   '</div>'
            + '</div>';
    }

    // ── 注入 Footer ───────────────────────────────────────────────────────
    var footerEl = document.getElementById('_layout_footer');
    if (footerEl) {
        footerEl.innerHTML = '<footer class="page-footer">© 台新國際商業銀行</footer>';
    }
})();
