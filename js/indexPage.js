var IndexPage = (function() {
    'use strict';
    
    var PROJECT_DATA = null;
    var selectedCategoryId = null;

    function initializeDashboard() {
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

            ChartVisualizer.drawDoublePieChart(data.overallProgress, data.categories);
            drawProgressCards(data.categories);
            ChartVisualizer.drawProgressArrows(data.categories);
            generateLegend(data.categories);
            setupInteractions(data.categories);
            CommonUtils.animatePercentage('overallPercentage', data.overallProgress);
            displayProjectStats(data);
        });
    }

    function displayProjectStats(data) {
        var stats = DataLoader.getProjectStats(data);
        console.log('專案統計:', stats);
    }

    function updateCenterDisplay(progress, label) {
        var percentageElement = document.getElementById('overallPercentage');
        var labelElement = document.querySelector('.pie-chart__label');
        
        if (percentageElement) {
            percentageElement.textContent = progress + '%';
        }
        if (labelElement) {
            labelElement.textContent = label;
        }
    }

    function generateLegend(categories) {
        var legendContainer = document.getElementById('chartLegend');
        legendContainer.innerHTML = '';

        categories.forEach(function(category) {
            var legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            legendItem.dataset.categoryId = category.id;
            
            var taskInfo = '';
            if (category.totalTasks !== undefined) {
                taskInfo = '<div class="legend-item__stats">' + 
                    '</div>';
            }
            
            legendItem.innerHTML = 
                '<div class="legend-item__color" style="background: ' + category.color + ';"></div>' +
                '<div class="legend-item__text">' +
                '<div class="legend-item__name">' + category.name + '</div>' +
                taskInfo +
                '</div>';
            
            legendContainer.appendChild(legendItem);
        });
    }

    function drawProgressCards(categories) {
        var container = document.getElementById('barChart');
        container.innerHTML = '';

        categories.forEach(function(category, index) {
            var barItem = document.createElement('div');
            barItem.className = 'bar-item';
            barItem.dataset.categoryId = category.id;
            barItem.style.setProperty('--color', category.color);
            
            var tasksInfo = '';
            if (category.totalTasks) {
                tasksInfo = '<div class="bar-item__details">' + 
                    '<span>' + category.completedTasks + '/' + category.totalTasks + ' 任務</span>' +
                    '</div>';
            }
            
            barItem.innerHTML = 
                '<div class="bar-item__icon" style="background: ' + category.color + ';">' +
                '<svg width="20" height="20" fill="white" viewBox="0 0 20 20">' +
                '<path d="M10 2L2 7v6l8 5 8-5V7l-8-5z"/>' +
                '</svg>' +
                '</div>' +
                '<div class="bar-item__header">' +
                '<div class="bar-item__name">' + category.name + '</div>' +
                '<div class="bar-item__percentage" style="color: ' + category.color + ';">' + category.progress + '%</div>' +
                '</div>' +
                tasksInfo +
                '<div class="bar-item__track">' +
                '<div class="bar-item__fill" style="width: 0%; background: ' + category.color + ';"></div>' +
                '</div>';
            
            container.appendChild(barItem);

            setTimeout(function() {
                var fill = barItem.querySelector('.bar-item__fill');
                fill.style.width = category.progress + '%';
            }, 100 * (index + 1) + 200);
        });
    }

    function setupInteractions(categories) {
        var canvas = document.getElementById('pieChartCanvas');
        var tooltip = document.getElementById('tooltip');

        canvas.addEventListener('mousemove', function(e) {
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            var hoveredCategory = ChartVisualizer.detectPieChartHover(x, y, canvas);
            
            if (hoveredCategory) {
                canvas.style.cursor = 'pointer';
                updateCenterDisplay(hoveredCategory.progress, hoveredCategory.name);
                
                if (ChartVisualizer.getCurrentHoveredId() !== hoveredCategory.id) {
                    ChartVisualizer.setCurrentHoveredId(hoveredCategory.id);
                    ChartVisualizer.drawDoublePieChart(PROJECT_DATA.overallProgress, PROJECT_DATA.categories, hoveredCategory.id);
                }
                
                var tooltipText = hoveredCategory.name + ': ' + hoveredCategory.progress + '%';
                if (hoveredCategory.totalTasks) {
                    tooltipText += ' (' + hoveredCategory.completedTasks + '/' + hoveredCategory.totalTasks + ' 任務)';
                }
                tooltip.textContent = tooltipText;
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
                tooltip.classList.add('show');
            } else {
                resetHoverState();
            }
        });

        canvas.addEventListener('mouseleave', function() {
            resetHoverState();
        });

        function resetHoverState() {
            if (ChartVisualizer.getCurrentHoveredId() !== null) {
                ChartVisualizer.setCurrentHoveredId(null);
                canvas.style.cursor = 'default';
                tooltip.classList.remove('show');
                updateCenterDisplay(PROJECT_DATA.overallProgress, '整體完成度');
                ChartVisualizer.drawDoublePieChart(PROJECT_DATA.overallProgress, PROJECT_DATA.categories);
            }
        }

        canvas.addEventListener('click', function(e) {
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            var clickedCategory = ChartVisualizer.detectPieChartHover(x, y, canvas);
            
            // if (clickedCategory) {
            //     navigateToCategory(clickedCategory.id, clickedCategory.name);
            // }
        });

        var barItems = document.querySelectorAll('.bar-item');
        barItems.forEach(function(item) {
            item.addEventListener('click', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                var category = categories.find(function(c) {
                    return c.id === categoryId;
                });
                navigateToCategory(categoryId, category.name);
            });

            item.addEventListener('mouseenter', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                highlightCategory(categoryId);
            });

            item.addEventListener('mouseleave', function() {
                unhighlightCategory();
            });
        });

        var arrowItems = document.querySelectorAll('.arrow-item');
        arrowItems.forEach(function(item) {
            item.addEventListener('click', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                var category = categories.find(function(c) {
                    return c.id === categoryId;
                });
                // navigateToCategory(categoryId, category.name);
            });

            item.addEventListener('mouseenter', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                highlightCategory(categoryId);
            });

            item.addEventListener('mouseleave', function() {
                unhighlightCategory();
            });
        });

        var legendItems = document.querySelectorAll('.legend-item');
        legendItems.forEach(function(item) {
            item.addEventListener('click', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                var category = categories.find(function(c) {
                    return c.id === categoryId;
                });
            });

            item.addEventListener('mouseenter', function() {
                var categoryId = parseInt(item.dataset.categoryId);
                highlightCategory(categoryId);
            });

            item.addEventListener('mouseleave', function() {
                unhighlightCategory();
            });
        });
    }

    function navigateToCategory(categoryId, categoryName) {
        console.log('導航到:' + categoryName + ' (ID: ' + categoryId + ')');
        if (categoryId === 1) {
            window.location.href = 'page/group1.html';
        }
        if (categoryId === 2) {
            window.location.href = 'page/group2.html';
        }
        if (categoryId === 3) {
            window.location.href = 'page/group3.html';
        }
        if (categoryId === 4) {
            window.location.href = 'page/group4.html';
        }
        if (categoryId === 5) {
            window.location.href = 'page/group5.html';
        }
    }

    function highlightCategory(categoryId) {
        selectedCategoryId = categoryId;
        var category = PROJECT_DATA.categories.find(function(c) {
            return c.id === categoryId;
        });
        
        if (category) {
            updateCenterDisplay(category.progress, category.name);
            ChartVisualizer.drawDoublePieChart(PROJECT_DATA.overallProgress, PROJECT_DATA.categories, categoryId);
            
            document.querySelectorAll('.bar-item').forEach(function(item) {
                if (parseInt(item.dataset.categoryId) === categoryId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            document.querySelectorAll('.arrow-item').forEach(function(item) {
                if (parseInt(item.dataset.categoryId) === categoryId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            document.querySelectorAll('.legend-item').forEach(function(item) {
                if (parseInt(item.dataset.categoryId) === categoryId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
    }

    function unhighlightCategory() {
        selectedCategoryId = null;
        updateCenterDisplay(PROJECT_DATA.overallProgress, '整體完成度');
        ChartVisualizer.drawDoublePieChart(PROJECT_DATA.overallProgress, PROJECT_DATA.categories);
        
        document.querySelectorAll('.bar-item').forEach(function(item) {
            item.classList.remove('active');
        });

        document.querySelectorAll('.arrow-item').forEach(function(item) {
            item.classList.remove('active');
        });

        document.querySelectorAll('.legend-item').forEach(function(item) {
            item.classList.remove('active');
        });
    }

    function handleResize() {
        if (PROJECT_DATA) {
            ChartVisualizer.drawDoublePieChart(
                PROJECT_DATA.overallProgress, 
                PROJECT_DATA.categories, 
                ChartVisualizer.getCurrentHoveredId()
            );
        }
    }

    return {
        init: initializeDashboard,
        handleResize: handleResize
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    IndexPage.init();
});

window.addEventListener('resize', IndexPage.handleResize);