# PAP Local Personal Agent

`PapPersonalAgentCapability` given the host's PAP reactor is a local
runtime's personal agent (PR-03). Against Manzanita
Outfitters, the SDK's demo company, it:

- opens a pairwise Session (the host's `pap.pairwiseUserIdStore`) and asks;
  signed out, the company asks for a sign-in;
- starts Device Sign-In: the link and the code are for the person, who signs
  in on the company's own page; the private device code stays in the SDK's
  authorization state store;
- asks again in the same Session, now signed in, and reads the order;
- confirms the exchange Manzanita proposes only once the person approved
  that exact revision on the host's approval surface (`pap.approvalSurface`).

Every answer is a summary (`PapAnswer`, `PapSignInSummary`,
`PapConfirmSummary`): no Session Token, DPoP proof, device code or pairwise
id. In Datalayer the same journey runs through the gateway's `pap` toolset.

```bash
loop apps run examples/personal-agent-protocol/local-personal-agent/app.py
```
