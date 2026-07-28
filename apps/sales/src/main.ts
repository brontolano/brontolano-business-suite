import express, { Request, Response } from "express";
import { authenticate, requirePermission } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Order number generator
async function generateOrderNumber(org_id, prefix = 'SO') {
  const result = await query(`
    SELECT COUNT(*) + 1 as seq FROM sales_orders WHERE org_id = $1
      AND TO_CHAR(created_at, 'YYYYMM') = TO_CHAR(NOW(), 'YYYYMM')
  `, [org_id]);
  
  const seq = String(result.rows[0].seq).padStart(5, '0');
  const month = new Date().toISOString().slice(0, 7).replace('-', '');
  const orgResult = await query('SELECT code FROM tenants WHERE id = (SELECT tenant_id FROM organizations WHERE id = $1)', [org_id]);
  const orgCode = orgResult.rows[0]?.code || 'XXX';
  
  return `${orgCode}-${month}-${seq}`;
}

// Discount validation function
function validateDiscount(order) {
  const { discount_type, discount_amount, subtotal } = order;
  
  if (discount_type === 'percentage') {
    if (discount_amount > 50) {
      return { valid: false, reason: 'Discount percentage exceeds 50% limit' };
    }
    return { valid: true, amount: (subtotal * discount_amount) / 100 };
  }
  
  if (discount_type === 'fixed') {
    if (discount_amount > subtotal) {
      return { valid: false, reason: 'Fixed discount exceeds order total' };
    }
    return { valid: true, amount: discount_amount };
  }
  
  if (discount_type === 'bogo') {
    return { valid: true, amount: 0 };
  }
  
  return { valid: true, amount: 0 };
}

// Order lifecycle handlers
const ORDER_STATUS_FLOWS = {
  'draft': ['pending_approval'],
  'pending_approval': ['approved', 'rejected'],
  'approved': ['in_fulfillment'],
  'in_fulfillment': ['shipped'],
  'shipped': ['delivered'],
  'delivered': ['closed'],
  'rejected': ['draft'],
};

function isTransitionValid(from, to) {
  if (!ORDER_STATUS_FLOWS[from]) return false;
  return ORDER_STATUS_FLOWS[from].includes(to);
}

// ============================================================
// QUOTES
// ============================================================

