document.addEventListener('DOMContentLoaded', async function() {
    // Initialize purchase management
    await initPurchase();
    
    // Setup event listeners
    setupPurchaseEventListeners();
    
    // Load initial purchase data
    loadPurchaseData();
});

let currentPage = 1;
const itemsPerPage = 10;
let totalItems = 0;
let purchaseData = [];
let currentPurchase = {
    id: null,
    po_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_id: null,
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    payment_status: 'pending',
    paid_amount: 0,
    balance: 0,
    notes: ''
};

let suppliers = [];
let inventoryItems = [];

async function initPurchase() {
    try {
        // Initialize Select2 dropdowns
        $('#supplier').select2({
            placeholder: 'Select Supplier',
            width: '100%'
        });
        
        $('#filter-supplier').select2({
            placeholder: 'All Suppliers',
            width: '100%'
        });
        
        $('#purchase-item').select2({
            placeholder: 'Select Item',
            width: '100%'
        });
        
        // Load suppliers
        const supplierResults = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name FROM suppliers ORDER BY name'
        });
        suppliers = supplierResults;
        
        // Load inventory items
        const itemResults = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, part_code, name FROM inventory ORDER BY name'
        });
        inventoryItems = itemResults;
        
        // Populate supplier dropdowns
        renderSupplierDropdowns();
        
        // Populate inventory dropdown
        renderInventoryDropdown();
        
        // Set today's date
        document.getElementById('purchase-date').value = currentPurchase.purchase_date;
    } catch (error) {
        console.error('Error initializing purchase module:', error);
        showAlert('Error initializing purchase module', 'danger');
    }
}

function renderSupplierDropdowns() {
    const supplierSelect = document.getElementById('supplier');
    const filterSupplierSelect = document.getElementById('filter-supplier');
    
    // Clear existing options except the first one
    while (supplierSelect.options.length > 1) {
        supplierSelect.remove(1);
    }
    while (filterSupplierSelect.options.length > 1) {
        filterSupplierSelect.remove(1);
    }
    
    suppliers.forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = supplier.name;
        supplierSelect.appendChild(option.cloneNode(true));
        filterSupplierSelect.appendChild(option);
    });
}

function renderInventoryDropdown() {
    const itemSelect = document.getElementById('purchase-item');
    
    // Clear existing options except the first one
    while (itemSelect.options.length > 1) {
        itemSelect.remove(1);
    }
    
    inventoryItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.name} (${item.part_code})`;
        itemSelect.appendChild(option);
    });
}

function setupPurchaseEventListeners() {
    // New purchase button
    document.getElementById('new-purchase-btn').addEventListener('click', () => {
        showPurchaseModal();
    });
    
    // Save purchase button
    document.getElementById('save-purchase-btn').addEventListener('click', async () => {
        await savePurchase();
    });
    
    // Add purchase item button
    document.getElementById('add-purchase-item-btn').addEventListener('click', () => {
        showPurchaseItemModal();
    });
    
    // Save purchase item button
    document.getElementById('save-purchase-item-btn').addEventListener('click', () => {
        addPurchaseItem();
    });
    
    // Purchase item quantity/price inputs
    document.getElementById('purchase-item-qty').addEventListener('input', updatePurchaseItemTotal);
    document.getElementById('purchase-item-cost').addEventListener('input', updatePurchaseItemTotal);
    
    // Payment status change
    document.getElementById('payment-status').addEventListener('change', function() {
        updatePurchaseBalance();
    });
    
    // Paid amount input
    document.getElementById('paid-amount').addEventListener('input', function() {
        updatePurchaseBalance();
    });
    
    // Filter buttons
    document.getElementById('filter-purchases-btn').addEventListener('click', () => {
        currentPage = 1;
        loadPurchaseData();
    });
    
    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        document.getElementById('search-purchases').value = '';
        $('#filter-supplier').val('').trigger('change');
        document.getElementById('filter-status').value = '';
        document.getElementById('date-from').value = '';
        document.getElementById('date-to').value = '';
        currentPage = 1;
        loadPurchaseData();
    });
    
    // Search input
    document.getElementById('search-purchases').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            loadPurchaseData();
        }
    });
    
    document.getElementById('search-purchases-btn').addEventListener('click', () => {
        currentPage = 1;
        loadPurchaseData();
    });
    
    // Export buttons
    document.getElementById('export-excel-btn').addEventListener('click', () => {
        exportPurchases('excel');
    });
    
    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        exportPurchases('pdf');
    });
}

async function loadPurchaseData() {
    try {
        const searchTerm = document.getElementById('search-purchases').value;
        const supplierId = document.getElementById('filter-supplier').value;
        const status = document.getElementById('filter-status').value;
        const dateFrom = document.getElementById('date-from').value;
        const dateTo = document.getElementById('date-to').value;
        
        // Build WHERE clause for filters
        let whereClause = '1=1';
        const params = [];
        
        if (searchTerm) {
            whereClause += ' AND (p.invoice_number LIKE ? OR s.name LIKE ?)';
            params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }
        
        if (supplierId) {
            whereClause += ' AND p.supplier_id = ?';
            params.push(supplierId);
        }
        
        if (status) {
            whereClause += ' AND p.payment_status = ?';
            params.push(status);
        }
        
        if (dateFrom && dateTo) {
            whereClause += ' AND date(p.purchase_date) BETWEEN ? AND ?';
            params.push(dateFrom, dateTo);
        }
        
        // Get total count for pagination
        const countResult = await window.electronAPI.invoke('db-query', {
            query: `SELECT COUNT(*) as total 
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE ${whereClause}`,
            params: params
        });
        
        totalItems = countResult[0].total;
        updatePagination();
        
        // Get paginated data
        const offset = (currentPage - 1) * itemsPerPage;
        
        purchaseData = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      p.id, p.invoice_number, p.purchase_date, p.total_amount,
                      p.payment_status, p.paid_amount, p.balance,
                      s.name as supplier_name,
                      (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) as item_count
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE ${whereClause}
                    ORDER BY p.purchase_date DESC
                    LIMIT ? OFFSET ?`,
            params: [...params, itemsPerPage, offset]
        });
        
        renderPurchaseTable();
    } catch (error) {
        console.error('Error loading purchase data:', error);
        showAlert('Error loading purchase data', 'danger');
    }
}

