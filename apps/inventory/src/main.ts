import express, { Request, Response } from "express";
import { authenticate, requirePermission } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

// ============================================================
// PRODUCT CATEGORIES
// ============================================================

app.get('/api/inventory/categories', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const result = await query('SELECT * FROM product_categories WHERE org_id = $1 ORDER BY name', [org_id]);
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// PRODUCTS
// ============================================================

// Create product
app.post('/api/inventory/products', authenticate, requirePermission('inventory:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { category_id, sku, barcode, name, description, unit, cost_price, selling_price, min_stock } = req.body;
    
    const result = await query(`
      INSERT INTO products (org_id, category_id, sku, barcode, name, description, unit, cost_price, selling_price, min_stock)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [org_id, category_id, sku, barcode, name, description, unit, cost_price, selling_price, min_stock]);
    
    res.status(201).json({
      message: 'Product created successfully',
      product: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'E003', message: 'SKU already exists for this organization' });
    }
    console.error('Create product error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all products with stock info
app.get('/api/inventory/products', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { category_id, is_active, search, low_stock } = req.query;
    
    let queryStr = `
      SELECT p.*, pc.name as category_name,
        COALESCE((SELECT SUM(quantity) FROM stock_levels WHERE product_id = p.id), 0) as total_stock,
        COALESCE((SELECT SUM(reserved) FROM stock_levels WHERE product_id = p.id), 0) as total_reserved,
        COALESCE((SELECT SUM(quantity) - SUM(reserved) FROM stock_levels WHERE product_id = p.id), 0) as available
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (category_id) {
      queryStr += ` AND p.category_id = $${paramIndex++}`;
      params.push(category_id);
    }
    if (is_active !== undefined) {
      queryStr += ` AND p.is_active = $${paramIndex++}`;
      params.push(is_active);
    }
    if (search) {
      queryStr += ` AND (p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex} OR p.barcode ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (low_stock === 'true') {
      queryStr += ` AND p.min_stock > 0 AND (SELECT SUM(quantity) FROM stock_levels WHERE product_id = p.id) <= p.min_stock`;
    }
    
    queryStr += ' ORDER BY p.name';
    
    const result = await query(queryStr, params);
    res.json({ products: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get product by ID
app.get('/api/inventory/products/:id', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const result = await query(`
      SELECT p.*, pc.name as category_name,
        (SELECT json_agg(json_build_object(
          'warehouse_id', sl.warehouse_id, 'warehouse_name', w.name,
          'quantity', sl.quantity, 'reserved', sl.reserved
        )) FROM stock_levels sl
        LEFT JOIN warehouses w ON sl.warehouse_id = w.id
        WHERE sl.product_id = p.id) as stock_by_warehouse
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.id = $1 AND p.org_id = $2
    `, [id, org_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Product not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// WAREHOUSES
// ============================================================

app.get('/api/inventory/warehouses', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const result = await query('SELECT * FROM warehouses WHERE org_id = $1', [org_id]);
    res.json({ warehouses: result.rows });
  } catch (error) {
    console.error('Get warehouses error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// STOCK OPERATIONS
// ============================================================

// Receive stock (stock in)
app.post('/api/inventory/stock/in', authenticate, requirePermission('inventory:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { product_id, warehouse_id, quantity, notes, batch_number, expiry_date } = req.body;
    const user_id = req.user.userId;
    
    if (quantity <= 0) {
      return res.status(400).json({ error: 'E003', message: 'Quantity must be positive' });
    }
    
    await transaction(async (client) => {
      await client.query(`
        INSERT INTO stock_movements (org_id, product_id, warehouse_id, type, quantity, notes, user_id)
        VALUES ($1, $2, $3, 'in', $4, $5, $6)
      `, [org_id, product_id, warehouse_id, quantity, notes, user_id]);
      
      const existing = await client.query(
        'SELECT id FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
        [product_id, warehouse_id]
      );
      
      if (existing.rows.length > 0) {
        await client.query(
          'UPDATE stock_levels SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3',
          [quantity, product_id, warehouse_id]
        );
      } else {
        await client.query(`
          INSERT INTO stock_levels (product_id, warehouse_id, quantity)
          VALUES ($1, $2, $3)
        `, [product_id, warehouse_id, quantity]);
      }
      
      if (batch_number) {
        await client.query(`
          INSERT INTO batch_lots (product_id, warehouse_id, batch_number, quantity, expiry_date)
          VALUES ($1, $2, $3, $4, $5)
        `, [product_id, warehouse_id, batch_number, quantity, expiry_date]);
      }
      
      return { success: true };
    });
    
    res.json({ message: `Stock received: ${quantity} units added` });
  } catch (error) {
    console.error('Stock in error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Transfer stock between warehouses
app.post('/api/inventory/stock/transfer', authenticate, requirePermission('inventory:update'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = req.body;
    const user_id = req.user.userId;
    
    if (quantity <= 0) {
      return res.status(400).json({ error: 'E003', message: 'Quantity must be positive' });
    }
    
    await transaction(async (client) => {
      const sourceStock = await client.query(
        'SELECT quantity, reserved FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
        [product_id, from_warehouse_id]
      );
      
      if (sourceStock.rows.length === 0) {
        throw new Error('Source warehouse has no stock for this product');
      }
      
      const available = sourceStock.rows[0].quantity - sourceStock.rows[0].reserved;
      if (available < quantity) {
        throw new Error(`Insufficient available stock. Available: ${available}, Requested: ${quantity}`);
      }
      
      await client.query(
        'UPDATE stock_levels SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3',
        [quantity, product_id, from_warehouse_id]
      );
      
      const destExisting = await client.query(
        'SELECT id FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
        [product_id, to_warehouse_id]
      );
      
      if (destExisting.rows.length > 0) {
        await client.query(
          'UPDATE stock_levels SET quantity = quantity + $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3',
          [quantity, product_id, to_warehouse_id]
        );
      } else {
        await client.query(`
          INSERT INTO stock_levels (product_id, warehouse_id, quantity)
          VALUES ($1, $2, $3)
        `, [product_id, to_warehouse_id, quantity]);
      }
      
      await client.query(`
        INSERT INTO stock_movements (org_id, product_id, warehouse_id, type, quantity, notes, user_id)
        VALUES ($1, $2, $3, 'transfer', $4, $5, $6)
      `, [org_id, product_id, from_warehouse_id, quantity, notes, user_id]);
      
      return { success: true };
    });
    
    res.json({ message: `Stock transferred: ${quantity} units moved` });
  } catch (error) {
    if (error.message.startsWith('Source') || error.message.startsWith('Insufficient')) {
      return res.status(400).json({ error: 'E002', message: error.message });
    }
    console.error('Stock transfer error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Stock out (removal)
app.post('/api/inventory/stock/out', authenticate, requirePermission('inventory:update'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { product_id, warehouse_id, quantity, notes } = req.body;
    const user_id = req.user.userId;
    
    const stockResult = await query(
      'SELECT quantity, reserved FROM stock_levels WHERE product_id = $1 AND warehouse_id = $2',
      [product_id, warehouse_id]
    );
    
    if (stockResult.rows.length === 0) {
      return res.status(400).json({ error: 'E002', message: 'No stock found for this product in the warehouse' });
    }
    
    const stock = stockResult.rows[0];
    const available = stock.quantity - stock.reserved;
    if (available < quantity) {
      return res.status(400).json({ error: 'E002', message: `Insufficient available stock. Available: ${available}, Requested: ${quantity}` });
    }
    
    await query('UPDATE stock_levels SET quantity = quantity - $1, updated_at = NOW() WHERE product_id = $2 AND warehouse_id = $3',
      [quantity, product_id, warehouse_id]);
    
    await query(`
      INSERT INTO stock_movements (org_id, product_id, warehouse_id, type, quantity, notes, user_id)
      VALUES ($1, $2, $3, 'out', $4, $5, $6)
    `, [org_id, product_id, warehouse_id, quantity, notes, user_id]);
    
    res.json({ message: `Stock removed: ${quantity} units` });
  } catch (error) {
    console.error('Stock out error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get stock movements
app.get('/api/inventory/stock/movements', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { product_id, type, limit } = req.query;
    
    let queryStr = `
      SELECT sm.*, p.name as product_name, p.sku, w.name as warehouse_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses w ON sm.warehouse_id = w.id
      WHERE sm.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (product_id) {
      queryStr += ` AND sm.product_id = $${paramIndex++}`;
      params.push(product_id);
    }
    if (type) {
      queryStr += ` AND sm.type = $${paramIndex++}`;
      params.push(type);
    }
    
    queryStr += ' ORDER BY sm.created_at DESC';
    
    if (limit) {
      queryStr += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit, 10));
    }
    
    const result = await query(queryStr, params);
    res.json({ movements: result.rows });
  } catch (error) {
    console.error('Get movements error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Inventory stats
app.get('/api/inventory/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const productsStats = await query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active THEN 1 END) as active_products,
        COUNT(CASE WHEN min_stock > 0 AND (SELECT COALESCE(SUM(quantity), 0) FROM stock_levels WHERE product_id = p.id) <= min_stock THEN 1 END) as low_stock_products
      FROM products p WHERE org_id = $1
    `, [org_id]);
    
    const stockValue = await query(`
      SELECT SUM(sl.quantity * p.cost_price) as total_stock_value
      FROM stock_levels sl
      JOIN products p ON sl.product_id = p.id
      WHERE p.org_id = $1
    `, [org_id]);
    
    const warehouseCount = await query('SELECT COUNT(*) as total FROM warehouses WHERE org_id = $1', [org_id]);
    
    res.json({
      products: productsStats.rows[0],
      stock_value: stockValue.rows[0]?.total_stock_value || 0,
      warehouses: warehouseCount.rows[0]?.total || 0,
    });
  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: "ok", service: "Inventory Service" }));

app.listen(PORT, () => console.log(`🚀 Inventory Service running on port ${PORT}`));