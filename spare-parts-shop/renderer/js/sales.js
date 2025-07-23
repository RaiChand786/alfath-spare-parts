document.addEventListener('DOMContentLoaded', async function() {
    // Initialize POS system
    await initPOS();
    
    // Setup event listeners
    setupPOSEventListeners();
    
    // Start a new sale
    startNewSale();
});

let currentSale = {
    id: null,
    items: [],
    customer: null,
    payment: {
        method: 'cash',
        amount: 0,
        balance: 0
    },
    discount: {
        type: 'amount',
        value: 0
    },
    taxRate: 0.15 // Example tax rate (15%)
};

let categories = [];
let products = [];
let customers = [];

async function initPOS() {
    try {
        // Load categories
        const categoryResults = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name FROM categories ORDER BY name'
        });
        categories = categoryResults;
        
        // Load products
        const productResults = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      i.id, i.part_code, i.name, i.selling_price, i.quantity, i.reorder_level, i.image_path,
                      c.name as category, c.id as category_id
                    FROM inventory i
                    LEFT JOIN categories c ON i.category_id = c.id
                    WHERE i.quantity > 0
                    ORDER BY i.name`
        });
        products = productResults;
        
        // Load customers
        const customerResults = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name, phone, vehicle_info FROM customers ORDER BY name'
        });
        customers = customerResults;
        
        // Render initial UI
        renderCategoryTabs();
        renderProductGrid('all');
        renderCustomerDropdown();
        
        // Set today's date
        document.getElementById('sale-date').textContent = new Date().toLocaleDateString();
    } catch (error) {
        console.error('Error initializing POS:', error);
        showAlert('Error initializing POS system', 'danger');
    }
}

function setupPOSEventListeners() {
    // Product search
    document.getElementById('product-search').addEventListener('input', function() {
        searchProducts(this.value);
    });
    
    document.getElementById('scan-barcode-btn').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('barcodeModal'));
        modal.show();
    });
    
    // Barcode scanner modal
    document.getElementById('use-barcode-btn').addEventListener('click', function() {
        const barcode = document.getElementById('manual-barcode').value;
        if (barcode) {
            searchProducts(barcode, true);
            const modal = bootstrap.Modal.getInstance(document.getElementById('barcodeModal'));
            modal.hide();
        }
    });
    
    // Discount input
    document.getElementById('discount').addEventListener('change', updateTotals);
    document.getElementById('discount-type').addEventListener('change', updateTotals);
    
    // Customer selection
    document.getElementById('customer-select').addEventListener('change', function() {
        const customerId = this.value;
        if (customerId) {
            const customer = customers.find(c => c.id == customerId);
            currentSale.customer = customer;
            showCustomerDetails(customer);
        } else {
            currentSale.customer = null;
            hideCustomerDetails();
        }
    });
    
    document.getElementById('edit-customer-btn').addEventListener('click', function() {
        if (currentSale.customer) {
            editCustomer(currentSale.customer);
        }
    });
    
    document.getElementById('new-customer-btn').addEventListener('click', function() {
        showCustomerModal();
    });
    
    // Payment method
    document.getElementById('payment-method').addEventListener('change', function() {
        currentSale.payment.method = this.value;
        updatePaymentUI();
    });
    
    document.getElementById('amount-tendered').addEventListener('input', function() {
        const amount = parseFloat(this.value) || 0;
        currentSale.payment.amount = amount;
        
        if (currentSale.payment.method === 'credit') {
            currentSale.payment.balance = calculateTotal() - amount;
            document.getElementById('balance').value = currentSale.payment.balance.toFixed(2);
        } else {
            currentSale.payment.balance = Math.max(0, amount - calculateTotal());
            document.getElementById('balance').value = currentSale.payment.balance.toFixed(2);
        }
    });
    
    // Sale actions
    document.getElementById('complete-sale-btn').addEventListener('click', completeSale);
    document.getElementById('cancel-sale-btn').addEventListener('click', confirmCancelSale);
    document.getElementById('new-sale-btn').addEventListener('click', confirmNewSale);
    
    // Invoice modal
    document.getElementById('open-invoices-btn').addEventListener('click', openInvoicesModal);
    document.getElementById('print-invoice-btn').addEventListener('click', printInvoice);
    
    // Invoices list modal
    document.getElementById('search-invoices-btn').addEventListener('click', searchInvoices);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(e) {
    // Focus on search input when F2 is pressed
    if (e.key === 'F2') {
        e.preventDefault();
        document.getElementById('product-search').focus();
    }
    
    // New sale when F1 is pressed
    if (e.key === 'F1') {
        e.preventDefault();
        confirmNewSale();
    }
    
    // Complete sale when F9 is pressed
    if (e.key === 'F9') {
        e.preventDefault();
        document.getElementById('complete-sale-btn').click();
    }
}

function renderCategoryTabs() {
    const container = document.querySelector('.category-tabs');
    
    // Clear existing tabs
    container.innerHTML = '';
    
    // Add "All" tab
    const allTab = document.createElement('button');
    allTab.className = 'btn btn-sm btn-outline-primary active';
    allTab.textContent = 'All';
    allTab.setAttribute('data-category', 'all');
    allTab.addEventListener('click', function() {
        document.querySelectorAll('.category-tabs .btn').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
        renderProductGrid('all');
    });
    container.appendChild(allTab);
    
    // Add category tabs
    categories.forEach(category => {
        const tab = document.createElement('button');
        tab.className = 'btn btn-sm btn-outline-primary';
        tab.textContent = category.name;
        tab.setAttribute('data-category', category.id);
        tab.addEventListener('click', function() {
            document.querySelectorAll('.category-tabs .btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            renderProductGrid(category.id);
        });
        container.appendChild(tab);
    });
}

function renderProductGrid(categoryId) {
    const container = document.getElementById('product-grid');
    container.innerHTML = '';
    
    let filteredProducts = products;
    
    if (categoryId !== 'all') {
        filteredProducts = products.filter(p => p.category_id == categoryId);
    }
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-box-seam" style="font-size: 2rem;"></i>
                <p class="mt-2">No products found</p>
            </div>
        `;
        return;
    }
    
    filteredProducts.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.setAttribute('data-id', product.id);
        productCard.innerHTML = `
            ${product.image_path ? 
                `<img src="${product.image_path}" class="product-image">` : 
                `<i class="bi bi-box-seam product-image" style="font-size: 2rem;"></i>`}
            <div class="product-name">${product.name}</div>
            <div class="product-code">${product.part_code}</div>
            <div class="product-price">${formatCurrency(product.selling_price)}</div>
            <div class="product-stock ${getStockStatusClass(product.quantity, product.reorder_level)}">
                Stock: ${product.quantity}
            </div>
        `;
        
        productCard.addEventListener('click', () => {
            addProductToSale(product);
        });
        
        container.appendChild(productCard);
    });
}