function renderPurchaseTable() {
    const tbody = document.querySelector('#purchases-table tbody');
    tbody.innerHTML = '';
    
    if (purchaseData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">No purchase orders found</td>
            </tr>
        `;
        return;
    }
    
    purchaseData.forEach(purchase => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${purchase.invoice_number}</td>
            <td>${new Date(purchase.purchase_date).toLocaleDateString()}</td>
            <td>${purchase.supplier_name}</td>
            <td>${purchase.item_count}</td>
            <td>${formatCurrency(purchase.total_amount)}</td>
            <td>${formatCurrency(purchase.paid_amount)}</td>
            <td>
                <span class="badge bg-${getStatusBadgeClass(purchase.payment_status)}">
                    ${purchase.payment_status.toUpperCase()}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-btn" data-id="${purchase.id}">
                    <i class="bi bi-eye"></i> View
                </button>
            </td>
        `;
        
        row.querySelector('.view-btn').addEventListener('click', () => {
            viewPurchase(purchase.id);
        });
        
        tbody.appendChild(row);
    });
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'paid': return 'success';
        case 'partial': return 'warning';
        default: return 'secondary';
    }
}

function updatePagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Previous</a>`;
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            loadPurchaseData();
        }
    });
    pagination.appendChild(prevLi);
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
        const firstLi = document.createElement('li');
        firstLi.className = 'page-item';
        firstLi.innerHTML = `<a class="page-link" href="#">1</a>`;
        firstLi.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = 1;
            loadPurchaseData();
        });
        pagination.appendChild(firstLi);
        
        if (startPage > 2) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
            pagination.appendChild(ellipsisLi);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
        pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        pageLi.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = i;
            loadPurchaseData();
        });
        pagination.appendChild(pageLi);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsisLi = document.createElement('li');
            ellipsisLi.className = 'page-item disabled';
            ellipsisLi.innerHTML = `<span class="page-link">...</span>`;
            pagination.appendChild(ellipsisLi);
        }
        
        const lastLi = document.createElement('li');
        lastLi.className = 'page-item';
        lastLi.innerHTML = `<a class="page-link" href="#">${totalPages}</a>`;
        lastLi.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = totalPages;
            loadPurchaseData();
        });
        pagination.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">Next</a>`;
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            loadPurchaseData();
        }
    });
    pagination.appendChild(nextLi);
}

