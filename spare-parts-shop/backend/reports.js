const { ipcMain } = require('electron');
const db = require('./db');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// Report generation handler
ipcMain.handle('generate-report', async (event, params) => {
    try {
        const { reportType, dateFrom, dateTo, groupBy, filters } = params;
        
        let reportData = {};
        
        switch(reportType) {
            case 'sales':
                reportData = await generateSalesReport(dateFrom, dateTo, groupBy, filters);
                break;
            case 'inventory':
                reportData = await generateInventoryReport(filters);
                break;
            case 'purchases':
                reportData = await generatePurchasesReport(dateFrom, dateTo, groupBy);
                break;
            case 'profit':
                reportData = await generateProfitReport(dateFrom, dateTo, groupBy);
                break;
            case 'customer':
                reportData = await generateCustomerReport(dateFrom, dateTo);
                break;
            case 'supplier':
                reportData = await generateSupplierReport(dateFrom, dateTo);
                break;
            default:
                throw new Error('Invalid report type');
        }
        
        return reportData;
    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
});

async function generateSalesReport(dateFrom, dateTo, groupBy, filters) {
    // Build SQL query based on filters
    let query = `
        SELECT 
            ${getGroupByField(groupBy)} AS period,
            COUNT(*) AS total_sales,
            SUM(total_amount) AS total_revenue,
            SUM(profit) AS total_profit
        FROM sales
        WHERE sale_date BETWEEN ? AND ?
    `;
    
    const queryParams = [dateFrom, dateTo];
    
    // Add filters
    if (filters.salesPerson !== 'all') {
        query += ' AND sales_person_id = ?';
        queryParams.push(filters.salesPerson);
    }
    
    if (filters.paymentMethod !== 'all') {
        query += ' AND payment_method = ?';
        queryParams.push(filters.paymentMethod);
    }
    
    if (filters.customerType !== 'all') {
        query += ' AND customer_type = ?';
        queryParams.push(filters.customerType);
    }
    
    query += ` GROUP BY ${getGroupByField(groupBy)} ORDER BY period`;
    
    const salesData = await db.all(query, queryParams);
    
    // Prepare summary data
    const summary = [
        { title: 'Total Sales', value: salesData.reduce((sum, item) => sum + item.total_sales, 0) },
        { title: 'Total Revenue', value: formatCurrency(salesData.reduce((sum, item) => sum + item.total_revenue, 0)) },
        { title: 'Total Profit', value: formatCurrency(salesData.reduce((sum, item) => sum + item.total_profit, 0)) },
        { title: 'Avg. Sale', value: formatCurrency(salesData.reduce((sum, item) => sum + item.total_revenue, 0) / 
                                      salesData.reduce((sum, item) => sum + item.total_sales, 1)) }
    ];
    
    // Prepare chart data
    const chartData = {
        type: 'bar',
        title: 'Sales Report',
        labels: salesData.map(item => item.period),
        datasets: [
            {
                label: 'Revenue',
                data: salesData.map(item => item.total_revenue),
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            },
            {
                label: 'Profit',
                data: salesData.map(item => item.total_profit),
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }
        ]
    };
    
    // Prepare table data
    const tableData = {
        headers: ['Period', 'Sales Count', 'Revenue', 'Profit', 'Profit Margin'],
        rows: salesData.map(item => [
            item.period,
            item.total_sales,
            formatCurrency(item.total_revenue),
            formatCurrency(item.total_profit),
            `${Math.round((item.total_profit / item.total_revenue) * 100)}%`
        ])
    };
    
    return { summary, chartData, tableData };
}

async function generateInventoryReport(filters) {
    let query = `
        SELECT 
            p.id,
            p.name,
            p.code,
            p.price,
            p.cost,
            p.quantity,
            c.name AS category,
            b.name AS brand,
            (p.price - p.cost) AS profit_per_unit
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE 1=1
    `;
    
    const queryParams = [];
    
    // Add filters
    if (filters.category !== 'all') {
        query += ' AND p.category_id = ?';
        queryParams.push(filters.category);
    }
    
    if (filters.brand !== 'all') {
        query += ' AND p.brand_id = ?';
        queryParams.push(filters.brand);
    }
    
    if (filters.stockStatus === 'low') {
        query += ' AND p.quantity < p.low_stock_threshold AND p.quantity > 0';
    } else if (filters.stockStatus === 'out') {
        query += ' AND p.quantity <= 0';
    } else if (filters.stockStatus === 'available') {
        query += ' AND p.quantity > 0';
    }
    
    query += ' ORDER BY p.name';
    
    const inventoryData = await db.all(query, queryParams);
    
    // Prepare summary data
    const totalValue = inventoryData.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalCost = inventoryData.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
    const outOfStockCount = inventoryData.filter(item => item.quantity <= 0).length;
    const lowStockCount = inventoryData.filter(item => 
        item.quantity > 0 && item.quantity < (item.low_stock_threshold || 5)
    ).length;
    
    const summary = [
        { title: 'Total Items', value: inventoryData.length },
        { title: 'Inventory Value', value: formatCurrency(totalValue) },
        { title: 'Out of Stock', value: outOfStockCount, color: outOfStockCount > 0 ? 'bg-danger-light' : '' },
        { title: 'Low Stock', value: lowStockCount, color: lowStockCount > 0 ? 'bg-warning-light' : '' }
    ];
    
    // Prepare chart data (pie chart of categories)
    const categories = [...new Set(inventoryData.map(item => item.category))];
    const categoryValues = categories.map(category => 
        inventoryData
            .filter(item => item.category === category)
            .reduce((sum, item) => sum + (item.price * item.quantity), 0)
    );
    
    const chartData = {
        type: 'pie',
        title: 'Inventory by Category',
        labels: categories,
        datasets: [{
            data: categoryValues,
            backgroundColor: generateColors(categories.length)
        }]
    };
    
    // Prepare table data
    const tableData = {
        headers: ['Code', 'Name', 'Category', 'Brand', 'Price', 'Cost', 'Profit', 'Qty', 'Status'],
        rows: inventoryData.map(item => [
            item.code,
            item.name,
            item.category,
            item.brand,
            formatCurrency(item.price),
            formatCurrency(item.cost),
            formatCurrency(item.profit_per_unit),
            item.quantity,
            getStockStatus(item.quantity, item.low_stock_threshold)
        ])
    };
    
    return { summary, chartData, tableData };
}

// Other report generation functions (similar structure)
// ...

// Helper functions
function getGroupByField(groupBy) {
    switch(groupBy) {
        case 'day': return 'strftime("%Y-%m-%d", sale_date)';
        case 'week': return 'strftime("%Y-%W", sale_date)';
        case 'month': return 'strftime("%Y-%m", sale_date)';
        case 'year': return 'strftime("%Y", sale_date)';
        default: return 'strftime("%Y-%m-%d", sale_date)';
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function getStockStatus(quantity, threshold = 5) {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity < threshold) return 'Low Stock';
    return 'In Stock';
}

function generateColors(count) {
    const colors = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
        colors.push(`hsl(${i * hueStep}, 70%, 50%)`);
    }
    
    return colors;
}

// Export handlers
ipcMain.handle('export-report', async (event, { type, reportType, dateFrom, dateTo }) => {
    try {
        const reportData = await generateReportData(reportType, dateFrom, dateTo);
        
        if (type === 'excel') {
            return await exportExcel(reportData, reportType);
        } else if (type === 'pdf') {
            return await exportPDF(reportData, reportType);
        }
    } catch (error) {
        console.error('Export error:', error);
        throw error;
    }
});

async function exportExcel(reportData, reportType) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');
    
    // Add headers
    worksheet.addRow(reportData.tableData.headers);
    
    // Add data
    reportData.tableData.rows.forEach(row => {
        worksheet.addRow(row);
    });
    
    // Style headers
    worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
    });
    
    // Generate file
    const downloadsPath = require('electron').app.getPath('downloads');
    const filePath = path.join(downloadsPath, `${reportType}_report_${new Date().toISOString().slice(0,10)}.xlsx`);
    
    await workbook.xlsx.writeFile(filePath);
    return filePath;
}

