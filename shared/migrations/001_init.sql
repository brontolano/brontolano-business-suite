-- ============================================================
-- BRONTOLANO BUSINESS SUITE - Database Schema
-- Matches ERD, FRS, and FRD specifications
-- ============================================================

-- TENANTS (multi-tenant root)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  domain VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORGANIZATIONS (per-tenant business units)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  tax_id VARCHAR(50),
  logo_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROLES (global role definitions)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(30) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PERMISSIONS
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('create','read','update','delete')),
  description TEXT,
  UNIQUE(module, action)
);

-- ROLE_PERMISSIONS
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  avatar_url VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  failed_attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- USER_ROLES
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- REFRESH_TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT_LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  table_name VARCHAR(50),
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CRM MODULE
-- ============================================================

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(20),
  name VARCHAR(200) NOT NULL,
  contact_name VARCHAR(150),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  industry VARCHAR(100),
  type VARCHAR(20) DEFAULT 'individual' CHECK (type IN ('individual','company')),
  segment VARCHAR(50),
  region VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEADS
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source VARCHAR(30) NOT NULL CHECK (source IN ('web_form','manual','import','referral','cold_call','social')),
  contact_name VARCHAR(150) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  company VARCHAR(200),
  score INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','lost')),
  assigned_to UUID REFERENCES users(id),
  converted_at TIMESTAMPTZ,
  customer_id UUID REFERENCES customers(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OPPORTUNITIES (deal pipeline)
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  name VARCHAR(200) NOT NULL,
  stage VARCHAR(30) DEFAULT 'prospecting' CHECK (stage IN (
    'prospecting','qualification','proposal','negotiation','closed_won','closed_lost'
  )),
  amount DECIMAL(14,2) DEFAULT 0,
  probability INT DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  assigned_to UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONTACT_HISTORY
CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('email','call','meeting','note')),
  subject VARCHAR(200),
  content TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVENTORY MODULE
-- ============================================================

-- WAREHOUSES
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCT CATEGORIES
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES product_categories(id),
  sku VARCHAR(30) NOT NULL,
  barcode VARCHAR(50),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  unit VARCHAR(20) DEFAULT 'pcs',
  cost_price DECIMAL(14,2) DEFAULT 0,
  selling_price DECIMAL(14,2) NOT NULL,
  min_stock DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, sku)
);

-- STOCK_LEVELS (per warehouse per product)
CREATE TABLE IF NOT EXISTS stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity DECIMAL(12,2) DEFAULT 0,
  reserved DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

-- STOCK_MOVEMENTS
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('in','out','transfer','adjustment')),
  quantity DECIMAL(12,2) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  notes TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BATCH_LOT (batch/lot tracking)
CREATE TABLE IF NOT EXISTS batch_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  batch_number VARCHAR(50) NOT NULL,
  quantity DECIMAL(12,2) DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SALES MODULE
-- ============================================================

-- SALES_ORDERS
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_number VARCHAR(30) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  opportunity_id UUID REFERENCES opportunities(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN (
    'draft','pending_approval','approved','rejected','in_fulfillment','shipped','delivered','closed'
  )),
  subtotal DECIMAL(14,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  discount_type VARCHAR(20) CHECK (discount_type IN ('percentage','fixed','bogo')),
  tax DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) DEFAULT 0,
  payment_method VARCHAR(30),
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, order_number)
);

-- ORDER_ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) DEFAULT 0,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price - discount) STORED
);

-- QUOTES (quotations)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quote_number VARCHAR(30) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  subtotal DECIMAL(14,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  tax DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, quote_number)
);

-- QUOTE_ITEMS
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) DEFAULT 0,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price - discount) STORED
);

-- INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number VARCHAR(30) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES sales_orders(id),
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  subtotal DECIMAL(14,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  tax DECIMAL(14,2) DEFAULT 0,
  total DECIMAL(14,2) DEFAULT 0,
  amount_paid DECIMAL(14,2) DEFAULT 0,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, invoice_number)
);

-- ============================================================
-- FINANCE MODULE
-- ============================================================

-- CHART_OF_ACCOUNTS
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, code)
);

-- GENERAL_LEDGER / LEDGER_ENTRIES
CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit DECIMAL(14,2) DEFAULT 0 CHECK (debit >= 0),
  credit DECIMAL(14,2) DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- FINANCIAL_TRANSACTIONS (journal header)
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  category VARCHAR(50),
  description TEXT,
  amount DECIMAL(14,2) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  user_id UUID REFERENCES users(id),
  transaction_date DATE DEFAULT CURRENT_DATE,
  is_posted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOUNTS_PAYABLE
CREATE TABLE IF NOT EXISTS accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name VARCHAR(200) NOT NULL,
  invoice_number VARCHAR(50),
  amount DECIMAL(14,2) NOT NULL,
  amount_paid DECIMAL(14,2) DEFAULT 0,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOUNTS_RECEIVABLE
CREATE TABLE IF NOT EXISTS accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  amount DECIMAL(14,2) NOT NULL,
  amount_received DECIMAL(14,2) DEFAULT 0,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HRM MODULE
