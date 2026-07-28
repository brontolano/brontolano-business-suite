import express, { Request, Response } from "express";
import { authenticate, requirePermission } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3007;

app.use(express.json());

// Send notification (internal API for other services)
app.post('/api/notifications', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { type, title, message, severity, reference_type, reference_id, user_id } = req.body;
    
    const result = await query(`
      INSERT INTO alerts (org_id, type, title, message, severity, reference_type, reference_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [org_id, type, title, message, severity || 'info', reference_type, reference_id]);
    
    if (user_id) {
      // In a real implementation, this would send email, push, or webhook
      console.log(`Notification sent to user ${user_id}: ${title}`);
    }
    
    res.status(201).json({
      message: 'Notification created',
      notification: result.rows[0],
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get user notifications
app.get('/api/notifications', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { is_read, type, severity, limit } = req.query;
    
    let queryStr = `
      SELECT a.*
      FROM alerts a
      WHERE a.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (is_read !== undefined) {
      queryStr += ` AND a.is_read = $${paramIndex++}`;
      params.push(is_read);
    }
    if (type) {
      queryStr += ` AND a.type = $${paramIndex++}`;
      params.push(type);
    }
    if (severity) {
      queryStr += ` AND a.severity = $${paramIndex++}`;
      params.push(severity);
    }
    
    queryStr += ' ORDER BY a.created_at DESC';
    
    if (limit) {
      queryStr += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string));
    }
    
    const result = await query(queryStr, params);
    res.json({ notifications: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Mark as read
app.put('/api/notifications/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const result = await query(`
      UPDATE alerts
      SET is_read = TRUE
      WHERE id = $1 AND org_id = $2
      RETURNING *
    `, [id, org_id]);
    
    res.json({ message: 'Notification marked as read', notification: result.rows[0] });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Mark all as read
app.put('/api/notifications/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    await query('UPDATE alerts SET is_read = TRUE WHERE org_id = $1', [org_id]);
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get unread count
app.get('/api/notifications/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const result = await query(`
      SELECT COUNT(*) as unread_count
      FROM alerts
      WHERE org_id = $1 AND is_read = FALSE
    `, [org_id]);
    
    res.json({ unread_count: parseInt(result.rows[0].unread_count) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Trigger restock check (can be called by cron)
app.post('/api/notifications/check-restock', authenticate, requirePermission('inventory:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const lowStock = await query(`
      SELECT p.id, p.name, p.sku, p.min_stock,
        COALESCE(SUM(sl.quantity), 0) as total_stock
      FROM products p
      LEFT JOIN stock_levels sl ON p.id = sl.product_id
      WHERE p.org_id = $1 AND p.is_active = TRUE AND p.min_stock > 0
      GROUP BY p.id
      HAVING COALESCE(SUM(sl.quantity), 0) <= p.min_stock
    `, [org_id]);
    
    for (const product of lowStock.rows) {
      await query(`
        INSERT INTO alerts (org_id, type, title, message, severity, reference_type, reference_id)
        VALUES ($1, 'restock', $2, $3, 'warning', 'product', $4)
        ON CONFLICT DO NOTHING
      `, [
        org_id,
        `Restock Alert: ${product.name}`,
        `Product ${product.name} (SKU: ${product.sku}) is below minimum stock level. Current: ${product.total_stock}, Minimum: ${product.min_stock}`,
        product.id
      ]);
    }
    
    res.json({
      message: `Restock check completed. ${lowStock.rows.length} products need restocking.`,
      low_stock_products: lowStock.rows,
    });
  } catch (error) {
    console.error('Restock check error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: "ok", service: "Notifications Service" }));

app.listen(PORT, () => console.log(`🚀 Notifications Service running on port ${PORT}`));