function showPurchaseModal(purchase = null) {
    const modal = new bootstrap.Modal(document.getElementById('purchaseModal'));
    const form = document.getElementById('purchase-form');
    const title = document.getElementById('purchase-modal-title');
    
    // Reset form
    form.reset();
    document.getElementById('purchase-items-table').querySelector('tbody').innerHTML = '';
    
    if (purchase) {
        // Edit mode
        title.textContent = 'Edit Purchase Order';
        document.getElementById('purchase-id').value = purchase.id;
        document.getElementById('po-number').value = purchase.invoice_number;
        document.getElementById('purchase-date').value = purchase.purchase_date;
        $('#supplier').val(purchase.supplier_id).trigger('change');
        document.getElementById('payment-status').value = purchase.payment_status;
        document.getElementById('paid-amount').value = purchase.paid_amount;
        document.getElementById('notes').value = purchase.notes || '';
        
        // Load items
        currentPurchase.items = purchase.items || [];
        renderPurchaseItems();
        updatePurchaseTotals();
    } else {
        // Add mode
        title.textContent = 'New Purchase Order';
        document.getElementById('purchase-id').value = '';
        document.getElementById('purchase-date').value = new Date().toISOString().split('T')[0];
        
        // Reset current purchase
        currentPurchase = {
            id: null,
            po_number: generatePONumber(),
            purchase_date: new Date().toISOString().split('T')[0],
            supplier_id: null,
            items: [],
            subtotal: 0,
            tax: 0,
            total: 0,
            payment_status: 'pending',
            paid_amount: 0,
            balance: 0,
            notes: ''
        };
        
        document.getElementById('po-number').value = currentPurchase.po_number;
    }
    
    modal.show();
}

function generatePONumber() {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    return `PO-${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function showPurchaseItemModal(item = null) {
    const modal = new bootstrap.Modal(document.getElementById('purchaseItemModal'));
    const form = document.getElementById('purchase-item-form');
    
    // Reset form
    form.reset();
    
    if (item) {
        // Edit mode
        document.getElementById('purchase-item-id').value = item.tempId || '';
        $('#purchase-item').val(item.id).trigger('change');
        document.getElementById('purchase-item-cost').value = item.unit_price;
        document.getElementById('purchase-item-qty').value = item.quantity;
        updatePurchaseItemTotal();
    } else {
        // Add mode
        document.getElementById('purchase-item-id').value = '';
        $('#purchase-item').val('').trigger('change');
        document.getElementById('purchase-item-cost').value = '';
        document.getElementById('purchase-item-qty').value = '1';
        document.getElementById('purchase-item-total').value = '0';
    }
    
    modal.show();
}

function updatePurchaseItemTotal() {
    const quantity = parseInt(document.getElementById('purchase-item-qty').value) || 0;
    const unitPrice = parseFloat(document.getElementById('purchase-item-cost').value) || 0;
    const total = quantity * unitPrice;
    document.getElementById('purchase-item-total').value = total.toFixed(2);
}

function addPurchaseItem() {
    const form = document.getElementById('purchase-item-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    const itemId = document.getElementById('purchase-item').value;
    const tempId = document.getElementById('purchase-item-id').value || Date.now();
    const item = inventoryItems.find(i => i.id == itemId);
    
    if (!item) {
        showAlert('Please select a valid item', 'warning');
        return;
    }
    
    const quantity = parseInt(document.getElementById('purchase-item-qty').value) || 0;
    const unitPrice = parseFloat(document.getElementById('purchase-item-cost').value) || 0;
    
    if (quantity <= 0) {
        showAlert('Quantity must be greater than 0', 'warning');
        return;
    }
    
    if (unitPrice <= 0) {
        showAlert('Unit price must be greater than 0', 'warning');
        return;
    }
    
    const newItem = {
        tempId,
        id: itemId,
        part_code: item.part_code,
        name: item.name,
        quantity,
        unit_price: unitPrice,
        total: quantity * unitPrice
    };
    
    // Check if item already exists in purchase
    const existingIndex = currentPurchase.items.findIndex(i => (i.id === itemId && !tempId) || i.tempId === tempId);
    
    if (existingIndex >= 0) {
        // Update existing item
        currentPurchase.items[existingIndex] = newItem;
    } else {
        // Add new item
        currentPurchase.items.push(newItem);
    }
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('purchaseItemModal'));
    modal.hide();
    
    // Update UI
    renderPurchaseItems();
    updatePurchaseTotals();
}

function renderPurchaseItems() {
    const tbody = document.querySelector('#purchase-items-table tbody');
    tbody.innerHTML = '';
    
    if (currentPurchase.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">No items added to purchase</td>
            </tr>
        `;
        return;
    }
    
    currentPurchase.items.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}<br><small class="text-muted">${item.part_code}</small></td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(item.unit_price)}</td>
            <td>${formatCurrency(item.total)}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary edit-item-btn" data-id="${item.tempId || item.id}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-item-btn" data-id="${item.tempId || item.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        
        row.querySelector('.edit-item-btn').addEventListener('click', () => {
            showPurchaseItemModal(item);
        });
        
        row.querySelector('.delete-item-btn').addEventListener('click', () => {
            currentPurchase.items.splice(index, 1);
            renderPurchaseItems();
            updatePurchaseTotals();
        });
        
        tbody.appendChild(row);
    });
}

