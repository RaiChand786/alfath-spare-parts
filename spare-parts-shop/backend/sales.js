const { getDbConnection } = require('./db');

// Create a new sale
async function createSale(saleData) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO sales (
                invoice_number, customer_id, subtotal, discount, tax, total_amount,
                payment_method, payment_status, paid_amount, balance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                saleData.invoice_number,
                saleData.customer_id,
                saleData.subtotal,
                saleData.discount,
                saleData.tax,
                saleData.total_amount,
                saleData.payment_method,
                saleData.payment_status,
                saleData.paid_amount,
                saleData.balance
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

// Add items to a sale
async function addSaleItems(saleId, items) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        // Start transaction
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) return reject(err);
            
            // Prepare statement for inserting items
            const stmt = db.prepare(
                `INSERT INTO sale_items (
                    sale_id, inventory_id, quantity, unit_price, total_price
                ) VALUES (?, ?, ?, ?, ?)`
            );
            
            // Insert each item
            items.forEach(item => {
                stmt.run(
                    [saleId, item.inventory_id, item.quantity, item.unit_price, item.total_price],
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

// Get sale by ID
async function getSaleById(saleId) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 
                s.*, 
                c.name as customer_name, 
                c.phone as customer_phone,
                c.vehicle_info as customer_vehicle
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
             WHERE s.id = ?`,
            [saleId],
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

// Get sale items
async function getSaleItems(saleId) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT 
                si.*,
                i.part_code,
                i.name as item_name
             FROM sale_items si
             JOIN inventory i ON si.inventory_id = i.id
             WHERE si.sale_id = ?`,
            [saleId],
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

// Get sales with filters
async function getSales(filters = {}) {
    const db = getDbConnection();
    const { dateFrom, dateTo, search, page = 1, limit = 10 } = filters;
    
    let whereClause = '1=1';
    const params = [];
    
    if (dateFrom && dateTo) {
        whereClause += ' AND date(s.sale_date) BETWEEN ? AND ?';
        params.push(dateFrom, dateTo);
    }
    
    if (search) {
        whereClause += ' AND (s.invoice_number LIKE ? OR c.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    // Get total count
    const total = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as total 
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
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
                s.id, s.invoice_number, s.sale_date, s.total_amount,
                s.payment_method, s.payment_status, s.paid_amount, s.balance,
                c.name as customer_name,
                (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as item_count
             FROM sales s
             LEFT JOIN customers c ON s.customer_id = c.id
             WHERE ${whereClause}
             ORDER BY s.sale_date DESC
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

// Record payment for a sale
async function recordPayment(paymentData) {
    const db = getDbConnection();
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO payments (
                sale_id, amount, payment_method, notes
            ) VALUES (?, ?, ?, ?)`,
            [
                paymentData.sale_id,
                paymentData.amount,
                paymentData.payment_method,
                paymentData.notes
            ],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    // Update sale balance
                    db.run(
                        `UPDATE sales SET 
                            paid_amount = paid_amount + ?,
                            balance = balance - ?,
                            payment_status = CASE WHEN balance - ? <= 0 THEN 'paid' ELSE 'partial' END
                         WHERE id = ?`,
                        [
                            paymentData.amount,
                            paymentData.amount,
                            paymentData.amount,
                            paymentData.sale_id
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

// Generate invoice number
async function generateInvoiceNumber() {
    const db = getDbConnection();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT invoice_number FROM sales 
             WHERE invoice_number LIKE '${datePart}%'
             ORDER BY invoice_number DESC LIMIT 1`,
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    let invoiceNumber;
                    if (row) {
                        const lastNum = parseInt(row.invoice_number.slice(9)) || 0;
                        invoiceNumber = `${datePart}-${(lastNum + 1).toString().padStart(4, '0')}`;
                    } else {
                        invoiceNumber = `${datePart}-0001`;
                    }
                    resolve(invoiceNumber);
                }
            }
        );
    });
}

module.exports = {
    createSale,
    addSaleItems,
    getSaleById,
    getSaleItems,
    getSales,
    recordPayment,
    generateInvoiceNumber
};