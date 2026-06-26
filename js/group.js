// js/group.js
var GroupPage = (function() {
    'use strict';
    
    var allGroups = [];
    var selectedCompany = null;
    var selectedTaskType = 'all';
    var script = document.currentScript;
    var groupPage = script?.dataset?.grouppage;

    function loadData() {
        DataLoader.loadProjectData(function(err, data) {
            if (err) return;
            
            var category = data.categories.find(function(cat) { return cat.id == groupPage; });
            if (category) {
                allGroups = category.groups || [];
                updateStats();
                renderCompanyCards();
            }
        });
    }

    function setTaskType(taskType) {
        selectedTaskType = taskType;
        selectedCompany = null;
        
        document.getElementById('taskTypeBtn0').classList.toggle('active', taskType === 'all');
        document.getElementById('taskTypeBtn1').classList.toggle('active', taskType === '資料轉置');
        document.getElementById('taskTypeBtn2').classList.toggle('active', taskType === '系統切轉');
        
        updateStats();
        renderCompanyCards();
        document.getElementById('groupSection').style.display = 'none';
    }

    function getFilteredTasks() {
        var allTasks = [];
        allGroups.forEach(function(group) {
            if (group.tasks) {
                var filteredTasks = selectedTaskType === 'all' ? 
                    group.tasks : 
                    group.tasks.filter(function(t) { return t.task === selectedTaskType; });
                allTasks = allTasks.concat(filteredTasks);
            }
        });
        return allTasks;
    }

    function updateStats() {
        var allTasks = getFilteredTasks();

        var completed = allTasks.filter(function(t) { return t.completed; }).length;
        var total = allTasks.length;
        var percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var overdue = allTasks.filter(function(t) { 
            if (t.completed) return false;
            var expectedDate = new Date(t.expectedCompletion);
            expectedDate.setHours(0, 0, 0, 0);
            return expectedDate < today;
        }).length;

        var importantTasks     = allTasks.filter(function(t) { return t.isImportant === 1; });
        var importantCompleted = importantTasks.filter(function(t) { return t.completed; }).length;
        var importantTotal     = importantTasks.length;
        var importantPct       = importantTotal > 0 ? Math.round((importantCompleted / importantTotal) * 100) : 0;

        var importantCardHTML = '';
        if (importantTotal > 0) {
            var importantUrl = '../page/important-tasks.html?groupPage=' + encodeURIComponent(groupPage || '');
            importantCardHTML =
                '<a href="' + importantUrl + '" class="stat-card stat-card--important" title="查看重要任務詳細列表">' +
                '<div class="stat-card__important-badge">⭐ 重要任務</div>' +
                '<div class="stat-card__value stat-card__value--important">' + importantPct + '%</div>' +
                '<div class="stat-card__label">' + importantCompleted + ' / ' + importantTotal + ' 已完成</div>' +
                '</a>';
        }

        var statsContainer = document.getElementById('progressSummaryStats');
        statsContainer.innerHTML =
            importantCardHTML +
            '<div class="stat-card">' +
            '<div class="stat-card__value">' + percentage + '%</div>' +
            '<div class="stat-card__label">整體完成度</div>' +
            '</div>' +
            '<div class="stat-card">' +
            '<div class="stat-card__value">' + completed + '/' + total + '</div>' +
            '<div class="stat-card__label">已完成任務</div>' +
            '</div>' +
            '<div class="stat-card">' +
            '<div class="stat-card__value">' + (total - completed) + '</div>' +
            '<div class="stat-card__label">待處理任務</div>' +
            '</div>' +
            '<div class="stat-card">' +
            '<div class="stat-card__value">' + overdue + '</div>' +
            '<div class="stat-card__label">已逾期任務</div>' +
            '</div>';
    }

    function renderCompanyCards() {
        var container = document.getElementById('companyCards');
        var companies = ['台新', '新光','全部'];

        container.innerHTML = '';

        var allCompanyData = null;
        var companyDataList = [];

        companies.forEach(function(company) {
            var companyTasks = [];
            var companyGroupCount = 0;

            allGroups.forEach(function(group) {
                if (group.tasks && group.tasks.length > 0) {
                    var filteredTasks = group.tasks.filter(function(t) {
                        var matchCompany = company === '全部' || t.company === company;
                        var matchTaskType = selectedTaskType === 'all' || t.task === selectedTaskType;
                        return matchCompany && matchTaskType;
                    });
                    
                    if (filteredTasks.length > 0) {
                        companyGroupCount++;
                        companyTasks = companyTasks.concat(filteredTasks);
                    }
                }
            });

            if (companyTasks.length === 0) return;

            var completed = companyTasks.filter(function(t) { return t.completed; }).length;
            var total = companyTasks.length;

            var companyData = {
                name: company,
                completed: completed,
                total: total,
                groupCount: companyGroupCount
            };

            if (company === '全部') {
                allCompanyData = companyData;
            } else {
                companyDataList.push(companyData);
            }
        });

        companyDataList.forEach(function(companyData) {
            var card = document.createElement('div');
            card.className = 'company-card';
            if (selectedCompany === companyData.name) {
                card.classList.add('selected');
            }
            
            card.innerHTML = 
                '<div class="card-title">' + companyData.name + '</div>' +
                '<div class="card-stats">' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + companyData.completed + '/' + companyData.total + '</div>' +
                '<div class="card-stat-label">已完成</div>' +
                '</div>' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + companyData.groupCount + '</div>' +
                '<div class="card-stat-label">組別數</div>' +
                '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                handleCompanySelect(companyData.name);
            });

            container.appendChild(card);
        });

        if (allCompanyData) {
            var shouldShowAll = false;
            
            companyDataList.forEach(function(companyData) {
                if (companyData.completed !== allCompanyData.completed || 
                    companyData.total !== allCompanyData.total) {
                    shouldShowAll = true;
                }
            });
            
            if (shouldShowAll) {
                var card = document.createElement('div');
                card.className = 'company-card';
                if (selectedCompany === '全部') {
                    card.classList.add('selected');
                }
                
                card.innerHTML = 
                    '<div class="card-title">全部</div>' +
                    '<div class="card-stats">' +
                    '<div class="card-stat">' +
                    '<div class="card-stat-value">' + allCompanyData.completed + '/' + allCompanyData.total + '</div>' +
                    '<div class="card-stat-label">已完成</div>' +
                    '</div>' +
                    '<div class="card-stat">' +
                    '<div class="card-stat-value">' + allCompanyData.groupCount + '</div>' +
                    '<div class="card-stat-label">組別數</div>' +
                    '</div>' +
                    '</div>';

                card.addEventListener('click', function() {
                    handleCompanySelect('全部');
                });

                container.appendChild(card);
            }
        }
    }

    function handleCompanySelect(company) {
        selectedCompany = company;
        renderCompanyCards();
        renderGroupCards();
        document.getElementById('groupSection').style.display = 'block';
    }

    function chineseToNumber(chinese) {
        var map = {
            '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
            '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
            '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
            '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20
        };
        return map[chinese] || null;
    }

    function renderGroupCards() {
        var container = document.getElementById('groupCards');
        container.innerHTML = '';

        var allGroupTasks = [];
        allGroups.forEach(function(group) {
            if (group.tasks) {
                var filteredTasks = group.tasks.filter(function(t) {
                    var matchCompany = selectedCompany === '全部' || t.company === selectedCompany;
                    var matchTaskType = selectedTaskType === 'all' || t.task === selectedTaskType;
                    return matchCompany && matchTaskType;
                });
                allGroupTasks = allGroupTasks.concat(filteredTasks);
            }
        });

        if (allGroupTasks.length > 0) {
            var allCompleted = allGroupTasks.filter(function(t) { return t.completed; }).length;
            var allTotal = allGroupTasks.length;
            var allPercentage = allTotal > 0 ? Math.round((allCompleted / allTotal) * 100) : 0;

            var allCard = document.createElement('div');
            allCard.className = 'group-card';
            allCard.style.animationDelay = '0s';
            
            allCard.innerHTML = 
                '<div class="card-title">全部組別</div>' +
                '<div class="card-stats">' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + allPercentage + '%</div>' +
                '<div class="card-stat-label">完成度</div>' +
                '</div>' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + allCompleted + '/' + allTotal + '</div>' +
                '<div class="card-stat-label">任務</div>' +
                '</div>' +
                '</div>';

            allCard.addEventListener('click', function() {
                var url = '../page/p'+groupPage+'.html?company=' + encodeURIComponent(selectedCompany);
                if (selectedTaskType !== 'all') {
                    url += '&taskType=' + encodeURIComponent(selectedTaskType);
                }
                window.location.href = url;
            });

            container.appendChild(allCard);
        }

        var groupsToRender = [];
        allGroups.forEach(function(group) {
            var filteredTasks = group.tasks.filter(function(t) {
                var matchCompany = selectedCompany === '全部' || t.company === selectedCompany;
                var matchTaskType = selectedTaskType === 'all' || t.task === selectedTaskType;
                return matchCompany && matchTaskType;
            });
            
            if (filteredTasks.length === 0) return;

            var completed = filteredTasks.filter(function(t) { return t.completed; }).length;
            var total = filteredTasks.length;
            var percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

            groupsToRender.push({
                group: group,
                completed: completed,
                total: total,
                percentage: percentage
            });
        });

        groupsToRender.sort(function(a, b) {
            var matchNumA = a.group.name.match(/第(\d+)組/);
            var matchNumB = b.group.name.match(/第(\d+)組/);
            
            var matchChineseA = a.group.name.match(/第([一二三四五六七八九十]+)組/);
            var matchChineseB = b.group.name.match(/第([一二三四五六七八九十]+)組/);
            
            var numA = null;
            var numB = null;
            
            if (matchNumA) {
                numA = parseInt(matchNumA[1]);
            } else if (matchChineseA) {
                numA = chineseToNumber(matchChineseA[1]);
            }
            
            if (matchNumB) {
                numB = parseInt(matchNumB[1]);
            } else if (matchChineseB) {
                numB = chineseToNumber(matchChineseB[1]);
            }
            
            if (numA !== null && numB !== null) {
                return numA - numB;
            }
            if (numA !== null) return -1;
            if (numB !== null) return 1;
            return a.group.name.localeCompare(b.group.name);
        });

        groupsToRender.forEach(function(item, index) {
            var card = document.createElement('div');
            card.className = 'group-card';
            card.style.animationDelay = ((index + 1) * 0.1) + 's';
            
            card.innerHTML = 
                '<div class="card-title">' + item.group.name + '</div>' +
                '<div class="card-stats">' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + item.percentage + '%</div>' +
                '<div class="card-stat-label">完成度</div>' +
                '</div>' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + item.completed + '/' + item.total + '</div>' +
                '<div class="card-stat-label">任務</div>' +
                '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                var url = '../page/p'+groupPage+'.html?company=' + encodeURIComponent(selectedCompany) + '&group=' + item.group.id;
                if (selectedTaskType !== 'all') {
                    url += '&taskType=' + encodeURIComponent(selectedTaskType);
                }
                window.location.href = url;
            });
            container.appendChild(card);
        });
    }

    function init() {
        loadData();
    }
    
    return {
        init: init,
        setTaskType: setTaskType
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    GroupPage.init();
});