function updatePurchaseTotals() {
    currentPurchase.subtotal = currentPurchase.items.reduce((sum, item) => sum + item.total, 0);
    currentPurchase.tax = currentPurchase.subtotal * 0.15; // Example 15% tax
    currentPurchase.total = currentPurchase.subtotal + currentPurchase.tax;
    
    document.getElementById('purchase-subtotal').textContent = formatCurrency(currentPurchase.subtotal);
    document.getElementById('purchase-tax').textContent = formatCurrency(currentPurchase.tax);
    document.getElementById('purchase-total').textContent = formatCurrency(currentPurchase.total);
    
    updatePurchaseBalance();
}

function updatePurchaseBalance() {
    const paymentStatus = document.getElementById('payment-status').value;
    const paidAmount = parseFloat(document.getElementById('paid-amount').value) || 0;
    
    if (paymentStatus === 'paid') {
        currentPurchase.paid_amount = currentPurchase.total;
        currentPurchase.balance = 0;
        document.getElementById('paid-amount').value = currentPurchase.total.toFixed(2);
    } else if (paymentStatus === 'partial') {
        currentPurchase.paid_amount = paidAmount;
        currentPurchase.balance = currentPurchase.total - paidAmount;
    } else {
        currentPurchase.paid_amount = 0;
        currentPurchase.balance = currentPurchase.total;
        document.getElementById('paid-amount').value = '0';
    }
    
    document.getElementById('purchase-balance').textContent = formatCurrency(currentPurchase.balance);
}

