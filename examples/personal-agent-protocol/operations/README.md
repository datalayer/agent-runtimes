# Operations

This example gets the user's approval of Northwind Bank's payments with the real
Python SDK `OperationsClient`: negotiation, the user asked through the host's own
approval surface about every revision, a user who says no, a new revision of the
same operation after the bank changes its terms, and a lost answer sent again with
the same approval, the payment performed once.

The tool returns what the user was asked, the changed term paths, and what the bank
said it came to, as written. Tokens stay in the host.

```bash
loop apps run examples/personal-agent-protocol/operations/app.py
```

Read the [Operations guide](https://personalagentprotocol.org/docs/guides/operations)
and the [example flow](https://personalagentprotocol.org/docs/examples/operations).
