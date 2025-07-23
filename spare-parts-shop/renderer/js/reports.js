const { ipcRenderer } = require('electron');
const Chart = require('chart.js/auto');

// DOM Elements
const reportTypeSelect = document.getElementById('report-type');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const groupBySelect = document.getElementById('group-by');
const generateBtn = document.getElementById('generate-report-btn');
const dynamicFilters = document.getElementById('dynamic-filters');
const reportSummary = document.getElementById('report-summary');
const reportChartCtx = document.getElementById('report-chart');
const reportTable = document.getElementById('report-table');

// Set default dates
dateFromInput.valueAsDate = new Date(new Date().setDate(1)); // First day of current month
dateToInput.valueAsDate = new Date(); // Today

// Chart instance
let reportChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadReportTypes();
    setupEventListeners();
    generateReport();
});

function loadReportTypes() {
    // Could be extended to load from config
    const reportTypes = [
        { value: 'sales', label: 'Sales Report' },
        { value: 'inventory', label: 'Inventory Report' },
        { value: 'purchases', label: 'Purchases Report' },
        { value: 'profit', label: 'Profit & Loss' },
        { value: 'customer', label: 'Customer Sales' },
        { value: 'supplier', label: 'Supplier Purchases' }
    ];
}

function setupEventListeners() {
    generateBtn.addEventListener('click', generateReport);
    reportTypeSelect.addEventListener('change', updateDynamicFilters);
    
    // Export buttons
    document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);
    document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
    document.getElementById('print-report-btn').addEventListener('click', printReport);
    document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
    document.getElementById('export-excel-table-btn').addEventListener('click', exportTableToExcel);
    document.getElementById('export-pdf-table-btn').addEventListener('click', exportTableToPDF);
}

function updateDynamicFilters() {
    const reportType = reportTypeSelect.value;
    let filtersHTML = '';

    switch(reportType) {
        case 'sales':
            filtersHTML = `
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <label class="form-label">Sales Person</label>
                            <select class="form-select" id="sales-person-filter">
                                <option value="all">All</option>
                                <!-- Will be populated by JS -->
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Payment Method</label>
                            <select class="form-select" id="payment-method-filter">
                                <option value="all">All</option>
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="credit">Credit</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Customer Type</label>
                            <select class="form-select" id="customer-type-filter">
                                <option value="all">All</option>
                                <option value="retail">Retail</option>
                                <option value="wholesale">Wholesale</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'inventory':
            filtersHTML = `
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <label class="form-label">Category</label>
                            <select class="form-select" id="category-filter">
                                <option value="all">All Categories</option>
                                <!-- Will be populated by JS -->
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Brand</label>
                            <select class="form-select" id="brand-filter">
                                <option value="all">All Brands</option>
                                <!-- Will be populated by JS -->
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Stock Status</label>
                            <select class="form-select" id="stock-status-filter">
                                <option value="all">All</option>
                                <option value="low">Low Stock</option>
                                <option value="out">Out of Stock</option>
                                <option value="available">In Stock</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
            break;
        // Add cases for other report types
    }

    dynamicFilters.innerHTML = filtersHTML;
    loadFilterOptions();
}

function loadFilterOptions() {
    const reportType = reportTypeSelect.value;
    
    if (reportType === 'sales') {
        ipcRenderer.invoke('get-sales-persons').then(persons => {
            const select = document.getElementById('sales-person-filter');
            persons.forEach(person => {
                const option = document.createElement('option');
                option.value = person.id;
                option.textContent = person.name;
                select.appendChild(option);
            });
        });
    }
    
    if (reportType === 'inventory') {
        ipcRenderer.invoke('get-categories').then(categories => {
            const select = document.getElementById('category-filter');
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
        });
        
        ipcRenderer.invoke('get-brands').then(brands => {
            const select = document.getElementById('brand-filter');
            brands.forEach(brand => {
                const option = document.createElement('option');
                option.value = brand.id;
                option.textContent = brand.name;
                select.appendChild(option);
            });
        });
    }
}

