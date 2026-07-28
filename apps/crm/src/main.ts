import express, { Request, Response, NextFunction } from "express";
import { authenticate, requirePermission } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// CRM Lead Scoring Algorithm
function calculateLeadScore(lead) {
  let score = 0;
  
  if (lead.source === 'referral') score += 20;
  else if (lead.source === 'web_form') score += 10;
  else if (lead.source === 'cold_call') score += 5;
  else if (lead.source === 'social') score += 5;
  
  if (lead.email && /@(gmail|yahoo|outlook|company)\./.test(lead.email.toLowerCase())) {
    score += 10; // Business email domain
  }
  
  if (lead.phone) score += 5;
  if (lead.company) score += 5;
  
  return Math.min(score, 100);
}

// Create Lead
app.post('/api/crm/leads', authenticate, requirePermission('crm:create'), async (req: Request, res: Response) => {
  try {
    const { source, contact_name, email, phone, company, assigned_to } = req.body;
    const org_id = req.user.org_id;
    
    const score = calculateLeadScore({ source, email, phone, company });
    
    const result = await query(`
      INSERT INTO leads (org_id, source, contact_name, email, phone, company, score, status, assigned_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [org_id, source, contact_name, email, phone, company, score, 'new', assigned_to]);
    
    res.status(201).json({
      message: 'Lead created successfully',
      lead: result.rows[0],
    });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all leads for org (with pagination and filtering)
app.get('/api/crm/leads', authenticate, requirePermission('crm:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { status, source, score_min, score_max, assigned_to } = req.query;
    
    let queryStr = 'SELECT * FROM leads WHERE org_id = $1';
    const params = [org_id];
    let paramIndex = 2;
    
    if (status) {
      queryStr += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (source) {
      queryStr += ` AND source = $${paramIndex++}`;
      params.push(source);
    }
    if (score_min) {
      queryStr += ` AND score >= $${paramIndex++}`;
      params.push(score_min);
    }
    if (score_max) {
      queryStr += ` AND score <= $${paramIndex++}`;
      params.push(score_max);
    }
    if (assigned_to) {
      queryStr += ` AND assigned_to = $${paramIndex++}`;
      params.push(assigned_to);
    }
    
    queryStr += ' ORDER BY created_at DESC';
    
    const result = await query(queryStr, params);
    
    res.json({
      leads: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get Lead by ID
app.get('/api/crm/leads/:id', authenticate, requirePermission('crm:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const result = await query('SELECT * FROM leads WHERE id = $1 AND org_id = $2', [id, org_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Lead not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Update Lead
app.put('/api/crm/leads/:id', authenticate, requirePermission('crm:update'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    const updates = req.body;
    
    const existResult = await query('SELECT * FROM leads WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (existResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Lead not found' });
    }
    
    const lead = existResult.rows[0];
    
    const updatedScore = calculateLeadScore({ ...lead, ...updates });
    
    const result = await query(`
      UPDATE leads 
      SET source = COALESCE($1, source),
          contact_name = COALESCE($2, contact_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          company = COALESCE($5, company),
          score = COALESCE($6, score),
          status = COALESCE($7, status),
          assigned_to = COALESCE($8, assigned_to),
          notes = COALESCE($9, notes),
          converted_at = COALESCE($10, converted_at),
          customer_id = COALESCE($11, customer_id),
          updated_at = NOW()
      WHERE id = $12 AND org_id = $13
      RETURNING *
    `, [
      updates.source, updates.contact_name, updates.email, updates.phone, updates.company,
      updatedScore, updates.status, updates.assigned_to, updates.notes, updates.converted_at,
      updates.customer_id, id, org_id
    ]);
    
    res.json({
      message: 'Lead updated successfully',
      lead: result.rows[0],
    });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Delete Lead
app.delete('/api/crm/leads/:id', authenticate, requirePermission('crm:delete'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const existResult = await query('SELECT * FROM leads WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (existResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Lead not found' });
    }
    
    await query('DELETE FROM leads WHERE id = $1 AND org_id = $2', [id, org_id]);
    
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Convert Lead to Customer
app.post('/api/crm/leads/:id/convert', authenticate, requirePermission('crm:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    const { customer_data } = req.body;
    
    const leadResult = await query('SELECT * FROM leads WHERE id = $1 AND org_id = $2', [id, org_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Lead not found' });
    }
    
    const lead = leadResult.rows[0];
    if (lead.status === 'converted') {
      return res.status(400).json({ error: 'E004', message: 'Lead already converted' });
    }
    
    await query('UPDATE leads SET status = $1, converted_at = NOW(), customer_id = $2 WHERE id = $3', ['converted', lead.id, lead.id]);
    
    const customerResult = await query(`
      INSERT INTO customers (
        org_id, name, contact_name, email, phone, address, industry
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      org_id, customer_data.company_name || lead.company || 'Unknown Company',
      lead.contact_name, lead.email, lead.phone, customer_data.address, customer_data.industry
    ]);
    
    await query('UPDATE leads SET customer_id = $1 WHERE id = $2', [customerResult.rows[0].id, id]);
    
    res.json({
      message: 'Lead converted to customer successfully',
      customer: customerResult.rows[0],
      lead: leadResult.rows[0],
    });
  } catch (error) {
    console.error('Convert lead error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all customers for org
app.get('/api/crm/customers', authenticate, requirePermission('crm:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { type, segment, region } = req.query;
    
    let queryStr = 'SELECT * FROM customers WHERE org_id = $1';
    const params = [org_id];
    let paramIndex = 2;
    
    if (type) {
      queryStr += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    if (segment) {
      queryStr += ` AND segment = $${paramIndex++}`;
      params.push(segment);
    }
    if (region) {
      queryStr += ` AND region = $${paramIndex++}`;
      params.push(region);
    }
    
    queryStr += ' ORDER BY created_at DESC';
    
    const result = await query(queryStr, params);
    
    res.json({
      customers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Create Opportunity
app.post('/api/crm/opportunities', authenticate, requirePermission('crm:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { customer_id, lead_id, name, stage, amount, probability, expected_close_date, assigned_to } = req.body;
    
    const result = await query(`
      INSERT INTO opportunities (
        org_id, customer_id, lead_id, name, stage, amount, probability,
        expected_close_date, assigned_to
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [org_id, customer_id, lead_id, name, stage, amount, probability, expected_close_date, assigned_to]);
    
    res.status(201).json({
      message: 'Opportunity created successfully',
      opportunity: result.rows[0],
    });
  } catch (error) {
    console.error('Create opportunity error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get opportunities for org
app.get('/api/crm/opportunities', authenticate, requirePermission('crm:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { stage, assigned_to } = req.query;
    
    let queryStr = 'SELECT * FROM opportunities WHERE org_id = $1';
    const params = [org_id];
    let paramIndex = 2;
    
    if (stage) {
      queryStr += ` AND stage = $${paramIndex++}`;
      params.push(stage);
    }
    if (assigned_to) {
      queryStr += ` AND assigned_to = $${paramIndex++}`;
      params.push(assigned_to);
    }
    
    queryStr += ' ORDER BY expected_close_date';
    
    const result = await query(queryStr, params);
    
    res.json({
      opportunities: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Get opportunities error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Stats endpoint for dashboard
app.get('/api/crm/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const leadsStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_leads,
        COUNT(CASE WHEN status = 'qualified' THEN 1 END) as qualified,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted
      FROM leads WHERE org_id = $1
    `, [org_id]);
    
    const customersStats = await query(`
      SELECT COUNT(*) as total FROM customers WHERE org_id = $1
    `, [org_id]);
    
    const opportunitiesStats = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN stage = 'closed_won' THEN 1 END) as closed_won,
        COUNT(CASE WHEN stage = 'closed_lost' THEN 1 END) as closed_lost
      FROM opportunities WHERE org_id = $1
    `, [org_id]);
    
    res.json({
      leads: leadsStats.rows[0],
      customers: customersStats.rows[0],
      opportunities: opportunitiesStats.rows[0],
    });
  } catch (error) {
    console.error('Get CRM stats error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: "ok", service: "CRM Service" }));

app.listen(PORT, () => console.log(`🚀 CRM Service running on port ${PORT}`));