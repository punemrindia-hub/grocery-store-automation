# WhatsApp

WhatsApp Cloud API integration will use a provider abstraction with persisted incoming/outgoing messages, verified webhooks, idempotent provider message IDs and a separate conversation state machine. Business services will call `WhatsAppService`, never a provider SDK directly.

The current local provider is `MockWhatsAppProvider`. It records outbound invoice messages as `SENT` with a mock provider ID, so dashboard and invoice workflows can be developed without Meta credentials. Real delivery requires a Meta WhatsApp Business Cloud access token, phone number ID, verify token and webhook configuration. Those values belong in `.env`, never in source control.

The local commerce agent supports this state machine:

`GREETING -> CATEGORY_SELECTION -> PRODUCT_SELECTION -> QUANTITY -> CART_REVIEW -> COMPLETED`

Example text flow: `hi`, `Staples`, `Basmati Rice`, `1`, `yes`. It validates shop/customer/product scope, available stock, persists inbound and outbound messages, recalculates the cart total through the shared pricing engine, creates the order transactionally, and ignores duplicate provider message IDs.

The order dashboard also sends status notifications for confirmed, preparing, ready, out-for-delivery, delivered, and cancelled states. The local provider records these messages; the production Meta provider will use the same service boundary.
