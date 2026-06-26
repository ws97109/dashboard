/**
 * 首頁 — 沉浸極光玻璃儀表板
 * 由 DataLoader 提供真實資料，渲染：整體完成度大環、階段進度流、
 * 各階段發光環卡片、實際進度 vs 整體平均對比條。
 */
var IndexPage = (function() {
    'use strict';

    var PROJECT_DATA = null;

    // 一致的極光色盤（依階段順序）
    var AURORA_COLORS = ['#4fe3c4', '#5fb2ff', '#a98bff', '#ffb454', '#ff6f8d'];
    function colorAt(i) { return AURORA_COLORS[i % AURORA_COLORS.length]; }

    var TAU = Math.PI * 2;

    var ICON = {
        ahead:   '<svg viewBox="0 0 24 24" fill="none"><path d="M5 15l7-7 7 7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        behind:  '<svg viewBox="0 0 24 24" fill="none"><path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        ontrack: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>'
    };

    /** 相對「整體平均」判定領先 / 接近 / 落後 */
    function statusOf(progress, overall) {
        var d = progress - overall;
        if (d >= 5)  return { k: 'ahead',   label: '領先', color: '#34d399' };
        if (d <= -5) return { k: 'behind',  label: '落後', color: '#f87171' };
        return { k: 'ontrack', label: '接近', color: '#60a5fa' };
    }

    function initializeDashboard() {
        setPeriodLabel();

        DataLoader.loadProjectData(function(err, data) {
            if (err) {
                console.error('初始化儀表板失敗:', err);
                return;
            }

            PROJECT_DATA = data;

            data.categories.forEach(function(category) {
                DataLoader.calculateCategoryProgress(category);
            });
            DataLoader.calculateOverallProgress(data);

            var overall = data.overallProgress;
            buildOverall(data, overall);
            buildFlow(data.categories, overall);
            buildCats(data.categories, overall);
            buildCompare(data.categories, overall);
            buildFootNote(data);
        });
    }

    function setPeriodLabel() {
        var el = document.getElementById('introPeriod');
        if (!el) return;
        var now = new Date();
        var q = Math.floor(now.getMonth() / 3) + 1;
        var qmap = ['第一季', '第二季', '第三季', '第四季'];
        el.textContent = now.getFullYear() + ' ' + qmap[q - 1];
    }

    /** 整體完成度大環 + 底部統計 */
    function buildOverall(data, overall) {
        var categories = data.categories;
        var totalTasks = 0, completedTasks = 0, ahead = 0, behind = 0;
        categories.forEach(function(c) {
            totalTasks += c.totalTasks || 0;
            completedTasks += c.completedTasks || 0;
            var st = statusOf(c.progress, overall);
            if (st.k === 'ahead') ahead++;
            else if (st.k === 'behind') behind++;
        });

        // 大環弧線（r=132）
        var arc = document.getElementById('overallArc');
        if (arc) {
            var r = 132, circ = TAU * r;
            arc.setAttribute('stroke-dasharray', circ.toFixed(1));
            arc.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.4,0,.2,1)';
            // 先停在空狀態，下一個 frame 再過渡到目標，產生繪製動畫
            arc.setAttribute('stroke-dashoffset', circ.toFixed(1));
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    arc.setAttribute('stroke-dashoffset', (circ * (1 - overall / 100)).toFixed(1));
                });
            });
        }

        animateNumber(document.getElementById('overallPercentage'), overall, 1500);

        var foot = document.getElementById('overallFoot');
        if (foot) {
            foot.innerHTML =
                '<div class="ofa"><div class="v">' + completedTasks + '<small> /' + totalTasks + '</small></div><div class="l">已完成任務</div></div>' +
                '<div class="ofa"><div class="v green">' + ahead + '</div><div class="l">階段領先</div></div>' +
                '<div class="ofa"><div class="v amber">' + behind + '</div><div class="l">階段落後</div></div>';
        }
    }

    /** 階段進度流：發光節點 + 連接線 */
    function buildFlow(categories, overall) {
        var track = document.getElementById('flowTrack');
        if (!track) return;

        categories.forEach(function(c, i) {
            var st = statusOf(c.progress, overall);
            var r = 50, circ = TAU * r, off = circ * (1 - c.progress / 100);
            var col = colorAt(i);
            var node = document.createElement('div');
            node.className = 'node';
            node.dataset.categoryId = c.id;
            node.innerHTML =
                '<div class="num">STAGE ' + (i + 1) + '</div>' +
                '<div class="dial">' +
                    '<div class="halo" style="background:' + col + '"></div>' +
                    '<svg viewBox="0 0 124 124">' +
                        '<circle cx="62" cy="62" r="' + r + '" stroke="rgba(255,255,255,.09)" stroke-width="8" fill="none"/>' +
                        '<circle cx="62" cy="62" r="' + r + '" stroke="' + col + '" stroke-width="8" fill="none" ' +
                            'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
                            'style="filter:drop-shadow(0 0 7px ' + col + 'bb)"/>' +
                    '</svg>' +
                    '<div class="inner"><div class="p">' + c.progress + '<small>%</small></div></div>' +
                '</div>' +
                '<div class="nm">' + c.name + '</div>' +
                '<div class="tk">' + c.completedTasks + '/' + c.totalTasks + ' 任務</div>' +
                '<div class="tag ' + st.k + '">' + ICON[st.k] + st.label + '</div>';
            track.appendChild(node);
        });

        // 連接線進度（以整體平均約略表示流動位置）
        var fill = document.getElementById('connectorFill');
        var head = document.getElementById('connectorHead');
        setTimeout(function() {
            if (fill) fill.style.width = overall + '%';
            if (head) head.style.left = overall + '%';
        }, 120);

        attachNav(track.querySelectorAll('.node'));
    }

    /** 各階段發光環卡片 */
    function buildCats(categories, overall) {
        var host = document.getElementById('cats');
        if (!host) return;
        host.innerHTML = '';

        // 卡片數量不為 5 時，調整欄數
        if (categories.length !== 5) {
            host.style.gridTemplateColumns = 'repeat(' + Math.min(categories.length, 5) + ', 1fr)';
        }

        categories.forEach(function(c, i) {
            var st = statusOf(c.progress, overall);
            var r = 52, circ = TAU * r, off = circ * (1 - c.progress / 100);
            var col = colorAt(i);
            var d = c.progress - overall;
            var deltaCls = st.k === 'ahead' ? 'delta-ahead' : st.k === 'behind' ? 'delta-behind' : 'delta-on';
            var sign = d > 0 ? '+' : '';

            var el = document.createElement('div');
            el.className = 'glass cat';
            el.dataset.categoryId = c.id;
            el.innerHTML =
                '<div class="cat-top">' +
                    '<span class="cat-idx">STAGE ' + (i + 1) + '</span>' +
                    '<span class="cat-state" style="color:' + st.color + ';background:' + st.color + '22;border:1px solid ' + st.color + '44">' +
                        '<span class="d" style="background:' + st.color + ';box-shadow:0 0 8px ' + st.color + '"></span>' + st.label + '</span>' +
                '</div>' +
                '<div class="mini-wrap">' +
                    '<div class="mini">' +
                        '<div class="mh" style="background:' + col + '"></div>' +
                        '<svg viewBox="0 0 128 128">' +
                            '<circle cx="64" cy="64" r="' + r + '" stroke="rgba(255,255,255,.08)" stroke-width="8" fill="none"/>' +
                            '<circle cx="64" cy="64" r="' + r + '" stroke="' + col + '" stroke-width="8" fill="none" ' +
                                'stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
                                'style="filter:drop-shadow(0 0 6px ' + col + 'aa)"/>' +
                        '</svg>' +
                        '<div class="mc"><div class="n">' + c.progress + '<small>%</small></div></div>' +
                    '</div>' +
                    '<div class="cat-name">' + c.name + '</div>' +
                    '<div class="cat-tasks"><b>' + c.completedTasks + '</b> / ' + c.totalTasks + ' 任務完成</div>' +
                '</div>' +
                '<div class="cat-foot">' +
                    '<div class="cat-bar"><div class="f" style="background:linear-gradient(90deg,' + col + '99,' + col + ')"></div></div>' +
                    '<span class="cat-tag ' + deltaCls + '">' + ICON[st.k] + sign + d + '</span>' +
                '</div>';
            host.appendChild(el);

            setTimeout(function() {
                var f = el.querySelector('.cat-bar .f');
                if (f) f.style.width = c.progress + '%';
            }, 150 + i * 60);
        });

        attachNav(host.querySelectorAll('.cat'));
    }

    /** 實際進度 vs 整體平均 對比條 */
    function buildCompare(categories, overall) {
        var host = document.getElementById('crows');
        if (!host) return;
        host.innerHTML = '';

        categories.forEach(function(c, i) {
            var st = statusOf(c.progress, overall);
            var col = colorAt(i);
            var d = c.progress - overall;
            var sign = d > 0 ? '+' : '';
            var deltaCls = st.k === 'ahead' ? 'delta-ahead' : st.k === 'behind' ? 'delta-behind' : 'delta-on';

            var row = document.createElement('div');
            row.className = 'crow';
            row.innerHTML =
                '<div class="label"><span class="sw" style="background:' + col + '"></span>' +
                    '<div><div>' + c.name + '</div><div class="si">STAGE ' + (i + 1) + '</div></div></div>' +
                '<div class="ctrack">' +
                    '<div class="grid"></div>' +
                    '<div class="bar" style="background:linear-gradient(90deg,' + col + 'cc,' + col + ')"></div>' +
                    '<div class="base" data-label="平均" style="left:' + overall + '%"></div>' +
                '</div>' +
                '<div class="right">' +
                    '<div class="pv">' + c.progress + '%</div>' +
                    '<div class="dv ' + deltaCls + '">' + sign + d + ' pts · ' + st.label + '</div>' +
                '</div>';
            host.appendChild(row);

            setTimeout(function() {
                var bar = row.querySelector('.bar');
                if (bar) bar.style.width = c.progress + '%';
            }, 180 + i * 70);
        });
    }

    function buildFootNote(data) {
        var el = document.getElementById('footNote');
        if (!el) return;
        var stats = DataLoader.getProjectStats(data);
        var now = new Date();
        var ts = now.getFullYear() + '/' +
            String(now.getMonth() + 1).padStart(2, '0') + '/' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0');
        el.innerHTML = '資料更新於 <b>' + ts + '</b>　·　共 <b>' + stats.totalCategories +
            '</b> 個階段　·　整體 <b>' + stats.totalTasks + '</b> 項任務　·　進度依各階段相對整體平均比較';
    }

    /** 點擊節點 / 卡片 → 對應 group 頁 */
    function attachNav(nodes) {
        nodes.forEach(function(node) {
            node.style.cursor = 'pointer';
            node.addEventListener('click', function() {
                var id = parseInt(node.dataset.categoryId, 10);
                if (id >= 1 && id <= 5) {
                    window.location.href = 'page/group' + id + '.html';
                }
            });
        });
    }

    /** 數字滾動動畫 */
    function animateNumber(element, target, duration) {
        if (!element) return;
        duration = duration || 1200;
        var steps = 60;
        var current = 0;
        var inc = target / steps;
        var stepDur = duration / steps;
        var timer = setInterval(function() {
            current += inc;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            element.textContent = Math.round(current);
        }, stepDur);
    }

    return { init: initializeDashboard };
})();

document.addEventListener('DOMContentLoaded', function() {
    IndexPage.init();
});
