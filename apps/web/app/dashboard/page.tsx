"use client";
import { Suspense, useEffect, useState } from "react";
import {
  crmApi,
  salesApi,
  inventoryApi,
  financeApi,
  hrApi,
} from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";

function StatCard({
  title,
  value,
  change,
  trend,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="stats-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-1 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${color}`}>{icon}</div>
      </div>
      {change && (
        <div className="mt-4 flex items-center gap-1">
          <span
            className={`text-sm font-medium ${
              trend === "up"
                ? "text-emerald-400"
                : trend === "down"
                ? "text-red-400"
                : "text-gray-400"
            }`}
          >
            {trend === "up" ? (
              <svg className="inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            ) : trend === "down" ? (
              <svg className="inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            ) : (
              <svg className="inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
            )}
            {change}
          </span>
          <span className="text-sm text-gray-500">vs last month</span>
        </div>
      )}
    </div>
  );
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div className="glass-card p-6 h-80">
      <h3 className="mb-4 text-sm font-semibold text-white">{title}</h3>
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <svg className="mx-auto mb-3 h-10 w-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">Chart placeholder — connect Recharts</p>
        </div>
      </div>
    </div>
  );
}

function RecentActivity() {
  return (
    <div className="glass-card">
      <div className="border-b border-gray-800/50 px-6 py-4">
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
      </div>
      <div className="divide-y divide-gray-800/50">
        {[
          { action: "New lead created", target: "PT. Maju Jaya", time: "5 min ago", color: "text-sky-400" },
          { action: "Order approved", target: "SO-BRT-202507-00123", time: "12 min ago", color: "text-emerald-400" },
          { action: "Invoice paid", target: "INV-BRT-202507-00045", time: "28 min ago", color: "text-emerald-400" },
          { action: "Low stock alert", target: "Laptop Dell XPS 13", time: "1 hr ago", color: "text-amber-400" },
          { action: "Employee leave approved", target: "Ahmad Santoso", time: "2 hr ago", color: "text-sky-400" },
        ].map((activity, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className={`h-2 w-2 rounded-full ${activity.color}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{activity.action}</p>
              <p className="text-xs text-gray-500 truncate">{activity.target}</p>
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsLoader() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="stats-card animate-pulse">
          <div className="flex items-start justify-between">
            <div>
              <div className="h-4 w-24 bg-gray-800/50 rounded animate-pulse" />
              <div className="mt-2 h-8 w-32 bg-gray-800/50 rounded animate-pulse" />
            </div>
            <div className="h-10 w-10 bg-gray-800/50 rounded-xl animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    crm: { total_leads: 0, new_leads: 0, qualified: 0, converted: 0, total_customers: 0, total_opportunities: 0, pipeline_value: 0 },
    sales: { total_orders: 0, total_revenue: 0, draft_orders: 0, approved_orders: 0, delivered_orders: 0, total_invoices: 0, paid_invoices: 0, overdue_invoices: 0 },
    inventory: { total_products: 0, active_products: 0, low_stock_products: 0, total_stock_value: 0, total_warehouses: 0 },
    finance: { revenue: 0, expenses: 0, profit: 0, ap_outstanding: 0, ar_outstanding: 0 },
    hr: { total_employees: 0, active: 0, pending_leaves: 0, current_payroll: 0 },
    loading: true,
  });

  useEffect(() => {
    async function fetchAllStats() {
      try {
        const [crm, sales, inv, fin, hr] = await Promise.all([
          crmApi.getCrmStats(),
          salesApi.getSalesStats(),
          inventoryApi.getInventoryStats(),
          financeApi.getFinanceStats(),
          hrApi.getHrStats(),
        ]);
        setStats({
          crm: crm || {},
          sales: sales || {},
          inventory: inv || {},
          finance: fin || {},
          hr: hr || {},
          loading: false,
        });
      } catch {
        setStats((prev) => ({ ...prev, loading: false }));
      }
    }
    fetchAllStats();
  }, []);

  if (stats.loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-500">Welcome back! Here's an overview of your business.</p>
          </div>
        </div>
        <StatsLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500">Welcome back! Here's an overview of your business.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary">
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Leads"
          value={formatNumber(stats.crm.total_leads || 0)}
          change="+12%"
          trend="up"
          icon={<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          color="bg-sky-500/20 text-sky-400"
        />
        <StatCard
          title="Pipeline Value"
          value={formatCurrency(stats.crm.pipeline_value || 0)}
          change="+8.5%"
          trend="up"
          icon={<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.sales.total_revenue || 0)}
          change="+15.2%"
          trend="up"
          icon={<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="bg-green-500/20 text-green-400"
        />
        <StatCard
          title="Active Employees"
          value={formatNumber(stats.hr.active || 0)}
          change="0%"
          trend="neutral"
          icon={<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
          color="bg-indigo-500/20 text-indigo-400"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartPlaceholder title="Revenue Trend" />
        <ChartPlaceholder title="Lead Conversion Funnel" />
      </div>

      {/* Second Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Top Products by Stock Value</h3>
          <div className="space-y-3">
            {[
              { name: "Laptop Dell XPS 13", stock: 45, value: "Rp 675.000.000", trend: "up" },
              { name: "Monitor Samsung 27\"", stock: 32, value: "Rp 128.000.000", trend: "up" },
              { name: "Keyboard Mechanical", stock: 78, value: "Rp 117.000.000", trend: "neutral" },
              { name: "Mouse Wireless", stock: 120, value: "Rp 84.000.000", trend: "down" },
              { name: "Headset Gaming", stock: 56, value: "Rp 56.000.000", trend: "up" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400 text-xs font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{item.name}</p>
                    <p className="text-xs text-gray-500">Stock: {formatNumber(item.stock)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{item.value}</p>
                  <span className={`text-xs ${item.trend === "up" ? "text-emerald-400" : item.trend === "down" ? "text-red-400" : "text-gray-400"}`}>
                    {item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→"} Trending
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <RecentActivity />
      </div>
    </div>
  );
}