document.addEventListener('DOMContentLoaded', function () {
    const loginForm      = document.getElementById('loginForm');
    const usernameInput  = document.getElementById('username');
    const passwordInput  = document.getElementById('custid');
    const togglePassword = document.getElementById('togglePassword');
    const usernameError  = document.getElementById('usernameError');
    const passwordError  = document.getElementById('passwordError');
    const submitBtn      = loginForm.querySelector('button[type="submit"]');

    // ── 密碼顯示 / 隱藏切換 ──────────────────────────────────
    togglePassword.addEventListener('click', function () {
        const isPassword = passwordInput.getAttribute('type') === 'password';
        passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
        togglePassword.textContent = isPassword ? '🔓' : '🔒';
    });

    // ── 帳號即時驗證 ─────────────────────────────────────────
    usernameInput.addEventListener('input', function () {
        const value = this.value;
        if (value.length === 0) {
            usernameError.textContent = '';
            usernameInput.style.borderColor = '#e5e7eb';
        } else {
            usernameError.textContent = '✓ 格式正確';
            usernameError.style.color = '#10b981';
            usernameInput.style.borderColor = '#10b981';
        }
    });

    // ── 工具：Base64 編碼 ──────────────────────────────────── 
    function toBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    // ── 工具：顯示全域錯誤訊息 ──────────────────────────────
    function showGlobalError(msg) {
        passwordError.textContent = msg;
        passwordError.style.color = '#dc2626';
    }

    function clearErrors() {
        usernameError.textContent = '';
        passwordError.textContent = '';
        usernameInput.style.borderColor = '#e5e7eb';
        passwordInput.style.borderColor = '#e5e7eb';
    }

    // ── 焦點樣式 ──────────────────────────────────────────────
    [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('focus', function () {
            this.parentElement.style.transform = 'translateY(-2px)';
        });
        input.addEventListener('blur', function () {
            this.parentElement.style.transform = 'translateY(0)';
        });
    });

    // ── 表單提交 ──────────────────────────────────────────────
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearErrors();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (password.length === 0) {
            showGlobalError('密碼不可為空');
            passwordInput.focus();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = '登入中…';

        try {
            const resp = await window.authFetch('/eServiceA/dashboard/auth/adLogin', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    username: toBase64(username),
                    password: toBase64(password)
                })
            });

            if (!resp.ok) {
                showGlobalError(`伺服器錯誤 (${resp.status})，請稍後再試`);
                return;
            }

            const json = await resp.json();
            const isSuccess = !json.stat || json.stat === 'ok';

            if (!isSuccess) {
                showGlobalError(json.errorMsg || json.message || '登入失敗，請確認帳號密碼');
                passwordInput.value = '';
                passwordInput.focus();
                return;
            }

            const data = json.result || json.data || {};

            // 儲存 JWT Token（改密碼 API 需要）
            if (data.token) {
                window.saveAuthToken(data.token);
            }

            // 儲存使用者基本資訊
            const userProfile = {
                userId:     data.userId     || '',
                employeeId: data.employeeId || username,
                userName:   data.userName   || data.fullName || username,
                company:    data.company    || '',
                department: data.department || data.ou || '',
                email:      data.email      || '',
                role:       data.role       || 'USER',
                firstLogin: !!data.firstLogin,
                fullName:   data.fullName   || data.userName || username,
                ou:         data.ou         || data.department || ''
            };

            sessionStorage.setItem('dashboardUser',  JSON.stringify(userProfile));
            localStorage.setItem('dashboardUser',  JSON.stringify(userProfile));
            localStorage.setItem('employeeId',     userProfile.employeeId);
            localStorage.setItem('userName',       userProfile.userName);
            localStorage.setItem('company',        userProfile.company);
            localStorage.setItem('department',     userProfile.department);
            localStorage.setItem('fullName',       userProfile.fullName);
            localStorage.setItem('ou',             userProfile.ou);
            localStorage.setItem('role',           userProfile.role);
            localStorage.setItem('firstLogin',     userProfile.firstLogin ? '1' : '0');

            // 登入成功 → 清除密碼欄位後進入首頁
            passwordInput.value = '';
            window.location.href = 'index.html';

        } catch (err) {
            showGlobalError('網路異常，請檢查連線後再試');
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = '登入';
        }
    });
});
