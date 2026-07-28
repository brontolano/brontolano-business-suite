export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatNumber(num: number | string): string {
  const n = typeof num === "string" ? parseFloat(num) : num;
  return new Intl.NumberFormat("id-ID").format(n);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
}

export const statusColors: Record<string, string> = {
  new: "badge-info",
  contacted: "badge-warning",
  qualified: "badge-success",
  converted: "badge-success",
  lost: "badge-danger",
  draft: "badge-neutral",
  pending_approval: "badge-warning",
  approved: "badge-success",
  rejected: "badge-danger",
  in_fulfillment: "badge-info",
  shipped: "badge-info",
  delivered: "badge-success",
  closed: "badge-neutral",
  paid: "badge-success",
  unpaid: "badge-warning",
  overdue: "badge-danger",
  partial: "badge-warning",
  active: "badge-success",
  inactive: "badge-neutral",
};

export function classed(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";