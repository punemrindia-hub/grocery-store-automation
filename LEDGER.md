# Ledger

Customer credit is represented by immutable `LedgerEntry` rows, never a mutable pending-balance field. Debit, credit, payment, refund, adjustment, order charge and discount entries are shop-scoped and linked to customer, order and payment where applicable.

Corrections must create adjustment entries. A ledger statement will calculate opening balance, debit, credit and closing balance from entries.

The dashboard Ledger page supports selecting a customer, reviewing entries and recording cash payments. Orders now create their `ORDER_CHARGE` debit in the same database transaction as inventory and order creation.
