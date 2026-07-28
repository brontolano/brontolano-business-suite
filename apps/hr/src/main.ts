import express, { Request, Response } from "express";
import { authenticate, requirePermission } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

// ============================================================
// EMPLOYEE DIRECTORY
// ============================================================

// Create employee
app.post('/api/hr/employees', authenticate, requirePermission('hr:create'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { first_name, last_name, email, phone, dept_id, job_title, tier, hire_date, salary, user_id } = req.body;
    
    const result = await query(`
      INSERT INTO employees (org_id, user_id, first_name, last_name, email, phone, dept_id, job_title, tier, hire_date, salary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [org_id, user_id, first_name, last_name, email, phone, dept_id, job_title, tier || 'staff', hire_date, salary]);
    
    res.status(201).json({
      message: 'Employee created successfully',
      employee: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'E003', message: 'Email already exists' });
    }
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all employees
app.get('/api/hr/employees', authenticate, requirePermission('hr:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { dept_id, is_active, search } = req.query;
    
    let queryStr = `
      SELECT e.*, d.name as dept_name
      FROM employees e
      LEFT JOIN departments d ON e.dept_id = d.id
      WHERE e.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (dept_id) {
      queryStr += ` AND e.dept_id = $${paramIndex++}`;
      params.push(dept_id);
    }
    if (is_active !== undefined) {
      queryStr += ` AND e.is_active = $${paramIndex++}`;
      params.push(is_active);
    }
    if (search) {
      queryStr += ` AND (e.first_name ILIKE $${paramIndex} OR e.last_name ILIKE $${paramIndex} OR e.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    queryStr += ' ORDER BY e.first_name';
    
    const result = await query(queryStr, params);
    res.json({ employees: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get employee by ID
app.get('/api/hr/employees/:id', authenticate, requirePermission('hr:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { id } = req.params;
    
    const result = await query(`
      SELECT e.*, d.name as dept_name
      FROM employees e
      LEFT JOIN departments d ON e.dept_id = d.id
      WHERE e.id = $1 AND e.org_id = $2
    `, [id, org_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Employee not found' });
    }
    
    const leaveBalance = await query(`
      SELECT leave_type,
        COUNT(*) as total_days
      FROM leave_requests
      WHERE employee_id = $1 AND status = 'approved' AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NOW())
      GROUP BY leave_type
    `, [id]);
    
    res.json({
      ...result.rows[0],
      leave_balance: leaveBalance.rows,
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// DEPARTMENTS
// ============================================================

app.get('/api/hr/departments', authenticate, requirePermission('hr:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const result = await query(`
      SELECT d.*,
        COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON e.dept_id = d.id AND e.is_active = true
      WHERE d.org_id = $1
      GROUP BY d.id
      ORDER BY d.name
    `, [org_id]);
    res.json({ departments: result.rows });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// LEAVE MANAGEMENT
// ============================================================

// TIER_MAP for annual leave
const TIER_MAP: Record<string, number> = {
  'executive': 21,
  'manager': 18,
  'staff': 14,
  'intern': 7,
};

// Calculate leave balance (FR-HRM-01)
app.get('/api/hr/leave-balance/:employeeId', authenticate, requirePermission('hr:read'), async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.params;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    
    const empResult = await query('SELECT tier FROM employees WHERE id = $1', [employeeId]);
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Employee not found' });
    }
    
    const tier = empResult.rows[0].tier;
    const allowanceDays = TIER_MAP[tier] || 14;
    
    const taken = await query(`
      SELECT leave_type, SUM(days_requested) as days_taken
      FROM leave_requests
      WHERE employee_id = $1 AND status = 'approved' 
        AND EXTRACT(YEAR FROM start_date) = $2
      GROUP BY leave_type
    `, [employeeId, year]);
    
    const totalTaken = taken.rows.reduce((sum, r) => sum + parseInt(r.days_taken), 0);
    
    res.json({
      employee_id: employeeId,
      year,
      tier,
      annual_leave_entitlement: allowanceDays,
      days_taken: totalTaken,
      days_remaining: Math.max(allowanceDays - totalTaken, 0),
      breakdown: taken.rows,
    });
  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Create leave request
app.post('/api/hr/leaves', authenticate, requirePermission('hr:create'), async (req: Request, res: Response) => {
  try {
    const { employee_id, leave_type, start_date, end_date, days_requested, reason } = req.body;
    
    const empResult = await query('SELECT tier FROM employees WHERE id = $1', [employee_id]);
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Employee not found' });
    }
    
    const tier = empResult.rows[0].tier;
    const allowanceDays = TIER_MAP[tier] || 14;
    
    const taken = await query(`
      SELECT COALESCE(SUM(days_requested), 0) as total_taken
      FROM leave_requests
      WHERE employee_id = $1 AND status = 'approved' 
        AND EXTRACT(YEAR FROM start_date) = $2
    `, [employee_id, new Date(start_date).getFullYear()]);
    
    const totalTaken = parseInt(taken.rows[0].total_taken);
    
    if (totalTaken + days_requested > allowanceDays) {
      return res.status(400).json({ 
        error: 'E003', 
        message: `Insufficient leave balance. Available: ${allowanceDays - totalTaken} days`
      });
    }
    
    const result = await query(`
      INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_requested, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [employee_id, leave_type, start_date, end_date, days_requested, reason]);
    
    res.status(201).json({
      message: 'Leave request created',
      leave: result.rows[0],
    });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Approve/reject leave
app.put('/api/hr/leaves/:id/status', authenticate, requirePermission('hr:update'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approved_by } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'E003', message: 'Status must be approved or rejected' });
    }
    
    const result = await query(`
      UPDATE leave_requests
      SET status = $1, approved_by = $2
      WHERE id = $3
      RETURNING *
    `, [status, approved_by, id]);
    
    res.json({
      message: `Leave request ${status}`,
      leave: result.rows[0],
    });
  } catch (error) {
    console.error('Update leave error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get all leave requests
app.get('/api/hr/leaves', authenticate, requirePermission('hr:read'), async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    const { employee_id, status, year } = req.query;
    
    let queryStr = `
      SELECT lr.*, e.first_name, e.last_name, e.tier
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.org_id = $1`;
    const params = [org_id];
    let paramIndex = 2;
    
    if (employee_id) {
      queryStr += ` AND lr.employee_id = $${paramIndex++}`;
      params.push(employee_id);
    }
    if (status) {
      queryStr += ` AND lr.status = $${paramIndex++}`;
      params.push(status);
    }
    if (year) {
      queryStr += ` AND EXTRACT(YEAR FROM lr.start_date) = $${paramIndex++}`;
      params.push(parseInt(year as string));
    }
    
    queryStr += ' ORDER BY lr.created_at DESC';
    
    const result = await query(queryStr, params);
    res.json({ leaves: result.rows });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// PAYROLL
// ============================================================

app.post('/api/hr/payroll', authenticate, requirePermission('hr:create'), async (req: Request, res: Response) => {
  try {
    const { employee_id, period, base_salary, allowances, deductions, tax } = req.body;
    
    const empResult = await query('SELECT id FROM employees WHERE id = $1', [employee_id]);
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'E003', message: 'Employee not found' });
    }
    
    const result = await query(`
      INSERT INTO payroll_records (employee_id, period, base_salary, allowances, deductions, tax)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [employee_id, period, base_salary, allowances || 0, deductions || 0, tax || 0]);
    
    res.status(201).json({
      message: 'Payroll record created',
      payroll: result.rows[0],
    });
  } catch (error) {
    console.error('Create payroll error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// ============================================================
// HR STATS
// ============================================================

app.get('/api/hr/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const org_id = req.user.org_id;
    
    const empStats = await query(`
      SELECT 
        COUNT(*) as total_employees,
        COUNT(CASE WHEN is_active THEN 1 END) as active,
        COUNT(CASE WHEN tier = 'executive' THEN 1 END) as executives,
        COUNT(CASE WHEN tier = 'manager' THEN 1 END) as managers,
        COUNT(CASE WHEN tier = 'staff' THEN 1 END) as staff
      FROM employees WHERE org_id = $1
    `, [org_id]);
    
    const deptStats = await query('SELECT COUNT(*) as total FROM departments WHERE org_id = $1', [org_id]);
    
    const pendingLeaves = await query(`
      SELECT COUNT(*) as total
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      WHERE e.org_id = $1 AND lr.status = 'pending'
    `, [org_id]);
    
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const payrollStats = await query(`
      SELECT COUNT(*) as processed, COALESCE(SUM(net_pay), 0) as total_payroll
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE e.org_id = $1 AND pr.period = $2
    `, [org_id, currentPeriod]);
    
    res.json({
      employees: empStats.rows[0],
      departments: deptStats.rows[0].total,
      pending_leaves: pendingLeaves.rows[0].total,
      payroll: payrollStats.rows[0],
    });
  } catch (error) {
    console.error('Get HR stats error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: "ok", service: "HR Service" }));

app.listen(PORT, () => console.log(`🚀 HR Service running on port ${PORT}`));