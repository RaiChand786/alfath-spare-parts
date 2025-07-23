const { ipcRenderer, contextBridge } = require('electron');
const Chart = require('chart.js/auto');

// Expose protected methods to the window object
contextBridge.exposeInMainWorld('electronAPI', {
    // Window control
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),

    // App functionality
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    openExternal: (url) => ipcRenderer.send('open-external', url),

    // Database operations
    executeQuery: (query, params) => ipcRenderer.invoke('execute-query', query, params),
    getProducts: () => ipcRenderer.invoke('get-products'),
    getCustomers: () => ipcRenderer.invoke('get-customers'),
    getSuppliers: () => ipcRenderer.invoke('get-suppliers'),

    // File operations
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    saveFile: (content, options) => ipcRenderer.invoke('save-file', content, options),

    // Print operations
    printInvoice: (invoiceId) => ipcRenderer.invoke('print-invoice', invoiceId),

    // Theme management
    getTheme: () => ipcRenderer.invoke('get-theme'),
    setTheme: (theme) => ipcRenderer.send('set-theme', theme),

    // Notification system
    showNotification: (options) => ipcRenderer.send('show-notification', options),

    // Security
    encryptData: (data) => ipcRenderer.invoke('encrypt-data', data),
    decryptData: (data) => ipcRenderer.invoke('decrypt-data', data)
});

// Initialize common UI components
document.addEventListener('DOMContentLoaded', () => {
    initializeSidebar();
    initializeTheme();
    loadDashboardStats();
    setupEventListeners();
});

function initializeSidebar() {
    const sidebarToggle = document.querySelector('.toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });

    // Highlight current page in sidebar
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    
    navLinks.forEach(link => {
        if (link.getAttribute('href').includes(currentPage)) {
            link.classList.add('active');
        }
    });
}

function initializeTheme() {
    window.electronAPI.getTheme().then(theme => {
        document.documentElement.setAttribute('data-theme', theme);
    });

    ipcRenderer.on('theme-changed', (event, theme) => {
        document.documentElement.setAttribute('data-theme', theme);
    });
}

function loadDashboardStats() {
    // Load dashboard statistics if on dashboard page
    if (window.location.pathname.includes('index.html')) {
        Promise.all([
            window.electronAPI.executeQuery('SELECT COUNT(*) FROM products'),
            window.electronAPI.executeQuery('SELECT COUNT(*) FROM customers'),
            window.electronAPI.executeQuery('SELECT SUM(total_amount) FROM sales WHERE date(sale_date) = date("now")'),
            window.electronAPI.executeQuery('SELECT COUNT(*) FROM sales WHERE date(sale_date) = date("now")')
        ]).then(([products, customers, dailyRevenue, dailySales]) => {
            document.getElementById('total-products').textContent = products[0]['COUNT(*)'];
            document.getElementById('total-customers').textContent = customers[0]['COUNT(*)'];
            document.getElementById('daily-revenue').textContent = formatCurrency(dailyRevenue[0]['SUM(total_amount)'] || 0);
            document.getElementById('daily-sales').textContent = dailySales[0]['COUNT(*)'];

            // Load sales chart
            loadSalesChart();
        });
    }
}

function loadSalesChart() {
    window.electronAPI.executeQuery(`
        SELECT date(sale_date) as day, SUM(total_amount) as amount 
        FROM sales 
        WHERE date(sale_date) >= date('now', '-30 days')
        GROUP BY date(sale_date)
        ORDER BY date(sale_date)
    `).then(data => {
        const ctx = document.getElementById('sales-chart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(row => new Date(row.day).toLocaleDateString()),
                datasets: [{
                    label: 'Daily Sales',
                    data: data.map(row => row.amount),
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
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
    });
}

function setupEventListeners() {
    // Global search functionality
    document.getElementById('global-search').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (searchTerm.length > 2) {
            ipcRenderer.send('global-search', searchTerm);
        }
    });

    // Notification button
    document.getElementById('notifications-btn').addEventListener('click', () => {
        ipcRenderer.send('show-notifications');
    });

    // User dropdown
    document.getElementById('user-dropdown').addEventListener('click', () => {
        document.getElementById('user-menu').classList.toggle('show');
    });

    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.classList.remove('show');
            });
        }
    });
}

// Helper functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

// Make helpers available to window
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;