// Create Quote
app.post('/api/sales/quotes', authenticate, requirePermission('sales:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { customer_id, items, valid_until, notes } = req.body;
    const user_id = req.user.userId;
    
    const orgResult = await query('SELECT tenant_id FROM organizations WHERE id = $1', [org_id]);
    const tenantId = orgResult.rows[0]?.tenant_id;
    const orgCode = await query('SELECT code FROM tenants WHERE id = $1', [tenantId]);
    const seq = (await query("SELECT COUNT(*) + 1 as seq FROM quotes WHERE org_id = $1 AND TO_CHAR(created_at, 'YYYYMM') = TO_CHAR(NOW(), 'YYYYMM')", [org_id])).rows[0].seq;
    const quoteNumber = `Q${orgCode.rows[0]?.code?.substring(0,4) || 'XXX'}-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(seq).padStart(5, '0')}`;
    
    let subtotal = 0;
    
    const itemsArray = [];
    for (const item of items) {
      const itemSubtotal = item.quantity * item.unit_price;
      subtotal += itemSubtotal;
      itemsArray.push([quoteNumber, item.product_id, item.quantity, item.unit_price]);
    }
    
    const discountValidation = validateDiscount({ ...req.body, subtotal });
    const discountAmount = discountValidation.valid ? (req.body.discount_amount || 0) : 0;
    const taxRate = parseFloat(process.env.TAX_RATE || '0.1');
    const taxAmount = (subtotal - discountAmount) * taxRate;
    const total = subtotal - discountAmount + taxAmount;
    
    await query(`UPDATE quotes SET subtotal = $1, total = $2, discount_amount = $3, tax = $4 WHERE quote_number = $5`, [subtotal, total, discountAmount, taxAmount, quoteNumber]);
    
    const result = await query(`
      INSERT INTO quotes (org_id, quote_number, customer_id, user_id, subtotal, discount_amount, tax, total, valid_until, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [org_id, quoteNumber, customer_id, user_id, subtotal, discountAmount, taxAmount, total, valid_until, notes]);
    
    for (const [qId, productId, qty, price] of itemsArray) {
      await query('INSERT INTO quote_items (quote_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [result.rows[0].id, productId, qty, price]);
    }
    
    res.status(201).json({
      message: 'Quote created successfully',
      quote: result.rows[0],
      items: itemsArray,
    });
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get Quotes
app.get('/api/sales/quotes', authenticate, requirePermission('sales:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const result = await query(`
      SELECT q.*, c.name as customer_name
      FROM quotes q LEFT JOIN customers c ON q.customer_id = c.id
      WHERE q.org_id = $1
      ORDER BY q.created_at DESC
    `, [org_id]);
    
    res.json({ quotes: result.rows });
  } catch (error) {
    console.error('Get quotes error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// ORDERS
// ============================================================

// Create Sales Order
app.post('/api/sales/orders', authenticate, requirePermission('sales:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { customer_id, opportunity_id, items, discount_type, discount_amount, payment_method, notes } = req.body;
    const user_id = req.user.userId;
    
    const orderNumber = await generateOrderNumber(org_id, 'SO');
    
    let subtotal = 0;
    for (const item of items) {
      subtotal += item.quantity * item.unit_price;
    }
    
    const discountValidation = validateDiscount({ discount_type, discount_amount, subtotal });
    if (!discountValidation.valid) {
      return res.status(400).json({ error: 'E003', message: discountValidation.reason });
    }
    
    const taxRate = parseFloat(process.env.TAX_RATE || '0.1');
    const taxAmount = (subtotal - discountValidation.amount) * taxRate;
    const total = subtotal - discountValidation.amount + taxAmount;
    
    const result = await query(`
      INSERT INTO sales_orders (
        org_id, order_number, customer_id, opportunity_id, user_id,
        subtotal, discount_amount, discount_type, tax, total,
        payment_method, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [org_id, orderNumber, customer_id, opportunity_id, user_id,
        subtotal, discountValidation.amount, discount_type, taxAmount, total,
        payment_method, notes]);
    
    const orderId = result.rows[0].id;
    for (const item of items) {
      await query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, item.product_id, item.quantity, item.unit_price, item.discount || 0]);
    }
    
    res.status(201).json({
      message: 'Order created successfully',
      order: result.rows[0],
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all orders
app.get('/api/sales/orders', authenticate, requirePermission('sales:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { status, customer_id, payment_status } = req.query;
    
    let queryStr = `SELECT so.*, c.name as customer_name
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        WHERE so.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (status) {
      queryStr += ` AND so.status = $${paramIndex++}`;
      params.push(status);
    }
    if (customer_id) {
      queryStr += ` AND so.customer_id = $${paramIndex++}`;
      params.push(customer_id);
    }
    if (payment_status) {
      queryStr += ` AND so.payment_status = $${paramIndex++}`;
      params.push(payment_status);
    }
    
    queryStr += ' ORDER BY so.created_at DESC';
    
    const result = await query(queryStr, params);
    res.json({ orders: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get order by ID
app.get('/api/sales/orders/:id', authenticate, requirePermission('sales:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const orderResult = await query(`
      SELECT so.*, c.name as customer_name
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.id = $1 AND so.org_id = $2
    `, [id, org_id]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Order not found' });
    }
    
    const itemsResult = await query(`
      SELECT oi.*, p.name as product_name, p.sku
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [id]);
    
    res.json({
      order: orderResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Update order status (lifecycle)
app.put('/api/sales/orders/:id/status', authenticate, requirePermission('sales:update'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    const { status } = req.body;
    
    const currentResult = await query('SELECT status FROM sales_orders WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Order not found' });
    }
    
    const currentStatus = currentResult.rows[0].status;
    if (!isTransitionValid(currentStatus, status)) {
      return res.status(400).json({ error: 'E003', message: `Cannot transition from ${currentStatus} to ${status}` });
    }
    
    if (status === 'approved') {
      // Reserve stock
      const items = await query('SELECT oi.product_id, oi.quantity FROM order_items oi JOIN sales_orders so ON oi.order_id = so.id WHERE oi.order_id = $1', [id]);
      for (const item of items.rows) {
        const stockResult = await query(`
          SELECT quantity, reserved FROM stock_levels WHERE product_id = $1
        `, [item.product_id]);
        
        if (stockResult.rows.length === 0) {
          return res.status(400).json({ error: 'E002', message: `Product ${item.product_id} has no stock configuration` });
        }
        
        const stock = stockResult.rows[0];
        const available = stock.quantity - stock.reserved;
        if (available < item.quantity) {
          return res.status(400).json({ error: 'E002', message: `Insufficient stock for product ${item.product_id}. Available: ${available}, Required: ${item.quantity}` });
        }
        
        await query('UPDATE stock_levels SET reserved = reserved + $1, updated_at = NOW() WHERE product_id = $2', [item.quantity, item.product_id]);
      }
    }
    
    await query('UPDATE sales_orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    
    const updatedResult = await query('SELECT * FROM sales_orders WHERE id = $1', [id]);
    
    res.json({
      message: `Order status changed to ${status}`,
      order: updatedResult.rows[0],
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// INVOICES
// ============================================================

// Generate invoice from order
app.post('/api/sales/invoices', authenticate, requirePermission('sales:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { order_id, due_date, notes } = req.body;
    const user_id = req.user.userId;
    
    const orderResult = await query('SELECT * FROM sales_orders WHERE id = $1 AND org_id = $2', [order_id, org_id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Order not found' });
    }
    
    const order = orderResult.rows[0];
    if (order.status !== 'approved' && order.status !== 'in_fulfillment' && order.status !== 'shipped' && order.status !== 'delivered') {
      return res.status(400).json({ error: 'E003', message: 'Cannot invoice an unapproved order' });
    }
    
    // Check existing invoice for this order
    const existingInvoice = await query('SELECT id FROM invoices WHERE order_id = $1', [order_id]);
    if (existingInvoice.rows.length > 0) {
      return res.status(400).json({ error: 'E003', message: 'Invoice already exists for this order' });
    }
    
    const invoiceNumber = await generateOrderNumber(org_id, 'INV');
    
    const result = await query(`
      INSERT INTO invoices (org_id, invoice_number, customer_id, order_id, user_id, subtotal, discount_amount, tax, total, due_date, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      org_id, invoiceNumber, order.customer_id, order_id, user_id,
      order.subtotal, order.discount_amount, order.tax, order.total, due_date, notes
    ]);
    
    await query("UPDATE sales_orders SET payment_status = 'unpaid', updated_at = NOW() WHERE id = $1", [order_id]);
    
    // Create AR entry
    await query(`
      INSERT INTO accounts_receivable (org_id, customer_id, invoice_id, amount, due_date)
      VALUES ($1, $2, $3, $4, $5)
    `, [org_id, order.customer_id, result.rows[0].id, order.total, due_date || new Date()]);
    
    res.status(201).json({
      message: 'Invoice created successfully',
      invoice: result.rows[0],
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all invoices
app.get('/api/sales/invoices', authenticate, requirePermission('sales:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { status, customer_id } = req.query;
    
    let queryStr = `SELECT i.*, c.name as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        WHERE i.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (status) {
      queryStr += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }
    if (customer_id) {
      queryStr += ` AND i.customer_id = $${paramIndex++}`;
      params.push(customer_id);
    }
    
    queryStr += ' ORDER BY i.created_at DESC';
    
    const result = await query(queryStr, params);
    res.json({ invoices: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Stats endpoint for sales
app.get('/api/sales/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const ordersStats = await query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(total) as total_revenue,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_orders,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders
      FROM sales_orders WHERE org_id = $1
    `, [org_id]);
    
    const invoicesStats = await query(`
      SELECT 
        COUNT(*) as total_invoices,
        SUM(total) as total_amount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_invoices
      FROM invoices WHERE org_id = $1
    `, [org_id]);
    
    res.json({
      orders: ordersStats.rows[0],
      invoices: invoicesStats.rows[0],
    });
  } catch (error) {
    console.error('Get sales stats error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: "ok", service: "Sales Service" }));

app.listen(PORT, () => console.log(`🚀 Sales Service running on port ${PORT}`));