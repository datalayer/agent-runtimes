# PAP Sign-In Display

When a personal agent has to ask the person to sign in at a company, the tool
that starts the sign-in answers with a **display**: a
`personal_agent_protocol.ui.PapSignIn` (type
`application/vnd.datalayer.pap.sign-in+json`) in the MCP result's
`_meta["reactor.ui/display"]`. Datalayer's gateway answers `pap_sign_in` this
way.

The page to open and the code to enter are for the person, not the model: a
device's verification URL may even carry the code. This `Application` runs one
real device sign-in at Manzanita Outfitters (the SDK's demo company), serves
the answer from an in-process MCP server shaped like the gateway's, and runs
it through the same plumbing a deployed agent uses:

- `agent_runtimes.mcp.displays.DisplayMCPToolset` keeps the display that
  pydantic-ai's MCP mapping would drop. The model is given the display's
  `model_view()`: its type, its text (_Sign in at manzanita.example: open its
  sign-in page, shown here, …_) and the fields marked for both audiences
  (`mode`, `expires_at`, `sent_to`), never `open` or `code`.
- `agent_runtimes.transports.agui_displays.DisplayAGUIAdapter` sends the page
  the same result with the whole display in `_meta`, the shape
  `resolveToolResult` (`@datalayer/reactor/ui`) reads; the chat then draws it
  with `ReactorDisplay` and the _Sign in at a company_ card of the
  `pap-sign-in` plugin (see the **PAP Sign-In Display** gallery example).

The tool returns which fields each side received and whether the model read the
link or the code (it did not); it returns neither itself. A scripted model
stands in for an LLM: no network, no key.

```bash
loop apps run examples/personal-agent-protocol/sign-in-display/app.py
```

See the PAP [Sign-in guides](https://personal-agent-protocol.datalayer.tech/guides/device-sign-in/).
