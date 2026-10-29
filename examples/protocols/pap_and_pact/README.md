# PAP and PACT in one task

Ada asks her application, _Atlas_, one question — _where is my jacket order,
and when do I fly?_ — whose answer is at two businesses speaking two
consent protocols (example EX-07):

- **Manzanita Outfitters**, a company over the
  [Personal Agent Protocol](https://personal-agent-protocol.datalayer.tech)
  (the PAP SDK's `demo` world): discovered at its domain, a signed-out
  Session under its own key (PAP draft 0.3), Device Sign-In with `orders:read` on its own page, then
  the same conversation answers;
- **Example Air**, a Brand over [PACT](https://github.com/openpactprotocol/openpactprotocol)
  1.0 (agent-runtimes' local Provider): its A2A card read, the
  personal-agent JWT, an RFC 8628 sign-in on its own page with
  `bookings:read`, then an answer carrying a signed receipt.

One record keeps what each protocol did, in order. PACT's receipts reach it
through `pact.receiptStore`, to which Atlas's host contributes the record
(as a Datalayer host contributes the application's record, R-07); PAP's
steps are written by the tool. No user code, device code, token, assertion,
proof or receipt signature is in it, nor in the answer the model reads.

```bash
python examples/protocols/pap_and_pact/app.py
loop apps run examples/protocols/pap_and_pact/app.py
```

prints both answers, then nine record entries (`company discovered`,
`sign-in asked`, `signed in`, `answered` at Manzanita; `card read`,
`sign-in asked`, `signed in`, `receipt verified`, `answered` at Example Air).
Everything runs in one process with no network and no model.

Tested by `agent_runtimes/tests/test_protocols_pap_and_pact.py`. Developer
documentation: `docs/docs/protocols/pap-and-pact.mdx`.