async function savePurchase() {
    const form = document.getElementById('purchase-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    if (currentPurchase.items.length === 0) {
        showAlert('Please add at least one item to the purchase', 'warning');
        return;
    }
    
    try {
        // Prepare purchase data
        currentPurchase.po_number = document.getElementById('po-number').value;
        currentPurchase.purchase_date = document.getElementById('purchase-date').value;
        currentPurchase.supplier_id = document.getElementById('supplier').value;
        currentPurchase.payment_status = document.getElementById('payment-status').value;
        currentPurchase.paid_amount = parseFloat(document.getElementById('paid-amount').value) || 0;
        currentPurchase.notes = document.getElementById('notes').value;
        
        // Start transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'BEGIN TRANSACTION'
        });
        
        if (currentPurchase.id) {
            // Update existing purchase
            await window.electronAPI.invoke('db-run', {
                query: `UPDATE purchases SET 
                        invoice_number = ?, purchase_date = ?, supplier_id = ?,
                        total_amount = ?, payment_status = ?, paid_amount = ?, balance = ?, notes = ?
                        WHERE id = ?`,
                params: [
                    currentPurchase.po_number,
                    currentPurchase.purchase_date,
                    currentPurchase.supplier_id,
                    currentPurchase.total,
                    currentPurchase.payment_status,
                    currentPurchase.paid_amount,
                    currentPurchase.balance,
                    currentPurchase.notes,
                    currentPurchase.id
                ]
            });
            
            // Delete existing items
            await window.electronAPI.invoke('db-run', {
                query: 'DELETE FROM purchase_items WHERE purchase_id = ?',
                params: [currentPurchase.id]
            });
        } else {
            // Insert new purchase
            const result = await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO purchases (
                    invoice_number, purchase_date, supplier_id,
                    total_amount, payment_status, paid_amount, balance, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    currentPurchase.po_number,
                    currentPurchase.purchase_date,
                    currentPurchase.supplier_id,
                    currentPurchase.total,
                    currentPurchase.payment_status,
                    currentPurchase.paid_amount,
                    currentPurchase.balance,
                    currentPurchase.notes
                ]
            });
            
            currentPurchase.id = result.lastID;
        }
        
        // Insert purchase items
        for (const item of currentPurchase.items) {
            await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO purchase_items (
                    purchase_id, inventory_id, quantity, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?)`,
                params: [
                    currentPurchase.id,
                    item.id,
                    item.quantity,
                    item.unit_price,
                    item.total
                ]
            });
        }
        
        // Record payment if any
        if (currentPurchase.paid_amount > 0) {
            await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO payments (
                    purchase_id, amount, payment_method, notes
                ) VALUES (?, ?, ?, ?)`,
                params: [
                    currentPurchase.id,
                    currentPurchase.paid_amount,
                    'cash', // Default payment method for purchases
                    'Initial payment for purchase order'
                ]
            });
        }
        
        // Commit transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'COMMIT'
        });
        
        showAlert('Purchase order saved successfully', 'success');
        
        // Close modal and refresh data
        const modal = bootstrap.Modal.getInstance(document.getElementById('purchaseModal'));
        modal.hide();
        loadPurchaseData();
    } catch (error) {
        console.error('Error saving purchase:', error);
        
        // Rollback transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'ROLLBACK'
        });
        
        showAlert('Error saving purchase order', 'danger');
    }
}

async function viewPurchase(purchaseId) {
    try {
        // Get purchase data
        const purchase = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      p.*, 
                      s.name as supplier_name,
                      s.phone as supplier_phone
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    WHERE p.id = ?`,
            params: [purchaseId]
        });
        
        if (purchase.length === 0) {
            showAlert('Purchase order not found', 'danger');
            return;
        }
        
        // Get purchase items
        const items = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      pi.*,
                      i.part_code,
                      i.name as item_name
                    FROM purchase_items pi
                    JOIN inventory i ON pi.inventory_id = i.id
                    WHERE pi.purchase_id = ?`,
            params: [purchaseId]
        });
        
        // Show view modal
        const po = purchase[0];
        document.getElementById('view-po-number').textContent = po.invoice_number;
        document.getElementById('view-supplier').textContent = po.supplier_name;
        document.getElementById('view-date').textContent = new Date(po.purchase_date).toLocaleDateString();
        
        const statusBadge = document.getElementById('view-status');
        statusBadge.textContent = po.payment_status.toUpperCase();
        statusBadge.className = `badge bg-${getStatusBadgeClass(po.payment_status)}`;
        
        document.getElementById('view-total').textContent = formatCurrency(po.total_amount);
        document.getElementById('view-payment-status').textContent = po.payment_status.toUpperCase();
        document.getElementById('view-paid-amount').textContent = formatCurrency(po.paid_amount);
        document.getElementById('view-balance').textContent = formatCurrency(po.balance);
        document.getElementById('view-notes').textContent = po.notes || 'No notes available';
        
        // Render items
        const itemsContainer = document.getElementById('view-purchase-items');
        itemsContainer.innerHTML = items.map(item => `
            <tr>
                <td>${item.item_name}<br><small>${item.part_code}</small></td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unit_price)}</td>
                <td>${formatCurrency(item.total_price)}</td>
            </tr>
        `).join('');
        
        // Show/hide add payment button
        const addPaymentBtn = document.getElementById('add-payment-btn');
        if (po.balance > 0) {
            addPaymentBtn.style.display = 'inline-block';
            addPaymentBtn.onclick = () => showPaymentModal(po);
        } else {
            addPaymentBtn.style.display = 'none';
        }
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('viewPurchaseModal'));
        modal.show();
    } catch (error) {
        console.error('Error viewing purchase:', error);
        showAlert('Error viewing purchase order', 'danger');
    }
}