async function exportPDF(reportData, reportType) {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(`${reportType.toUpperCase()} REPORT`, 105, 20, { align: 'center' });
    
    // Add date range if available
    if (reportData.dateFrom && reportData.dateTo) {
        doc.setFontSize(12);
        doc.text(`Date Range: ${reportData.dateFrom} to ${reportData.dateTo}`, 105, 30, { align: 'center' });
    }
    
    // Add table
    doc.autoTable({
        head: [reportData.tableData.headers],
        body: reportData.tableData.rows,
        startY: 40,
        styles: { 
            fontSize: 8,
            cellPadding: 2,
            halign: 'center'
        },
        headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontStyle: 'bold'
        }
    });
    
    // Generate file
    const downloadsPath = require('electron').app.getPath('downloads');
    const filePath = path.join(downloadsPath, `${reportType}_report_${new Date().toISOString().slice(0,10)}.pdf`);
    
    doc.save(filePath);
    return filePath;
}

// Other utility handlers
ipcMain.handle('get-sales-persons', async () => {
    return await db.all('SELECT id, name FROM users WHERE role IN ("admin", "sales") ORDER BY name');
});

ipcMain.handle('get-categories', async () => {
    return await db.all('SELECT id, name FROM categories ORDER BY name');
});

ipcMain.handle('get-brands', async () => {
    return await db.all('SELECT id, name FROM brands ORDER BY name');
});

module.exports = {
    generateSalesReport,
    generateInventoryReport,
    // Export other functions as needed
};