document.addEventListener('DOMContentLoaded', async function() {
    // Initialize inventory management
    await initInventory();
    
    // Setup event listeners
    setupInventoryEventListeners();
    
    // Load initial inventory data
    loadInventoryData();
});

let currentPage = 1;
const itemsPerPage = 10;
let totalItems = 0;
let inventoryData = [];

async function initInventory() {
    // Initialize Select2 dropdowns
    $('#category').select2({
        placeholder: 'Select Category',
        width: '100%'
    });
    $('#brand').select2({
        placeholder: 'Select Brand',
        width: '100%'
    });
    $('#supplier').select2({
        placeholder: 'Select Supplier',
        width: '100%'
    });
    $('#filter-category').select2({
        placeholder: 'All Categories',
        width: '100%'
    });
    $('#filter-brand').select2({
        placeholder: 'All Brands',
        width: '100%'
    });
    
    // Load dropdown data
    await loadDropdownData();
}

async function loadDropdownData() {
    try {
        // Load categories
        const categories = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name FROM categories ORDER BY name'
        });
        
        const categorySelect = document.getElementById('category');
        const filterCategorySelect = document.getElementById('filter-category');
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.appendChild(option.cloneNode(true));
            filterCategorySelect.appendChild(option);
        });
        
        // Load brands
        const brands = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name FROM brands ORDER BY name'
        });
        
        const brandSelect = document.getElementById('brand');
        const filterBrandSelect = document.getElementById('filter-brand');
        
        brands.forEach(brand => {
            const option = document.createElement('option');
            option.value = brand.id;
            option.textContent = brand.name;
            brandSelect.appendChild(option.cloneNode(true));
            filterBrandSelect.appendChild(option);
        });
        
        // Load suppliers
        const suppliers = await window.electronAPI.invoke('db-query', {
            query: 'SELECT id, name FROM suppliers ORDER BY name'
        });
        
        const supplierSelect = document.getElementById('supplier');
        
        suppliers.forEach(supplier => {
            const option = document.createElement('option');
            option.value = supplier.id;
            option.textContent = supplier.name;
            supplierSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading dropdown data:', error);
        showAlert('Error loading dropdown data', 'danger');
    }
}

function setupInventoryEventListeners() {
    // Add inventory button
    document.getElementById('add-inventory-btn').addEventListener('click', () => {
        showInventoryModal();
    });
    
    // Save inventory button
    document.getElementById('save-inventory-btn').addEventListener('click', async () => {
        await saveInventoryItem();
    });
    
    // Filter buttons
    document.getElementById('filter-btn').addEventListener('click', () => {
        currentPage = 1;
        loadInventoryData();
    });
    
    document.getElementById('reset-filters-btn').addEventListener('click', () => {
        document.getElementById('search-inventory').value = '';
        $('#filter-category').val('').trigger('change');
        $('#filter-brand').val('').trigger('change');
        document.getElementById('filter-stock').value = '';
        currentPage = 1;
        loadInventoryData();
    });
    
    // Search input
    document.getElementById('search-inventory').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            currentPage = 1;
            loadInventoryData();
        }
    });
    
    document.getElementById('search-btn').addEventListener('click', () => {
        currentPage = 1;
        loadInventoryData();
    });
    
    // Export buttons
    document.getElementById('export-excel-btn').addEventListener('click', () => {
        exportInventory('excel');
    });
    
    document.getElementById('export-pdf-btn').addEventListener('click', () => {
        exportInventory('pdf');
    });
    
    // Image upload preview
    document.getElementById('part-image').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const preview = document.getElementById('image-preview');
                preview.innerHTML = `
                    <img src="${event.target.result}" class="img-thumbnail" style="max-height: 150px;">
                    <button class="btn btn-sm btn-danger mt-2" id="remove-image-btn">
                        <i class="bi bi-trash"></i> Remove Image
                    </button>
                `;
                
                document.getElementById('remove-image-btn').addEventListener('click', () => {
                    document.getElementById('part-image').value = '';
                    preview.innerHTML = '';
                });
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Barcode scanner button (placeholder - actual implementation would use a barcode scanner library)
    document.getElementById('barcode').addEventListener('click', function() {
        const modal = new bootstrap.Modal(document.getElementById('barcodeModal'));
        modal.show();
    });
    
    document.getElementById('use-barcode-btn').addEventListener('click', function() {
        const barcode = document.getElementById('manual-barcode').value;
        if (barcode) {
            document.getElementById('barcode').value = barcode;
            const modal = bootstrap.Modal.getInstance(document.getElementById('barcodeModal'));
            modal.hide();
        }
    });
}