function searchProducts(query, isBarcode = false) {
    if (!query) {
        renderProductGrid('all');
        document.querySelector('.category-tabs .btn[data-category="all"]').click();
        return;
    }
    
    const container = document.getElementById('product-grid');
    container.innerHTML = '';
    
    let filteredProducts = products;
    
    if (isBarcode) {
        filteredProducts = products.filter(p => p.part_code.includes(query));
    } else {
        const queryLower = query.toLowerCase();
        filteredProducts = products.filter(p => 
            p.name.toLowerCase().includes(queryLower) || 
            p.part_code.toLowerCase().includes(queryLower)
        );
    }
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-search" style="font-size: 2rem;"></i>
                <p class="mt-2">No products found for "${query}"</p>
            </div>
        `;
        return;
    }
    
    filteredProducts.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.setAttribute('data-id', product.id);
        productCard.innerHTML = `
            ${product.image_path ? 
                `<img src="${product.image_path}" class="product-image">` : 
                `<i class="bi bi-box-seam product-image" style="font-size: 2rem;"></i>`}
            <div class="product-name">${product.name}</div>
            <div class="product-code">${product.part_code}</div>
            <div class="product-price">${formatCurrency(product.selling_price)}</div>
            <div class="product-stock ${getStockStatusClass(product.quantity, product.reorder_level)}">
                Stock: ${product.quantity}
            </div>
        `;
        
        productCard.addEventListener('click', () => {
            addProductToSale(product);
        });
        
        container.appendChild(productCard);
    });
}

function getStockStatusClass(quantity, reorderLevel) {
    if (quantity === 0) {
        return 'out';
    } else if (quantity <= reorderLevel) {
        return 'low';
    }
    return '';
}

function renderCustomerDropdown() {
    const select = document.getElementById('customer-select');
    
    // Clear existing options except the first one
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    customers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.id;
        option.textContent = customer.name;
        select.appendChild(option);
    });
}

function showCustomerDetails(customer) {
    document.getElementById('customer-details').style.display = 'block';
    document.getElementById('customer-phone').textContent = customer.phone || 'N/A';
    document.getElementById('customer-vehicle').textContent = customer.vehicle_info || 'N/A';
}

function hideCustomerDetails() {
    document.getElementById('customer-details').style.display = 'none';
}

function startNewSale() {
    currentSale = {
        id: null,
        items: [],
        customer: null,
        payment: {
            method: 'cash',
            amount: 0,
            balance: 0
        },
        discount: {
            type: 'amount',
            value: 0
        }
    };
    
    // Reset UI
    document.getElementById('sale-id').textContent = 'New Sale';
    document.getElementById('sale-date').textContent = new Date().toLocaleDateString();
    document.getElementById('customer-select').value = '';
    document.getElementById('payment-method').value = 'cash';
    document.getElementById('amount-tendered').value = '0';
    document.getElementById('discount').value = '0';
    document.getElementById('discount-type').value = 'amount';
    hideCustomerDetails();
    
    renderSaleItems();
    updateTotals();
    updatePaymentUI();
    
    // Focus on search input
    document.getElementById('product-search').focus();
}

function addProductToSale(product) {
    // Check if product already exists in sale
    const existingItem = currentSale.items.find(item => item.id === product.id);
    
    if (existingItem) {
        // Increase quantity if stock allows
        if (existingItem.quantity < product.quantity) {
            existingItem.quantity++;
        } else {
            showAlert(`Cannot add more. Only ${product.quantity} items available in stock.`, 'warning');
            return;
        }
    } else {
        // Add new item to sale
        currentSale.items.push({
            id: product.id,
            part_code: product.part_code,
            name: product.name,
            price: product.selling_price,
            quantity: 1,
            stock: product.quantity
        });
    }
    
    renderSaleItems();
    updateTotals();
    
    // Clear search and focus
    document.getElementById('product-search').value = '';
    document.getElementById('product-search').focus();
}

function renderSaleItems() {
    const tbody = document.querySelector('#sale-items-table tbody');
    tbody.innerHTML = '';
    
    if (currentSale.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">No items added to sale</td>
            </tr>
        `;
        return;
    }
    
    currentSale.items.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="item-name">${item.name}<br><small class="text-muted">${item.part_code}</small></td>
            <td class="item-price">${formatCurrency(item.price)}</td>
            <td class="item-qty">
                <div class="input-group input-group-sm">
                    <button class="btn btn-outline-secondary minus-btn" type="button">-</button>
                    <input type="number" class="form-control text-center" value="${item.quantity}" min="1" max="${item.stock}">
                    <button class="btn btn-outline-secondary plus-btn" type="button">+</button>
                </div>
            </td>
            <td class="item-total">${formatCurrency(item.price * item.quantity)}</td>
            <td><i class="bi bi-trash remove-item"></i></td>
        `;
        
        // Quantity controls
        const minusBtn = row.querySelector('.minus-btn');
        const plusBtn = row.querySelector('.plus-btn');
        const qtyInput = row.querySelector('input');
        
        minusBtn.addEventListener('click', () => {
            if (item.quantity > 1) {
                item.quantity--;
                qtyInput.value = item.quantity;
                updateItemTotal(row, item);
                updateTotals();
            }
        });
        
        plusBtn.addEventListener('click', () => {
            if (item.quantity < item.stock) {
                item.quantity++;
                qtyInput.value = item.quantity;
                updateItemTotal(row, item);
                updateTotals();
            } else {
                showAlert(`Cannot add more. Only ${item.stock} items available in stock.`, 'warning');
            }
        });
        
        qtyInput.addEventListener('change', () => {
            const newQty = parseInt(qtyInput.value) || 1;
            if (newQty < 1) {
                qtyInput.value = 1;
                item.quantity = 1;
            } else if (newQty > item.stock) {
                qtyInput.value = item.stock;
                item.quantity = item.stock;
                showAlert(`Only ${item.stock} items available in stock.`, 'warning');
            } else {
                item.quantity = newQty;
            }
            updateItemTotal(row, item);
            updateTotals();
        });
        
        // Remove item
        row.querySelector('.remove-item').addEventListener('click', () => {
            currentSale.items.splice(index, 1);
            renderSaleItems();
            updateTotals();
        });
        
        tbody.appendChild(row);
    });
}

function updateItemTotal(row, item) {
    row.querySelector('.item-total').textContent = formatCurrency(item.price * item.quantity);
}

function updateTotals() {
    const subtotal = calculateSubtotal();
    const discountValue = parseFloat(document.getElementById('discount').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    
    let discountAmount = 0;
    if (discountType === 'amount') {
        discountAmount = Math.min(discountValue, subtotal);
    } else {
        discountAmount = subtotal * (discountValue / 100);
    }
    
    const taxAmount = (subtotal - discountAmount) * currentSale.taxRate;
    const total = subtotal - discountAmount + taxAmount;
    
    document.getElementById('subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('discount').value = discountValue;
    document.getElementById('tax').textContent = formatCurrency(taxAmount);
    document.getElementById('total').textContent = formatCurrency(total);
    
    // Update payment amount if it's more than total (for change calculation)
    const amountTendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    if (amountTendered > 0 && currentSale.payment.method !== 'credit') {
        currentSale.payment.balance = Math.max(0, amountTendered - total);
        document.getElementById('balance').value = currentSale.payment.balance.toFixed(2);
    }
}

function calculateSubtotal() {
    return currentSale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function calculateTotal() {
    const subtotal = calculateSubtotal();
    const discountValue = parseFloat(document.getElementById('discount').value) || 0;
    const discountType = document.getElementById('discount-type').value;
    
    let discountAmount = 0;
    if (discountType === 'amount') {
        discountAmount = Math.min(discountValue, subtotal);
    } else {
        discountAmount = subtotal * (discountValue / 100);
    }
    
    const taxAmount = (subtotal - discountAmount) * currentSale.taxRate;
    return subtotal - discountAmount + taxAmount;
}

function updatePaymentUI() {
    const paymentMethod = document.getElementById('payment-method').value;
    
    if (paymentMethod === 'credit') {
        document.getElementById('amount-tendered-group').style.display = 'none';
        document.getElementById('balance-group').style.display = 'block';
        document.getElementById('amount-tendered').value = '0';
        document.getElementById('balance').value = calculateTotal().toFixed(2);
        currentSale.payment = {
            method: 'credit',
            amount: 0,
            balance: calculateTotal()
        };
    } else {
        document.getElementById('amount-tendered-group').style.display = 'block';
        document.getElementById('balance-group').style.display = 'block';
        currentSale.payment.method = paymentMethod;
    }
}

async function completeSale() {
    if (currentSale.items.length === 0) {
        showAlert('Please add items to the sale', 'warning');
        return;
    }
    
    const total = calculateTotal();
    const paymentMethod = document.getElementById('payment-method').value;
    let amountTendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    let balance = 0;
    
    if (paymentMethod === 'credit') {
        balance = total;
        amountTendered = 0;
    } else {
        if (amountTendered < total) {
            showAlert(`Amount tendered (${formatCurrency(amountTendered)}) is less than total (${formatCurrency(total)})`, 'warning');
            return;
        }
        balance = amountTendered - total;
    }
    
    try {
        // Generate invoice number (YYYYMMDD-XXXX)
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const lastInvoice = await window.electronAPI.invoke('db-query', {
            query: `SELECT invoice_number FROM sales 
                    WHERE invoice_number LIKE '${datePart}%'
                    ORDER BY invoice_number DESC LIMIT 1`
        });
        
        let invoiceNumber;
        if (lastInvoice.length > 0) {
            const lastNum = parseInt(lastInvoice[0].invoice_number.slice(9)) || 0;
            invoiceNumber = `${datePart}-${(lastNum + 1).toString().padStart(4, '0')}`;
        } else {
            invoiceNumber = `${datePart}-0001`;
        }
        
        // Start transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'BEGIN TRANSACTION'
        });
        
        // Insert sale
        const saleResult = await window.electronAPI.invoke('db-run', {
            query: `INSERT INTO sales (
                invoice_number, customer_id, subtotal, discount, tax, total_amount,
                payment_method, payment_status, paid_amount, balance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
                invoiceNumber,
                currentSale.customer ? currentSale.customer.id : null,
                calculateSubtotal(),
                parseFloat(document.getElementById('discount').value) || 0,
                parseFloat(document.getElementById('tax').textContent.replace(/[^0-9.-]+/g, '')),
                total,
                paymentMethod,
                balance > 0 ? 'partial' : 'paid',
                amountTendered,
                balance
            ]
        });
        
        const saleId = saleResult.lastID;
        
        // Insert sale items
        for (const item of currentSale.items) {
            await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO sale_items (
                    sale_id, inventory_id, quantity, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?)`,
                params: [
                    saleId,
                    item.id,
                    item.quantity,
                    item.price,
                    item.price * item.quantity
                ]
            });
        }
        
        // Insert payment if paid
        if (amountTendered > 0) {
            await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO payments (
                    sale_id, amount, payment_method, notes
                ) VALUES (?, ?, ?, ?)`,
                params: [
                    saleId,
                    amountTendered,
                    paymentMethod,
                    'Initial payment'
                ]
            });
        }
        
        // Commit transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'COMMIT'
        });
        
        // Update current sale with ID and invoice number
        currentSale.id = saleId;
        currentSale.invoiceNumber = invoiceNumber;
        
        // Show invoice
        showInvoice(saleId);
        
        // Start new sale
        startNewSale();
    } catch (error) {
        console.error('Error completing sale:', error);
        
        // Rollback transaction
        await window.electronAPI.invoke('db-exec', {
            query: 'ROLLBACK'
        });
        
        showAlert('Error completing sale. Please try again.', 'danger');
    }
}

