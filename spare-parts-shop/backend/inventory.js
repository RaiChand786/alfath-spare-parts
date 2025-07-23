const { getDbConnection } = require('./db');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Check for low stock items
async function checkLowStock() {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT id, part_code, name, quantity, reorder_level 
             FROM inventory 
             WHERE quantity <= reorder_level`,
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Get inventory item by ID
async function getInventoryItem(id) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM inventory WHERE id = ?`,
            [id],
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            }
        );
    });
}

// Add new inventory item
async function addInventoryItem(item) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO inventory (
                part_code, name, category_id, brand_id, supplier_id,
                cost_price, selling_price, quantity, reorder_level,
                location, description, barcode, image_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item.part_code, item.name, item.category_id, item.brand_id, item.supplier_id,
                item.cost_price, item.selling_price, item.quantity, item.reorder_level,
                item.location, item.description, item.barcode, item.image_path
            ],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
    });
}

// Update inventory item
async function updateInventoryItem(id, item) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE inventory SET 
                part_code = ?, name = ?, category_id = ?, brand_id = ?, supplier_id = ?,
                cost_price = ?, selling_price = ?, quantity = ?, reorder_level = ?,
                location = ?, description = ?, barcode = ?, image_path = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                item.part_code, item.name, item.category_id, item.brand_id, item.supplier_id,
                item.cost_price, item.selling_price, item.quantity, item.reorder_level,
                item.location, item.description, item.barcode, item.image_path,
                id
            ],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Delete inventory item
async function deleteInventoryItem(id) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM inventory WHERE id = ?`,
            [id],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
    });
}

// Get inventory list with filters
async function getInventoryList(filters = {}) {
    const db = getDbConnection();
    const { search, category_id, brand_id, stock_status, page = 1, limit = 10 } = filters;
    
    let whereClause = '1=1';
    const params = [];
    
    if (search) {
        whereClause += ' AND (i.name LIKE ? OR i.part_code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    if (category_id) {
        whereClause += ' AND i.category_id = ?';
        params.push(category_id);
    }
    
    if (brand_id) {
        whereClause += ' AND i.brand_id = ?';
        params.push(brand_id);
    }
    
    if (stock_status === 'low') {
        whereClause += ' AND i.quantity <= i.reorder_level AND i.quantity > 0';
    } else if (stock_status === 'out') {
        whereClause += ' AND i.quantity = 0';
    }
    
    // Get total count
    const total = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as total FROM inventory i WHERE ${whereClause}`,
            params,
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.total);
                }
            }
        );
    });
    
    // Get paginated data
    const offset = (page - 1) * limit;
    const data = await new Promise((resolve, reject) => {
        db.all(
            `SELECT 
                i.id, i.part_code, i.name, i.quantity, i.reorder_level, 
                i.cost_price, i.selling_price, i.image_path, i.barcode,
                c.name as category, b.name as brand
             FROM inventory i
             LEFT JOIN categories c ON i.category_id = c.id
             LEFT JOIN brands b ON i.brand_id = b.id
             WHERE ${whereClause}
             ORDER BY i.name
             LIMIT ? OFFSET ?`,
            [...params, limit, offset],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
    
    return {
        total,
        page,
        limit,
        data
    };
}

// Handle image upload
async function handleImageUpload(file, partCode) {
    try {
        // Create inventory directory if it doesn't exist
        const inventoryDir = path.join(app.getPath('userData'), 'inventory');
        if (!fs.existsSync(inventoryDir)) {
            fs.mkdirSync(inventoryDir, { recursive: true });
        }
        
        // Generate unique filename
        const ext = path.extname(file.name);
        const filename = `${partCode}_${Date.now()}${ext}`;
        const filePath = path.join(inventoryDir, filename);
        
        // Save file
        await fs.promises.writeFile(filePath, file.data);
        
        return filePath;
    } catch (error) {
        console.error('Error saving image:', error);
        throw error;
    }
}

module.exports = {
    checkLowStock,
    getInventoryItem,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    getInventoryList,
    handleImageUpload
};