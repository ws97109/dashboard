/**
 * 資料載入工具
 */

var DataLoader = (function() {
    'use strict';
    
    var DASHBOARD_PATH = '/eServiceA/dashboard/api/v2/dashboard/index';
    var CATEGORY_COLORS = {
        1: '#ef4444',
        2: '#22c55e',
        3: '#eab308',
        4: '#84cc16',
        5: '#f97316'
    };
    
    /**
     * 從 JSON 檔案載入專案資料 TSBDashboard
     */
    function loadProjectData(jsonPath, callback) {
        if (typeof jsonPath === 'function') {
            callback = jsonPath;
            jsonPath = null;
        }

        jsonPath = jsonPath || DASHBOARD_PATH;
        
        window.authFetch(jsonPath)
            .then(function(response) {
                return response.json();
            })
            .then(function(data) {
                if (data.categories) {
                    data.categories.forEach(function(category) {
                        if (!category.color && CATEGORY_COLORS[category.id]) {
                            category.color = CATEGORY_COLORS[category.id];
                        }
                        if (!category.color) {
                            category.color = '#6b7280';
                        }
                    });
                }
                if (callback) callback(null, data);
            })
            .catch(function(error) {                
                if (callback) callback(error, null);
            });
    }

    /**
     * 計算單個類別的進度(新資料結構:包含 groups)
     */
    function calculateCategoryProgress(category) {
        if (!category.groups || category.groups.length === 0) {
            category.progress = 0;
            return;
        }

        var totalTasks = 0;
        var completedTasks = 0;

        category.groups.forEach(function(group) {
            if (group.tasks && group.tasks.length > 0) {
                totalTasks += group.tasks.length;
                completedTasks += group.tasks.filter(function(task) {
                    return task.completed;
                }).length;
            }
        });

        if (totalTasks === 0) {
            category.progress = 0;
        } else {
            category.progress = Math.round((completedTasks / totalTasks) * 100);
        }

        category.totalTasks = totalTasks;
        category.completedTasks = completedTasks;
    }

    /**
     * 計算整體進度
     */
    function calculateOverallProgress(data) {
        if (!data.categories || data.categories.length === 0) {
            data.overallProgress = 0;
            return;
        }

        var totalProgress = data.categories.reduce(function(sum, category) {
            return sum + category.progress;
        }, 0);
        data.overallProgress = Math.round(totalProgress / data.categories.length);
    }

    /**
     * 計算單個 group 的進度
     */
    function calculateGroupProgress(group) {
        if (!group.tasks || group.tasks.length === 0) {
            group.progress = 0;
            return;
        }

        var totalTasks = group.tasks.length;
        var completedTasks = group.tasks.filter(function(task) {
            return task.completed;
        }).length;

        group.progress = Math.round((completedTasks / totalTasks) * 100);
        group.totalTasks = totalTasks;
        group.completedTasks = completedTasks;
    }

    /**
     * 獲取類別中的所有任務(扁平化)
     */
    function getFlattenedTasks(category) {
        var tasks = [];
        if (category.groups) {
            category.groups.forEach(function(group) {
                if (group.tasks) {
                    tasks = tasks.concat(group.tasks);
                }
            });
        }
        return tasks;
    }

    /**
     * 獲取專案統計資訊
     */
    function getProjectStats(data) {
        var stats = {
            totalCategories: data.categories.length,
            totalGroups: 0,
            totalTasks: 0,
            completedTasks: 0,
            overallProgress: data.overallProgress || 0
        };

        data.categories.forEach(function(category) {
            if (category.groups) {
                stats.totalGroups += category.groups.length;
                stats.totalTasks += category.totalTasks || 0;
                stats.completedTasks += category.completedTasks || 0;
            }
        });

        return stats;
    }

    return {
        loadProjectData: loadProjectData,
        calculateCategoryProgress: calculateCategoryProgress,
        calculateOverallProgress: calculateOverallProgress,
        calculateGroupProgress: calculateGroupProgress,
        getFlattenedTasks: getFlattenedTasks,
        getProjectStats: getProjectStats
    };
})();