async function showInvoice(saleId) {
    try {
        // Get sale data
        const saleData = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      s.invoice_number, s.sale_date, s.subtotal, s.discount, s.tax, s.total_amount,
                      s.payment_method, s.paid_amount, s.balance,
                      c.name as customer_name, c.phone as customer_phone, c.vehicle_info as customer_vehicle,
                      u.username as cashier
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    LEFT JOIN users u ON s.created_by = u.id
                    WHERE s.id = ?`,
            params: [saleId]
        });
        
        if (saleData.length === 0) {
            showAlert('Invoice not found', 'danger');
            return;
        }
        
        const sale = saleData[0];
        
        // Get sale items
        const items = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      i.part_code, i.name, si.quantity, si.unit_price, si.total_price
                    FROM sale_items si
                    JOIN inventory i ON si.inventory_id = i.id
                    WHERE si.sale_id = ?`,
            params: [saleId]
        });
        
        // Render invoice
        const invoiceContainer = document.getElementById('invoice-container');
        invoiceContainer.innerHTML = `
            <div class="invoice-header">
                <div class="row">
                    <div class="col-md-6">
                        <h3>Alfath Spare Parts</h3>
                        <p>123 Main Street, City</p>
                        <p>Phone: 0300-1234567</p>
                    </div>
                    <div class="col-md-6 text-end">
                        <h4>INVOICE</h4>
                        <p><strong>#${sale.invoice_number}</strong></p>
                        <p>Date: ${new Date(sale.sale_date).toLocaleDateString()}</p>
                    </div>
                </div>
            </div>
            
            <div class="invoice-customer mt-4">
                <div class="row">
                    <div class="col-md-6">
                        <h5>Bill To:</h5>
                        <p>${sale.customer_name || 'Walk-in Customer'}</p>
                        ${sale.customer_phone ? `<p>Phone: ${sale.customer_phone}</p>` : ''}
                        ${sale.customer_vehicle ? `<p>Vehicle: ${sale.customer_vehicle}</p>` : ''}
                    </div>
                    <div class="col-md-6 text-end">
                        <h5>Sold By:</h5>
                        <p>${sale.cashier || 'System'}</p>
                    </div>
                </div>
            </div>
            
            <div class="invoice-items mt-4">
                <table class="table table-bordered">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item</th>
                            <th>Price</th>
                            <th>Qty</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map((item, index) => `
                            <tr>
                                <td>${index + 1}</td>
                                <td>${item.name}<br><small>${item.part_code}</small></td>
                                <td>${formatCurrency(item.unit_price)}</td>
                                <td>${item.quantity}</td>
                                <td>${formatCurrency(item.total_price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="invoice-totals mt-4">
                <div class="row justify-content-end">
                    <div class="col-md-4">
                        <table class="table table-bordered">
                            <tr>
                                <td>Subtotal:</td>
                                <td>${formatCurrency(sale.subtotal)}</td>
                            </tr>
                            <tr>
                                <td>Discount:</td>
                                <td>${formatCurrency(sale.discount)}</td>
                            </tr>
                            <tr>
                                <td>Tax (${(currentSale.taxRate * 100)}%):</td>
                                <td>${formatCurrency(sale.tax)}</td>
                            </tr>
                            <tr class="table-active">
                                <td><strong>Total:</strong></td>
                                <td><strong>${formatCurrency(sale.total_amount)}</strong></td>
                            </tr>
                            <tr>
                                <td>Payment Method:</td>
                                <td>${sale.payment_method.toUpperCase()}</td>
                            </tr>
                            <tr>
                                <td>Amount Paid:</td>
                                <td>${formatCurrency(sale.paid_amount)}</td>
                            </tr>
                            ${sale.balance > 0 ? `
                                <tr>
                                    <td>Balance:</td>
                                    <td>${formatCurrency(sale.balance)}</td>
                                </tr>
                            ` : ''}
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="invoice-footer mt-4 text-center">
                <p>Thank you for your business!</p>
                <p>For any inquiries, please contact us at 0300-1234567</p>
            </div>
        `;
        
        // Show modal
        document.getElementById('invoice-number').textContent = sale.invoice_number;
        const modal = new bootstrap.Modal(document.getElementById('invoiceModal'));
        modal.show();
    } catch (error) {
        console.error('Error generating invoice:', error);
        showAlert('Error generating invoice', 'danger');
    }
}

function printInvoice() {
    // In a real Electron app, we would use window.print() or a PDF generator
    // This is a simplified version that just shows a message
    showAlert('Invoice sent to printer', 'success');
}

function confirmNewSale() {
    if (currentSale.items.length > 0 && !confirm('Are you sure you want to start a new sale? Current sale will be lost.')) {
        return;
    }
    startNewSale();
}

function confirmCancelSale() {
    if (currentSale.items.length > 0 && !confirm('Are you sure you want to cancel this sale?')) {
        return;
    }
    startNewSale();
}

function showCustomerModal(customer = null) {
    const modal = new bootstrap.Modal(document.getElementById('customerModal'));
    const form = document.getElementById('customer-form');
    const title = document.getElementById('customer-modal-title');
    
    // Reset form
    form.reset();
    
    if (customer) {
        // Edit mode
        title.textContent = 'Edit Customer';
        document.getElementById('customer-id').value = customer.id;
        document.getElementById('customer-name').value = customer.name;
        document.getElementById('customer-phone-input').value = customer.phone || '';
        document.getElementById('customer-email').value = customer.email || '';
        document.getElementById('customer-address').value = customer.address || '';
        document.getElementById('customer-vehicle-input').value = customer.vehicle_info || '';
    } else {
        // Add mode
        title.textContent = 'New Customer';
        document.getElementById('customer-id').value = '';
    }
    
    modal.show();
}

function editCustomer(customer) {
    showCustomerModal(customer);
}

async function saveCustomer() {
    const form = document.getElementById('customer-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    try {
        const customerId = document.getElementById('customer-id').value;
        const customerData = {
            name: document.getElementById('customer-name').value,
            phone: document.getElementById('customer-phone-input').value || null,
            email: document.getElementById('customer-email').value || null,
            address: document.getElementById('customer-address').value || null,
            vehicle_info: document.getElementById('customer-vehicle-input').value || null
        };
        
        if (customerId) {
            // Update existing customer
            await window.electronAPI.invoke('db-run', {
                query: `UPDATE customers SET 
                        name = ?, phone = ?, email = ?, address = ?, vehicle_info = ?
                        WHERE id = ?`,
                params: [
                    customerData.name,
                    customerData.phone,
                    customerData.email,
                    customerData.address,
                    customerData.vehicle_info,
                    customerId
                ]
            });
            
            showAlert('Customer updated successfully', 'success');
        } else {
            // Insert new customer
            const result = await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO customers (
                    name, phone, email, address, vehicle_info
                ) VALUES (?, ?, ?, ?, ?)`,
                params: [
                    customerData.name,
                    customerData.phone,
                    customerData.email,
                    customerData.address,
                    customerData.vehicle_info
                ]
            });
            
            customerData.id = result.lastID;
            showAlert('Customer added successfully', 'success');
            
            // Add to dropdown and select
            customers.push(customerData);
            renderCustomerDropdown();
            document.getElementById('customer-select').value = customerData.id;
            currentSale.customer = customerData;
            showCustomerDetails(customerData);
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('customerModal'));
        modal.hide();
    } catch (error) {
        console.error('Error saving customer:', error);
        showAlert('Error saving customer', 'danger');
    }
}

