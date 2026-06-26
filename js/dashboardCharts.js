/**
 * Dashboard 視覺化 - 對外營運資料 / 一個一列寬版
 */
(function () {
    'use strict';

    const css = getComputedStyle(document.documentElement);
    const COLOR = {
        track: css.getPropertyValue('--color-track').trim() || 'rgba(255,255,255,0.05)'
    };

    const svg = (w, h, content) =>
        `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${content}</svg>`;

    /** ============ 區域定義 ============ */
    const REGIONS = [
        { key: '中區',    color: '#5e9b7e' },
        { key: '北一區',  color: '#6a9bb0' },
        { key: '北二區',  color: '#7a8db8' },
        { key: '南區',    color: '#b89968' },
        { key: '香港分行', color: '#b88068' }
    ];

    function regionOf(task) {
        const name = task.groupName || '';
        const sorted = [...REGIONS].sort((a, b) => b.key.length - a.key.length);
        for (const r of sorted) {
            if (name.includes(r.key)) return r.key;
        }
        return null;
    }

    /** ============ 資料計算 ============ */

    function flattenTasks(category) {
        const tasks = [];
        (category.groups || []).forEach(g => {
            (g.tasks || []).forEach(t => {
                tasks.push({ ...t, groupName: g.name, groupId: g.id });
            });
        });
        return tasks;
    }

    function daysFromToday(dateStr) {
        if (!dateStr) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(dateStr);
        target.setHours(0, 0, 0, 0);
        return Math.round((target - today) / 86400000);
    }

    function computeMetrics(category) {
        const tasks = flattenTasks(category);
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const pending = total - completed;

        // 區域統計：依 REGIONS 順序固定輸出五筆，無資料則為 0
        const regionMap = {};
        REGIONS.forEach(r => { regionMap[r.key] = { done: 0, total: 0 }; });
        tasks.forEach(t => {
            const key = regionOf(t);
            if (!key) return;
            regionMap[key].total++;
            if (t.completed) regionMap[key].done++;
        });
        const regionStats = REGIONS.map(r => ({
            name: r.key,
            color: r.color,
            done: regionMap[r.key].done,
            total: regionMap[r.key].total,
            ratio: regionMap[r.key].total > 0 ? regionMap[r.key].done / regionMap[r.key].total : 0
        }));

        // 區域加總（卡片1底部：只計入有歸屬到區域的任務）
        const regionTotal = regionStats.reduce((s, r) => s + r.total, 0);
        const regionDone = regionStats.reduce((s, r) => s + r.done, 0);
        const regionPending = regionTotal - regionDone;

        const groupStats = (category.groups || []).map(g => {
            const gTasks = g.tasks || [];
            const gDone = gTasks.filter(t => t.completed).length;
            return {
                id: g.id,
                name: g.name,
                shortName: g.name.replace(/^\d+組-/, ''),
                done: gDone,
                total: gTasks.length,
                ratio: gTasks.length > 0 ? gDone / gTasks.length : 0
            };
        }).sort((a, b) => b.ratio - a.ratio);

        const companies = {};
        tasks.forEach(t => {
            const c = t.company || '未指定';
            if (!companies[c]) companies[c] = { total: 0, done: 0 };
            companies[c].total++;
            if (t.completed) companies[c].done++;
        });
        const companyStats = Object.entries(companies).map(([name, s]) => ({
            name,
            total: s.total,
            done: s.done,
            ratio: s.total > 0 ? s.done / s.total : 0
        }));

        const pendingTasks = tasks.filter(t => !t.completed);
        let overdue = 0, soon = 0, safe = 0;
        const overdueList = [];
        pendingTasks.forEach(t => {
            const d = daysFromToday(t.expectedCompletion);
            if (d === null) return;
            if (d < 0) { overdue++; overdueList.push({ ...t, daysOver: -d }); }
            else if (d <= 7) soon++;
            else safe++;
        });
        overdueList.sort((a, b) => b.daysOver - a.daysOver);

        // external_type 統計：依實際值動態分組，空白不顯示
        const externalTypes = {};
        tasks.forEach(t => {
            const et = t.externalType;
            if (!et || !et.trim()) return;
            const key = et.trim();
            if (!externalTypes[key]) externalTypes[key] = { total: 0, done: 0 };
            externalTypes[key].total++;
            if (t.completed) externalTypes[key].done++;
        });
        const externalTypeStats = Object.entries(externalTypes).map(([name, s]) => ({
            name,
            total: s.total,
            done: s.done,
            ratio: s.total > 0 ? s.done / s.total : 0
        })).sort((a, b) => b.ratio - a.ratio);

        return {
            total, completed, pending,
            ratio: total > 0 ? completed / total : 0,
            regionStats, regionTotal, regionDone, regionPending,
            groupStats, companyStats, externalTypeStats,
            risk: { overdue, soon, safe, overdueList }
        };
    }

    /** ============ 工具 ============ */

    function animateNumber(el, target, duration = 1300) {
        const start = performance.now();
        function tick(now) {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = Math.round(target * eased);
            if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    function shell(accent, sub, label, tag, mainHtml, bottomHtml) {
        return `
            <div class="dc-card-inner" style="--accent:${accent};">
                <div class="dc-top">
                    <div class="dc-top-left">
                        <span class="dc-sub">${sub}</span>
                        <span class="dc-label">${label}</span>
                    </div>
                    <span class="dc-tag">
                        <span class="dc-tag-dot"></span>${tag}
                    </span>
                </div>
                <div class="dc-main">${mainHtml}</div>
                <div class="dc-bottom">${bottomHtml}</div>
            </div>
        `;
    }

    function bottomBar(items) {
        return items.map(it => `
            <div class="dc-stat">
                <span class="dc-stat-label">${it.label}</span>
                <span class="dc-stat-value">${it.value}</span>
            </div>
        `).join('<span class="dc-stat-sep"></span>');
    }

    /** ============ 卡片 1：區域完成進度（五個圓餅，各自下方顯示完成數） ============ */

    function renderRegion(card, m) {
        const accent = '#5e9b7e';
        const ratio = m.regionTotal > 0 ? m.regionDone / m.regionTotal : 0;
        const percent = Math.round(ratio * 100);
        const tagText = percent >= 70 ? '良好' : percent >= 40 ? '進行中' : '完成比例';

        const W = 100, H = 100;
        const cx = W / 2, cy = H / 2;
        const r = 38;
        const stroke = 8;
        const circumference = 2 * Math.PI * r;

        const ringsHtml = m.regionStats.map((rg, i) => {
            const pct = Math.round(rg.ratio * 100);
            const offset = circumference * (1 - rg.ratio);
            const gid = `grad-region-${i}`;
            return `
                <div class="dc-region-item">
                    <div class="dc-region-ring">
                        ${svg(W, H, `
                            <defs>
                                <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="${rg.color}"/>
                                    <stop offset="100%" stop-color="${rg.color}" stop-opacity="0.6"/>
                                </linearGradient>
                            </defs>
                            <circle cx="${cx}" cy="${cy}" r="${r}"
                                fill="none" stroke="${COLOR.track}" stroke-width="${stroke}"/>
                            <circle cx="${cx}" cy="${cy}" r="${r}"
                                fill="none" stroke="url(#${gid})" stroke-width="${stroke}"
                                stroke-linecap="round"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${circumference}"
                                transform="rotate(-90 ${cx} ${cy})"
                                class="dc-region-ring-fill"
                                data-offset="${offset}"
                                style="transition: stroke-dashoffset 1.3s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.12}s;"/>
                            <text x="${cx}" y="${cy + 5}" text-anchor="middle"
                                font-family="'Orbitron', sans-serif" font-weight="900"
                                font-size="19" fill="${rg.color}">
                                <tspan class="dc-region-num" data-target="${pct}">0</tspan><tspan font-size="11" dy="-3">%</tspan>
                            </text>
                        `)}
                    </div>
                    <div class="dc-region-name">${rg.name}</div>
                    <div class="dc-region-count">
                        <span class="dc-region-done" data-target="${rg.done}" style="color:${rg.color};">0</span><span class="dc-region-total"> / ${rg.total}</span>
                    </div>
                    <div class="dc-region-label">任務完成數</div>
                </div>
            `;
        }).join('');

        const main = `<div class="dc-region-row">${ringsHtml}</div>`;

        const bottom = bottomBar([
            { label: '已完成', value: m.regionDone },
            { label: '待處理', value: m.regionPending },
            { label: '總任務', value: m.regionTotal }
        ]);

        card.innerHTML = shell(accent, 'REGION PROGRESS', '區域完成進度', tagText, main, bottom);

        requestAnimationFrame(() => {
            card.querySelectorAll('.dc-region-ring-fill').forEach(el => {
                el.style.strokeDashoffset = el.dataset.offset;
            });
            card.querySelectorAll('.dc-region-num').forEach(el => {
                animateNumber(el, Number(el.dataset.target));
            });
            card.querySelectorAll('.dc-region-done').forEach(el => {
                animateNumber(el, Number(el.dataset.target));
            });
        });
    }

    /** ============ 卡片 2：對外系統類型（依 external_type 動態顯示） ============ */

    function renderGroupRank(card, m) {
        const accent = '#6a9bb0';
        const list = m.externalTypeStats;

        if (!list || list.length === 0) {
            card.style.display = 'none';
            return;
        }

        const leader = list[0];

        const rows = list.map((g, idx) => {
            const pct = Math.round(g.ratio * 100);
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
            return `
                <div class="dc-rank-row">
                    <span class="dc-rank-medal">${medal}</span>
                    <div class="dc-rank-info">
                        <span class="dc-rank-name" title="${g.name}">${g.name}</span>
                        <span class="dc-rank-count">${g.done}/${g.total} 任務</span>
                    </div>
                    <div class="dc-rank-bar">
                        <div class="dc-rank-fill" data-target="${pct}" style="width: 0%; background: ${accent};"></div>
                    </div>
                    <span class="dc-rank-pct">${pct}%</span>
                </div>
            `;
        }).join('');

        const main = `<div class="dc-rank-list">${rows}</div>`;

        const totalAll = list.reduce((s, g) => s + g.total, 0);
        const doneAll = list.reduce((s, g) => s + g.done, 0);
        const bottom = bottomBar([
            { label: '領先類型', value: leader ? leader.name : '-' },
            { label: '類型總數', value: list.length },
            { label: '平均完成率', value: list.length > 0 ? Math.round(list.reduce((s, g) => s + g.ratio, 0) / list.length * 100) + '%' : '0%' }
        ]);

        card.innerHTML = shell(accent, 'EXTERNAL TYPE', '對外系統類型', '完成度', main, bottom);

        requestAnimationFrame(() => {
            card.querySelectorAll('.dc-rank-fill').forEach((el, i) => {
                setTimeout(() => {
                    el.style.transition = 'width 1s cubic-bezier(0.4, 0, 0.2, 1)';
                    el.style.width = el.dataset.target + '%';
                }, i * 80);
            });
        });
    }

    /** ============ 卡片 3：公司任務分佈（寬版，固定台新 / 新光） ============ */

    function renderCompany(card, m) {
        const accent = '#8b8db8';
        // 固定顯示「台新」「新光」兩家，順序固定，缺值補 0
        const TARGET = ['台新', '新光'];
        const companies = TARGET.map(name =>
            m.companyStats.find(c => c.name === name) ||
            { name, total: 0, done: 0, ratio: 0 }
        );
        const colors = ['#7a8db8', '#b89968'];
        const totalTasks = companies.reduce((s, c) => s + c.total, 0);

        const stackHtml = `
            <div class="dc-co-stack">
                ${companies.map((c, i) => {
                    const w = totalTasks > 0 ? (c.total / totalTasks) * 100 : 0;
                    return `<div class="dc-co-seg" style="width:0%; background:${colors[i]};"
                        data-target="${w}" title="${c.name}: ${c.total}"></div>`;
                }).join('')}
            </div>
            <div class="dc-co-stack-labels">
                ${companies.map((c, i) => {
                    const w = totalTasks > 0 ? Math.round((c.total / totalTasks) * 100) : 0;
                    return `<span style="color:${colors[i]};">${c.name} ${w}%</span>`;
                }).join('')}
            </div>
        `;

        const ringHtml = companies.map((c, i) => {
            const W = 90, H = 110;
            const cx = W / 2, cy = 45;
            const r = 30;
            const stroke = 7;
            const circumference = 2 * Math.PI * r;
            const offset = circumference * (1 - c.ratio);
            const pct = Math.round(c.ratio * 100);
            return `
                <div class="dc-co-ring-box">
                    ${svg(W, H, `
                        <circle cx="${cx}" cy="${cy}" r="${r}"
                            fill="none" stroke="${COLOR.track}" stroke-width="${stroke}"/>
                        <circle cx="${cx}" cy="${cy}" r="${r}"
                            fill="none" stroke="${colors[i]}" stroke-width="${stroke}"
                            stroke-linecap="round"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${circumference}"
                            transform="rotate(-90 ${cx} ${cy})"
                            class="dc-co-ring"
                            data-offset="${offset}"
                            style="transition: stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1) ${i * 0.15}s;"/>
                        <text x="${cx}" y="${cy + 4}" text-anchor="middle"
                            font-family="'Orbitron', sans-serif" font-weight="700"
                            font-size="16" fill="${colors[i]}">${pct}%</text>
                        <text x="${cx}" y="${H - 18}" text-anchor="middle"
                            font-family="'Noto Sans TC', sans-serif" font-weight="700"
                            font-size="11" fill="currentColor" opacity="0.85">${c.name}</text>
                        <text x="${cx}" y="${H - 6}" text-anchor="middle"
                            font-family="'Orbitron', sans-serif"
                            font-size="9" fill="currentColor" opacity="0.5">${c.done}/${c.total}</text>
                    `)}
                </div>
            `;
        }).join('');

        const main = `
            <div class="dc-co-wide">
                <div class="dc-co-stack-wrap">
                    <div class="dc-co-stack-title">任務分佈比例</div>
                    ${stackHtml}
                </div>
                <div class="dc-co-rings">${ringHtml}</div>
            </div>
        `;

        const bottom = bottomBar([
            { label: '總任務', value: totalTasks },
            { label: companies[0].name, value: companies[0].total },
            { label: companies[1].name, value: companies[1].total }
        ]);

        card.innerHTML = shell(accent, 'COMPANY SPLIT', '公司任務分佈', '對比', main, bottom);

        requestAnimationFrame(() => {
            card.querySelectorAll('.dc-co-seg').forEach((el, i) => {
                setTimeout(() => {
                    el.style.transition = 'width 1s cubic-bezier(0.4, 0, 0.2, 1)';
                    el.style.width = el.dataset.target + '%';
                }, i * 100);
            });
            card.querySelectorAll('.dc-co-ring').forEach(r => {
                r.style.strokeDashoffset = r.dataset.offset;
            });
        });
    }

    /** ============ 卡片 4：時程風險警示（半圓儀表版） ============ */

    function renderRisk(card, m) {
        const accent = '#b88068';
        const { overdue, soon, safe, overdueList } = m.risk;
        const total = overdue + soon + safe;
        const tagText = overdue > 0 ? '警示' : soon > 0 ? '注意' : '安全';

        // 風險加權分數：逾期權重最高，越高越危險（0~100）
        const riskScore = total > 0
            ? Math.round(((overdue * 1 + soon * 0.5 + safe * 0) / total) * 100)
            : 0;

        const levels = [
            { label: '已逾期', value: overdue, color: '#c75d57' },
            { label: '即將到期', value: soon, color: '#d99a5b' },
            { label: '時程充裕', value: safe, color: '#7fae84' }
        ];

        // ---- 左：半圓儀表 ----
        const W = 200, H = 130;
        const cx = W / 2, cy = 112;
        const R = 80;
        const arcW = 14;

        // 半圓：左端(0%)在左側 180°，右端(100%)在右側 0°
        const polar = (deg) => {
            const rad = deg * Math.PI / 180;
            return { x: cx + R * Math.cos(rad), y: cy - R * Math.sin(rad) };
        };
        const startP = polar(180);
        const endP = polar(0);

        // fromDeg/toDeg 以「百分比角度(0~180，左→右)」傳入，內部轉成實際極座標角
        const seg = (fromPct, toPct, color) => {
            const a = polar(180 - fromPct), b = polar(180 - toPct);
            return `<path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${R} ${R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}"
                fill="none" stroke="${color}" stroke-width="${arcW}" stroke-linecap="round" opacity="0.9"/>`;
        };

        // 指針：score 0 → 指最左(逆時針90°)，100 → 指最右(順時針90°)
        // 指針線固定畫在正上方，旋轉角度 = (score/100)*180 - 90
        const needleRotate = (riskScore / 100) * 180 - 90;
        const needleLen = R - arcW - 4;

        const gaugeSvg = svg(W, H, `
            <path d="M ${startP.x.toFixed(1)} ${startP.y.toFixed(1)} A ${R} ${R} 0 0 1 ${endP.x.toFixed(1)} ${endP.y.toFixed(1)}"
                fill="none" stroke="${COLOR.track}" stroke-width="${arcW}" stroke-linecap="round"/>
            ${seg(2, 58, '#7fae84')}
            ${seg(62, 118, '#d99a5b')}
            ${seg(122, 178, '#c75d57')}
            <g class="dc-gauge-needle" style="transform-origin:${cx}px ${cy}px; transform:rotate(-90deg); transition:transform 1.3s cubic-bezier(0.34,1.56,0.64,1);">
                <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - needleLen}"
                    stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
                <circle cx="${cx}" cy="${cy}" r="6" fill="${accent}"/>
                <circle cx="${cx}" cy="${cy}" r="2.5" fill="#1a1a1a"/>
            </g>
            <text x="${cx}" y="${cy - 26}" text-anchor="middle"
                font-family="'Orbitron', sans-serif" font-weight="900"
                font-size="30" fill="${accent}"><tspan class="dc-gauge-num">0</tspan></text>
            <text x="${cx}" y="${cy - 10}" text-anchor="middle"
                font-family="'Noto Sans TC', sans-serif" font-size="9"
                fill="currentColor" opacity="0.5">風險指數</text>
        `);

        // ---- 右：逾期任務列表（任務代號 + 名稱 + 逾期天數） ----
        const overdueTop = overdueList.slice(0, 10);
        const overdueHtml = overdueTop.length > 0
            ? overdueTop.map(t => `
                    <div class="dc-od-item">
                        <div class="dc-od-head">
                            <span class="dc-od-name" title="${t.name}"><span class="dc-od-no">#${t.id}</span>${t.name}</span>
                            <span class="dc-od-days">${t.daysOver}天</span>
                        </div>
                    </div>
                `).join('')
            : `<div class="dc-od-empty">
                    <span class="dc-od-empty-icon">✓</span>
                    <span>目前無逾期任務</span>
               </div>`;

        // ---- 左下：三段統計小標籤 ----
        const miniStats = levels.map(lv => `
            <div class="dc-risk-mini">
                <span class="dc-risk-mini-dot" style="background:${lv.color};"></span>
                <span class="dc-risk-mini-val" style="color:${lv.color};">${lv.value}</span>
                <span class="dc-risk-mini-label">${lv.label}</span>
            </div>
        `).join('');

        const main = `
            <div class="dc-risk-wide">
                <div class="dc-risk-gauge-side">
                    <div class="dc-risk-gauge">${gaugeSvg}</div>
                    <div class="dc-risk-mini-row">${miniStats}</div>
                </div>
                <div class="dc-risk-list">
                    <div class="dc-risk-list-title">⚠ 逾期任務</div>
                    ${overdueHtml}
                </div>
            </div>
        `;

        const bottom = bottomBar([
            { label: '逾期', value: overdue },
            { label: '7天內', value: soon },
            { label: '充裕', value: safe }
        ]);

        card.innerHTML = shell(accent, 'TIMELINE RISK', '時程風險警示', tagText, main, bottom);

        requestAnimationFrame(() => {
            const needle = card.querySelector('.dc-gauge-needle');
            if (needle) needle.style.transform = `rotate(${needleRotate}deg)`;
            animateNumber(card.querySelector('.dc-gauge-num'), riskScore);
        });
    }

    /** ============ 主流程 ============ */

    async function init() {
        const container = document.querySelector('.dashboard-section');
        if (!container) return;

        const res = await window.authFetch('/eServiceA/dashboard/api/v2/dashboard/index');
        const json = await res.json();
        const list = json.categories || [];
        const category = list.find(c => c.id === 5 || c.name === '對外營運');
        if (!category) return;

        const m = computeMetrics(category);

        const cards = container.querySelectorAll('.dashboard-card');
        if (cards[0]) renderRegion(cards[0], m);
        if (cards[1]) renderGroupRank(cards[1], m);
        if (cards[2]) renderCompany(cards[2], m);
        if (cards[3]) renderRisk(cards[3], m);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();