function generateReport() {
    const reportType = reportTypeSelect.value;
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    const groupBy = groupBySelect.value;
    
    let filters = {};
    switch(reportType) {
        case 'sales':
            filters = {
                salesPerson: document.getElementById('sales-person-filter').value,
                paymentMethod: document.getElementById('payment-method-filter').value,
                customerType: document.getElementById('customer-type-filter').value
            };
            break;
        case 'inventory':
            filters = {
                category: document.getElementById('category-filter').value,
                brand: document.getElementById('brand-filter').value,
                stockStatus: document.getElementById('stock-status-filter').value
            };
            break;
    }

    showLoading(true);
    
    ipcRenderer.invoke('generate-report', {
        reportType,
        dateFrom,
        dateTo,
        groupBy,
        filters
    }).then(reportData => {
        showLoading(false);
        updateReportSummary(reportData.summary);
        updateReportChart(reportData.chartData);
        updateReportTable(reportData.tableData);
    }).catch(error => {
        showLoading(false);
        console.error('Error generating report:', error);
        alert('Failed to generate report. Please try again.');
    });
}

function updateReportSummary(summary) {
    let summaryHTML = '';
    
    summary.forEach(item => {
        summaryHTML += `
            <div class="col-md-3">
                <div class="card summary-card ${item.color || ''}">
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2">${item.title}</h6>
                        <h3 class="card-title">${item.value}</h3>
                        ${item.change ? `<span class="badge ${item.change >= 0 ? 'bg-success' : 'bg-danger'}">
                            ${item.change >= 0 ? '+' : ''}${item.change}%
                        </span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    reportSummary.innerHTML = summaryHTML;
}

function updateReportChart(chartData) {
    if (reportChart) {
        reportChart.destroy();
    }
    
    reportChart = new Chart(reportChartCtx, {
        type: chartData.type || 'bar',
        data: {
            labels: chartData.labels,
            datasets: chartData.datasets
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: chartData.title
                }
            }
        }
    });
}

function updateReportTable(tableData) {
    // Clear existing table
    reportTable.innerHTML = `
        <thead>
            <tr>
                ${tableData.headers.map(header => `<th>${header}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${tableData.rows.map(row => `
                <tr>
                    ${row.map(cell => `<td>${cell}</td>`).join('')}
                </tr>
            `).join('')}
        </tbody>
    `;
}

function showLoading(show) {
    if (show) {
        generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Generating...';
        generateBtn.disabled = true;
    } else {
        generateBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Generate';
        generateBtn.disabled = false;
    }
}

// Export Functions
function exportToExcel() {
    ipcRenderer.send('export-report', {
        type: 'excel',
        reportType: reportTypeSelect.value,
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value
    });
}

function exportToPDF() {
    ipcRenderer.send('export-report', {
        type: 'pdf',
        reportType: reportTypeSelect.value,
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value
    });
}

function printReport() {
    ipcRenderer.send('print-report', {
        reportType: reportTypeSelect.value,
        dateFrom: dateFromInput.value,
        dateTo: dateToInput.value
    });
}

function exportToCSV() {
    // Get current table data and export as CSV
    const headers = Array.from(reportTable.querySelectorAll('thead th')).map(th => th.textContent);
    const rows = Array.from(reportTable.querySelectorAll('tbody tr')).map(tr => 
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent)
    );
    
    ipcRenderer.send('export-csv', { headers, rows });
}

function exportTableToExcel() {
    // Similar to exportToExcel but for current table view only
    const tableData = {
        headers: Array.from(reportTable.querySelectorAll('thead th')).map(th => th.textContent),
        rows: Array.from(reportTable.querySelectorAll('tbody tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent)
        )
    };
    
    ipcRenderer.send('export-table-excel', tableData);
}

function exportTableToPDF() {
    // Similar to exportToPDF but for current table view only
    const tableData = {
        headers: Array.from(reportTable.querySelectorAll('thead th')).map(th => th.textContent),
        rows: Array.from(reportTable.querySelectorAll('tbody tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent)
        )
    };
    
    ipcRenderer.send('export-table-pdf', tableData);
}

// Listen for report type changes to update filters
reportTypeSelect.addEventListener('change', updateDynamicFilters);

// Initial setup
updateDynamicFilters();