async function openInvoicesModal() {
    try {
        // Load recent invoices
        await loadInvoices();
        
        // Set date range (today)
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('invoice-date-from').value = today;
        document.getElementById('invoice-date-to').value = today;
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('invoicesModal'));
        modal.show();
    } catch (error) {
        console.error('Error opening invoices:', error);
        showAlert('Error loading invoices', 'danger');
    }
}

let currentInvoicePage = 1;
const invoicesPerPage = 10;
let totalInvoices = 0;

async function loadInvoices(page = 1) {
    try {
        const dateFrom = document.getElementById('invoice-date-from').value;
        const dateTo = document.getElementById('invoice-date-to').value;
        const searchTerm = document.getElementById('invoice-search').value;
        
        let whereClause = '1=1';
        const params = [];
        
        if (dateFrom && dateTo) {
            whereClause += ' AND date(s.sale_date) BETWEEN ? AND ?';
            params.push(dateFrom, dateTo);
        }
        
        if (searchTerm) {
            whereClause += ' AND (s.invoice_number LIKE ? OR c.name LIKE ?)';
            params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }
        
        // Get total count
        const countResult = await window.electronAPI.invoke('db-query', {
            query: `SELECT COUNT(*) as total 
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    WHERE ${whereClause}`,
            params: params
        });
        
        totalInvoices = countResult[0].total;
        
        // Get paginated data
        const offset = (page - 1) * invoicesPerPage;
        const invoices = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      s.id, s.invoice_number, s.sale_date, s.total_amount,
                      s.payment_method, s.payment_status, s.paid_amount, s.balance,
                      c.name as customer_name,
                      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as item_count
                    FROM sales s
                    LEFT JOIN customers c ON s.customer_id = c.id
                    WHERE ${whereClause}
                    ORDER BY s.sale_date DESC
                    LIMIT ? OFFSET ?`,
            params: [...params, invoicesPerPage, offset]
        });
        
        renderInvoicesTable(invoices);
        renderInvoicesPagination();
    } catch (error) {
        console.error('Error loading invoices:', error);
        showAlert('Error loading invoices', 'danger');
    }
}

function renderInvoicesTable(invoices) {
    const tbody = document.querySelector('#invoices-table tbody');
    tbody.innerHTML = '';
    
    if (invoices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">No invoices found</td>
            </tr>
        `;
        return;
    }
    
    invoices.forEach(invoice => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${invoice.invoice_number}</td>
            <td>${new Date(invoice.sale_date).toLocaleDateString()}</td>
            <td>${invoice.customer_name || 'Walk-in'}</td>
            <td>${invoice.item_count}</td>
            <td>${formatCurrency(invoice.total_amount)}</td>
            <td>${invoice.payment_method.toUpperCase()}</td>
            <td>
                <span class="badge bg-${invoice.payment_status === 'paid' ? 'success' : 'warning'}">
                    ${invoice.payment_status.toUpperCase()}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary view-invoice-btn" data-id="${invoice.id}">
                    <i class="bi bi-eye"></i> View
                </button>
            </td>
        `;
        
        row.querySelector('.view-invoice-btn').addEventListener('click', () => {
            showInvoice(invoice.id);
            const modal = bootstrap.Modal.getInstance(document.getElementById('invoicesModal'));
            modal.hide();
        });
        
        tbody.appendChild(row);
    });
}

function renderInvoicesPagination() {
    const pagination = document.getElementById('invoices-pagination');
    pagination.innerHTML = '';
    
    const totalPages = Math.ceil(totalInvoices / invoicesPerPage);
    
    if (totalPages <= 1) return;
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentInvoicePage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#">Previous</a>`;
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentInvoicePage > 1) {
            currentInvoicePage--;
            loadInvoices(currentInvoicePage);
        }
    });
    pagination.appendChild(prevLi);
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentInvoicePage - Math.floor(maxVisiblePages / 2));
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
            currentInvoicePage = 1;
            loadInvoices(currentInvoicePage);
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
        pageLi.className = `page-item ${i === currentInvoicePage ? 'active' : ''}`;
        pageLi.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        pageLi.addEventListener('click', (e) => {
            e.preventDefault();
            currentInvoicePage = i;
            loadInvoices(currentInvoicePage);
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
            currentInvoicePage = totalPages;
            loadInvoices(currentInvoicePage);
        });
        pagination.appendChild(lastLi);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentInvoicePage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#">Next</a>`;
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentInvoicePage < totalPages) {
            currentInvoicePage++;
            loadInvoices(currentInvoicePage);
        }
    });
    pagination.appendChild(nextLi);
}

function searchInvoices() {
    currentInvoicePage = 1;
    loadInvoices();
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

// Attach save customer handler
document.getElementById('save-customer-btn').addEventListener('click', saveCustomer);