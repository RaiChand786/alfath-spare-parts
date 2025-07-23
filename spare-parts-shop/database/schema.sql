-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier', -- 'admin' or 'cashier'
  full_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Inventory categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  vehicle_info TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory items
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id),
  brand_id INTEGER REFERENCES brands(id),
  cost_price REAL NOT NULL,
  selling_price REAL NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER DEFAULT 5,
  supplier_id INTEGER REFERENCES suppliers(id),
  location TEXT,
  barcode TEXT,
  image_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number TEXT,
  total_amount REAL NOT NULL,
  payment_status TEXT DEFAULT 'pending', -- 'paid', 'pending', 'partial'
  paid_amount REAL DEFAULT 0,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id)
);

-- Purchase items
CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER REFERENCES purchases(id),
  inventory_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL
);

-- Sales (invoices)
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  payment_method TEXT, -- 'cash', 'card', 'upi'
  payment_status TEXT DEFAULT 'paid', -- 'paid', 'pending', 'partial'
  paid_amount REAL NOT NULL,
  balance REAL DEFAULT 0,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_by INTEGER REFERENCES users(id)
);

-- Sale items
CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER REFERENCES sales(id),
  inventory_id INTEGER REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER REFERENCES sales(id),
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  received_by INTEGER REFERENCES users(id)
);

-- System settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  tax_rate REAL DEFAULT 0,
  currency TEXT DEFAULT 'PKR',
  logo_path TEXT,
  theme TEXT DEFAULT 'light', -- 'light' or 'dark'
  language TEXT DEFAULT 'en' -- 'en' or 'ur'
);

-- Create triggers for inventory updates
CREATE TRIGGER IF NOT EXISTS update_inventory_after_purchase
AFTER INSERT ON purchase_items
BEGIN
  UPDATE inventory SET quantity = quantity + NEW.quantity 
  WHERE id = NEW.inventory_id;
END;

CREATE TRIGGER IF NOT EXISTS update_inventory_after_sale
AFTER INSERT ON sale_items
BEGIN
  UPDATE inventory SET quantity = quantity - NEW.quantity 
  WHERE id = NEW.inventory_id;
END;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_part_code ON inventory(part_code);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_brand ON inventory(brand_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier' -- admin/cashier
);