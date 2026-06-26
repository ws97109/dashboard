/**
 * 首頁視覺化圖表
 */

var ChartVisualizer = (function() {
    'use strict';

    var categoryAngles = [];
    var currentHoveredId = null;

    /**
     * 繪製雙層圓餅圖
     */
    function drawDoublePieChart(overallProgress, categories, highlightId) {
        highlightId = highlightId || null;
        var canvas = document.getElementById('pieChartCanvas');
        if (!canvas) return;
        
        var ctx = canvas.getContext('2d');
        var centerX = canvas.width / 2;
        var centerY = canvas.height / 2;

        var outerRadius = 180;
        var outerStrokeWidth = 35;
        var innerRadius = 120;
        var innerStrokeWidth = 30;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 外圈背景
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerRadius - outerStrokeWidth / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = outerStrokeWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // 外圈進度（含發光效果）
        var outerGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        outerGradient.addColorStop(0, '#34d399');
        outerGradient.addColorStop(0.5, '#10b981');
        outerGradient.addColorStop(1, '#047857');

        ctx.save();
        ctx.shadowColor = 'rgba(16, 185, 129, 0.55)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(
            centerX,
            centerY,
            outerRadius - outerStrokeWidth / 2,
            -Math.PI / 2,
            -Math.PI / 2 + (overallProgress / 100) * 2 * Math.PI
        );
        ctx.strokeStyle = outerGradient;
        ctx.lineWidth = outerStrokeWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
        
        // 內圈背景
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius - innerStrokeWidth / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = '#f3f4f6';
        ctx.lineWidth = innerStrokeWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        var totalProgress = categories.reduce(function(sum, cat) {
            return sum + cat.progress;
        }, 0);
        categoryAngles = [];
        
        var startAngle = -Math.PI / 2;
        var accumulatedProgress = 0;
        
        categories.forEach(function(category) {
            var progressRatio = category.progress / totalProgress;
            var angleSpan = progressRatio * overallProgress / 100 * 2 * Math.PI;
            var endAngle = startAngle + angleSpan;

            categoryAngles.push({
                id: category.id,
                name: category.name,
                progress: category.progress,
                color: category.color,
                startAngle: startAngle,
                endAngle: endAngle
            });

            var isHighlighted = (highlightId !== null && highlightId === category.id);
            var isDimmed = (highlightId !== null && highlightId !== category.id);

            if (isDimmed) {
                ctx.beginPath();
                ctx.arc(
                    centerX,
                    centerY,
                    innerRadius - innerStrokeWidth / 2,
                    startAngle,
                    endAngle
                );
                ctx.strokeStyle = CommonUtils.hexToRGBA(category.color, 0.3);
                ctx.lineWidth = innerStrokeWidth;
                ctx.lineCap = 'butt';
                ctx.stroke();
            } else if (isHighlighted) {
                ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 5;
                ctx.beginPath();
                ctx.arc(
                    centerX,
                    centerY,
                    innerRadius - innerStrokeWidth / 2 + 2,
                    startAngle,
                    endAngle
                );
                ctx.strokeStyle = category.color;
                ctx.lineWidth = innerStrokeWidth + 4;
                ctx.lineCap = 'butt';
                ctx.stroke();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            } else {
                ctx.beginPath();
                ctx.arc(
                    centerX,
                    centerY,
                    innerRadius - innerStrokeWidth / 2,
                    startAngle,
                    endAngle
                );
                ctx.strokeStyle = category.color;
                ctx.lineWidth = innerStrokeWidth;
                ctx.lineCap = 'butt';
                ctx.stroke();
            }

            startAngle = endAngle;
        });
    }

    /**
     * 繪製進度箭頭圖
     */
    function drawProgressArrows(categories) {
        var container = document.getElementById('arrowContainer');
        if (!container) return;
        
        container.innerHTML = '';

        categories.forEach(function(category, index) {
            var arrowItem = document.createElement('div');
            arrowItem.className = 'arrow-item';
            arrowItem.dataset.categoryId = category.id;
        
            var c = category.color;
            var fillGradient = 'linear-gradient(180deg, ' +
                CommonUtils.hexToRGBA(c, 0.42) + ' 0%, ' +
                CommonUtils.hexToRGBA(c, 0.18) + ' 100%)';

            arrowItem.innerHTML =
                '<div class="arrow-shape" style="--arrow-color:' + c + ';">' +
                '<div class="arrow-fill" style="width: 0%; background: ' + fillGradient + ';"></div>' +
                '<div class="arrow-content">' +
                '<div class="arrow-name">' + category.name + '</div>' +
                '<div class="arrow-percentage" style="color: ' + category.color + ';">' + category.progress + '%' +'</div>' +
                '</div>' +
                '</div>';
            
            container.appendChild(arrowItem);

            setTimeout(function() {
                var fill = arrowItem.querySelector('.arrow-fill');
                var percentage = arrowItem.querySelector('.arrow-percentage');
                fill.style.width = category.progress + '%';
                CommonUtils.animatePercentage(percentage, category.progress);
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