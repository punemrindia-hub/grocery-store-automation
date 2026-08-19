# Payments

Payment providers will be implemented through a `PaymentProvider` interface. The business service will verify payment status server-side, persist raw provider events and enforce unique provider event IDs before mutating orders or ledger records.

Razorpay is planned as the first adapter; no provider SDK is coupled to the current foundation.

Payment credentials are optional for the current workflow. Orders can produce invoices with `amountPaid = 0` and `amountPending = total`; online payment creation will be enabled when a provider key and webhook secret are configured.
