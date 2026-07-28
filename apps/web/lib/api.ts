const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("access_token");
  }
  return null;
}

export async function apiFetch<T = unknown>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, skipAuth = false } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // Determine which service to hit based on endpoint prefix
  const serviceMap: Record<string, string> = {
    "/auth": "3001",
    "/crm": "3002",
    "/sales": "3003",
    "/inventory": "3004",
    "/finance": "3005",
    "/hr": "3006",
    "/notifications": "3007",
  };

  const prefix = Object.keys(serviceMap).find((key) => endpoint.startsWith(key));
  const baseUrl = prefix
    ? API_BASE.replace("3001", serviceMap[prefix])
    : API_BASE;

  const url = `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    const error = await response.json().catch(() => ({ message: "Network error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// Auth API
export const authApi = {
  login: (email: string, password: string, tenant_domain?: string) =>
    apiFetch<{ access_token: string; user: Record<string, unknown> }>("/auth/api/login", {
      method: "POST",
      body: { email, password, tenant_domain },
      skipAuth: true,
    }),
  refreshToken: (refresh_token: string) =>
    apiFetch<{ access_token: string; refresh_token: string }>("/auth/api/refresh-token", {
      method: "POST",
      body: { refresh_token },
      skipAuth: true,
    }),
  logout: () => apiFetch("/auth/api/logout", { method: "POST" }),
  getUsers: () => apiFetch("/auth/api/users"),
};

// CRM API
export const crmApi = {
  getLeads: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ leads: unknown[]; count: number }>(`/crm/api/crm/leads${qs}`);
  },
  createLead: (data: Record<string, unknown>) =>
    apiFetch("/crm/api/crm/leads", { method: "POST", body: data }),
  updateLead: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/crm/api/crm/leads/${id}`, { method: "PUT", body: data }),
  convertLead: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/crm/api/crm/leads/${id}/convert`, { method: "POST", body: data }),
  getCustomers: () => apiFetch<{ customers: unknown[] }>("/crm/api/crm/customers"),
  getOpportunities: () => apiFetch<{ opportunities: unknown[] }>("/crm/api/crm/opportunities"),
  getCrmStats: () => apiFetch<Record<string, unknown>>("/crm/api/crm/stats"),
};

// Sales API
export const salesApi = {
  getOrders: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ orders: unknown[] }>(`/sales/api/sales/orders${qs}`);
  },
  createOrder: (data: Record<string, unknown>) =>
    apiFetch("/sales/api/sales/orders", { method: "POST", body: data }),
  updateOrderStatus: (id: string, status: string) =>
    apiFetch(`/sales/api/sales/orders/${id}/status`, { method: "PUT", body: { status } }),
  getQuotes: () => apiFetch<{ quotes: unknown[] }>("/sales/api/sales/quotes"),
  getInvoices: () => apiFetch<{ invoices: unknown[] }>("/sales/api/sales/invoices"),
  createInvoice: (data: Record<string, unknown>) =>
    apiFetch("/sales/api/sales/invoices", { method: "POST", body: data }),
  getSalesStats: () => apiFetch<Record<string, unknown>>("/sales/api/sales/stats"),
};

// Inventory API
export const inventoryApi = {
  getProducts: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ products: unknown[] }>(`/inventory/api/inventory/products${qs}`);
  },
  createProduct: (data: Record<string, unknown>) =>
    apiFetch("/inventory/api/inventory/products", { method: "POST", body: data }),
  getProduct: (id: string) => apiFetch(`/inventory/api/inventory/products/${id}`),
  getStockIn: (data: Record<string, unknown>) =>
    apiFetch("/inventory/api/inventory/stock/in", { method: "POST", body: data }),
  getStockOut: (data: Record<string, unknown>) =>
    apiFetch("/inventory/api/inventory/stock/out", { method: "POST", body: data }),
  transferStock: (data: Record<string, unknown>) =>
    apiFetch("/inventory/api/inventory/stock/transfer", { method: "POST", body: data }),
  getWarehouses: () => apiFetch<{ warehouses: unknown[] }>("/inventory/api/inventory/warehouses"),
  getCategories: () => apiFetch<{ categories: unknown[] }>("/inventory/api/inventory/categories"),
  getInventoryStats: () => apiFetch<Record<string, unknown>>("/inventory/api/inventory/stats"),
  getMovements: () => apiFetch<{ movements: unknown[] }>("/inventory/api/inventory/stock/movements"),
};

// Finance API
export const financeApi = {
  getJournal: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ entries: unknown[] }>(`/finance/api/finance/journal${qs}`);
  },
  createJournal: (data: Record<string, unknown>) =>
    apiFetch("/finance/api/finance/journal", { method: "POST", body: data }),
  getTrialBalance: () => apiFetch<Record<string, unknown>>("/finance/api/finance/trial-balance"),
  getAccounts: () => apiFetch<{ accounts: unknown[] }>("/finance/api/finance/accounts"),
  getAp: () => apiFetch<{ payable: unknown[] }>("/finance/api/finance/ap"),
  getAr: () => apiFetch<{ receivable: unknown[] }>("/finance/api/finance/ar"),
  getFinanceStats: () => apiFetch<Record<string, unknown>>("/finance/api/finance/stats"),
};

// HR API
export const hrApi = {
  getEmployees: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ employees: unknown[] }>(`/hr/api/hr/employees${qs}`);
  },
  createEmployee: (data: Record<string, unknown>) =>
    apiFetch("/hr/api/hr/employees", { method: "POST", body: data }),
  getLeaves: () => apiFetch<{ leaves: unknown[] }>("/hr/api/hr/leaves"),
  createLeave: (data: Record<string, unknown>) =>
    apiFetch("/hr/api/hr/leaves", { method: "POST", body: data }),
  getDepartments: () => apiFetch<{ departments: unknown[] }>("/hr/api/hr/departments"),
  getHrStats: () => apiFetch<Record<string, unknown>>("/hr/api/hr/stats"),
};

// Notifications API
export const notificationApi = {
  getNotifications: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params) : "";
    return apiFetch<{ notifications: unknown[] }>(`/notifications/api/notifications${qs}`);
  },
  getUnreadCount: () => apiFetch<{ unread_count: number }>("/notifications/api/notifications/unread-count"),
};
