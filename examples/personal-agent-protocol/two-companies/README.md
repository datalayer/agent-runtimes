# Two companies

Ledgerly, an accounting firm, pays Ada's invoices at Northwind Bank for her.

This is **composition**, not a company-to-company protocol: PAP draft 0.3
defines none. Ledgerly is a PAP company to Atlas (Ada's personal agent) and,
for the same Ada, a PAP personal agent at Northwind with its own `client_id`
and keys. Ada connects Ledgerly to Northwind on Northwind's own page. Every
approval is an Operation: Northwind's payment is relayed to Ada as a Ledgerly
operation quoting it as written, and Ledgerly sends Northwind the approval of that
exact revision once she approves it. Ada is asked about every payment.

The tool returns summaries as the companies wrote them and who approved each
payment. No token, code, or proof enters it.

```bash
loop apps run examples/personal-agent-protocol/two-companies/app.py
```

Read the [Operations guide](https://personalagentprotocol.org/docs/guides/operations)
and the [example flow](https://personalagentprotocol.org/docs/examples/two-companies).