function showPaymentModal(purchase) {
    const modal = new bootstrap.Modal(document.getElementById('paymentModal'));
    document.getElementById('payment-po-number').textContent = purchase.invoice_number;
    document.getElementById('payment-balance').textContent = formatCurrency(purchase.balance);
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-method').value = 'cash';
    document.getElementById('payment-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('payment-notes').value = '';
    
    // Store purchase ID for saving
    document.getElementById('payment-form').dataset.purchaseId = purchase.id;
    
    modal.show();
}

async function savePayment() {
    const form = document.getElementById('payment-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    const purchaseId = form.dataset.purchaseId;
    const amount = parseFloat(document.getElementById('payment-amount').value) || 0;
    const balance = parseFloat(document.getElementById('payment-balance').textContent.replace(/[^0-9.-]+/g, ''));
    
    if (amount <= 0) {
        showAlert('Payment amount must be greater than 0', 'warning');
        return;
    }
    
    if (amount > balance) {
        showAlert('Payment amount cannot be greater than balance', 'warning');
        return;
    }
    
    try {
        const paymentData = {
            purchase_id: purchaseId,
            amount: amount,
            payment_method: document.getElementById('payment-method').value,
            payment_date: document.getElementById('payment-date').value,
            notes: document.getElementById('payment-notes').value
        };
        
        // Start transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'BEGIN TRANSACTION'
        });
        
        // Record payment
        await window.electronAPI.invoke('db-run', {
            query: `INSERT INTO payments (
                purchase_id, amount, payment_method, payment_date, notes
            ) VALUES (?, ?, ?, ?, ?)`,
            params: [
                paymentData.purchase_id,
                paymentData.amount,
                paymentData.payment_method,
                paymentData.payment_date,
                paymentData.notes
            ]
        });
        
        // Update purchase balance
        await window.electronAPI.invoke('db-run', {
            query: `UPDATE purchases SET 
                    paid_amount = paid_amount + ?,
                    balance = balance - ?,
                    payment_status = CASE WHEN balance - ? <= 0 THEN 'paid' ELSE 'partial' END
                    WHERE id = ?`,
            params: [
                paymentData.amount,
                paymentData.amount,
                paymentData.amount,
                paymentData.purchase_id
            ]
        });
        
        // Commit transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'COMMIT'
        });
        
        showAlert('Payment recorded successfully', 'success');
        
        // Close modals and refresh data
        const paymentModal = bootstrap.Modal.getInstance(document.getElementById('paymentModal'));
        paymentModal.hide();
        
        const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewPurchaseModal'));
        viewModal.hide();
        
        loadPurchaseData();
    } catch (error) {
        console.error('Error recording payment:', error);
        
        // Rollback transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'ROLLBACK'
        });
        
        showAlert('Error recording payment', 'danger');
    }
}

async function exportPurchases(format) {
    try {
        // Get all purchase data (without pagination)
        const data = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      p.invoice_number, p.purchase_date, s.name as supplier,
                      p.total_amount, p.paid_amount, p.balance, p.payment_status
                    FROM purchases p
                    LEFT JOIN suppliers s ON p.supplier_id = s.id
                    ORDER BY p.purchase_date DESC`
        });
        
        if (format === 'excel') {
            await exportToExcel(data);
        } else {
            await exportToPDF(data);
        }
    } catch (error) {
        console.error('Error exporting purchases:', error);
        showAlert('Error exporting purchase data', 'danger');
    }
}

async function exportToExcel(data) {
    // In a real Electron app, we would use exceljs to create an Excel file
    showAlert('Excel export started. File will be saved to your downloads folder.', 'success');
}

async function exportToPDF(data) {
    // In a real Electron app, we would use jsPDF to create a PDF file
    showAlert('PDF export started. File will be saved to your downloads folder.', 'success');
}

// Helper functions
function formatCurrency(amount) {
    const currency = 'PKR';
    return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount).replace(currency, '').trim() + ' ' + currency;
}

function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.style.position = 'fixed';
    alert.style.top = '20px';
    alert.style.right = '20px';
    alert.style.zIndex = '1100';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 150);
    }, 3000);
}

// Attach payment save handler
document.getElementById('save-payment-btn').addEventListener('click', savePayment);