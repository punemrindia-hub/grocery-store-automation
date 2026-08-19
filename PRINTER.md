# Printer

Thermal printing will use a local authenticated printer agent connected to a queued backend print job. The browser will not talk directly to USB printers. Print jobs will have idempotency keys, retry state and delivery acknowledgement from the agent.
