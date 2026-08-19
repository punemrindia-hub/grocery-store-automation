const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type User = { id: string; name: string; email: string; role: string; shop: { id: string; name: string; slug: string } };
export type Category = { id: string; name: string; isActive: boolean };
export type Product = { id: string; name: string; sku: string; unit: string; sellingPrice: string; costPrice: string; stockQuantity: string; minimumStock: string; category: Category };
export type Customer = { id: string; name: string; whatsappNumber: string; email: string | null; _count: { orders: number; ledgerEntries?: number; conversations?: number } };
export type Order = { id: string; orderNumber: string; status: string; total: string; source: string; createdAt: string; customer: { name: string; whatsappNumber: string }; items: { nameSnapshot: string; quantity: string; unitPrice: string; lineTotal: string }[] };
export type Invoice = { id: string; invoiceNumber: string; amountPaid: string; amountPending: string };
export type LedgerStatement = { customer: Customer; entries: { id: string; direction: string; amount: string; description: string; createdAt: string }[]; totalDebit: string; totalCredit: string; closingBalance: string };
export type ReportSummary = { todaySales: string; todayOrders: number; pendingOrders: number; lowStock: number; outstandingCredit: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('grocery_token');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = (await response.json()) as { success: boolean; data: T; error?: { message: string } };
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}

export function login(input: { shopSlug: string; email: string; password: string }): Promise<{ token: string; user: User }> {
  return request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });
}
export function getCategories(): Promise<Category[]> { return request('/api/v1/categories'); }
export function getProducts(): Promise<Product[]> { return request('/api/v1/products'); }
export function getCustomers(): Promise<Customer[]> { return request('/api/v1/customers'); }
export function getLedger(customerId: string): Promise<LedgerStatement> { return request(`/api/v1/customers/${customerId}/ledger`); }
export function recordPayment(customerId: string, input: { amount: number; method: string; description: string }): Promise<unknown> { return request(`/api/v1/customers/${customerId}/payments`, { method: 'POST', body: JSON.stringify(input) }); }
export function getLowStock(): Promise<Product[]> { return request('/api/v1/inventory/low-stock'); }
export function getReportSummary(): Promise<ReportSummary> { return request('/api/v1/reports/summary'); }
export function getOrders(): Promise<Order[]> { return request('/api/v1/orders'); }
export function updateOrderStatus(orderId: string, status: string): Promise<Order> { return request(`/api/v1/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); }
export function createPosOrder(input: { customerId?: string; customerName?: string; customerWhatsapp?: string; paymentMethod: string; fulfillmentType: string; items: { productId: string; quantity: number }[]; miscAmount?: number; miscDescription?: string }): Promise<{ created: Order; payment: unknown; invoice: Invoice }> { return request('/api/v1/pos/orders', { method: 'POST', body: JSON.stringify(input) }); }
export function generateInvoice(orderId: string): Promise<{ invoice: Invoice; message: { provider: string; status: string } }> { return request(`/api/v1/orders/${orderId}/invoice`, { method: 'POST', body: JSON.stringify({}) }); }
export function createCategory(name: string): Promise<Category> { return request('/api/v1/categories', { method: 'POST', body: JSON.stringify({ name }) }); }
export function createCustomer(input: { name: string; whatsappNumber: string; email?: string }): Promise<Customer> { return request('/api/v1/customers', { method: 'POST', body: JSON.stringify(input) }); }
export function deleteCustomer(id: string): Promise<{ id: string; deleted: boolean }> { return request(`/api/v1/customers/${id}`, { method: 'DELETE', body: JSON.stringify({}) }); }
export function adjustStock(productId: string, input: { type: string; quantity: number; reference?: string }): Promise<unknown> { return request(`/api/v1/inventory/${productId}/adjust`, { method: 'POST', body: JSON.stringify(input) }); }
export function createProduct(input: { categoryId: string; name: string; sku: string; unit: string; sellingPrice: number; costPrice: number; stockQuantity: number; minimumStock: number }): Promise<Product> { return request('/api/v1/products', { method: 'POST', body: JSON.stringify(input) }); }