-- ============================================================

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  dept_id UUID REFERENCES departments(id),
  job_title VARCHAR(100),
  tier VARCHAR(20) DEFAULT 'staff' CHECK (tier IN ('executive','manager','staff','intern')),
  hire_date DATE,
  salary DECIMAL(14,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEAVE_REQUESTS
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(30) NOT NULL CHECK (leave_type IN ('annual','sick','personal','maternity','paternity','unpaid')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested INT NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYROLL_RECORDS
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  base_salary DECIMAL(14,2) NOT NULL,
  allowances DECIMAL(14,2) DEFAULT 0,
  deductions DECIMAL(14,2) DEFAULT 0,
  tax DECIMAL(14,2) DEFAULT 0,
  net_pay DECIMAL(14,2) GENERATED ALWAYS AS (base_salary + allowances - deductions - tax) STORED,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','processed','paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PERFORMANCE_REVIEWS
CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES employees(id),
  period VARCHAR(7) NOT NULL,
  score INT CHECK (score >= 1 AND score <= 5),
  strengths TEXT,
  improvements TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS / ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('restock','low_stock','order','payment','hr','system')),
  title VARCHAR(200) NOT NULL,
  message TEXT,
  severity VARCHAR(10) DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  is_read BOOLEAN DEFAULT FALSE,
  reference_type VARCHAR(30),
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_orgs_tenant ON organizations(tenant_id);
CREATE INDEX idx_customers_org ON customers(org_id);
CREATE INDEX idx_leads_org ON leads(org_id);
CREATE INDEX idx_leads_status ON leads(org_id, status);
CREATE INDEX idx_leads_score ON leads(org_id, score DESC);
CREATE INDEX idx_opportunities_org ON opportunities(org_id);
CREATE INDEX idx_opportunities_stage ON opportunities(org_id, stage);
CREATE INDEX idx_products_org ON products(org_id);
CREATE INDEX idx_products_sku ON products(org_id, sku);
CREATE INDEX idx_stock_levels_product ON stock_levels(product_id);
CREATE INDEX idx_stock_movements_org ON stock_movements(org_id);
CREATE INDEX idx_orders_org ON sales_orders(org_id);
CREATE INDEX idx_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_orders_status ON sales_orders(org_id, status);
CREATE INDEX idx_quotes_org ON quotes(org_id);
CREATE INDEX idx_invoices_org ON invoices(org_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_ledger_entries_txn ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX idx_transactions_org ON financial_transactions(org_id);
CREATE INDEX idx_employees_org ON employees(org_id);
CREATE INDEX idx_leave_emp ON leave_requests(employee_id);
CREATE INDEX idx_payroll_emp ON payroll_records(employee_id);
CREATE INDEX idx_alerts_org ON alerts(org_id);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_contact_history_org ON contact_history(org_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default roles
INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Full system access'),
  ('admin', 'Organization administrator'),
  ('manager', 'Department manager'),
  ('staff', 'Regular staff member'),
  ('finance', 'Finance department'),
  ('viewer', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

-- Default permissions for common modules
INSERT INTO permissions (module, action) VALUES
  ('crm','create'),('crm','read'),('crm','update'),('crm','delete'),
  ('sales','create'),('sales','read'),('sales','update'),('sales','delete'),
  ('inventory','create'),('inventory','read'),('inventory','update'),('inventory','delete'),
  ('finance','create'),('finance','read'),('finance','update'),('finance','delete'),
  ('hr','create'),('hr','read'),('hr','update'),('hr','delete'),
  ('reports','read')
ON CONFLICT (module, action) DO NOTHING;

-- Grant all permissions to super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Grant most permissions to admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Default tenant
INSERT INTO tenants (name, code, domain, email) VALUES
  ('Brontolano Kantin', 'BRT001', 'brontolano.com', 'admin@brontolano.com')
ON CONFLICT (code) DO NOTHING;

-- Default organization
INSERT INTO organizations (tenant_id, name, tax_id)
SELECT t.id, 'Brontolano Main Office', 'TAX-001'
FROM tenants t WHERE t.code = 'BRT001'
ON CONFLICT DO NOTHING;

-- Default admin user (password: admin123 - bcrypt)
INSERT INTO users (tenant_id, email, password_hash, full_name, role)
SELECT t.id, 'admin@brontolano.com', '$2b$12$LJ3m4ris7Hke5dmHxPp0VOTbGQpZKoMvDzHb3z1cJmV2bF1eR9Z3e', 'Admin Brontolano', 'super_admin'
FROM tenants t WHERE t.code = 'BRT001'
ON CONFLICT DO NOTHING;

-- Assign super_admin role to admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'admin@brontolano.com' AND r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Default product categories
INSERT INTO product_categories (org_id, name)
SELECT o.id, c.name
FROM organizations o, (VALUES ('Food'),('Beverage'),('Supplies'),('Services')) AS c(name)
WHERE o.name = 'Brontolano Main Office'
ON CONFLICT DO NOTHING;

-- Default warehouse
INSERT INTO warehouses (org_id, name)
SELECT id, 'Main Warehouse'
FROM organizations WHERE name = 'Brontolano Main Office'
ON CONFLICT DO NOTHING;
