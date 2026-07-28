const express = require("express");
const { query } = require("../shared/db");

const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "Auth Service", port: PORT }));

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "E001", message: "Email and password required" });
  try {
    const r = await query("SELECT * FROM users WHERE email = $1", [email]);
    if (r.rows.length === 0) return res.status(401).json({ error: "E001", message: "Invalid credentials" });
    const user = r.rows[0];
    const bcrypt = require("bcrypt");
    if (!(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: "E001", message: "Invalid credentials" });
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role, permissions: [] },
      process.env.JWT_SECRET || "supersecret",
      { expiresIn: "1h" }
    );
    res.json({ access_token: token, user: { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "E001", message: "Internal server error" });
  }
});

app.listen(PORT, () => console.log("Auth Service running on port " + PORT));