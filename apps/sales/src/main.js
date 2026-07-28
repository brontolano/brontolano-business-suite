const express = require("express");
const { query } = require("../shared/db");

const app = express();
const PORT = process.env.PORT || 3003;
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", service: "Sales Service" }));

app.post("/api/sales/orders", async (req, res) => {
  const { customer_id, items, discount_type, discount_amount, payment_method, notes } = req.body;
  const org_id = "00000000-0000-0000-0000-000000000001";
  try {
    const seq = Date.now().toString(36).toUpperCase();
    const orderNo = "SO-" + seq;
    let subtotal = 0;
    if (items) items.forEach((i) => { subtotal += (i.quantity || 0) * (i.unit_price || 0); });
    let discAmt = 0;
    if (discount_type === "percentage") discAmt = subtotal * (Math.min(discount_amount || 0, 50) / 100);
    else if (discount_type === "fixed") discAmt = Math.min(discount_amount || 0, subtotal);
    const tax = (subtotal - discAmt) * 0.1;
    const total = subtotal - discAmt + tax;
    const r = await query(
      "INSERT INTO sales_orders (org_id,order_number,customer_id,subtotal,discount_amount,tax,total,payment_method,notes,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft') RETURNING *",
      [org_id, orderNo, customer_id, subtotal, discAmt, tax, total, payment_method, notes]
    );
    const orderId = r.rows[0].id;
    if (items) {
      for (const item of items) {
        await query("INSERT INTO order_items (order_id,product_id,quantity,unit_price,discount) VALUES ($1,$2,$3,$4,$5)",
          [orderId, item.product_id, item.quantity || 0, item.unit_price || 0, item.discount || 0]);
      }
    }
    res.status(201).json({ order: r.rows[0] });
  } catch (err) {
    console.error("Sales error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sales/orders", async (_req, res) => {
  try {
    const r = await query("SELECT * FROM sales_orders ORDER BY created_at DESC LIMIT 50");
    res.json({ orders: r.rows, count: r.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sales/stats", async (_req, res) => {
  try {
    const orders = (await query("SELECT COUNT(*) as total_orders, COALESCE(SUM(total),0) as total_revenue FROM sales_orders")).rows[0];
    const invoices = (await query("SELECT COUNT(*) as total_invoices, COALESCE(SUM(total),0) as total_amount FROM invoices")).rows[0];
    res.json({
      total_orders: parseInt(orders.total_orders) || 0,
      total_revenue: parseFloat(orders.total_revenue) || 0,
      draft_orders: 0, approved_orders: 0, delivered_orders: 0,
      total_invoices: parseInt(invoices.total_invoices) || 0,
      total_amount: parseFloat(invoices.total_amount) || 0,
      paid_invoices: 0, overdue_invoices: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log("Sales Service running on port " + PORT));