async function loadInventoryData() {
    try {
        const searchTerm = document.getElementById('search-inventory').value;
        const categoryId = document.getElementById('filter-category').value;
        const brandId = document.getElementById('filter-brand').value;
        const stockStatus = document.getElementById('filter-stock').value;
        
        // Build WHERE clause for filters
        let whereClause = '1=1';
        const params = [];
        
        if (searchTerm) {
            whereClause += ' AND (i.name LIKE ? OR i.part_code LIKE ?)';
            params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }
        
        if (categoryId) {
            whereClause += ' AND i.category_id = ?';
            params.push(categoryId);
        }
        
        if (brandId) {
            whereClause += ' AND i.brand_id = ?';
            params.push(brandId);
        }
        
        if (stockStatus === 'low') {
            whereClause += ' AND i.quantity <= i.reorder_level AND i.quantity > 0';
        } else if (stockStatus === 'out') {
            whereClause += ' AND i.quantity = 0';
        }
        
        // Get total count for pagination
        const countResult = await window.electronAPI.invoke('db-query', {
            query: `SELECT COUNT(*) as total 
                    FROM inventory i
                    WHERE ${whereClause}`,
            params: params
        });
        
        totalItems = countResult[0].total;
        updatePagination();
        
        // Get paginated data
        const offset = (currentPage - 1) * itemsPerPage;
        
        inventoryData = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      i.id, i.part_code, i.name, i.quantity, i.reorder_level, 
                      i.cost_price, i.selling_price, i.image_path, i.barcode,
                      c.name as category, b.name as brand
                    FROM inventory i
                    LEFT JOIN categories c ON i.category_id = c.id
                    LEFT JOIN brands b ON i.brand_id = b.id
                    WHERE ${whereClause}
                    ORDER BY i.name
                    LIMIT ? OFFSET ?`,
            params: [...params, itemsPerPage, offset]
        });
        
        renderInventoryTable();
    } catch (error) {
        console.error('Error loading inventory data:', error);
        showAlert('Error loading inventory data', 'danger');
    }
}

function renderInventoryTable() {
    const tableBody = document.querySelector('#inventory-table tbody');
    tableBody.innerHTML = '';
    
    if (inventoryData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-4">No inventory items found</td>
            </tr>
        `;
        return;
    }
    
    inventoryData.forEach(item => {
        const status = getStockStatus(item.quantity, item.reorder_level);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.part_code}</td>
            <td>
                ${item.image_path ? 
                    `<img src="${item.image_path}" class="img-thumbnail" style="height: 40px;">` : 
                    `<i class="bi bi-image" style="font-size: 1.5rem;"></i>`}
            </td>
            <td>${item.name}</td>
            <td>${item.category || 'N/A'}</td>
            <td>${item.brand || 'N/A'}</td>
            <td>${formatCurrency(item.cost_price)}</td>
            <td>${formatCurrency(item.selling_price)}</td>
            <td>
                <span class="badge bg-${status.class}">
                    ${item.quantity}
                </span>
            </td>
            <td>${status.text}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${item.id}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${item.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Add event listeners to action buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-id');
            editInventoryItem(itemId);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const itemId = btn.getAttribute('data-id');
            deleteInventoryItem(itemId);
        });
    });
}

function getStockStatus(quantity, reorderLevel) {
    if (quantity === 0) {
        return { text: 'Out of Stock', class: 'danger' };
    } else if (quantity <= reorderLevel) {
        return { text: 'Low Stock', class: 'warning' };
    } else {
        return { text: 'In Stock', class: 'success' };
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
            loadInventoryData();
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
            loadInventoryData();
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
            loadInventoryData();
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
            loadInventoryData();
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
            loadInventoryData();
        }
    });
    pagination.appendChild(nextLi);
}

