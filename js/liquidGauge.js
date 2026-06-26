/**
 * 液體計量器視覺化
 * p1 頁面專用
 */

var LiquidGauge = (function() {
    'use strict';

    /**
     * 創建刻度標記
     */
    function createGaugeMarks() {
        var marksContainer = document.getElementById('gaugeMarks');
        if (!marksContainer) return;
        
        marksContainer.innerHTML = '';
        
        for (var i = 0; i < 12; i++) {
            var mark = document.createElement('div');
            mark.className = i % 3 === 0 ? 'gauge-mark major' : 'gauge-mark';
            var angle = (i * 30) - 90;
            mark.style.transform = 'rotate(' + angle + 'deg)';
            marksContainer.appendChild(mark);
        }
    }

    /**
     * 更新液體計量器
     */
    function updateLiquidGauge(percentage) {
        var svg = document.getElementById('liquidWaveSvg');
        var liquidPercentage = document.getElementById('liquidPercentage');
        var wave1 = document.getElementById('wave1');
        var wave2 = document.getElementById('wave2');
        
        if (!svg || !liquidPercentage || !wave1 || !wave2) return;
        
        svg.style.height = percentage + '%';
        liquidPercentage.textContent = percentage + '%';
        
        var surfaceY = 20;
        var amplitude = 15;
        
        var wave1Animate = wave1.querySelector('animate');
        if (wave1Animate) {
            wave1Animate.setAttribute('values',
                'M0,' + surfaceY + ' Q70,' + (surfaceY-amplitude) + ' 140,' + surfaceY + ' T280,' + surfaceY + ' L280,280 L0,280 Z;' +
                'M0,' + surfaceY + ' Q70,' + (surfaceY+amplitude) + ' 140,' + surfaceY + ' T280,' + surfaceY + ' L280,280 L0,280 Z;' +
                'M0,' + surfaceY + ' Q70,' + (surfaceY-amplitude) + ' 140,' + surfaceY + ' T280,' + surfaceY + ' L280,280 L0,280 Z'
            );
        }
        
        var wave2Animate = wave2.querySelector('animate');
        if (wave2Animate) {
            var y2 = surfaceY + 8;
            wave2Animate.setAttribute('values',
                'M0,' + y2 + ' Q70,' + (y2-amplitude) + ' 140,' + y2 + ' T280,' + y2 + ' L280,280 L0,280 Z;' +
                'M0,' + y2 + ' Q70,' + (y2+amplitude) + ' 140,' + y2 + ' T280,' + y2 + ' L280,280 L0,280 Z;' +
                'M0,' + y2 + ' Q70,' + (y2-amplitude) + ' 140,' + y2 + ' T280,' + y2 + ' L280,280 L0,280 Z'
            );
        }
        
        if (percentage >= 100) {
            wave1.setAttribute('fill', 'url(#greenGradient)');
            wave2.setAttribute('fill', 'url(#greenGradient)');
            liquidPercentage.classList.add('completed');
        } else {
            wave1.setAttribute('fill', 'url(#waveGradient)');
            wave2.setAttribute('fill', 'url(#waveGradient)');
            liquidPercentage.classList.remove('completed');
        }
    }

    return {
        createGaugeMarks: createGaugeMarks,
        updateLiquidGauge: updateLiquidGauge
    };
})();
