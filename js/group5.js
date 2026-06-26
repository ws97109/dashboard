// js/group5.js
var Group5Page = (function() {
    'use strict';
    
    var allGroups = [];
    var selectedCompany = null;

    function loadData() {
        DataLoader.loadProjectData(function(err, data) {
            if (err) return;
            
            var category = data.categories.find(function(cat) { return cat.id === 5; });
            if (category) {
                allGroups = category.groups || [];
                updateStats();
                renderCompanyCards();
            }
        });
    }

    function updateStats() {
        var allTasks = [];
        allGroups.forEach(function(group) {
            if (group.tasks) {
                allTasks = allTasks.concat(group.tasks);
            }
        });

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

        var statsContainer = document.getElementById('progressSummaryStats');
        statsContainer.innerHTML = 
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
            '</div>';
    }

    function renderCompanyCards() {
        var container = document.getElementById('companyCards');
        var companies = ['台新', '新光'];

        container.innerHTML = '';

        companies.forEach(function(company) {
            var companyTasks = [];
            var companyGroupCount = 0;

            allGroups.forEach(function(group) {
                if (group.tasks && group.tasks.length > 0) {
                    var hasCompanyTask = group.tasks.some(function(t) { return t.company === company; });
                    if (hasCompanyTask) {
                        companyGroupCount++;
                        var companyTasksInGroup = group.tasks.filter(function(t) { return t.company === company; });
                        companyTasks = companyTasks.concat(companyTasksInGroup);
                    }
                }
            });

            var completed = companyTasks.filter(function(t) { return t.completed; }).length;
            var total = companyTasks.length;

            var card = document.createElement('div');
            card.className = 'company-card';
            if (selectedCompany === company) {
                card.classList.add('selected');
            }
            
            card.innerHTML = 
                '<div class="card-title">' + company + '</div>' +
                '<div class="card-stats">' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + completed + '/' + total + '</div>' +
                '<div class="card-stat-label">已完成</div>' +
                '</div>' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + companyGroupCount + '</div>' +
                '<div class="card-stat-label">組別數</div>' +
                '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                handleCompanySelect(company);
            });

            container.appendChild(card);
        });
    }

    function handleCompanySelect(company) {
        selectedCompany = company;
        renderCompanyCards();
        renderGroupCards();
        document.getElementById('groupSection').style.display = 'block';
    }

    function renderGroupCards() {
        var container = document.getElementById('groupCards');
        container.innerHTML = '';

        allGroups.forEach(function(group, index) {
            var companyTasks = group.tasks.filter(function(t) { return t.company === selectedCompany; });
            
            if (companyTasks.length === 0) return;

            var completed = companyTasks.filter(function(t) { return t.completed; }).length;
            var total = companyTasks.length;
            var percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

            var card = document.createElement('div');
            card.className = 'group-card';
            card.style.animationDelay = (index * 0.1) + 's';
            
            card.innerHTML = 
                '<div class="card-title">' + group.name + '</div>' +
                '<div class="card-stats">' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + percentage + '%</div>' +
                '<div class="card-stat-label">完成度</div>' +
                '</div>' +
                '<div class="card-stat">' +
                '<div class="card-stat-value">' + completed + '/' + total + '</div>' +
                '<div class="card-stat-label">任務</div>' +
                '</div>' +
                '</div>';

            card.addEventListener('click', function() {
                window.location.href = '../page/p5.html?company=' + encodeURIComponent(selectedCompany) + '&group=' + group.id;
            });

            container.appendChild(card);
        });
    }

    function init() {
        loadData();
    }
    
    return {
        init: init
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    Group5Page.init();
});