function showInventoryModal(item = null) {
    const modal = new bootstrap.Modal(document.getElementById('inventoryModal'));
    const form = document.getElementById('inventory-form');
    const title = document.getElementById('modal-title');
    
    // Reset form
    form.reset();
    document.getElementById('image-preview').innerHTML = '';
    
    if (item) {
        // Edit mode
        title.textContent = 'Edit Inventory Item';
        document.getElementById('item-id').value = item.id;
        document.getElementById('part-code').value = item.part_code;
        document.getElementById('part-name').value = item.name;
        $('#category').val(item.category_id).trigger('change');
        $('#brand').val(item.brand_id).trigger('change');
        $('#supplier').val(item.supplier_id).trigger('change');
        document.getElementById('cost-price').value = item.cost_price;
        document.getElementById('selling-price').value = item.selling_price;
        document.getElementById('quantity').value = item.quantity;
        document.getElementById('reorder-level').value = item.reorder_level;
        document.getElementById('location').value = item.location || '';
        document.getElementById('description').value = item.description || '';
        document.getElementById('barcode').value = item.barcode || '';
        
        if (item.image_path) {
            const preview = document.getElementById('image-preview');
            preview.innerHTML = `
                <img src="${item.image_path}" class="img-thumbnail" style="max-height: 150px;">
                <button class="btn btn-sm btn-danger mt-2" id="remove-image-btn">
                    <i class="bi bi-trash"></i> Remove Image
                </button>
            `;
            
            document.getElementById('remove-image-btn').addEventListener('click', () => {
                document.getElementById('part-image').value = '';
                preview.innerHTML = '';
            });
        }
    } else {
        // Add mode
        title.textContent = 'Add New Inventory Item';
        document.getElementById('item-id').value = '';
    }
    
    modal.show();
}

async function editInventoryItem(itemId) {
    try {
        const item = await window.electronAPI.invoke('db-query', {
            query: 'SELECT * FROM inventory WHERE id = ?',
            params: [itemId]
        });
        
        if (item.length > 0) {
            showInventoryModal(item[0]);
        } else {
            showAlert('Item not found', 'danger');
        }
    } catch (error) {
        console.error('Error fetching item:', error);
        showAlert('Error fetching item details', 'danger');
    }
}

