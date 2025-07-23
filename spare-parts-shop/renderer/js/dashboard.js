document.addEventListener('DOMContentLoaded', async function() {
    // Initialize dashboard
    await initDashboard();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check for low stock alerts
    checkForAlerts();
    
    // Listen for low stock alerts from main process
    window.electronAPI.receive('low-stock-alert', (items) => {
        showLowStockNotification(items);
    });
});

async function initDashboard() {
    // Load dashboard stats
    const stats = await window.electronAPI.invoke('db-query', {
        query: `SELECT 
                (SELECT COUNT(*) FROM inventory) as total_items,
                (SELECT COUNT(*) FROM inventory WHERE quantity <= reorder_level) as low_stock_items,
                (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE date(sale_date) = date('now')) as today_sales,
                (SELECT COALESCE(SUM(balance), 0) FROM sales WHERE balance > 0) as pending_payments`
    });
    
    // Update stats cards
    document.getElementById('total-items').textContent = stats[0].total_items;
    document.getElementById('low-stock-items').textContent = stats[0].low_stock_items;
    document.getElementById('today-sales').textContent = formatCurrency(stats[0].today_sales);
    document.getElementById('pending-payments').textContent = formatCurrency(stats[0].pending_payments);
    
    // Load recent sales
    const recentSales = await window.electronAPI.invoke('db-query', {
        query: `SELECT s.invoice_number, 
                       COALESCE(c.name, 'Walk-in Customer') as customer, 
                       s.total_amount, 
                       strftime('%d-%m-%Y %H:%M', s.sale_date) as sale_date
                FROM sales s
                LEFT JOIN customers c ON s.customer_id = c.id
                ORDER BY s.sale_date DESC
                LIMIT 5`
    });
    
    const salesTable = document.getElementById('recent-sales');
    salesTable.innerHTML = recentSales.map(sale => `
        <tr>
            <td><a href="#" class="view-sale" data-id="${sale.invoice_number}">${sale.invoice_number}</a></td>
            <td>${sale.customer}</td>
            <td>${formatCurrency(sale.total_amount)}</td>
            <td>${sale.sale_date}</td>
        </tr>
    `).join('');
    
    // Load low stock items
    const lowStockItems = await window.electronAPI.invoke('db-query', {
        query: `SELECT part_code, name, quantity, reorder_level 
                FROM inventory 
                WHERE quantity <= reorder_level
                ORDER BY quantity ASC
                LIMIT 5`
    });
    
    const lowStockTable = document.getElementById('low-stock-list');
    lowStockTable.innerHTML = lowStockItems.map(item => `
        <tr>
            <td>${item.part_code}</td>
            <td>${item.name}</td>
            <td><span class="badge bg-warning">${item.quantity}</span></td>
            <td>${item.reorder_level}</td>
        </tr>
    `).join('');
    
    // Initialize charts
    initSalesChart();
    initCategoryChart();
}

function setupEventListeners() {
    // Sidebar toggle
    document.querySelector('.toggle-sidebar').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('active');
        document.querySelector('.main-content').classList.toggle('active');
    });
    
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            if (page !== 'dashboard') {
                // In a real app, we would load the requested page
                alert(`Navigating to ${page} page - implementation would load this page`);
            }
        });
    });
    
    // New sale button
    document.querySelector('.new-sale-btn').addEventListener('click', function() {
        // In a real app, this would open the POS screen
        alert('Opening POS screen for new sale');
    });
    
    // Notification bell
    document.querySelector('.notification-bell').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('notificationModal'));
        modal.show();
    });
    
    // View low stock items
    document.getElementById('view-low-stock').addEventListener('click', function(e) {
        e.preventDefault();
        alert('Showing all low stock items - would navigate to inventory with filter');
    });
    
    // View pending payments
    document.getElementById('view-pending-payments').addEventListener('click', function(e) {
        e.preventDefault();
        alert('Showing pending payments - would navigate to sales with filter');
    });
    
    // Sales period filter
    document.getElementById('sales-period').addEventListener('change', function() {
        updateSalesChart(this.value);
    });
}

async function checkForAlerts() {
    const lowStockItems = await window.electronAPI.invoke('db-query', {
        query: `SELECT COUNT(*) as count FROM inventory WHERE quantity <= reorder_level`
    });
    
    if (lowStockItems[0].count > 0) {
        document.querySelector('.notification-count').textContent = lowStockItems[0].count;
        document.querySelector('.notification-count').style.display = 'block';
    }
}

function showLowStockNotification(items) {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';
    
    items.forEach(item => {
        const notificationItem = document.createElement('div');
        notificationItem.className = 'alert alert-warning mb-2';
        notificationItem.innerHTML = `
            <div class="d-flex justify-content-between">
                <strong>Low Stock: ${item.name}</strong>
                <small>${new Date().toLocaleTimeString()}</small>
            </div>
            <div>Current stock: ${item.quantity} (Reorder at ${item.reorder_level})</div>
        `;
        notificationList.appendChild(notificationItem);
    });
    
    // Show badge
    document.querySelector('.notification-count').textContent = items.length;
    document.querySelector('.notification-count').style.display = 'block';
    
    // Play sound
    const audio = new Audio('../assets/sounds/alert.mp3');
    audio.play().catch(e => console.log('Audio play failed:', e));
}

function initSalesChart() {
    const ctx = document.getElementById('salesChart').getContext('2d');
    window.salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Sales Amount',
                data: [],
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                borderColor: 'rgba(67, 97, 238, 1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
    
    // Load initial data (last 30 days)
    updateSalesChart(30);
}

async function updateSalesChart(days) {
    const salesData = await window.electronAPI.invoke('db-query', {
        query: `SELECT date(sale_date) as day, SUM(total_amount) as total
                FROM sales
                WHERE date(sale_date) >= date('now', '-${days} days')
                GROUP BY date(sale_date)
                ORDER BY date(sale_date)`
    });
    
    const labels = [];
    const data = [];
    
    // Fill in all dates in the range, even if no sales
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        labels.push(formatDate(d));
        
        const sale = salesData.find(s => s.day === dateStr);
        data.push(sale ? sale.total : 0);
    }
    
    window.salesChart.data.labels = labels;
    window.salesChart.data.datasets[0].data = data;
    window.salesChart.update();
}

function initCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    window.categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    'rgba(67, 97, 238, 0.8)',
                    'rgba(244, 63, 94, 0.8)',
                    'rgba(248, 150, 30, 0.8)',
                    'rgba(72, 149, 239, 0.8)',
                    'rgba(76, 201, 240, 0.8)',
                    'rgba(139, 92, 246, 0.8)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
    
    // Load category data
    updateCategoryChart();
}

async function updateCategoryChart() {
    const categoryData = await window.electronAPI.invoke('db-query', {
        query: `SELECT c.name as category, SUM(si.total_price) as total
                FROM sale_items si
                JOIN inventory i ON si.inventory_id = i.id
                JOIN categories c ON i.category_id = c.id
                WHERE date(s.sale_date) >= date('now', '-30 days')
                GROUP BY c.name
                ORDER BY total DESC`
    });
    
    window.categoryChart.data.labels = categoryData.map(c => c.category);
    window.categoryChart.data.datasets[0].data = categoryData.map(c => c.total);
    window.categoryChart.update();
}

// Helper functions
function formatCurrency(amount) {
    // Get currency from settings (default to PKR)
    const currency = 'PKR';
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount).replace(currency, '').trim() + ' ' + currency;
}

function formatDate(date) {
    if (typeof date === 'string') {
        date = new Date(date);
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}