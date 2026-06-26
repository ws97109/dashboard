// js/p1Page.js
var p1Page = (function() {
    'use strict';
    
    var tasks = [];
    var allGroups = [];
    var currentPage = 1;
    var tasksPerPage = 20;
    var currentFilter = 'all';
    var searchQuery = '';
    var pendingTaskId = null;
    var selectedCompany = null;
    var selectedGroupId = null;
    var selectedTaskType = null;
    var currentGroupName = '';
    var expandedTaskId = null;
    var categoryName = '前置作業';

    function getUrlParams() {
        var params = {};
        var queryString = window.location.search.substring(1);
        var pairs = queryString.split('&');
        
        pairs.forEach(function(pair) {
            var parts = pair.split('=');
            if (parts[0]) {
                params[parts[0]] = decodeURIComponent(parts[1] || '');
            }
        });
        
        return params;
    }

    function formatDateTime(date) {
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        var hours = String(date.getHours()).padStart(2, '0');
        var minutes = String(date.getMinutes()).padStart(2, '0');
        return year + '/' + month + '/' + day + '-' + hours + ':' + minutes;
    }

    function formatDateTimeDisplay(dateTimeStr) {
        if (!dateTimeStr) return '';
        var date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) return dateTimeStr;
        
        var year = date.getFullYear();
        var month = String(date.getMonth() + 1).padStart(2, '0');
        var day = String(date.getDate()).padStart(2, '0');
        var hours = String(date.getHours()).padStart(2, '0');
        var minutes = String(date.getMinutes()).padStart(2, '0');
        return year + '/' + month + '/' + day + ' ' + hours + ':' + minutes;
    }

    function loadNotesFromStorage() {
        var savedNotes = localStorage.getItem('taskNotes1');
        return savedNotes ? JSON.parse(savedNotes) : {};
    }

    function saveNotesToStorage() {
        var notes = {};
        tasks.forEach(function(task) {
            if (task.note || task.noteTimestamp) {
                notes[task.id] = {
                    note: task.note,
                    noteTimestamp: task.noteTimestamp
                };
            }
        });
        localStorage.setItem('taskNotes1', JSON.stringify(notes));
    }

    function loadTaskDatesFromStorage() {
        var savedDates = localStorage.getItem('taskDates3');
        return savedDates ? JSON.parse(savedDates) : {};
    }

    function saveDatesToStorage() {
        var dates = {};
        tasks.forEach(function(task) {
            dates[task.id] = {
                actualStart: task.actualStart || null
            };
        });
        localStorage.setItem('taskDates3', JSON.stringify(dates));
    }

    function getTaskStatus(task) {
        if (task.completed) return 'completed';
        
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var expectedDate = new Date(task.expectedCompletion);
        expectedDate.setHours(0, 0, 0, 0);
        
        if (expectedDate < today) return 'overdue';
        
        if (!task.actualStart) return 'notStarted';
        
        var now = new Date();
        var actualStartDate = new Date(task.actualStart);
        
        if (now >= actualStartDate) {
            return 'inProgress';
        } else {
            return 'notStarted';
        }
    }

    function loadTasksData() {
        var urlParams = getUrlParams();
        selectedCompany = urlParams.company || null;
        selectedGroupId = urlParams.group ? parseInt(urlParams.group) : null;
        selectedTaskType = urlParams.taskType || null;

        DataLoader.loadProjectData(function(err, data) {
            if (err) {
                tasks = [];
                allGroups = [];
                updatePageTitle();
                updateStats();
                renderTasks();
                return;
            }
            
            var category = data.categories.find(function(cat) { return cat.id === 1; });
            
            if (!category) {
                tasks = [];
                allGroups = [];
            } else {
                categoryName = category.name;
                allGroups = category.groups || [];
                tasks = [];
                
                // 如果沒有指定 groupId，表示選擇了"全部組別"
                if (!selectedGroupId) {
                    currentGroupName = '全部組別';
                    
                    // 遍歷所有組別，收集符合條件的任務
                    allGroups.forEach(function(group) {
                        if (group.tasks) {
                            group.tasks.forEach(function(task) {
                                var matchCompany = !selectedCompany || task.company === selectedCompany || selectedCompany === '全部';
                                var matchTaskType = !selectedTaskType || 
                                    (selectedTaskType === '資料轉置' && task.task === '資料轉置') ||
                                    (selectedTaskType === '系統切轉' && task.task === '切轉');
                                
                                if (matchCompany && matchTaskType) {
                                    task.groupId = group.id;
                                    task.groupName = group.name;
                                    task.note = '';
                                    task.noteTimestamp = '';
                                    tasks.push(task);
                                }
                            });
                        }
                    });
                } else {
                    // 原本的邏輯：選擇特定組別
                    var targetGroup = allGroups.find(function(g) { return g.id === selectedGroupId; });
                    
                    if (targetGroup && targetGroup.tasks) {
                        currentGroupName = targetGroup.name;
                        
                        targetGroup.tasks.forEach(function(task) {
                            var matchCompany = !selectedCompany || task.company === selectedCompany || selectedCompany === '全部';
                            var matchTaskType = !selectedTaskType || 
                                (selectedTaskType === '資料轉置' && task.task === '資料轉置') ||
                                (selectedTaskType === '系統切轉' && task.task === '切轉');
                            
                            if (matchCompany && matchTaskType) {
                                task.groupId = targetGroup.id;
                                task.groupName = targetGroup.name;
                                task.note = '';
                                task.noteTimestamp = '';
                                tasks.push(task);
                            }
                        });
                    }
                }
                
                var savedNotes = loadNotesFromStorage();
                var savedDates = loadTaskDatesFromStorage();
                tasks.forEach(function(task) {
                    if (savedNotes[task.id]) {
                        task.note = savedNotes[task.id].note || '';
                        task.noteTimestamp = savedNotes[task.id].noteTimestamp || '';
                    }
                    if (savedDates[task.id]) {
                        task.actualStart = savedDates[task.id].actualStart || null;
                    }
                });
            }
            
            updatePageTitle();
            updateStats();
            renderTasks();
        });
    }

    function updatePageTitle() {
        var titleElement = document.querySelector('._page_header__title');
        if (titleElement) {
            var title = categoryName;
            if (selectedTaskType) {
                title += ' - ' + (selectedTaskType === '資料轉置' ? '資料轉置' : '系統切轉');
            }
            if (selectedCompany && currentGroupName) {
                title += ' - ' + selectedCompany + ' - ' + currentGroupName;
            } else if (currentGroupName) {
                title += ' - ' + currentGroupName;
            } else if (selectedCompany) {
                title += ' - ' + selectedCompany;
            }
            titleElement.textContent = title;
        }
    }

    function getFilteredTasks() {
        return tasks.filter(function(task) {
            var status = getTaskStatus(task);
            
            if (currentFilter === 'notStarted' && status !== 'notStarted') return false;
            if (currentFilter === 'inProgress' && status !== 'inProgress') return false;
            if (currentFilter === 'overdue' && status !== 'overdue') return false;
            if (currentFilter === 'completed' && status !== 'completed') return false;
            
            if (searchQuery) {
                var query = searchQuery.toLowerCase();
                return task.name.toLowerCase().includes(query) || 
                       task.owner.toLowerCase().includes(query) ||
                       task.systemCode.toLowerCase().includes(query) || // 系統代碼
                       task.id.toString().toLowerCase().includes(query) ||  
                        task.groupName.toLowerCase().includes(query);      // 組別名稱
            }
            return true;
        });
    }

    function renderTasks() {
        var filteredTasks = getFilteredTasks();
        
        var notStartedTasks = filteredTasks.filter(function(t) { return getTaskStatus(t) === 'notStarted'; });
        var inProgressTasks = filteredTasks.filter(function(t) { return getTaskStatus(t) === 'inProgress'; });
        var overdueTasks = filteredTasks.filter(function(t) { return getTaskStatus(t) === 'overdue'; });
        var completedTasks = filteredTasks.filter(function(t) { return getTaskStatus(t) === 'completed'; });

        filteredTasks.sort(function(a, b) {
            return new Date(a.expectedCompletion) - new Date(b.expectedCompletion);
        });

        [notStartedTasks, inProgressTasks, overdueTasks, completedTasks].forEach(function(list) {
            list.sort(function(a, b) {
                return new Date(a.expectedCompletion) - new Date(b.expectedCompletion);
            });
        });

        var sections = {
            all: document.getElementById('allSection'),
            notStarted: document.getElementById('notStartedSection'),
            inProgress: document.getElementById('inProgressSection'),
            overdue: document.getElementById('overdueSection'),
            completed: document.getElementById('completedSection')
        };
        
        Object.keys(sections).forEach(function(key) {
            var isActive = currentFilter === key;
            sections[key].classList.toggle('hidden', !isActive);
            sections[key].classList.toggle('full-width', isActive);
        });

        var startIndex = (currentPage - 1) * tasksPerPage;
        var endIndex = startIndex + tasksPerPage;
        
        if (currentFilter === 'all') {
            renderTaskList(filteredTasks.slice(startIndex, endIndex), 'allTaskList');
            document.getElementById('allCount').textContent = filteredTasks.length;
        } else if (currentFilter === 'notStarted') {
            renderTaskList(notStartedTasks.slice(startIndex, endIndex), 'notStartedTaskList');
            document.getElementById('notStartedCount').textContent = notStartedTasks.length;
        } else if (currentFilter === 'inProgress') {
            renderTaskList(inProgressTasks.slice(startIndex, endIndex), 'inProgressTaskList');
            document.getElementById('inProgressCount').textContent = inProgressTasks.length;
        } else if (currentFilter === 'overdue') {
            renderTaskList(overdueTasks.slice(startIndex, endIndex), 'overdueTaskList');
            document.getElementById('overdueCount').textContent = overdueTasks.length;
        } else if (currentFilter === 'completed') {
            renderTaskList(completedTasks.slice(startIndex, endIndex), 'completedTaskList');
            document.getElementById('completedCount').textContent = completedTasks.length;
        }

        updatePagination(filteredTasks.length);
    }

    function renderTaskList(tasks, containerId) {
        var container = document.getElementById(containerId);
        
        if (tasks.length === 0) {
            var emptyMessages = {
                allTaskList: '尚無任務資料',
                notStartedTaskList: '尚無未開始任務',
                inProgressTaskList: '尚無進行中任務',
                overdueTaskList: '尚無逾期任務',
                completedTaskList: '尚無已完成任務'
            };
            
            var emptyIcons = {
                allTaskList: '📋',
                notStartedTaskList: '⏸',
                inProgressTaskList: '⏳',
                overdueTaskList: '⚠',
                completedTaskList: '✅'
            };
            
            container.innerHTML = 
                '<div class="empty-state">' +
                '<div class="empty-state-icon">' + emptyIcons[containerId] + '</div>' +
                '<div class="empty-state-text">' + emptyMessages[containerId] + '</div>' +
                '</div>';
            return;
        }

        container.innerHTML = '';
        
        tasks.forEach(function(task, index) {
            var status = getTaskStatus(task);
            
            var taskItem = document.createElement('div');
            taskItem.className = 'task-item' + 
                (status === 'completed' ? ' completed' : '') + 
                (status === 'overdue' ? ' overdue' : '');
            taskItem.style.animationDelay = (index * 0.05) + 's';
            taskItem.dataset.taskId = task.id;
            
            var noteButtonClass = task.note ? 'task-note-btn has-note' : 'task-note-btn';
            var noteButtonText = task.note ? '進度說明' : '📝 新增進度說明';
            
            var statusBadge = '';
            if (status === 'overdue') {
                statusBadge = '<span class="overdue-badge">⚠ 已逾期</span>';
            } else if (status === 'inProgress') {
                statusBadge = '<span class="overdue-ing">⏳ 進行中</span>';
            } else if (status === 'notStarted') {
                statusBadge = '<span class="overdue-notyet">未開始</span>';
            } else if (status === 'completed') {
                statusBadge = '<span class="overdue-ok"> 已完成</span>';
            }
            
            var actualStartHTML = '';
            if (task.actualStart) {
                actualStartHTML = '<div class="task-meta-value datetime-display clickable" onclick="p1Page.openStartDateModal(' + task.id + '); event.stopPropagation();">' + 
                    formatDateTimeDisplay(task.actualStart) + 
                    '</div>';
            } else {
                actualStartHTML = '<div class="task-meta-value">' +
                    '<button class="set-date-btn" onclick="p1Page.openStartDateModal(' + task.id + '); event.stopPropagation();">設定開始日期</button>' +
                    '</div>';
            }
            
            var actualCompletionHTML = '<div class="task-meta-value datetime-display">' + 
                (task.actualCompletion ? formatDateTimeDisplay(task.actualCompletion) : '') + 
                '</div>';
            
            var metaGridHTML = 
                '<div class="task-meta-item">' +
                '<div class="task-meta-label">負責人員</div>' +
                '<div class="task-meta-value">' + task.owner + '</div>' +
                '</div>' +
                '<div class="task-meta-item">' +
                '<div class="task-meta-label">組別</div>' +
                '<div class="task-meta-value">' + (task.groupName || '') + '</div>' +
                '</div>' +
                '<div class="task-meta-item">' +
                '<div class="task-meta-label">預期開始日期</div>' +
                '<div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedStart) + '</div>' +
                '</div>' +
                '<div class="task-meta-item' + (status === 'overdue' ? ' overdue-date' : '') + '">' +
                '<div class="task-meta-label">預期完成日期 ' + '</div>' +
                '<div class="task-meta-value datetime-display">' + formatDateTimeDisplay(task.expectedCompletion) + '</div>' +
                '</div>' +
                '<div class="task-meta-item">' +
                '<div class="task-meta-label">實際開始日期</div>' +
                actualStartHTML +
                '</div>' +
                '<div class="task-meta-item">' +
                '<div class="task-meta-label">實際完成日期</div>' +
                actualCompletionHTML +
                '</div>';
            
            var noteExpandedHTML = '';
            if (expandedTaskId === task.id) {
                var noteContent = task.note || '<span class="task-note-empty">尚無說明</span>';
                var timestamp = task.noteTimestamp ? '<div class="task-note-timestamp">最後更新：' + task.noteTimestamp + '</div>' : '';
                noteExpandedHTML = 
                    '<div class="task-note-expanded">' +
                    '<div class="task-note-header">進度說明</div>' +
                    '<div class="task-note-content">' + noteContent + '</div>' +
                    timestamp +
                    '</div>';
            }
            
            taskItem.innerHTML = 
                '<div class="task-buttons-container">' +
                '<button class="' + noteButtonClass + '" onclick="p1Page.openNoteModal(' + task.id + '); event.stopPropagation();">' +
                noteButtonText +
                '</button>' +
                '<button class="task-update-btn" onclick="p1Page.toggleTask(' + task.id + '); event.stopPropagation();">' +
                '更新進度' +
                '</button>' +
                '</div>' +
                '<div class="task-header">' +
                '<div class="task-content">' +
                '<div class="task-name">'+ statusBadge + (task.taskSeq != null ? "  " + task.taskSeq : "") + "  " + task.name + '</div>' +
                '<div class="task-systemCode">' + '系統代碼 : ' +  task.systemCode + '</div>' +
                '<div class="task-systemCode">' + '備註 : ' +  escapeHtml(task.description || '') + '</div>' +
                '<div class="task-meta-grid">' +
                metaGridHTML +
                '</div>' +
                '</div>' +
                '</div>' +
                noteExpandedHTML;
            
            taskItem.addEventListener('click', function(e) {
                if (!e.target.closest('.task-checkbox') && 
                    !e.target.closest('.task-note-btn') && 
                    !e.target.closest('.task-update-btn') && 
                    e.target.tagName !== 'INPUT') {
                    toggleNoteExpansion(task.id);
                }
            });
            
            container.appendChild(taskItem);
        });
    }

    function updateActualStart(taskId, value) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (task) {
            task.actualStart = value || null;
            saveDatesToStorage();
        }
    }

    function openStartDateModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        
        pendingTaskId = taskId;
        document.getElementById('startDateModalTaskName').textContent = task.name;
        document.getElementById('modalStartDate').value = task.actualStart || CommonUtils.getTodayISO();
        document.getElementById('startDateModal').classList.add('show');
    }

    function confirmStartDate() {
        var startDate = document.getElementById('modalStartDate').value;
        if (!startDate) {
            alert('請輸入實際開始日期時間!');
            return;
        }

        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (task) {
            task.actualStart = startDate;
            saveDatesToStorage();
            renderTasks();
        }

        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelStartDate() {
        document.getElementById('startDateModal').classList.remove('show');
        pendingTaskId = null;
    }

    function openCompletionDateModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        
        pendingTaskId = taskId;
        document.getElementById('completionDateModalTaskName').textContent = task.name;
        document.getElementById('modalCompletionDate').value = task.actualCompletion || CommonUtils.getTodayISO();
    }

    function confirmCompletionDate() {
        var completionDate = document.getElementById('modalCompletionDate').value;
        if (!completionDate) {
            alert('請輸入實際完成日期時間!');
            return;
        }

        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (task) {
            task.actualCompletion = completionDate;
            task.completed = true;
            updateStats();
            renderTasks();
        }

    }

    function toggleNoteExpansion(taskId) {
        expandedTaskId = expandedTaskId === taskId ? null : taskId;
        renderTasks();
    }

    function openNoteModal(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;
        
        pendingTaskId = taskId;
        document.getElementById('noteModalTaskName').textContent = task.name;
        document.getElementById('modalNoteText').value = task.note || '';
        document.getElementById('noteModal').classList.add('show');
    }

    function saveNote() {
        var noteText = document.getElementById('modalNoteText').value.trim();
        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        
        if (task) {
            task.note = noteText;
            task.noteTimestamp = formatDateTime(new Date());
            saveNotesToStorage();
            renderTasks();
        }
        
        document.getElementById('noteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelNote() {
        document.getElementById('noteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function updatePagination(totalTasks) {
        var totalPages = Math.ceil(totalTasks / tasksPerPage);
        document.getElementById('pageInfo').textContent = 
            '第 ' + currentPage + ' 頁 / 共 ' + totalPages + ' 頁 (總計 ' + totalTasks + ' 項任務)';
        document.getElementById('prevPage').disabled = currentPage === 1;
        document.getElementById('nextPage').disabled = currentPage >= totalPages;
    }

    function toggleTask(taskId) {
        var task = tasks.find(function(t) { return t.id === taskId; });
        if (!task) return;

        pendingTaskId = taskId;
        if (!task.completed) {
            document.getElementById('modalTaskName').textContent = task.name;
            document.getElementById('modalActualDate').value = CommonUtils.getTodayISO();
            document.getElementById('completeModal').classList.add('show');
        } else {
            document.getElementById('uncompleteModalTaskName').textContent = task.name;
            document.getElementById('uncompleteModal').classList.add('show');
        }
    }

    function confirmComplete() {
        var actualDate = document.getElementById('modalActualDate').value;
        if (!actualDate) {
            alert('請輸入實際完成日期!');
            return;
        }

        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (task) {
            task.completed = true;
            task.actualCompletion = actualDate;
            updateStats();
            renderTasks();
        }

        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelComplete() {
        document.getElementById('completeModal').classList.remove('show');
        pendingTaskId = null;
    }

    function confirmUncomplete() {
        var task = tasks.find(function(t) { return t.id === pendingTaskId; });
        if (task) {
            task.completed = false;
            task.actualCompletion = null;
            updateStats();
            renderTasks();
        }

        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function cancelUncomplete() {
        document.getElementById('uncompleteModal').classList.remove('show');
        pendingTaskId = null;
    }

    function updateStats() {
        var completed = tasks.filter(function(t) { return t.completed; }).length;
        var total = tasks.length;
        var percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var overdue = tasks.filter(function(t) { 
            if (t.completed) return false;
            var expectedDate = new Date(t.expectedCompletion);
            expectedDate.setHours(0, 0, 0, 0);
            return expectedDate < today;
        }).length;

        var progressStats = [
            { value: percentage + '%', label: currentGroupName === '全部組別' ? '整體完成度' : '組別完成度' },
            { value: completed + '/' + total, label: '已完成任務' },
            { value: (total - completed).toString(), label: '待處理任務' },
            { value: overdue.toString(), label: '已逾期任務' }
        ];
        renderProgressSummary(progressStats);
    }

    function renderProgressSummary(stats) {
        var statsContainer = document.getElementById('progressSummaryStats');
        if (!statsContainer) return;
        
        statsContainer.innerHTML = '';
        stats.forEach(function(stat) {
            var statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = 
                '<div class="stat-card__value">' + stat.value + '</div>' +
                '<div class="stat-card__label">' + stat.label + '</div>';
            statsContainer.appendChild(statCard);
        });
    }

    function handleSearch(query) {
        searchQuery = query;
        currentPage = 1;
        renderTasks();
    }

    function handleFilter(filter) {
        currentFilter = filter;
        currentPage = 1;
        renderTasks();
    }

    function prevPage() {
        if (currentPage > 1) {
            currentPage--;
            renderTasks();
            scrollToTasks();
        }
    }

    function nextPage() {
        var totalPages = Math.ceil(getFilteredTasks().length / tasksPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTasks();
            scrollToTasks();
        }
    }

    function scrollToTasks() {
    var tasksSection = document.querySelector('.tasks-section');
        if (tasksSection) {
            tasksSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function init() {
        loadTasksData();
        
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                handleSearch(e.target.value);
            });
        }
        
        document.querySelectorAll('.filter-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.filter-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                handleFilter(btn.dataset.filter);
            });
        });
        
        var prevBtn = document.getElementById('prevPage');
        var nextBtn = document.getElementById('nextPage');
        if (prevBtn) prevBtn.addEventListener('click', prevPage);
        if (nextBtn) nextBtn.addEventListener('click', nextPage);

        ['completeModal', 'uncompleteModal', 'noteModal', 'startDateModal'].forEach(function(modalId) {
            document.getElementById(modalId).addEventListener('click', function(e) {
                if (e.target.id === modalId) {
                    if (modalId === 'completeModal') cancelComplete();
                    else if (modalId === 'uncompleteModal') cancelUncomplete();
                    else if (modalId === 'noteModal') cancelNote();
                    else if (modalId === 'startDateModal') cancelStartDate();
                }
            });
        });
    }
    
    return {
        init: init,
        toggleTask: toggleTask,
        confirmComplete: confirmComplete,
        cancelComplete: cancelComplete,
        confirmUncomplete: confirmUncomplete,
        cancelUncomplete: cancelUncomplete,
        openNoteModal: openNoteModal,
        saveNote: saveNote,
        cancelNote: cancelNote,
        updateActualStart: updateActualStart,
        openStartDateModal: openStartDateModal,
        confirmStartDate: confirmStartDate,
        cancelStartDate: cancelStartDate,
        openCompletionDateModal: openCompletionDateModal,
        confirmCompletionDate: confirmCompletionDate
    };
})();

document.addEventListener('DOMContentLoaded', function() {
    p1Page.init();
});

window.confirmComplete = p1Page.confirmComplete;
window.cancelComplete = p1Page.cancelComplete;
window.confirmUncomplete = p1Page.confirmUncomplete;
window.cancelUncomplete = p1Page.cancelUncomplete;