async function saveInventoryItem() {
    const form = document.getElementById('inventory-form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    try {
        const itemId = document.getElementById('item-id').value;
        const imageFile = document.getElementById('part-image').files[0];
        
        // Prepare item data
        const itemData = {
            part_code: document.getElementById('part-code').value,
            name: document.getElementById('part-name').value,
            category_id: document.getElementById('category').value,
            brand_id: document.getElementById('brand').value || null,
            supplier_id: document.getElementById('supplier').value || null,
            cost_price: document.getElementById('cost-price').value,
            selling_price: document.getElementById('selling-price').value,
            quantity: document.getElementById('quantity').value,
            reorder_level: document.getElementById('reorder-level').value,
            location: document.getElementById('location').value || null,
            description: document.getElementById('description').value || null,
            barcode: document.getElementById('barcode').value || null
        };
        
        // Handle image upload (in a real app, this would save the file and return the path)
        if (imageFile) {
            itemData.image_path = await handleImageUpload(imageFile, itemData.part_code);
        } else if (document.getElementById('image-preview').innerHTML === '') {
            // If image was removed
            itemData.image_path = null;
        }
        
        if (itemId) {
            // Update existing item
            await window.electronAPI.invoke('db-run', {
                query: `UPDATE inventory SET 
                        part_code = ?, name = ?, category_id = ?, brand_id = ?, supplier_id = ?,
                        cost_price = ?, selling_price = ?, quantity = ?, reorder_level = ?,
                        location = ?, description = ?, barcode = ?, image_path = ?,
                        updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?`,
                params: [
                    itemData.part_code, itemData.name, itemData.category_id, itemData.brand_id, itemData.supplier_id,
                    itemData.cost_price, itemData.selling_price, itemData.quantity, itemData.reorder_level,
                    itemData.location, itemData.description, itemData.barcode, itemData.image_path,
                    itemId
                ]
            });
            
            showAlert('Item updated successfully', 'success');
        } else {
            // Insert new item
            await window.electronAPI.invoke('db-run', {
                query: `INSERT INTO inventory (
                    part_code, name, category_id, brand_id, supplier_id,
                    cost_price, selling_price, quantity, reorder_level,
                    location, description, barcode, image_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    itemData.part_code, itemData.name, itemData.category_id, itemData.brand_id, itemData.supplier_id,
                    itemData.cost_price, itemData.selling_price, itemData.quantity, itemData.reorder_level,
                    itemData.location, itemData.description, itemData.barcode, itemData.image_path
                ]
            });
            
            showAlert('Item added successfully', 'success');
        }
        
        // Close modal and refresh data
        const modal = bootstrap.Modal.getInstance(document.getElementById('inventoryModal'));
        modal.hide();
        loadInventoryData();
    } catch (error) {
        console.error('Error saving item:', error);
        showAlert('Error saving item', 'danger');
    }
}

async function handleImageUpload(file, partCode) {
    // In a real Electron app, we would:
    // 1. Generate a unique filename based on part code
    // 2. Save the file to the app's user data directory
    // 3. Return the path to the saved file
    
    // For this example, we'll just return a placeholder
    return `assets/inventory/${partCode}_${Date.now()}.${file.name.split('.').pop()}`;
}

async function deleteInventoryItem(itemId) {
    if (confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        try {
            await window.electronAPI.invoke('db-run', {
                query: 'DELETE FROM inventory WHERE id = ?',
                params: [itemId]
            });
            
            showAlert('Item deleted successfully', 'success');
            loadInventoryData();
        } catch (error) {
            console.error('Error deleting item:', error);
            showAlert('Error deleting item', 'danger');
        }
    }
}

async function exportInventory(format) {
    try {
        // Get all inventory data (without pagination)
        const data = await window.electronAPI.invoke('db-query', {
            query: `SELECT 
                      i.part_code, i.name, c.name as category, b.name as brand,
                      i.cost_price, i.selling_price, i.quantity, i.reorder_level,
                      CASE 
                        WHEN i.quantity = 0 THEN 'Out of Stock'
                        WHEN i.quantity <= i.reorder_level THEN 'Low Stock'
                        ELSE 'In Stock'
                      END as status
                    FROM inventory i
                    LEFT JOIN categories c ON i.category_id = c.id
                    LEFT JOIN brands b ON i.brand_id = b.id
                    ORDER BY i.name`
        });
        
        if (format === 'excel') {
            await exportToExcel(data);
        } else {
            await exportToPDF(data);
        }
    } catch (error) {
        console.error('Error exporting inventory:', error);
        showAlert('Error exporting inventory data', 'danger');
    }
}

async function exportToExcel(data) {
    try {
        // In a real Electron app, we would use exceljs to create an Excel file
        // and save it using the dialog.showSaveDialog API
        
        // This is a simplified version that just shows a success message
        showAlert('Excel export started. File will be saved to your downloads folder.', 'success');
        
        // Actual implementation would look something like this:
        /*
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Inventory');
        
        // Add headers
        worksheet.columns = [
            { header: 'Part Code', key: 'part_code' },
            { header: 'Name', key: 'name' },
            { header: 'Category', key: 'category' },
            { header: 'Brand', key: 'brand' },
            { header: 'Cost Price', key: 'cost_price' },
            { header: 'Selling Price', key: 'selling_price' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Reorder Level', key: 'reorder_level' },
            { header: 'Status', key: 'status' }
        ];
        
        // Add data
        worksheet.addRows(data);
        
        // Save file
        const { filePath } = await window.electronAPI.invoke('show-save-dialog', {
            title: 'Save Excel File',
            defaultPath: 'inventory_export.xlsx',
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });
        
        if (filePath) {
            await workbook.xlsx.writeFile(filePath);
            showAlert('Excel file exported successfully', 'success');
        }
        */
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        showAlert('Error exporting to Excel', 'danger');
    }
}

async function exportToPDF(data) {
    try {
        // In a real Electron app, we would use jsPDF to create a PDF file
        // and save it using the dialog.showSaveDialog API
        
        // This is a simplified version that just shows a success message
        showAlert('PDF export started. File will be saved to your downloads folder.', 'success');
        
        // Actual implementation would look something like this:
        /*
        const { jsPDF } = require('jspdf');
        const doc = new jsPDF();
        
        // Add title
        doc.setFontSize(18);
        doc.text('Inventory Report', 105, 15, { align: 'center' });
        
        // Add date
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 22, { align: 'center' });
        
        // Add table
        const headers = [
            'Part Code', 'Name', 'Category', 'Brand', 
            'Cost Price', 'Selling Price', 'Quantity', 'Status'
        ];
        
        const rows = data.map(item => [
            item.part_code,
            item.name,
            item.category || 'N/A',
            item.brand || 'N/A',
            formatCurrency(item.cost_price),
            formatCurrency(item.selling_price),
            item.quantity,
            item.status
        ]);
        
        doc.autoTable({
            head: [headers],
            body: rows,
            startY: 30,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [67, 97, 238] }
        });
        
        // Save file
        const { filePath } = await window.electronAPI.invoke('show-save-dialog', {
            title: 'Save PDF File',
            defaultPath: 'inventory_export.pdf',
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        
        if (filePath) {
            doc.save(filePath);
            showAlert('PDF file exported successfully', 'success');
        }
        */
    } catch (error) {
        console.error('Error exporting to PDF:', error);
        showAlert('Error exporting to PDF', 'danger');
    }
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