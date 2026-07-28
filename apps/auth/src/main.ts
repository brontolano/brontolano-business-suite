import express, { Request, Response, NextFunction } from "express";
import { auth, authenticate, requirePermission, requireRole } from '../shared/auth';
const { query, transaction } = require('../shared/db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Register default roles
async function registerDefaultRoles() {
  const roles = ['super_admin', 'admin', 'manager', 'staff', 'finance', 'viewer'];
  for (const roleName of roles) {
    await query('INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [roleName, `Role with ${roleName} permissions`]);
  }
}

registerDefaultRoles().then(() => console.log('Default roles registered'));

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", service: "Auth Service" }));

// Login with multi-tenant support
app.post("/api/login", async (req: Request, res: Response) => {
  const { email, password, tenant_domain } = req.body;
  
  try {
    let tenantId = null;
    if (tenant_domain) {
      const tenantResult = await query('SELECT id FROM tenants WHERE domain = $1 OR code = $1', [tenant_domain]);
      if (tenantResult.rows.length > 0) {
        tenantId = tenantResult.rows[0].id;
      }
    }
    
    let tenantWhere = 'WHERE email = $1';
    const params = [email];
    
    if (tenantId) {
      tenantWhere += ' AND tenant_id = $2';
      params.push(tenantId);
    }
    
    const result = await query(`SELECT * FROM users ${tenantWhere}`, params);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'E001', message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    const isMatch = await require('bcrypt').compare(password, user.password_hash);
    if (!isMatch) {
      await query('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = $1', [user.id]);
      return res.status(401).json({ error: 'E001', message: 'Invalid credentials' });
    }
    
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(403).json({ error: 'E001', message: 'Account is temporarily locked' });
    }
    
    if (user.failed_attempts >= 5) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + 15);
      await query('UPDATE users SET locked_until = $1 WHERE id = $2', [lockedUntil, user.id]);
      return res.status(403).json({ error: 'E001', message: 'Account is locked due to too many failed attempts' });
    }
    
    await query('UPDATE users SET failed_attempts = 0, last_login = NOW() WHERE id = $1', [user.id]);
    
    const accessToken = require('../shared/auth').generateAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      permissions: [],
    });
    
    const refreshToken = require('../shared/auth').generateRefreshToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      permissions: [],
    });
    
    await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL "24 hours")', [
      user.id,
      require('crypto').createHash('sha256').update(refreshToken).digest('hex')
    ]);
    
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Refresh token
app.post("/api/refresh-token", async (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  try {
    const decoded = require('../shared/auth').verifyToken(refresh_token);
    if (!decoded) {
      return res.status(401).json({ error: 'E001', message: 'Invalid refresh token' });
    }
    
    const tokenHash = require('crypto').createHash('sha256').update(refresh_token).digest('hex');
    const result = await query('SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE', [tokenHash]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'E001', message: 'Invalid refresh token' });
    }
    
    const tokenData = result.rows[0];
    
    const newAccessToken = require('../shared/auth').generateAccessToken({
      userId: tokenData.user_id,
      tenantId: decoded.tenantId,
      role: decoded.role,
      permissions: decoded.permissions || [],
    });
    
    const newRefreshToken = require('../shared/auth').generateRefreshToken({
      userId: tokenData.user_id,
      tenantId: decoded.tenantId,
      role: decoded.role,
      permissions: decoded.permissions || [],
    });
    
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [tokenData.id]);
    await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL "24 hours")', [
      tokenData.user_id,
      require('crypto').createHash('sha256').update(newRefreshToken).digest('hex')
    ]);
    
    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Logout (revoke refresh token)
app.post("/api/logout", authenticate, async (req: Request, res: Response) => {
  try {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.userId]);
    res.json({ message: 'Successfully logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// Get user permissions
app.get("/api/user-permissions", authenticate, async (req: Request, res: Response) => {
  try {
    const userRoles = await query('SELECT role_id FROM user_roles WHERE user_id = $1', [req.user.userId]);
    const roleIds = userRoles.rows.map(r => r.role_id);
    
    const permissions = await query(`
      SELECT DISTINCT p.module, p.action 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1)
    `, [roleIds]);
    
    res.json({
      roles: roleIds,
      permissions: permissions.rows.map(p => `${p.module}:${p.action}`),
    });
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

// User management (admin only)
app.get("/api/users", authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.role, u.is_active,
             t.name as tenant_name, o.name as org_name
      FROM users u
      LEFT JOIN tenants t ON u.tenant_id = t.id
      LEFT JOIN organizations o ON u.org_id = o.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'E001', message: 'Internal server error' });
  }
});

app.listen(PORT, () => console.log(`🚀 Auth Service running on port ${PORT}`));
