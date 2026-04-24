import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, update, onValue, push, remove, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// 1. Firebase Config (Browser Version)
const firebaseConfig = {
    apiKey: "AIza" + "SyB7Ofntn3k7ingeYINtCr6SNQB69lct4VA",
    authDomain: "intracore-cyber-syn.firebaseapp.com",
    databaseURL: "https://intracore-cyber-syn-default-rtdb.firebaseio.com",
    projectId: "intracore-cyber-syn"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// MODULE: AUTHENTICATION, RBAC & BRANCHING
// ==========================================
let currentUser = null; let currentRole = null; let currentShiftId = null; let currentShiftSales = 0; 
let currentBranch = 'branch_main'; // Default fallback
let dashboardBranchFilter = 'all'; // Admin viewing filter

const shiftsRef = ref(db, 'cafes/blessmas/shifts');
const staffRef = ref(db, 'cafes/blessmas/staff');
let globalStaffData = {};

window.applyRoleBasedUI = function(role) {
    const isAdmin = role === 'admin';
    
    // STRICT ADMIN ONLY
    document.getElementById('nav-staff').style.display = isAdmin ? 'flex' : 'none';
    document.getElementById('nav-settings').style.display = isAdmin ? 'flex' : 'none';
    
    // OPEN TO ALL STAFF
    document.getElementById('nav-finances').style.display = 'flex';
    document.getElementById('nav-shifts').style.display = 'flex';
    document.getElementById('admin-revenue-row').style.display = 'grid';
    document.getElementById('card-profit').style.display = 'flex';

    // Lock the Dropdown for Cashiers
    const branchFilter = document.getElementById('branch-filter');
    if (branchFilter) {
        branchFilter.disabled = !isAdmin;
        branchFilter.style.opacity = isAdmin ? '1' : '0.7'; 
        branchFilter.style.cursor = isAdmin ? 'pointer' : 'not-allowed';
    }

    document.querySelector('.nav-item').click(); 
}

const securityLogRef = ref(db, 'cafes/blessmas/security_logs');
let failedAttempts = 0;
const MAX_ATTEMPTS = 3;
let lockoutTimer = null;

window.processLogin = function() {
    if (failedAttempts >= MAX_ATTEMPTS) return;

    const pinInputEl = document.getElementById('login-pin');
    const pin = pinInputEl.value;
    let foundUser = null;

    for (let key in globalStaffData) { if (globalStaffData[key].pin === pin) { foundUser = globalStaffData[key]; break; } }
    if (!foundUser && pin === '8888') { foundUser = { name: 'Master Admin', role: 'admin', branch: 'all' }; }
    
    if (!foundUser) { 
        failedAttempts++;
        pinInputEl.value = '';
        
        pinInputEl.style.borderColor = '#ef4444';
        setTimeout(() => { pinInputEl.style.borderColor = '#d1d5db'; }, 800);

        push(securityLogRef, { event: 'Failed Login Attempt', timestamp: Date.now() });

        if (failedAttempts >= MAX_ATTEMPTS) { window.triggerSecurityLockout(); } 
        else { const remaining = MAX_ATTEMPTS - failedAttempts; alert(`❌ Invalid PIN Code. Warning: ${remaining} attempts remaining before system lockout.`); }
        return; 
    }

    failedAttempts = 0;
    currentUser = foundUser.name; 
    currentRole = foundUser.role;
    currentBranch = foundUser.branch || 'branch_main'; 
    
    dashboardBranchFilter = currentRole === 'admin' ? 'all' : currentBranch;

    // Force the dropdown to visually show the cashier's branch
    const filterEl = document.getElementById('branch-filter');
    if (filterEl) filterEl.value = dashboardBranchFilter;

    window.applyRoleBasedUI(currentRole);

    if (typeof window.renderVoucherTable === 'function') window.renderVoucherTable(); 
    if (typeof window.renderFinanceTable === 'function') window.renderFinanceTable(); 
    if (typeof window.renderShiftsTable === 'function') window.renderShiftsTable();
    if (rawTransactionData) window.processTransactionsEngine();

    document.getElementById('login-overlay').style.display = 'none'; 
    document.getElementById('active-user-name').innerText = currentUser; 
    document.getElementById('shift-user-display').innerText = currentUser;
    const newShiftRef = push(shiftsRef); currentShiftId = newShiftRef.key; currentShiftSales = 0; window.updateShiftSalesUI();
    set(newShiftRef, { cashierName: currentUser, branch: currentBranch, startTime: Date.now(), endTime: null, totalSales: 0, status: 'active' }); 
}

window.triggerSecurityLockout = function() {
    const btn = document.querySelector('.btn-login');
    const input = document.getElementById('login-pin');
    let secondsLeft = 30;

    input.disabled = true; btn.disabled = true; btn.style.background = '#9ca3af'; 
    push(securityLogRef, { event: 'System Locked - Brute Force Attempt', timestamp: Date.now() });

    lockoutTimer = setInterval(() => {
        btn.innerText = `System Locked (${secondsLeft}s)`;
        secondsLeft--;
        if (secondsLeft < 0) {
            clearInterval(lockoutTimer); failedAttempts = 0; input.disabled = false; btn.disabled = false;
            btn.style.background = '#0ea5e9'; btn.innerText = 'Initialize';
        }
    }, 1000);
}

window.clockOut = function() {
    if(!confirm(`Are you sure you want to clock out?\n\nYou should have exactly $${currentShiftSales.toFixed(2)} in your cash drawer.`)) return;
    update(ref(db, 'cafes/blessmas/shifts/' + currentShiftId), { endTime: Date.now(), totalSales: currentShiftSales, status: 'completed' }); 
    currentUser = null; currentRole = null; currentShiftId = null; currentShiftSales = 0; document.getElementById('login-pin').value = ''; document.getElementById('login-overlay').style.display = 'flex';
}

// ==========================================
// DYNAMIC BRANCH MANAGEMENT
// ==========================================
const branchesRef = ref(db, 'cafes/blessmas/settings/branches');

window.saveBranch = function() {
    const name = document.getElementById('branch-name').value.trim();
    const id = 'branch_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    update(ref(db, 'cafes/blessmas/settings/branches/' + id), { name: name, createdAt: Date.now() }).then(() => { window.closeAllPanels(); });
}

window.deleteBranch = function(id, name) {
    if(confirm(`⚠️ Delete branch "${name}"?\n\nNote: Transactions and staff assigned to this branch will lose their label reference.`)) {
        remove(ref(db, 'cafes/blessmas/settings/branches/' + id));
    }
}

onValue(branchesRef, (snapshot) => {
    const data = snapshot.val();
    const filterEl = document.getElementById('branch-filter');
    const staffBranchEl = document.getElementById('staff-branch');
    const tbody = document.getElementById('branches-list');

    let filterHtml = '<option value="all" selected>🏢 All Branches (Global)</option>';
    let staffHtml = ''; let tableHtml = '';

    if (!data) {
        staffHtml = '<option value="branch_main">📍 Main Branch (Default)</option>';
        if(tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #9ca3af;">No branches configured yet.</td></tr>';
    } else {
        Object.entries(data).forEach(([key, branch]) => {
            const safeName = branch.name.replace(/'/g, "\\'");
            filterHtml += `<option value="${key}">📍 ${branch.name}</option>`;
            staffHtml += `<option value="${key}">📍 ${branch.name}</option>`;
            tableHtml += `<tr><td style="font-weight: 500; color: #111827;">${branch.name}</td><td><span class="badge-neutral">${key}</span></td><td style="text-align: right;"><button class="btn-action" onclick="deleteBranch('${key}', '${safeName}')">🗑️</button></td></tr>`;
        });
        if(tbody) tbody.innerHTML = tableHtml;
    }

    if (filterEl) {
        filterEl.innerHTML = filterHtml;
        filterEl.value = dashboardBranchFilter;
    }
    if (staffBranchEl) staffBranchEl.innerHTML = staffHtml;
});

// STAFF DIRECTORY
onValue(staffRef, (snapshot) => {
    globalStaffData = snapshot.val() || {}; const tbody = document.getElementById('staff-list'); 
    let html = ''; 
    if(Object.keys(globalStaffData).length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #9ca3af;">No staff configured yet. Default Admin PIN is 8888.</td></tr>'; return; }
    Object.entries(globalStaffData).forEach(([key, staff]) => {
        const safeName = staff.name.replace(/'/g, "\\'"); 
        const roleBadge = staff.role === 'admin' ? '<span class="badge-active-small" style="background:#fef3c7; color:#b45309;">ADMIN</span>' : '<span class="badge-active-small" style="background:#dcfce7; color:#15803d;">CASHIER</span>';
        const branchDisplay = staff.branch ? staff.branch.replace('branch_', '').toUpperCase() : 'MAIN';
        
        html += `<tr><td style="font-weight: 600; color: #111827;">${staff.name}</td><td>${roleBadge}</td><td style="font-family: monospace;">••••</td><td><span class="badge-neutral">${branchDisplay}</span></td><td style="text-align: right;"><button class="btn-action" onclick="deleteStaff('${key}', '${safeName}')">🗑️</button></td></tr>`;
    });
    tbody.innerHTML = html;
});

window.saveStaff = function() {
    const name = document.getElementById('staff-name').value; const pin = document.getElementById('staff-pin').value; const role = document.getElementById('staff-role').value; const branch = document.getElementById('staff-branch').value;
    for (let key in globalStaffData) { if (globalStaffData[key].pin === pin) { alert("❌ This PIN is already taken."); return; } }
    push(staffRef, { name: name, pin: pin, role: role, branch: branch, createdAt: Date.now() }).then(() => { window.closeAllPanels(); alert(`✅ Staff member ${name} created successfully!`); });
}

window.deleteStaff = function(id, name) { if(confirm(`Delete staff account "${name}"?`)) { remove(ref(db, 'cafes/blessmas/staff/' + id)); } }

// ==========================================
// SEGMENTED REVENUE & BRANCH FILTER ENGINE
// ==========================================
let globalPosRevenue = 0; let globalWifiRevenue = 0; let globalPcRevenue = 0; let globalManualRevenue = 0; let totalExpenses = 0;
let posCart = []; let cartTotal = 0;
const transactionsRef = ref(db, 'cafes/blessmas/transactions');

window.changeBranch = function(branchValue) {
    if (currentRole !== 'admin' && branchValue !== currentBranch) return; 
    
    dashboardBranchFilter = branchValue;
    if (rawTransactionData) window.processTransactionsEngine();
    if (typeof window.renderFinanceTable === 'function') window.renderFinanceTable(); 
    if (typeof window.renderVoucherTable === 'function') window.renderVoucherTable(); 
    if (typeof window.renderShiftsTable === 'function') window.renderShiftsTable(); 
}

window.updateProfitCalculator = function() {
    const totalRevenue = globalPosRevenue + globalWifiRevenue + globalPcRevenue + globalManualRevenue; 
    const profit = totalRevenue - totalExpenses;
    
    const elDashTotalRev = document.getElementById('dash-total-rev'); if(elDashTotalRev) elDashTotalRev.innerText = '$' + totalRevenue.toFixed(2);
    const elDashWifiRev = document.getElementById('dash-wifi-rev'); if(elDashWifiRev) elDashWifiRev.innerText = '$' + globalWifiRevenue.toFixed(2);
    const elDashPosRev = document.getElementById('dash-pos-rev'); if(elDashPosRev) elDashPosRev.innerText = '$' + globalPosRevenue.toFixed(2);
    const elDashPcRev = document.getElementById('dash-pc-rev'); if(elDashPcRev) elDashPcRev.innerText = '$' + globalPcRevenue.toFixed(2);
    const elDashBreakdownRev = document.getElementById('dash-breakdown-rev'); if(elDashBreakdownRev) elDashBreakdownRev.innerText = '$' + totalRevenue.toFixed(2);
    const elDashBreakdownExp = document.getElementById('dash-breakdown-exp'); if(elDashBreakdownExp) elDashBreakdownExp.innerText = '-$' + totalExpenses.toFixed(2);
    const elDashProfit = document.getElementById('dash-profit');
    if(elDashProfit) { elDashProfit.innerText = '$' + profit.toFixed(2); elDashProfit.style.color = profit >= 0 ? '#10b981' : '#ef4444'; }
}

window.updateShiftSalesUI = function() { document.getElementById('current-shift-sales').innerText = '$' + currentShiftSales.toFixed(2); if(currentShiftId) { update(ref(db, 'cafes/blessmas/shifts/' + currentShiftId), { totalSales: currentShiftSales }); } }

let rawShiftData = null;

onValue(shiftsRef, (snapshot) => {
    rawShiftData = snapshot.val();
    if (currentUser) { window.renderShiftsTable(); }
});

window.renderShiftsTable = function() {
    const tbody = document.getElementById('shifts-list');
    if(!tbody) return;
    if(!rawShiftData) { tbody.innerHTML = ''; return; }

    let html = '';
    Object.values(rawShiftData).sort((a, b) => b.startTime - a.startTime).slice(0, 30).forEach(shift => {
        const safeBranch = shift.branch || 'branch_main';

        // 1. Branch Filter
        if (dashboardBranchFilter !== 'all' && safeBranch !== dashboardBranchFilter) return;

        // 2. Strict Cashier Filter
        if (currentRole !== 'admin' && String(shift.cashierName).trim().toLowerCase() !== String(currentUser).trim().toLowerCase()) return;

        const startStr = new Date(shift.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); const endStr = shift.endTime ? new Date(shift.endTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Still Active';
        const statusBadge = shift.status === 'active' ? '<span class="badge-active-small">ACTIVE NOW</span>' : '<span class="badge-neutral">Completed</span>';
        
        let branchTag = dashboardBranchFilter === 'all' ? `<span style="font-size:0.7rem; background:#e2e8f0; padding:2px 4px; border-radius:4px; margin-left:5px;">${safeBranch.replace('branch_', '').toUpperCase()}</span>` : '';

        html += `<tr><td style="font-weight: 600; color: #111827;">${shift.cashierName} ${branchTag}</td><td>${startStr}</td><td>${endStr}</td><td style="color: #10b981; font-weight: 600;">$${shift.totalSales.toFixed(2)}</td><td>${statusBadge}</td></tr>`;
    });
    tbody.innerHTML = html;
}

window.saveTransaction = function() { 
    const type = document.getElementById('trans-type').value; const desc = document.getElementById('trans-desc').value; const amount = parseFloat(document.getElementById('trans-amount').value); const category = document.getElementById('trans-category').value; const finalCategory = type === 'inflow' ? 'Manual Income' : category;
    push(transactionsRef, { type: type, description: desc, amount: amount, category: finalCategory, cashier: currentUser, branch: currentBranch, createdAt: Date.now() }).then(() => { window.closeAllPanels(); }); 
}

let revenueChartInstance = null; let rawTransactionData = null; let renderFinanceTimeout = null;

onValue(transactionsRef, (snapshot) => { 
    rawTransactionData = snapshot.val(); 
    window.processTransactionsEngine();
    if (currentUser) { clearTimeout(renderFinanceTimeout); renderFinanceTimeout = setTimeout(() => { window.renderFinanceTable(); }, 200); }
});

window.processTransactionsEngine = function() {
    globalWifiRevenue = 0; globalPosRevenue = 0; globalPcRevenue = 0; globalManualRevenue = 0; totalExpenses = 0; 
    let chartDataMap = {}; let chartLabels = [];
    for (let i = 6; i >= 0; i--) { let d = new Date(); d.setDate(d.getDate() - i); let dateKey = d.toLocaleDateString([], {month: 'short', day: 'numeric'}); chartDataMap[dateKey] = 0; chartLabels.push(dateKey); }

    if (rawTransactionData) {
        Object.values(rawTransactionData).forEach(trans => { 
            const safeBranch = trans.branch || 'branch_main';

            // 1. Branch Filter
            if (dashboardBranchFilter !== 'all' && safeBranch !== dashboardBranchFilter) return;

            // 2. Strict Cashier Filter
            if (currentRole !== 'admin' && String(trans.cashier).trim().toLowerCase() !== String(currentUser).trim().toLowerCase()) return;

            const isIncome = trans.type === 'inflow'; 
            if (isIncome) {
                if (trans.category === 'Wi-Fi') globalWifiRevenue += trans.amount;
                else if (trans.category === 'POS') globalPosRevenue += trans.amount;
                else if (trans.category === 'PC') globalPcRevenue += trans.amount;
                else globalManualRevenue += trans.amount;

                let transDateKey = new Date(trans.createdAt).toLocaleDateString([], {month: 'short', day: 'numeric'});
                if (chartDataMap[transDateKey] !== undefined) chartDataMap[transDateKey] += trans.amount;
            } else { totalExpenses += trans.amount; }
        });
    }
    
    window.updateProfitCalculator(); 

    const ctx = document.getElementById('revenueChart');
    if (ctx) {
        if (revenueChartInstance) revenueChartInstance.destroy(); 
        let chartValues = chartLabels.map(label => chartDataMap[label]);

        if (typeof Chart !== 'undefined') {
            revenueChartInstance = new Chart(ctx, {
                type: 'line',
                data: { labels: chartLabels, datasets: [{ label: 'Daily Revenue ($)', data: chartValues, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', borderWidth: 3, pointBackgroundColor: '#0ea5e9', pointRadius: 4, fill: true, tension: 0.3 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return '$' + value; } } }, x: { grid: { display: false } } } }
            });
        }
    }
}

window.renderFinanceTable = function() {
    const tbody = document.getElementById('transactions-list');
    if(!tbody) return;

    let openingBalance = 0; let periodRevenue = 0; let periodExpenses = 0; let closingBalance = 0;

    if (!rawTransactionData) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No transactions found.</td></tr>';
        return;
    }

    let transactionsArray = Object.entries(rawTransactionData).map(([key, val]) => ({ key, ...val })).sort((a, b) => b.createdAt - a.createdAt);

    // 1. Branch Filter
    if (dashboardBranchFilter !== 'all') {
        transactionsArray = transactionsArray.filter(t => {
            const safeBranch = t.branch || 'branch_main';
            return safeBranch === dashboardBranchFilter;
        });
    }

    // 2. Strict Cashier Filter
    if (currentRole !== 'admin') {
        transactionsArray = transactionsArray.filter(t => 
            String(t.cashier).trim().toLowerCase() === String(currentUser).trim().toLowerCase()
        );
    }

    let startDateInput = document.getElementById('finance-start-date').value;
    let endDateInput = document.getElementById('finance-end-date').value;

    if (!startDateInput && !endDateInput && !window.financeInitialized) {
        const today = new Date(); const yyyy = today.getFullYear(); const mm = String(today.getMonth() + 1).padStart(2, '0'); const dd = String(today.getDate()).padStart(2, '0'); const todayStr = `${yyyy}-${mm}-${dd}`;
        document.getElementById('finance-start-date').value = todayStr; document.getElementById('finance-end-date').value = todayStr;
        startDateInput = todayStr; endDateInput = todayStr; window.financeInitialized = true; 
    }

    let startMs = 0; let endMs = Infinity;
    if (startDateInput) startMs = new Date(startDateInput + 'T00:00:00').getTime();
    if (endDateInput) endMs = new Date(endDateInput + 'T23:59:59').getTime();

    let tableHTML = ''; let rowCount = 0;

    transactionsArray.forEach(trans => {
        const isIncome = trans.type === 'inflow'; const amt = trans.amount;

        if (trans.createdAt < startMs) {
            if (isIncome) openingBalance += amt; else openingBalance -= amt;
        }
        
        if (trans.createdAt >= startMs && trans.createdAt <= endMs) {
            if (isIncome) periodRevenue += amt; else periodExpenses += amt;

            if (rowCount < 100) {
                const timeStr = new Date(trans.createdAt).toLocaleDateString() + ' ' + new Date(trans.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); 
                const amountColor = isIncome ? '#10b981' : '#ef4444'; 
                const amountSign = isIncome ? '+' : '-'; 
                const typeBadge = isIncome ? '<span class="badge-active-small">INCOME</span>' : '<span class="badge-neutral" style="background:#fee2e2; color:#ef4444;">EXPENSE</span>'; 
                
                const safeBranch = trans.branch || 'branch_main';
                let branchTag = dashboardBranchFilter === 'all' ? `<span style="font-size:0.7rem; background:#e2e8f0; padding:2px 4px; border-radius:4px; margin-left:5px;">${safeBranch.replace('branch_', '').toUpperCase()}</span>` : '';
                const descDisplay = trans.cashier ? `${trans.description} <span style="color:#9ca3af; font-size:0.75rem;">(${trans.cashier})</span> ${branchTag}` : trans.description;
                
                tableHTML += `<tr><td style="font-weight: 500; color: #111827;">${descDisplay}</td><td><span class="badge-neutral">${trans.category}</span></td><td>${typeBadge}</td><td style="color: ${amountColor}; font-weight: 600;">${amountSign}$${trans.amount.toFixed(2)}</td><td style="color: #6b7280; font-size: 0.8rem;">${timeStr}</td></tr>`; 
                rowCount++;
            }
        }
    });

    if (rowCount === 0) tableHTML = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No transactions found for this date/branch range.</td></tr>';

    closingBalance = openingBalance + periodRevenue - periodExpenses;

    const elFinanceOpening = document.getElementById('finance-opening'); if(elFinanceOpening) elFinanceOpening.innerText = (openingBalance >= 0 ? '$' : '-$') + Math.abs(openingBalance).toFixed(2);
    const elFinanceRev = document.getElementById('finance-revenue'); if(elFinanceRev) elFinanceRev.innerText = '$' + periodRevenue.toFixed(2);
    const elFinanceExp = document.getElementById('finance-expenses'); if(elFinanceExp) elFinanceExp.innerText = '$' + periodExpenses.toFixed(2);
    const elFinanceClose = document.getElementById('finance-closing'); if(elFinanceClose) elFinanceClose.innerText = (closingBalance >= 0 ? '$' : '-$') + Math.abs(closingBalance).toFixed(2);

    tbody.innerHTML = tableHTML;
}

// ==========================================
// MODULE: MULTI-PC GRID
// ==========================================
const pcsRef = ref(db, 'cafes/blessmas/machines'); let pcIntervals = {}; 
window.deployNewPC = function() { const pcNumber = prompt("Enter PC Designation (e.g., PC_02, VIP_PC):"); if(!pcNumber) return; set(ref(db, 'cafes/blessmas/machines/' + pcNumber), { status: 'free', endTime: 0 }); }
window.addPCTimer = function(pcId, minutes, priceStr) {
    const price = parseFloat(priceStr || 0); const msToAdd = minutes * 60 * 1000;
    update(ref(db, 'cafes/blessmas/machines/' + pcId), { status: 'active', endTime: Date.now() + msToAdd });
    if(price > 0) { currentShiftSales += price; window.updateShiftSalesUI(); push(transactionsRef, { type: 'inflow', description: `PC Rental: ${pcId.replace('_', ' ')} for ${minutes} mins`, amount: price, category: 'PC', cashier: currentUser, branch: currentBranch, createdAt: Date.now() }); }
}
window.lockPC = function(pcId) { update(ref(db, 'cafes/blessmas/machines/' + pcId), { status: 'free', endTime: 0 }); }
onValue(pcsRef, (snapshot) => {
    const grid = document.getElementById('multi-pc-grid'); const data = snapshot.val();
    if(!data) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #9ca3af;">No workstations deployed. Click Add Workstation.</div>'; return; }
    Object.values(pcIntervals).forEach(clearInterval); pcIntervals = {}; let html = '';
    Object.entries(data).forEach(([pcId, pcData]) => {
        const isFree = pcData.status !== 'active'; const nodeClass = isFree ? 'free' : 'active'; const statusClass = isFree ? 'status-free' : 'status-active'; const statusText = isFree ? 'FREE / LOCKED' : 'ACTIVE';
        html += `<div class="pc-node ${nodeClass}"><div class="pc-node-title">${pcId.replace('_', ' ')}</div><div class="pc-node-status ${statusClass}">${statusText}</div><div class="pc-node-time" id="timer-${pcId}">${isFree ? '--:--' : 'Calculating...'}</div><div class="pc-controls"><button onclick="addPCTimer('${pcId}', 15, 0.50)">15m ($0.5)</button><button onclick="addPCTimer('${pcId}', 60, 1.00)">1h ($1)</button>${!isFree ? `<button class="stop" onclick="lockPC('${pcId}')">Force Lock</button>` : ''}</div></div>`;
        if(!isFree && pcData.endTime > 0) {
            pcIntervals[pcId] = setInterval(() => {
                const remaining = pcData.endTime - Date.now(); const timerEl = document.getElementById(`timer-${pcId}`);
                if(!timerEl) { clearInterval(pcIntervals[pcId]); return; } 
                if (remaining <= 0) { clearInterval(pcIntervals[pcId]); timerEl.innerText = "EXPIRED"; timerEl.style.color = "#ef4444"; } 
                else { const mins = Math.floor(remaining / 60000); const secs = Math.floor((remaining % 60000) / 1000); timerEl.innerText = `${mins}:${secs < 10 ? '0'+secs : secs}`; }
            }, 1000);
        }
    });
    grid.innerHTML = html;
});

// ==========================================
// UI LOGIC: TAB SWITCHING & PANELS
// ==========================================
window.toggleSidebar = function() { document.querySelector('.sidebar').classList.toggle('mobile-open'); }
window.switchTab = function(sectionId, element) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); element.classList.add('active');
    document.querySelectorAll('.app-section').forEach(el => el.classList.remove('active-section')); document.getElementById('sec-' + sectionId).classList.add('active-section');
    const titles = { 'dashboard': 'Analytics Dashboard', 'network': 'Live Network Telemetry', 'pc': 'PC Workstation Grid', 'hotspot': 'Wi-Fi Hotspot Management', 'pos': 'Point of Sale (POS)', 'finances': 'Financial Ledger', 'shifts': 'Shift & Audit Reports', 'staff': 'Staff & Access Control', 'settings': 'System Settings' }; document.getElementById('page-title').innerText = titles[sectionId];
    document.querySelector('.sidebar').classList.remove('mobile-open');
}
window.openPanel = function(panelId) { 
    if(panelId === 'finance') document.getElementById('finance-form').reset(); 
    if(panelId === 'staff') document.getElementById('staff-form').reset(); 
    if(panelId === 'branch') document.getElementById('branch-form').reset(); 
    if(panelId === 'generate-token') { document.getElementById('generated-token').innerText = '------'; document.getElementById('customer-phone').value = ''; }
    if(panelId === 'bulk-generate') { document.getElementById('bulk-print-preview').style.display = 'none'; document.getElementById('btn-bulk-gen').style.display = 'block'; latestBulkBatch = []; }
    document.getElementById('panel-' + panelId).classList.add('open'); document.getElementById('panel-overlay').classList.add('open'); 
}
window.closeAllPanels = function() { document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open')); document.getElementById('panel-overlay').classList.remove('open'); }

// POS Cart Logic
window.addToCart = function(name, price) { posCart.push({ name, price }); cartTotal += price; window.updateCartUI(); }
window.updateCartUI = function() { const cartDiv = document.getElementById('cart-items-list'); if (posCart.length === 0) { cartDiv.innerHTML = '<p style="color: #9ca3af; text-align: center; margin-top: 50px;">Cart is empty</p>'; } else { let html = ''; posCart.forEach(item => html += `<div class="cart-row"><span>${item.name}</span><span>$${item.price.toFixed(2)}</span></div>`); cartDiv.innerHTML = html; } document.getElementById('cart-total-price').innerText = '$' + cartTotal.toFixed(2); }
window.checkoutCart = function() { 
    if(cartTotal === 0) return alert("Add items to the cart first!"); 
    currentShiftSales += cartTotal; window.updateShiftSalesUI(); 
    const itemNames = posCart.map(i => i.name).join(', ');
    push(transactionsRef, { type: 'inflow', description: `POS Sale: ${itemNames}`, amount: cartTotal, category: 'POS', cashier: currentUser, branch: currentBranch, createdAt: Date.now() });
    alert(`Sale completed! Add $${cartTotal.toFixed(2)} to your drawer.`); posCart = []; cartTotal = 0; window.updateCartUI(); 
}

// ==========================================
// SETTINGS & PACKAGES
// ==========================================
const packagesRef = ref(db, 'cafes/blessmas/settings/packages'); let editingPackageId = null;
window.openPackageForm = function(isEdit = false) { if(!isEdit) { document.getElementById('package-form').reset(); document.getElementById('form-title').innerText = "➕ New Package"; editingPackageId = null; } window.openPanel('settings'); }
window.savePackage = function() { const pkgData = { name: document.getElementById('pkg-name').value, price: parseFloat(document.getElementById('pkg-price').value), uptimeLimit: document.getElementById('pkg-time').value, dataLimit: document.getElementById('pkg-data').value, speedLimit: document.getElementById('pkg-speed').value, updatedAt: Date.now() }; if (editingPackageId) { update(ref(db, 'cafes/blessmas/settings/packages/' + editingPackageId), pkgData).then(window.closeAllPanels); } else { pkgData.createdAt = Date.now(); push(packagesRef, pkgData).then(window.closeAllPanels); } }
window.editPackage = function(id, name, price, time, data, speed) { editingPackageId = id; document.getElementById('pkg-name').value = name; document.getElementById('pkg-price').value = price; document.getElementById('pkg-time').value = time; document.getElementById('pkg-data').value = data; document.getElementById('pkg-speed').value = speed; document.getElementById('form-title').innerText = "✏️ Edit Package"; window.openPanel('settings'); }
window.deletePackage = function(id, name) { if(confirm(`Delete "${name}" package?`)) { remove(ref(db, 'cafes/blessmas/settings/packages/' + id)); } }
onValue(packagesRef, (snapshot) => { 
    const tbody = document.getElementById('packages-list'); const btnContainer = document.getElementById('dynamic-package-buttons'); const bulkSelect = document.getElementById('bulk-pkg-select');
    const data = snapshot.val(); 
    if (!data) { tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9ca3af;">No packages configured yet.</td></tr>'; btnContainer.innerHTML = '<p style="color: #9ca3af; font-size: 0.85rem; text-align: center;">No packages configured in settings.</p>'; bulkSelect.innerHTML = '<option value="">-- Choose Package --</option>'; return; } 
    let tableHtml = ''; let btnHtml = ''; let selectHtml = '<option value="">-- Choose Package --</option>';
    Object.entries(data).forEach(([key, pkg]) => { 
        const safeName = pkg.name.replace(/'/g, "\\'"); 
        tableHtml += `<tr><td style="font-weight: 500; color: #111827;">${pkg.name}</td><td style="color: #10b981; font-weight: 600;">$${pkg.price.toFixed(2)}</td><td>${pkg.uptimeLimit}</td><td>${pkg.dataLimit}</td><td><span class="badge-neutral">${pkg.speedLimit}</span></td><td style="text-align: right;"><button class="btn-action" onclick="editPackage('${key}', '${safeName}', ${pkg.price}, '${pkg.uptimeLimit}', '${pkg.dataLimit}', '${pkg.speedLimit}')">✏️</button><button class="btn-action" onclick="deletePackage('${key}', '${safeName}')">🗑️</button></td></tr>`; 
        btnHtml += `<button style="background-color: #ffffff; border: 1px solid #e5e7eb; color: #111827; padding: 14px 15px; border-radius: 8px; cursor: pointer; width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.borderColor='#0ea5e9'; this.style.boxShadow='0 2px 8px rgba(14, 165, 233, 0.15)';" onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)';" onclick="generateDynamicToken('${safeName}', ${pkg.price}, '${pkg.uptimeLimit}', '${pkg.dataLimit}', '${pkg.speedLimit}')"><div style="font-weight: 600; font-size: 1rem;">${pkg.name}</div><div style="color: #10b981; font-weight:700; font-size: 1rem;">$${pkg.price.toFixed(2)}</div></button>`;
        selectHtml += `<option value="${safeName}|${pkg.price}|${pkg.uptimeLimit}|${pkg.dataLimit}|${pkg.speedLimit}">${pkg.name} ($${pkg.price.toFixed(2)})</option>`;
    }); 
    tbody.innerHTML = tableHtml; btnContainer.innerHTML = btnHtml; bulkSelect.innerHTML = selectHtml;
});

// ==========================================
// MODULE: WI-FI HOTSPOT (DYNAMIC TOKEN GEN)
// ==========================================
const vouchersRef = ref(db, 'cafes/blessmas/wifi_vouchers'); let isGenerating = false;
window.generateDynamicToken = function(name, price, uptime, dataLimit, speed) { 
    if(!currentUser) return alert("You must clock in to generate tokens!");
    if(isGenerating) return; isGenerating = true; setTimeout(() => { isGenerating = false; }, 2000);
    const phoneInput = document.getElementById('customer-phone').value;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let newToken = ''; 
    for (let i = 0; i < 5; i++) newToken += chars.charAt(Math.floor(Math.random() * chars.length)); 
    document.getElementById('generated-token').innerText = newToken; 
    
    push(vouchersRef, { code: newToken, package: name, label: name, price: price, uptimeLimit: uptime, dataLimit: dataLimit, speedLimit: speed, status: "active", cashier: currentUser, branch: currentBranch, phone: phoneInput, createdAt: Date.now() }); 
    if(price > 0) { currentShiftSales += price; window.updateShiftSalesUI(); push(transactionsRef, { type: 'inflow', description: `Sold Wi-Fi Token: ${newToken} (${name})`, amount: price, category: 'Wi-Fi', cashier: currentUser, branch: currentBranch, createdAt: Date.now() }); }
    
    if(phoneInput) { 
        let formattedPhone = phoneInput.trim();
        if (formattedPhone.startsWith('0')) formattedPhone = '+263' + formattedPhone.substring(1);
        if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;
        push(ref(db, 'cafes/blessmas/commands/sms'), { to: formattedPhone, message: `Your Blessmas Wi-Fi Code is: ${newToken}\nPackage: ${name}\nEnjoy your browsing!`, status: 'pending', timestamp: Date.now() });
        alert(`Token generated! SMS queued for ${formattedPhone}`); 
    }
    document.getElementById('customer-phone').value = '';
}

// ==========================================
// MODULE: REAL-TIME LIVE NETWORK TELEMETRY
// ==========================================
const liveNetworkRef = ref(db, 'cafes/blessmas/live_network');
window.liveActiveCodes = [];
onValue(liveNetworkRef, (snapshot) => {
    const tbody = document.getElementById('live-network-list'); const rawData = snapshot.val();
    let deviceArray = []; if (rawData) { deviceArray = Array.isArray(rawData) ? rawData : Object.values(rawData); }
    window.liveActiveCodes = []; 
    if(deviceArray.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #9ca3af;">No devices physically connected right now.</td></tr>'; 
        document.getElementById('total-down-speed').innerText = "0.00 Mbps"; document.getElementById('total-up-speed').innerText = "0.00 Mbps"; document.getElementById('network-active-count').innerText = "0";
        if (typeof window.renderVoucherTable === 'function') window.renderVoucherTable(); return; 
    }
    let html = ''; let totalDown = 0; let totalUp = 0;
    deviceArray.forEach(device => {
        totalDown += parseFloat(device.downloadSpeed || 0); totalUp += parseFloat(device.uploadSpeed || 0); window.liveActiveCodes.push(device.code); 
        html += `<tr><td><span class="live-dot"></span> Online</td><td style="font-weight: 600; font-family: monospace; font-size: 1.1rem; color:#111827;">${device.code}</td><td style="color: #6b7280; font-size: 0.8rem;">${device.ip}<br>${device.mac}</td><td style="color: #0ea5e9; font-weight:600;">${device.downloadSpeed} Mbps</td><td style="color: #f59e0b; font-weight:600;">${device.uploadSpeed} Mbps</td><td style="color: #10b981; font-weight:600;">${device.timeleft}</td><td><button class="btn-print" onclick="kickUser('${device.code}', '${device.mac}')" style="background:white; color:#ef4444; border-color:#fca5a5;">Disconnect</button></td></tr>`;
    });
    tbody.innerHTML = html;
    document.getElementById('total-down-speed').innerText = totalDown.toFixed(2) + " Mbps"; document.getElementById('total-up-speed').innerText = totalUp.toFixed(2) + " Mbps"; document.getElementById('network-active-count').innerText = deviceArray.length;
    if (typeof window.renderVoucherTable === 'function') window.renderVoucherTable();
});

// ==========================================
// MODULE: RECENT VOUCHERS (HOTSPOT TAB)
// ==========================================
function getExpiryData(createdAt, uptimeStr) {
    if (!uptimeStr || String(uptimeStr).trim() === '' || String(uptimeStr).toLowerCase() === 'unlimited') return { text: 'Never Expires', ms: 0 };
    let msToAdd = 0; const str = String(uptimeStr).toLowerCase(); const val = parseInt(str); 
    if (isNaN(val)) return { text: 'Unknown', ms: 0 };
    if (str.includes('m') && !str.includes('mo')) { msToAdd = val * 60 * 1000; } else if (str.includes('h')) { msToAdd = val * 60 * 60 * 1000; } else if (str.includes('d')) { msToAdd = val * 24 * 60 * 60 * 1000; } else { msToAdd = val * 60 * 60 * 1000; }
    const expiryMs = createdAt + msToAdd; const dateObj = new Date(expiryMs); return { text: `${dateObj.toLocaleDateString([], {month: 'short', day: 'numeric'})}, ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, ms: expiryMs };
}

let rawVoucherData = null; let renderVoucherTimeout = null; window.pendingVoucherUpdates = new Set(); 
onValue(vouchersRef, (snapshot) => { 
    rawVoucherData = snapshot.val(); 
    if (currentUser) { clearTimeout(renderVoucherTimeout); renderVoucherTimeout = setTimeout(() => { window.renderVoucherTable(); }, 200); }
});

window.renderVoucherTable = function() {
    const tbody = document.getElementById('voucher-list'); if(!tbody) return;
    if (!rawVoucherData) { tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #9ca3af;">No tokens generated yet.</td></tr>'; return; }
    let vouchersArray = Object.entries(rawVoucherData).map(([key, val]) => ({ key, ...val })).sort((a, b) => b.createdAt - a.createdAt); 
    
    // 1. Branch Filter
    if (dashboardBranchFilter !== 'all') {
        vouchersArray = vouchersArray.filter(v => {
            const safeBranch = v.branch || 'branch_main';
            return safeBranch === dashboardBranchFilter;
        });
    }

    // 2. Strict Cashier Filter
    if (currentRole !== 'admin') {
        vouchersArray = vouchersArray.filter(v => 
            String(v.cashier).trim().toLowerCase() === String(currentUser).trim().toLowerCase()
        );
    }

    const startDateInput = document.getElementById('wifi-start-date')?.value; const endDateInput = document.getElementById('wifi-end-date')?.value; let isFiltered = false;
    if (startDateInput) { const startMs = new Date(startDateInput + 'T00:00:00').getTime(); vouchersArray = vouchersArray.filter(v => v.createdAt >= startMs); isFiltered = true; }
    if (endDateInput) { const endMs = new Date(endDateInput + 'T23:59:59').getTime(); vouchersArray = vouchersArray.filter(v => v.createdAt <= endMs); isFiltered = true; }
    if (!isFiltered) vouchersArray = vouchersArray.slice(0, 100);
    if (vouchersArray.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #9ca3af;">No tokens found for this criteria.</td></tr>'; return; }
    
    let tableHTML = '';
    vouchersArray.forEach(v => { 
        const dateStr = new Date(v.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); 
        const deliveryBadge = v.cashier === 'BULK_SYSTEM' ? `<span class="badge-neutral" style="color: #8b5cf6; border-color: #8b5cf6;">🖨️ Bulk Print</span>` : (v.phone ? `<span class="badge-neutral" style="color: #0ea5e9; border-color: #0ea5e9;">📱 SMS Sent</span>` : `<span class="badge-neutral">📄 Printed</span>`);
        
        const safeBranch = v.branch || 'branch_main';
        let branchTag = dashboardBranchFilter === 'all' ? `<span style="font-size:0.7rem; background:#e2e8f0; padding:2px 4px; border-radius:4px;">${safeBranch.replace('branch_', '').toUpperCase()}</span>` : '';
        const cashierDisplay = `<div style="font-size: 0.7rem; color: #9ca3af; margin-top: 4px; font-weight: 600;">by ${v.cashier || 'Unknown'} ${branchTag}</div>`;
        const isConnected = window.liveActiveCodes && window.liveActiveCodes.includes(v.code);

        if (isConnected && v.status === 'active' && !window.pendingVoucherUpdates.has(v.key)) {
            window.pendingVoucherUpdates.add(v.key); const now = Date.now();
            update(ref(db, 'cafes/blessmas/wifi_vouchers/' + v.key), { status: 'used', startedAt: now }).then(() => { window.pendingVoucherUpdates.delete(v.key); });
            v.status = 'used'; v.startedAt = now;
        }

        let expiryText = `<span style="color: #0ea5e9; font-style: italic;">Pending Login</span>`; let isExpired = false;
        let startTime = v.startedAt || ((v.status === 'used' || v.status === 'voided') ? v.createdAt : null);
        if (startTime) { const expiryInfo = getExpiryData(startTime, v.uptimeLimit); expiryText = expiryInfo.text; isExpired = expiryInfo.ms > 0 && Date.now() > expiryInfo.ms; }

        let statusBadgeHTML = ''; let canVoid = false;
        if (v.status === 'voided') { statusBadgeHTML = `<span class="badge-neutral" style="background:#fee2e2; color:#ef4444; text-decoration: line-through;">VOIDED</span>`; } 
        else if (isExpired) { statusBadgeHTML = `<span class="badge-neutral" style="background:#f3f4f6; color:#9ca3af; text-decoration: line-through;">FINISHED</span>`; } 
        else if (isConnected) { statusBadgeHTML = `<span class="badge-active-small" style="background:#dcfce7; color:#16a34a; font-weight: 700;">🟢 CONNECTED</span>`; } 
        else if (v.status === 'used') { statusBadgeHTML = `<span class="badge-neutral" style="background:#fef3c7; color:#b45309; font-weight: 700;">🟡 PAUSED</span>`; canVoid = false; } 
        else { statusBadgeHTML = `<span class="badge-active-small" style="background:#e0f2fe; color:#0284c7;">READY</span>`; canVoid = true; }
        
        const safeLabel = v.label ? String(v.label).replace(/'/g, "\\'") : 'Token';
        let actionButtons = `<button class="btn-print" onclick="printReceipt('${v.code}', '${safeLabel}', ${v.price || 0}, '${v.uptimeLimit || 'Unlimited'}', '${v.dataLimit || 'Unlimited'}', '${dateStr}')">🖨️ Print</button>`;
        if (canVoid) actionButtons += `<button class="btn-action" style="font-size:0.8rem; background:#fee2e2; color:#ef4444; padding:4px 8px; border:1px solid #fca5a5; border-radius:4px; margin-left:5px;" onclick="voidToken('${v.key}', '${v.code}', ${v.price || 0}, '${safeLabel}')">🚫 Void</button>`;
        tableHTML += `<tr><td style="font-family: monospace; font-size: 1.1rem; font-weight: 600; color: #111827;">${v.code}</td><td style="font-weight:500;">${v.label}</td><td>${deliveryBadge}${cashierDisplay}</td><td>${statusBadgeHTML}</td><td style="color:#6b7280; font-size:0.8rem;">${new Date(v.createdAt).toLocaleDateString([], {month:'short', day:'numeric'})} ${dateStr}</td><td style="color:#374151; font-size:0.8rem; font-weight:500;">${expiryText}</td><td>${actionButtons}</td></tr>`; 
    }); 
    tbody.innerHTML = tableHTML;
}

window.voidToken = function(voucherKey, code, price, label) {
    if(!confirm(`⚠️ Are you sure you want to VOID token ${code}?\n\nThis will disable the code and refund $${price.toFixed(2)} from your shift expected cash.`)) return;
    update(ref(db, 'cafes/blessmas/wifi_vouchers/' + voucherKey), { status: 'voided', updatedAt: Date.now() });
    if (price > 0) { currentShiftSales -= price; window.updateShiftSalesUI(); push(transactionsRef, { type: 'inflow', description: `VOID REFUND: Token ${code} (${label})`, amount: -Math.abs(price), category: 'Wi-Fi', cashier: currentUser, branch: currentBranch, createdAt: Date.now() }); }
    push(ref(db, 'cafes/blessmas/commands/kick'), { code: code, mac: 'VOID', timestamp: Date.now() }); alert(`Token ${code} has been voided. Shift cash adjusted.`);
}

window.printReceipt = function(code, label, price, uptime, data, timeStr) { 
    const priceDisplay = price > 0 ? `$${parseFloat(price).toFixed(2)}` : 'FREE'; const printWindow = window.open('', '_blank', 'width=300,height=450'); 
    printWindow.document.write(`<html><head><style>body { font-family: monospace; text-align: center; width: 58mm; color: black; margin: 0 auto; } h2 { margin: 5px 0; font-size: 1.2rem; } .code { font-size: 2.2rem; font-weight: bold; margin: 10px 0; border: 2px dashed #000; padding: 5px; } p { margin: 5px 0; font-size: 0.9rem; } .details { text-align: left; font-size: 0.85rem; margin: 10px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px 0; } .details div { display: flex; justify-content: space-between; margin-bottom: 2px; }</style></head><body><h2>Blessmas Wi-Fi</h2><p>Wi-Fi Access Code</p><div class="code">${code}</div><div class="details"><div><span>Package:</span> <strong>${label}</strong></div><div><span>Amount:</span> <strong>${priceDisplay}</strong></div><div><span>Time Limit:</span> <strong>${uptime && uptime !== 'undefined' ? uptime : 'Unlimited'}</strong></div><div><span>Data Limit:</span> <strong>${data && data !== 'undefined' ? data : 'Unlimited'}</strong></div></div><p>Generated: ${timeStr}</p><hr><p>Powered by IntraCore.Digital</p></body></html>`); 
    printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); printWindow.close(); }, 250); 
}

// ==========================================
// MODULE: BULK PRINTING
// ==========================================
let latestBulkBatch = []; 
window.generateBulkTokens = function() {
    if(!currentUser) return alert("You must clock in to generate tokens!");
    if(currentRole !== 'admin') return alert("Only Administrators can generate bulk inventory!");
    const qty = parseInt(document.getElementById('bulk-qty').value); const pkgData = document.getElementById('bulk-pkg-select').value.split('|');
    if(pkgData.length < 5) return alert("Please select a valid package.");
    const [name, priceStr, uptime, dataLimit, speed] = pkgData; const price = parseFloat(priceStr); const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; latestBulkBatch = []; 
    document.getElementById('btn-bulk-gen').innerText = "Generating...";
    for(let j = 0; j < qty; j++) {
        let newToken = ''; for (let i = 0; i < 5; i++) newToken += chars.charAt(Math.floor(Math.random() * chars.length)); 
        latestBulkBatch.push({ code: newToken, package: name, price: price, uptime: uptime, data: dataLimit });
        push(vouchersRef, { code: newToken, package: name, label: name, price: price, uptimeLimit: uptime, dataLimit: dataLimit, speedLimit: speed, status: "active", cashier: "BULK_SYSTEM", branch: currentBranch, phone: "", createdAt: Date.now() });
    }
    document.getElementById('btn-bulk-gen').style.display = 'none'; document.getElementById('bulk-count-display').innerText = qty; document.getElementById('bulk-print-preview').style.display = 'block';
}

window.printBulkGrid = function() {
    if(latestBulkBatch.length === 0) return alert("No batch found to print.");
    const printWindow = window.open('', '_blank');
    let html = `<html><head><title>Print Vouchers</title><style>body { font-family: 'Arial', sans-serif; margin: 0; padding: 10px; } .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; } .ticket { border: 2px dashed #9ca3af; padding: 12px; text-align: center; page-break-inside: avoid; border-radius: 8px;} .brand { font-size: 14px; font-weight: bold; color: #000; margin-bottom: 2px; } .pkg { font-size: 13px; color: #111827; margin-bottom: 8px; font-weight: 700; } .code { font-size: 26px; font-family: monospace; font-weight: 900; letter-spacing: 3px; border: 1px solid #000; padding: 8px; background: #f9fafb; margin-bottom: 8px; } .details-bar { display: flex; justify-content: space-between; background: #f3f4f6; padding: 5px 8px; font-size: 11px; font-weight: 600; color: #374151; border-radius: 4px; border: 1px solid #e5e7eb; } .footer { font-size: 10px; color: #6b7280; margin-top: 6px; } @media print { .grid { grid-template-columns: repeat(3, 1fr); gap: 10px; } }</style></head><body><div class="grid">`;
    latestBulkBatch.forEach(v => { html += `<div class="ticket"><div class="brand">Blessmas Wi-Fi</div><div class="pkg">${v.package}</div><div class="code">${v.code}</div><div class="details-bar"><span>⏱️ ${v.uptime || 'Unlimited'}</span><span>📶 ${v.data || 'Unlimited'}</span><span style="color:#10b981;">💰 ${v.price > 0 ? '$'+v.price.toFixed(2) : 'FREE'}</span></div><div class="footer">Connect & enter code to start</div></div>`; });
    html += `</div></body></html>`;
    printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); }, 500); window.closeAllPanels();
}

window.kickUser = function(code, mac) { if(!confirm(`⚠️ Are you sure you want to disconnect ${code}?`)) return; push(ref(db, 'cafes/blessmas/commands/kick'), { code: code, mac: mac, timestamp: Date.now() }); }
