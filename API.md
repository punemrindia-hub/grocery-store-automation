# API

Base path: `/api/v1` for domain routes. Health endpoints remain at `/health` and `/ready`.

Success envelope:

```json
{"success":true,"data":{},"error":null,"meta":{}}
```

Error envelope:

```json
{"success":false,"data":null,"error":{"code":"ERROR_CODE","message":"Readable message"},"meta":{"requestId":"..."}}
```

Phase 2 routes require a JWT from `/api/v1/auth/login` and derive `shopId` from its claims:

- `GET|POST /api/v1/categories`
- `GET|POST /api/v1/products`
- `PATCH /api/v1/products/:id`
- `GET|POST /api/v1/customers`
- `GET /api/v1/inventory/low-stock`
- `POST /api/v1/inventory/:productId/adjust`
- `POST /api/v1/carts`
- `GET /api/v1/carts/:cartId`
- `POST /api/v1/carts/:cartId/items`
- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `PATCH /api/v1/orders/:orderId/status`
- `POST /api/v1/pos/orders`
- `GET /api/v1/reports/summary`
- `POST /api/v1/orders/:orderId/invoice`
- `GET /api/v1/invoices`
- `GET /api/v1/customers/:customerId/ledger`
- `POST /api/v1/customers/:customerId/payments`

Route handlers validate input with Zod and delegate persistence through tenant-scoped Prisma queries.

Order creation recalculates prices server-side, validates stock, decrements inventory, records SALE movements, closes the active cart, and accepts a shop-scoped idempotency key.

Invoice generation is available without payment credentials. It creates one invoice per order and queues an invoice message through the WhatsApp provider abstraction.

Ledger statements return debit, credit and closing balance. New orders atomically post an `ORDER_CHARGE` debit; manual cash payments atomically post a `PAYMENT` credit and update an existing invoice's paid and pending amounts.

Order status transitions are validated server-side. Invalid transitions return `INVALID_ORDER_TRANSITION`; valid transitions write an audit log, send an order-status WhatsApp message, and restore inventory on cancellation.

`POST /api/v1/pos/orders` supports walk-in or existing customers, server-side product pricing, cash/UPI/credit payment methods, invoice creation, inventory movement, and ledger posting in one transaction.

POS orders accept `fulfillmentType: TAKEAWAY | DELIVERY`. Take-away orders can stop at `READY`; delivery orders continue through the delivery lifecycle. Reports summary returns today's sales, today's order count, pending orders, low-stock count, and outstanding credit from live PostgreSQL data.
