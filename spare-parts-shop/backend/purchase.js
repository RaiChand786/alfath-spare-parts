const { getDbConnection } = require('./db');

// Create a new purchase order
async function createPurchase(purchaseData) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO purchases (
                invoice_number, purchase_date, supplier_id, total_amount,
                payment_status, paid_amount, balance, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                purchaseData.invoice_number,
                purchaseData.purchase_date,
                purchaseData.supplier_id,
                purchaseData.total_amount,
                purchaseData.payment_status,
                purchaseData.paid_amount,
                purchaseData.balance,
                purchaseData.notes
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

// Add items to a purchase order
async function addPurchaseItems(purchaseId, items) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        // Start transaction
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) return reject(err);
            
            // Prepare statement for inserting items
            const stmt = db.prepare(
                `INSERT INTO purchase_items (
                    purchase_id, inventory_id, quantity, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?)`
            );
            
            // Insert each item
            items.forEach(item => {
                stmt.run(
                    [purchaseId, item.inventory_id, item.quantity, item.unit_price, item.total_price],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }
                    }
                );
            });
            
            // Finalize and commit
            stmt.finalize((err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                
                db.run('COMMIT', (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    resolve();
                });
            });
        });
    });
}

// Get purchase by ID
async function getPurchaseById(purchaseId) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 
                p.*, 
                s.name as supplier_name, 
                s.phone as supplier_phone
             FROM purchases p
             LEFT JOIN suppliers s ON p.supplier_id = s.id
             WHERE p.id = ?`,
            [purchaseId],
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

// Get purchase items
async function getPurchaseItems(purchaseId) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT 
                pi.*,
                i.part_code,
                i.name as item_name
             FROM purchase_items pi
             JOIN inventory i ON pi.inventory_id = i.id
             WHERE pi.purchase_id = ?`,
            [purchaseId],
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

// Get purchases with filters
async function getPurchases(filters = {}) {
    const db = getDbConnection();
    const { dateFrom, dateTo, supplierId, status, search, page = 1, limit = 10 } = filters;
    
    let whereClause = '1=1';
    const params = [];
    
    if (dateFrom && dateTo) {
        whereClause += ' AND date(p.purchase_date) BETWEEN ? AND ?';
        params.push(dateFrom, dateTo);
    }
    
    if (supplierId) {
        whereClause += ' AND p.supplier_id = ?';
        params.push(supplierId);
    }
    
    if (status) {
        whereClause += ' AND p.payment_status = ?';
        params.push(status);
    }
    
    if (search) {
        whereClause += ' AND (p.invoice_number LIKE ? OR s.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    // Get total count
    const total = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as total 
             FROM purchases p
             LEFT JOIN suppliers s ON p.supplier_id = s.id
             WHERE ${whereClause}`,
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
                p.id, p.invoice_number, p.purchase_date, p.total_amount,
                p.payment_status, p.paid_amount, p.balance,
                s.name as supplier_name,
                (SELECT COUNT(*) FROM purchase_items WHERE purchase_id = p.id) as item_count
             FROM purchases p
             LEFT JOIN suppliers s ON p.supplier_id = s.id
             WHERE ${whereClause}
             ORDER BY p.purchase_date DESC
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

// Record payment for a purchase
async function recordPurchasePayment(paymentData) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO payments (
                purchase_id, amount, payment_method, payment_date, notes
            ) VALUES (?, ?, ?, ?, ?)`,
            [
                paymentData.purchase_id,
                paymentData.amount,
                paymentData.payment_method,
                paymentData.payment_date,
                paymentData.notes
            ],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    // Update purchase balance
                    db.run(
                        `UPDATE purchases SET 
                            paid_amount = paid_amount + ?,
                            balance = balance - ?,
                            payment_status = CASE WHEN balance - ? <= 0 THEN 'paid' ELSE 'partial' END
                         WHERE id = ?`,
                        [
                            paymentData.amount,
                            paymentData.amount,
                            paymentData.amount,
                            paymentData.purchase_id
                        ],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(this.changes);
                            }
                        }
                    );
                }
            }
        );
    });
}

// Update a purchase order
async function updatePurchase(purchaseId, purchaseData) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE purchases SET 
                invoice_number = ?, purchase_date = ?, supplier_id = ?,
                total_amount = ?, payment_status = ?, paid_amount = ?, balance = ?, notes = ?
             WHERE id = ?`,
            [
                purchaseData.invoice_number,
                purchaseData.purchase_date,
                purchaseData.supplier_id,
                purchaseData.total_amount,
                purchaseData.payment_status,
                purchaseData.paid_amount,
                purchaseData.balance,
                purchaseData.notes,
                purchaseId
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

// Delete purchase items
async function deletePurchaseItems(purchaseId) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM purchase_items WHERE purchase_id = ?',
            [purchaseId],
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

module.exports = {
    createPurchase,
    addPurchaseItems,
    getPurchaseById,
    getPurchaseItems,
    getPurchases,
    recordPurchasePayment,
    updatePurchase,
    deletePurchaseItems
};