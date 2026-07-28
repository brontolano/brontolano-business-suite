const express = require("express");
const { query } = require("../shared/db");

const app = express();
const PORT = process.env.PORT || 3002;
app.use(express.json());

function calcScore(l) {
  let s = 0;
  if (l.source === "referral") s += 20;
  else if (l.source === "web_form") s += 10;
  else if (["cold_call", "social"].includes(l.source)) s += 5;
  if (l.email && /@/.test(l.email)) s += 10;
  if (l.phone) s += 5;
  if (l.company) s += 5;
  return Math.min(s, 100);
}

app.get("/health", (_req, res) => res.json({ status: "ok", service: "CRM Service" }));

app.post("/api/crm/leads", async (req, res) => {
  const { source, contact_name, email, phone, company } = req.body;
  const org_id = "00000000-0000-0000-0000-000000000001";
  const score = calcScore({ source, email, phone, company });
  try {
    const r = await query(
      "INSERT INTO leads (org_id,source,contact_name,email,phone,company,score,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [org_id, source || "manual", contact_name, email, phone, company, score, "new"]
    );
    res.status(201).json({ lead: r.rows[0] });
  } catch (err) {
    console.error("CRM create lead error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/crm/leads", async (_req, res) => {
  try {
    const r = await query("SELECT * FROM leads ORDER BY created_at DESC LIMIT 50");
    res.json({ leads: r.rows, count: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/crm/leads/:id", async (req, res) => {
  try {
    const r = await query("SELECT * FROM leads WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/crm/customers", async (_req, res) => {
  try {
    const r = await query("SELECT * FROM customers ORDER BY created_at DESC LIMIT 50");
    res.json({ customers: r.rows, count: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/crm/opportunities", async (_req, res) => {
  try {
    const r = await query("SELECT * FROM opportunities ORDER BY created_at DESC LIMIT 50");
    res.json({ opportunities: r.rows, count: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/crm/stats", async (_req, res) => {
  try {
    const leads = (await query("SELECT COUNT(*) as total, COUNT(CASE WHEN status='new' THEN 1 END) as new_leads, COUNT(CASE WHEN status='converted' THEN 1 END) as converted FROM leads")).rows[0];
    const customers = (await query("SELECT COUNT(*) as total FROM customers")).rows[0];
    const opps = (await query("SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as pipeline_value FROM opportunities")).rows[0];
    res.json({
      leads: { total: parseInt(leads.total) || 0, new_leads: parseInt(leads.new_leads) || 0, converted: parseInt(leads.converted) || 0 },
      total_customers: parseInt(customers.total) || 0,
      total_opportunities: parseInt(opps.total) || 0,
      pipeline_value: parseFloat(opps.pipeline_value) || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log("CRM Service running on port " + PORT));