/**
 * 首頁視覺化圖表
 */

var ChartVisualizer = (function() {
    'use strict';

    var categoryAngles = [];
    var currentHoveredId = null;

    // 雙層圓餅圖：進場動畫一次性旗標（之後 hover/leave/resize 皆同步繪製）
    var introDone = false;
    var introRaf = null;

    // 外圈光澤鏡面色帶：紅→橘極光漸層（以多段短弧模擬 conic gradient）
    var AURORA_STOPS = ['#ef4444', '#dc2626', '#f97316', '#991b1b'];
    function lerpHex(a, b, t) {
        var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
        var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
        return 'rgb(' + Math.round(ar + (br - ar) * t) + ',' + Math.round(ag + (bg - ag) * t) + ',' + Math.round(ab + (bb - ab) * t) + ')';
    }
    function auroraAt(p) {
        p = Math.max(0, Math.min(1, p));
        var seg = p * (AURORA_STOPS.length - 1), i = Math.floor(seg);
        if (i >= AURORA_STOPS.length - 1) return AURORA_STOPS[AURORA_STOPS.length - 1];
        return lerpHex(AURORA_STOPS[i], AURORA_STOPS[i + 1], seg - i);
    }

    /**
     * 繪製雙層圓餅圖（液態玻璃儀表風格）
     * 簽名、categoryAngles[] 結構、內外半徑皆維持不變，detectPieChartHover 不需更動。
     */
    function drawDoublePieChart(overallProgress, categories, highlightId) {
        highlightId = highlightId || null;
        var canvas = document.getElementById('pieChartCanvas');
        if (!canvas) return;

        // 首次閒置繪製 → 一次性緩入進場動畫
        if (highlightId === null && !introDone) {
            introDone = true;
            var startTs = null, DUR = 900;
            if (introRaf) cancelAnimationFrame(introRaf);
            var step = function(ts) {
                if (startTs === null) startTs = ts;
                var t = Math.min(1, (ts - startTs) / DUR);
                var e = 1 - Math.pow(1 - t, 3); // easeOutCubic
                renderDonut(canvas, overallProgress, categories, null, e);
                if (t < 1) introRaf = requestAnimationFrame(step);
                else introRaf = null;
            };
            step(typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
            return;
        }

        // 任何 hover / leave / highlight / resize 重繪：取消進行中的進場動畫，同步繪製
        if (introRaf) { cancelAnimationFrame(introRaf); introRaf = null; }
        renderDonut(canvas, overallProgress, categories, highlightId, 1);
    }

    function renderDonut(canvas, overallProgress, categories, highlightId, factor) {
        var ctx = canvas.getContext('2d');
        var cx = canvas.width / 2, cy = canvas.height / 2;
        var outerR = 180, outerW = 35, innerR = 120, innerW = 30; // 不變 → hover 命中幾何有效
        var TAU = Math.PI * 2, TOP = -Math.PI / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // (0) 中央霧面玻璃圓盤（位於 HTML 百分比文字之後，讓數字浮在玻璃上）
        var disc = ctx.createRadialGradient(cx, cy - 14, 4, cx, cy, innerR - innerW);
        disc.addColorStop(0, 'rgba(255,255,255,0.85)');
        disc.addColorStop(1, 'rgba(248,250,252,0.35)');
        ctx.save();
        ctx.shadowColor = 'rgba(220,38,38,0.10)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 6;
        ctx.beginPath(); ctx.arc(cx, cy, innerR - innerW + 6, 0, TAU);
        ctx.fillStyle = disc; ctx.fill();
        ctx.restore();

        // 內凹磨砂玻璃軌道（三層描邊製造凹槽內陰影）
        function glassTrack(r, w) {
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2, 0, TAU);
            ctx.lineWidth = w; ctx.strokeStyle = 'rgba(148,163,184,0.16)'; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2 - w * 0.28, 0, TAU);
            ctx.lineWidth = w * 0.42; ctx.strokeStyle = 'rgba(15,23,42,0.10)'; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2 + w * 0.30, 0, TAU);
            ctx.lineWidth = w * 0.20; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
        }
        // 浮起的光澤色弧 + 立體斜角 + 光暈（內圈分段使用）
        function glassArc(r, w, a0, a1, base, glowColor, glowBlur, lift) {
            if (glowBlur) { ctx.save(); ctx.shadowColor = glowColor; ctx.shadowBlur = glowBlur; ctx.shadowOffsetY = 4; }
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2, a0, a1);
            ctx.lineWidth = w + (lift || 0); ctx.lineCap = 'butt'; ctx.strokeStyle = base; ctx.stroke();
            if (glowBlur) ctx.restore();
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2 + w * 0.26, a0, a1); // 外緣亮面
            ctx.lineWidth = w * 0.22; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, r - w / 2 - w * 0.30, a0, a1); // 內緣暗面
            ctx.lineWidth = w * 0.18; ctx.strokeStyle = 'rgba(2,6,23,0.18)'; ctx.stroke();
        }

        // (1) 外圈：玻璃軌道 + 綠色圓拱進度弧
        glassTrack(outerR, outerW);
        var sweep = (overallProgress / 100) * TAU * factor;
        var rArc = outerR - outerW / 2;
        var g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        g.addColorStop(0, '#10b981'); g.addColorStop(1, '#059669');
        ctx.save();
        ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(16,185,129,0.45)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
        ctx.beginPath(); ctx.arc(cx, cy, rArc, TOP, TOP + sweep);
        ctx.lineWidth = outerW; ctx.strokeStyle = g; ctx.stroke();
        ctx.restore();

        // (1b) 綠弧上的極光鏡面色帶（紅→橘多段短弧，低透明度，作為品牌暖光反光）
        var STEPS = 90, rRim = rArc + outerW * 0.24, wRim = outerW * 0.16;
        ctx.lineCap = 'round';
        for (var s = 0; s < STEPS; s++) {
            var p0 = s / STEPS, p1 = (s + 1) / STEPS;
            if (p0 >= 1) break;
            var col = auroraAt(p0);
            ctx.beginPath();
            ctx.arc(cx, cy, rRim, TOP + p0 * sweep, TOP + Math.min(p1, 1) * sweep);
            ctx.lineWidth = wRim;
            ctx.strokeStyle = col.replace('rgb(', 'rgba(').replace(')', ',0.5)');
            ctx.stroke();
        }

        // (1c) 進度前緣的發光點
        var tip = TOP + sweep, tx = cx + rArc * Math.cos(tip), ty = cy + rArc * Math.sin(tip);
        var rg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 22);
        rg.addColorStop(0, 'rgba(255,255,255,0.95)');
        rg.addColorStop(0.4, 'rgba(220,38,38,0.9)');
        rg.addColorStop(1, 'rgba(220,38,38,0)');
        ctx.beginPath(); ctx.fillStyle = rg; ctx.arc(tx, ty, 22, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = '#ffffff'; ctx.arc(tx, ty, 3, 0, TAU); ctx.fill();

        // (2) 內圈：玻璃軌道 + 各類別的光澤浮起色弧
        glassTrack(innerR, innerW);
        var total = categories.reduce(function(sum, c) { return sum + c.progress; }, 0) || 1;
        categoryAngles = []; // 同一個陣列、同一種結構（hover 命中依賴它）
        var startA = TOP, GAP = 0.018;
        categories.forEach(function(category) {
            var ratio = category.progress / total;
            var span = ratio * (overallProgress / 100) * TAU; // 完整角度（與 factor 無關）
            var endA = startA + span;
            categoryAngles.push({ // 命中測試使用最終完整角度
                id: category.id,
                name: category.name,
                progress: category.progress,
                color: category.color,
                startAngle: startA,
                endAngle: endA
            });
            var drawEnd = startA + span * factor; // 僅動畫繪製範圍
            var a0 = startA + GAP / 2, a1 = Math.max(a0, drawEnd - GAP / 2);
            var isHi = (highlightId !== null && highlightId === category.id);
            var isDim = (highlightId !== null && highlightId !== category.id);
            if (isDim) {
                ctx.beginPath(); ctx.arc(cx, cy, innerR - innerW / 2, a0, a1);
                ctx.lineWidth = innerW; ctx.lineCap = 'butt';
                ctx.strokeStyle = CommonUtils.hexToRGBA(category.color, 0.22); ctx.stroke();
            } else if (isHi) {
                glassArc(innerR, innerW, a0, a1, category.color, 'rgba(245,158,11,0.55)', 22, 4);
            } else {
                glassArc(innerR, innerW, a0, a1, category.color, CommonUtils.hexToRGBA(category.color, 0.40), 10, 0);
            }
            startA = endA;
        });
    }

    /**
     * 繪製進度箭頭圖（霧面玻璃階段條）
     */
    function drawProgressArrows(categories) {
        var container = document.getElementById('arrowContainer');
        if (!container) return;

        container.innerHTML = '';

        categories.forEach(function(category, index) {
            var arrowItem = document.createElement('div');
            arrowItem.className = 'arrow-item';
            arrowItem.dataset.categoryId = category.id;
            arrowItem.style.setProperty('--cat', category.color);
            arrowItem.style.setProperty('--cat-soft', CommonUtils.hexToRGBA(category.color, 0.85));
            arrowItem.style.setProperty('--cat-faint', CommonUtils.hexToRGBA(category.color, 0.18));
            arrowItem.style.setProperty('--cat-fill', CommonUtils.hexToRGBA(category.color, 0.34));
            arrowItem.style.setProperty('--i', index);

            arrowItem.innerHTML =
                '<div class="arrow-shape">' +
                '<div class="arrow-fill" style="width: 0%;"></div>' +
                '<div class="arrow-gloss"></div>' +
                '<div class="arrow-content">' +
                '<div class="arrow-step">' + (index + 1) + '</div>' +
                '<div class="arrow-name">' + category.name + '</div>' +
                '<div class="arrow-percentage" id="arrowPct' + category.id + '" style="color: ' + category.color + ';">0%</div>' +
                '</div>' +
                '</div>';

            container.appendChild(arrowItem);

            setTimeout(function() {
                var fill = arrowItem.querySelector('.arrow-fill');
                fill.style.width = category.progress + '%';
                // 傳入 id 字串（utils 的 animatePercentage 以 getElementById 查找），讓數字真正跳動
                CommonUtils.animatePercentage('arrowPct' + category.id, category.progress);
            }, 100 * (index + 1) + 300);
        });
    }

    /**
     * 檢測滑鼠在圓餅圖上的位置
     */
    function detectPieChartHover(mouseX, mouseY, canvas) {
        var centerX = canvas.width / 2;
        var centerY = canvas.height / 2;
        var dx = mouseX - centerX;
        var dy = mouseY - centerY;
        var distance = Math.sqrt(dx * dx + dy * dy);
        var mouseAngle = Math.atan2(dy, dx);
        var innerRadius = 120;
        var innerStrokeWidth = 30;
        var hoverRadius = 5;

        if (distance >= innerRadius - innerStrokeWidth / 2 - hoverRadius &&
            distance <= innerRadius + innerStrokeWidth / 2 + hoverRadius) {

            for (var i = 0; i < categoryAngles.length; i++) {
                var cat = categoryAngles[i];
                var startAngle = cat.startAngle;
                var endAngle = cat.endAngle;
                var normalizedStart = startAngle < 0 ? startAngle + 2 * Math.PI : startAngle;
                var normalizedEnd = endAngle < 0 ? endAngle + 2 * Math.PI : endAngle;
                var normalizedMouse = mouseAngle < 0 ? mouseAngle + 2 * Math.PI : mouseAngle;

                if (normalizedStart <= normalizedEnd) {
                    if (normalizedMouse >= normalizedStart && normalizedMouse <= normalizedEnd) {
                        return cat;
                    }
                } else {
                    if (normalizedMouse >= normalizedStart || normalizedMouse <= normalizedEnd) {
                        return cat;
                    }
                }
            }
        }
        return null;
    }

    function getCurrentHoveredId() {
        return currentHoveredId;
    }

    function setCurrentHoveredId(id) {
        currentHoveredId = id;
    }

    function getCategoryAngles() {
        return categoryAngles;
    }

    return {
        drawDoublePieChart: drawDoublePieChart,
        drawProgressArrows: drawProgressArrows,
        detectPieChartHover: detectPieChartHover,
        getCurrentHoveredId: getCurrentHoveredId,
        setCurrentHoveredId: setCurrentHoveredId,
        getCategoryAngles: getCategoryAngles
    };
})();
