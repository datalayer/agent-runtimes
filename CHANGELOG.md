# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

Each version names the LOOP boxes it carries (the plan's ids, as its commits
say them) and links the page that documents them, at <https://agent-runtimes.datalayer.tech>.

## 1.5.31

On agentspecs 0.0.100 and `datalayer-agent-shield` 0.1.1.

- **A harness as a Datalayer agent** (SHIELD.md SH-10, on SH-01 and SH-11): `harness: claude-code` (or `codex`, `gemini-cli`, `goose`, `opencode`, `openhands`, `fast-agent`) in an agent spec is served by `ACPAgent(BaseAgent)` — the `agent-shield` package's proxy with the runtime as its face: the pinned adapter launched over stdio from `~/.agent-shield/harnesses/<id>@<version>` or the PATH, never fetched; `initialize` with `fs` and `terminal` on; every `session/update` an event of the runtime's; a malformed update or a refused action ending the turn in a sentence; `DELETE /agents/{id}` ending the process. Registered on `acp`, `a2a` and `ag-ui`; `vercel-ai` refused. The Studio's side (`src/runtimes/variants.ts`, `checkAppspec`) offers such an agent the Datalayer runtimes and never the page; `custom` stays refused in the shared catalogue. [Harnesses](https://agent-runtimes.datalayer.tech/docs/harnesses)
- **Permissions as Rules** (SH-12): `session/request_permission` decided by the application's Rules read into a team-scope policy (`guardrails/shield_policy.py`) above the default — *do it* answered, *ask me first* raised through the tool approvals, *always* a session rule, `cancelled` on a cancelled turn.
- **Files and terminals against the workspace** (SH-13): `fs/*` and `terminal/*` answered inside `AGENT_RUNTIMES_WORKSPACE_ROOT`, each a tool row with its diff or terminal display and a decision in the record; a path outside refused.
- **Sessions and the record** (SH-18): the Shield's audit written to the application's record; the harness's session kept in the protocol state store and loaded when the harness advertises it, a start-over said otherwise.
- **`loop --harness <id>` and `loop harnesses`** (SH-19); the orchestration adapter on the package's stdio and WebSocket channels (SH-02).

## 1.5.30

On agentspecs 0.0.99. (1.5.29 was tagged and did not publish: its build refused an unused import; this carries it.)

- **`loop --voice` and `--speak`** (VOICE.md VO-15, VO-16, VO-17): `/voice`, `Ctrl`+`T` its shortcut, listens with the machine's microphone (the `voice` extra, sounddevice) and puts the words on the prompt line; `--speak` says each answer; heard on the machine with faster-whisper and the pinned `whisper-small`, else on Datalayer's servers with the person's token; no microphone, no extra or no token refused in a sentence. [Voice](https://agent-runtimes.datalayer.tech/docs/chat/voice)

- **Hands-free and barge-in** (VOICE.md VO-12, VO-13): where an Appspec's voice says `input: hands_free`, *Talk with it* beside the microphone — a turn sent by itself after 700 ms of silence, the answer said as it is written, listening on, the state shown at all times; speaking over the agent stops its voice and its run, the answer marked *interrupted*. No longer refused by `checkAppspec`. [Voice](https://agent-runtimes.datalayer.tech/docs/chat/voice)
- `<datalayer-app>` reads a visitor's address at ai-agents' address, not Spacer's (found on datalayer.ai, VOICE.md VO-18).
- The voice catalogue of agentspecs 0.0.98 (`whisper-small` for spoken turns on the server, VO-47); `measure.py --server` measures the server's models on the fixtures.

## 1.5.28

On agentspecs 0.0.97.

- **Heard on Datalayer's servers from the page** (VOICE.md VO-34, VO-14, §5): `ServerHearing` — the browser's VAD finds the speech, the speech service's Whisper large-v3-turbo writes it (`POST /api/ai-agents/v1/speech/transcriptions`). Used where an Appspec's voice says `where: server`, where it says `auto` and no model in the browser hears the language (`hearingPlace`), and where the person chose *Detect the language I speak* (`detectLanguage`); asked apart from the device's consent. [Voice](https://agent-runtimes.datalayer.tech/docs/chat/voice)
- **`<datalayer-app>` runs the deployment its embed token names** (VOICE.md decision 16): no `deployment` attribute; a token naming none is refused in a sentence before anything is drawn; the chat's voice sends no deployment of the page's. [Embedding](https://agent-runtimes.datalayer.tech/docs/apps/embedding)
- The voice catalogue of agentspecs 0.0.97 (`whisper-large-v3-turbo`, on the server only).
- The floating assistant leaves its corner's words free (REVIEWS Q-08); pictures in CI on a pull request (REVIEWS Q-09).

## 1.5.27

On agentspecs 0.0.96.

- **The web chat's conversation is the shared reducer** (MOBILE M-030): `ChatBase` keeps no message state of its own — every protocol adapter's events (AG-UI, Vercel AI, A2A, ACP, the in-page agent) go through `portable/adapterEvents`' `conversationEventsOf` into `reduceConversation`, the phone's reducer; a conversation read again is one `snapshotOfMessages`. `chat/base/conversationItems` draws its rows with what only the web holds (Reactor UI displays and authors, an application's steps). The reducer grows to what the chat needed: arguments as an object, results as values when kept whole, what a running call waits for (an approval, the person), sandbox and code errors and exit codes, tool calls restored from a snapshot, the device's bounds (`DEVICE_LIMITS`, `BROWSER_LIMITS`) and `withoutItems`. A protocol error is now also said in the conversation; a stopped call says *Stopped*, as on the phone.
- **ACP tool results reach the chat**: a `tool_call_update` names its call and is a result only once it completed or failed.

## 1.5.26

On agentspecs 0.0.96.

- **How a sign-in under way stands, for the person's own client** (MOBILE M-039): `portable/signInStatus` asks the gateway's `GET /api/mcp/v1/pap/sign-in` with the person's own sign-in and accepts an answer only bound to the application, the company and a verified issuer.
- **A mediated sign-in's form in `lib/portable`** (PAP_DATALAYER P-03, MOBILE M-039): `portable/protectedInput` reads what a company asks with the sign-in's one-use protected ticket and sends what the person typed once to IAM; the Studio's `/pap/sign-in` and Datalayer Mobile share it.

## 1.5.25

On agentspecs 0.0.96.

- **An application that asks the person says so on its record** (MOBILE M-023): an `asked` entry, always kept, by the question's kind and when — never its words; ai-agents tells whoever opened the session, on their phone too.
- **Protocol displays from the stream in `lib/portable`** (MOBILE M-037): `portable/displays` reads the PAP SDK's sign-in, confirm, outcome and replies displays from a tool result's `_meta["reactor.ui/display"]`, a plain `pap_sign_in`/`pact_sign_in` answer and a `pap_handoff` answer, strictly — anything else is `unknown`, with its type and model-safe text only. The conversation reducer keeps it on the tool row; `ProtocolDisplayProps` is the renderers' contract. The sign-in reader moves to `portable/signIn` (the web plugin re-exports it).
- **A Direct Conversation in `lib/portable`** (PAP_DATALAYER P-08, MOBILE M-038): `portable/direct` is the one client for the person's own words to a company (IAM's one-use ticket, then the gateway; replies read from the cursor) with the linked sub-conversation's state, shared by the Studio's chat and Datalayer Mobile.

## 1.5.24

On agentspecs 0.0.96.

- **Presence and the conversation's component contracts in `lib/portable`** (MOBILE M-030, M-032): `portable/presence` (the states and words beside an application's face, which the web chat re-exports, and `presenceOfConversation` over `reduceConversation`'s state); `portable/views` (each conversation row's props, words and screen-reader labels, the message box's rule — when a person may type, Send or Stop — and the question card's), one contract for the web and Datalayer Mobile's native renderers; `conversationFixture`, the conversation every renderer is tested against. The web `PresenceLine` takes `PresenceLineProps`.

## 1.5.23

On agentspecs 0.0.96.

- **A Preview's ask-first tool call runs once the person approves it** (PAP_DATALAYER release gate *Preview and the shipped renderer*, round 23): a token ai-agents reads as narrowed (a Preview's, a run's) is refused by its `/ws`, so the runtime reads each approval it forwarded with such a token at `GET /tool-approvals/{id}` until it is decided, and opens no `/ws` for it.
- **Web Bot Auth: a key a verifier's cached directory does not list is read again** (`DirectoryResolver`, at most once in ten seconds per agent): an agent's rotated key, which signs at once, is verified straight after the rotation, not an hour later.

## 1.5.22

On agentspecs 0.0.96.

- **A signed-out visitor of a Python application talks to it on the runtime its deployment is kept on** (R-30, decided 14 October 2026, [Python applications](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)): never the shared visitors' runtime, whose plain agent would answer in its code's place. That runtime takes a visitor's token for its own address, makes the address's agent with the deployment's code, and holds the visitor to the visitors' runtime's rules (their own token for its models, read only, turns and minutes, nothing kept). The visitors' runtime refuses such an address; the embed sends the visitor to the kept runtime.
- Portable session/AG-UI client and conversation reducer (MOBILE M-030, M-033).

## 1.5.21

On agentspecs 0.0.96.

- **A shipped Python application's own code runs wherever its deployment's agent is made** (LOOP R-14, [Python applications](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)): the hosted page, kept always on or not, an embed, a tick. The runtime reads the version's `app.py` from the deployment (ai-agents' `GET /apps/deployments/{uid}/code?version=N`, with the caller's token, once the principal's token is held); before, it ran only on a runtime kept always on, and the plain agent answered silently elsewhere.
- **`app_code` is refused** (422): code is never taken from the request that makes an agent; `session_payload` and `kept_payload` carry none. A deployment's agent names the version it runs (`app_instance.version`).

## 1.5.20

On agentspecs 0.0.96.

- **Voice in the chat** (VOICE.md): the microphone in an application's own composer, dictation into the input as it is heard, stopped on silence; spoken answers and Read aloud through the speech service, a long answer said whole; Stop speaking in an application's composer; a person's own voice settings; voice for visitors and embeds; `hands_free` refused until VO-12.
- **Each example in Python** (`APP_PYTHON`): its own `app.py`, or the one `loop apps eject` writes from its spec.

## 1.5.19

On agentspecs 0.0.95.

- **A kept organization deployment's keeper routes answer its administrators** (PAP_DATALAYER, decided 2026-10-14): an organization owner counts as the deployment's owner, asked of IAM's memberships; refused when IAM cannot be asked.
- **A deployment's page asks its runtime only the application's own routes**: no `/runtime/status`, no `DELETE /agents/{id}`, no `/configure/models`.
- **Speech models kept under their provider** (VOICE.md VO-48): `<provider>/<model id>/<path>`, in the browser store and the pinning tools.

## 1.5.18

On agentspecs 0.0.94 and personal-agent-protocol 0.24.0.

- **A deployment's runtime answers only the application's own routes** (PAP_DATALAYER release gates, decided 2026-10-14): every generic and admin route answers 404 for an agent serving a deployment; the deployment page calls only those it answers (Stop through `/apps/sessions/{uid}/stop`, no monitoring stream, no sandbox socket, no model switch); the keeper's routes answer the deployment's owner alone, and its retry finds the agent it created.
- **Applications' UI plugins** (AGENTIC_UI R8): `uiFor`/`uiOf`, the same mapping as agentspecs' `ui_for`, held by a shared fixture; a blank application starts with its kind's plugins; a bare id in `ui` is refused.
- **Voice** (VOICE.md): an agent spec's own `voice:`, Read aloud on request in the floating chat, the speech models' descriptions.
- **Catalogue entries read by id**, never through version-named constants.

- **A signed fetch** (AGENT_PROTOCOLS EX-11, decided 2026-10-13; agentspecs 69c5da3): an application's `signed_fetch.sites[]` (`AppSignedFetchSpec`, Python and TypeScript, read and written, refused unless `web-bot-auth` is listed) are each one server of the gateway's `signed-fetch` toolset (`/mcp?only=signed-fetch&signed-fetch-site=<domain>`), in the person's name, its one tool `signed_fetch` a `read` under the Rules; a Preview names them as its token is asked for. *Signed Reader* in the catalogue — [Web Bot Auth](https://agent-runtimes.datalayer.tech/docs/protocols/web-bot-auth#in-an-application-a-signed-fetch).

- **A TypeScript MCP client, and MCP's conformance in both languages** (AGENT_PROTOCOLS PR-51, EX-09): `McpClient` on the official `@modelcontextprotocol/sdk` (now a direct dependency, `^1.32.1`) — connect over Streamable HTTP or any transport, the version agreed, tools listed through their pages and called, resources read, prompts got — and the readings both languages agree on (`toolReading` / `tool_reading` with the specification's defaults for missing annotations, `callReading`, `resourceReading`, `promptReading`), held to `protocols/mcp/fixtures/session.json` by both suites; `examples/protocols/mcp/fixture_server.py` serves the fixture with the `mcp` SDK, and the TypeScript client reads it across the two SDKs' versions (2025-11-25 agreed) — [Agent protocols](https://agent-runtimes.datalayer.tech/protocols/agent-protocols#conformance).

- **TAP, a draft profile over Web Bot Auth** (AGENT_PROTOCOLS PR-24, decided 2026-10-13): `sign_tap_request` / `signTapRequest` and `verify_tap_request` / `verifyTapRequest` — Visa's agent-recognition signature as its public Merchant Specifications say it (`@authority` and `@path`, `created`, `keyid`, `alg="Ed25519"`, `expires`, `nonce`, `tag` `agent-browser-auth` or `agent-payer-auth`, at most 8 minutes, a nonce a replay for 8 minutes), keys by `keyid`; not confirmed by Visa. Vectors computed here (`web_bot_auth/fixtures/tap.json`) and reproduced by Cloudflare's `http-message-sig` (now a direct dependency, `0.3.0`) — [Web Bot Auth](https://agent-runtimes.datalayer.tech/protocols/web-bot-auth#tap-a-draft-profile).

## 1.5.17

On agentspecs 0.0.93.

- **UI specs are the Reactor plugins; A2UI, MCP Apps and MCP UI their own `ui-renderers`** (AGENTIC_UI F-03..F-05, F-07): `src/specs/ui.ts` and the new `uiRenderers.ts`, an app's `ui: [{plugin, renderer?}]`, the old shape refused; the canvas toolbox offers a part per UI plugin.
- **A deployment's page opens each visitor's own conversation, never the runtime agent's** (PAP_DATALAYER release gate); what a deployment's agent holds is nobody's to read or decide on its runtime.
- **CI green again**: mypy clean, numpydoc and interrogate pass, stale tests and one stale example brought to the code, the docs build.
- `@datalayer/personal-agent-protocol` `^0.23.0`.

## 1.5.16

On agentspecs 0.0.92.

- **A shipped application's page draws a personal agent's question in the person's words** (PAP_DATALAYER, decided 2026-10-14): the opened conversation, read from the agent's full context and from the prompt history, goes through `askedOf` like a thread (`src/chat/base/fullContextMessages.ts`).

## 1.5.15

On agentspecs 0.0.92.

- **Exchange Desk on** (AGENT_PROTOCOLS PI-42): a proposed exchange waits for the person's confirmation.
- **A company's proposal is recorded like any decision** (PAP_DATALAYER R-01): a record that keeps `decisions` holds the Rule decision of a proposal.
- **The runtime's PAP preamble is never shown to the person** (PAP_DATALAYER, decided 2026-10-14): marked `<asked-for>…</asked-for>`, kept in the record, stripped by `askedOf` where a thread is shown.

## 1.5.14

On agentspecs 0.0.91.

- **A proposal does not end a company's turn** (AGENT_PROTOCOLS PI-42): a declared operation proposed in a personal agent's turn skips its tool with the sentence as its result, so the model tells the person (Exchange Desk answered "could not answer just now").
- **A sign-in card hears one return** (PAP_DATALAYER P-04): a denied attempt's card no longer sends *check again* into the next sign-in's run.
- **A run's end is always recorded** (PAP_DATALAYER R-01, decided 2026-10-13): `AppRecorder.ended` keeps `{status, ended_at, trace_id}` whatever `record.include` says; the answer's words stay opt-in under `outputs`.

## 1.5.13

On agentspecs 0.0.91.

- **A run over A2A has the tools of the application's code** (AGENT_PROTOCOLS PI-42): a company's turn arrives outside a session, and only a session offered the code's tools before (Exchange Desk wrote `exchange_order(...)` as text).
- **The sign-in card says what the company needs** (PAP_DATALAYER P-02), and an application's chat with no title bar still mounts what plugins put there (P-04).
- **Returns Desk and Shop Concierge on** (PI-42).

## 1.5.12

On agentspecs 0.0.90.

- **`pap_propose`** (PAP_DATALAYER R-07) in the action specs, classed send.
- **A PACT business is told who the person is** (AGENT_PROTOCOLS PR-13): under `profile:read`, their handle and display name; never their email without its own grant.
- **Examples** (PI-42, PR-13, STUDIO E-04): Returns Desk at Manzanita's API, Exchange Desk in Python, Guest Desk and Errand Runner on; what was tried said in a Maker's words.

## 1.5.11

On agentspecs 0.0.89.

- **A company or business is told who asks** (PAP_DATALAYER B-04, AGENT_PROTOCOLS PR-13): ai-agents' `metadata.pap` and `metadata.pact` reach the turn as one line before the request (`asked_for_said`) — a business told a signed-in person "You are not signed in" before.
- **A turn without someone to act for** (B-04, R-07): a server connected per person, with nobody to reach it in the name of, is left out of the turn instead of failing it.
- **The sign-in card names the company** of a bound Direct Sign-In (P-04), and says when the person's browser came back.
- **A company's decision keeps its correlation ID** (R-01).
- **Examples on** (PI-42, EX-11): Signed Reader, Order Desk, Order Tracker, Sign-in Desk.

## 1.5.10

On agentspecs 0.0.88.

- **Security** (PAP_DATALAYER B-02): the embed build takes nothing from the shell's environment (`envPrefix: 'DATALAYER_EMBED_'`) and refuses to write a bundle that carries a secret (`embedSecrets`). An embed built locally had carried a `VITE_` API key.
- **A signed fetch** (AGENT_PROTOCOLS EX-11): `signed_fetch.sites[]` in the Appspec, each site a gateway server whose one tool reads, signed, under the Rules; a Preview names its sites.
- **A pair of examples** (PR-13): a PACT business and its personal agent; copying both writes the agent's issuer into the business's registered agents.
- **A company's tool decided by the Rules evaluator** (R-01), recorded with what decided it.

## 1.5.9

On agentspecs 0.0.87.

- **A company's turn reaches its tools over A2A** (PAP_DATALAYER B-04): an application's run over A2A goes through the gateway's toolsets as its AG-UI and Vercel runs do; a kept deployment's agent had no company tools before.
- **Standing permissions through an operation** (R-07): an operation may give a standing permission (`allows`), read and written in both languages, with a Python builder; a local company refuses it.
- **A TypeScript MCP client** (AGENT_PROTOCOLS PR-51, EX-09) on `@modelcontextprotocol/sdk`, and MCP's conformance fixtures read by both languages.
- **TAP** (PR-24): a draft profile over Web Bot Auth, from Visa's public documentation, *arriving* until Visa confirms.
- **Travel Desk and Shopping Desk switched on** (PI-42), drilled live against the hosted counterparts.

## 1.5.8

On agentspecs 0.0.86.

- **An application answers as a PACT business** (AGENT_PROTOCOLS PR-13, PI-32): `PactBrand`, the Provider's side of one Brand with what a host decides handed in (an ES256 signer and its published keys, `IssuerKeys` for the registered personal agents, a `BrandStore`, a `BrandAgent`, the page where the person signs in) — its card, the personal-agent JWT verified against a registered issuer's keys only, the device code, the delegation token, the step-up and a signed receipt per reply under a delegation; `ExampleAir` is one `PactBrand` in memory; the Appspec's `pact.business` in the Python and TypeScript types (`AppPactBusinessSpec`, `AppPactRegisteredAgentSpec`), `app.as_business` — [PACT](https://agent-runtimes.datalayer.tech/protocols/pact#answering-as-a-business).
- **A Preview reaches its businesses and test merchants** (AGENT_PROTOCOLS PI-42): `preview_grants` sends the Appspec's `pact` connections and `commerce` merchants with its Spaces and companies (needs ai-agents and IAM with services 52a5144e).
- **The protocol examples at the hosted counterparts** (AGENT_PROTOCOLS PI-42): *Order Desk*, *Travel Desk* and *Shopping Desk* reach `manzanita`, `air`, `store` and `outfitters.examples.datalayer.run`; still off until each is run live.
- **Words that go elsewhere than the agent** (PAP_DATALAYER P-08): `LoopChatExtrasValue.sendInstead` (`says`, `send`) — while a host sets it, the composer's placeholder says where the words go and sending hands them to `send`, never to the model or the runtime (`sendInstead` in `apps/core`), a refusal said under the composer: the person's own words in a Direct Conversation with a company.
- **A kept deployment's A2A route answers its own principal** (PAP_DATALAYER B-04): a principal's own token is a `principal` caller, never a person; the gate answers the principal this runtime acts as for the same deployment grant (`is_held_principal`) — what ai-agents sends a company's turn with. Needs IAM answering whoami for principals.
- **A `pap` block names its profile** (PAP_DATALAYER S-03): `AppPapSpec.profile` (`PapProfile`, `'draft-01'`), read and written first by the TypeScript reader and writer (`PAP_PROFILES`, `PAP_PROFILE`, `papProfileProblem`: an unknown profile, or a block naming none, refused in agentspecs' sentence and not read); `app.company_connection` and `app.as_company` write it; the catalogue regenerated.

## 1.5.7

On agentspecs 0.0.85.

- **UCP after the sale** (AGENT_PROTOCOLS PR-31): `get_order` / `getOrder` and `order_summary` / `orderSummary` read an order the merchant placed; the test Example Store serves `/orders/{id}`.
- **The seven recorded PAP journeys as Studio examples** (PR-05), off until each is drilled live.
- **Two more scripted Stages** (EX-14, EX-15): *A Purchase, Approved* (UCP) and *A Personal Agent at a Business* (PACT).

## 1.5.6

On agentspecs 0.0.84. 1.5.5 was tagged but never published: its build failed on two TypeScript errors (the protocol check did not read the `commerce` block's type; the empty scene spec lacked the scripted kind's fields), fixed here. Shopping Desk also checks out at Example Outfitters over ACP.

- **A Preview reaches its companies** (PAP_DATALAYER P-01): the runtime asks for its Preview token with its `pap.connections` beside its Spaces (`preview_grants`), so the gateway's `pap` toolset can reach the companies the Maker reviewed; no Preview could before.
- **Talking to a company is a send** (R-02): `pap_ask` and `pap_handoff` are classed send, *Ask me first* by default; a read connection to a company no longer converses.
- **Scripted scenes** (X-02): `SceneSpec` gains `kind`, `actors`, `lines` and `live` in both languages.
- **Merchants in an application** (AGENT_PROTOCOLS PI-01, PI-20, PI-21): the Appspec's `commerce` block — UCP and ACP test merchants only, every purchase asked first, no real payment.

## 1.5.4

On agentspecs 0.0.83.

- **Sign in at a company, every way** (AGENT_PROTOCOLS PI-56): the chat's sign-in card draws Mediated Sign-In — Datalayer's own page, what the company asks typed there and never in the chat — and a PACT business's `pact_sign_in` as a PAP company's Device Sign-In; the page and its code travel only in the `PapSignIn` display, so the model reads neither. In the Preview, the hosted page, the embed and the run page.
- **`pap_handoff`** (PAP_DATALAYER P-08) in the action specs, classed with `pap_ask`.

## 1.5.3

On personal-agent-protocol 0.16.0.

- **Security** (AGENT_PROTOCOLS PI-13): merchant profiles, seller discovery and PACT cards — `/.well-known/ucp`, `/.well-known/acp.json`, a Brand's card, its OAuth metadata and keys — read through the PAP SDK's single egress path (`protocols.egress.metadata_fetch`: resolved first, every address public, only that address dialled, no redirect, no proxy, bounded). A local test counterpart is read over the caller's client only when said (`client_fetch`).
- **PAP words are the agent's** (PAP_DATALAYER P-08): `PapPersonalAgentCapability.ask` sends what it is given as the agent's own words (`sender: agent`, PAP-7.8-01); they went as the person's.
- **What the code decides, marked** (PAP_DATALAYER U-06): `loop apps build` marks a company the application works with, its company role and each operation it declares, at its line, for the Studio to show them read-only.
- **The PAP gallery's traces** (PR-05) recorded again on SDK 0.16.0, each naming the release that recorded it.

## 1.5.2

On personal-agent-protocol 0.15.0.

- **PAP for a local runtime** (AGENT_PROTOCOLS PR-03, PR-04): `PapPersonalAgentCapability` asks, signs in (Device Sign-In) and confirms through the host's PAP reactor — a confirmation sent only after the person approves on `pap.approvalSurface`; `PapCompanyCapability` publishes an application's `pap.company` and answers personal agents over its A2A route, each operation carried out once through a one-use ticket (`pap.company.operationTickets`). Examples `local-personal-agent`, `local-company`. PAP is a plugin of the `agent-protocols` Extension in both languages.
- **Security** (PI-13): Web Bot Auth key directories fetched through the PAP SDK's resolving client — a hostname resolving inside the network is refused, not only a private address written in the URL.
- **UCP and ACP across languages** (EX-04, EX-05): the TypeScript clients at the Python test merchants over HTTP.
- **The workspace's chat views by props** (`chatViewModes` on `LoopWorkspace`): the floating view is the chat's own assistant mode.

## 1.5.1

- **PACT businesses reached by the runtime** (AGENT_PROTOCOLS PI-20): the runtime's `AppSpec` keeps an application's `pact` block (it was silently dropped); each business is reached through the gateway's `pact` toolset in the person's name, its tools decided by the Rules. `app.business_connection(...)` in the Python surface (PI-01).
- **PACT across languages** (EX-06): the TypeScript personal agent at the Python Provider (Example Air) over HTTP — card, sign-in for one scope, step-up, a change, both receipts verified.
- **The Datalayer target's agent is created on AG-UI**, the transport the workspace chat speaks (it was created on Vercel AI, and the chat's requests 404'd).

## 1.5.0

On Reactor 1.3.0 and agentspecs 0.0.82. A page and a runtime of this release move together: an older page's `loop.action` and `data_url` are refused.

- **Typed actions** (REACTOR_UI RU-5): `@app.action(name, payload=Model)` in Reactor's ActionRegistry, declared as `interface.actions` in the Appspec; an undeclared action, a bad payload or an unknown field refused (422), a forged token 403; a page's payload never reaches the model as text.
- **No action POST** (RU-W): the session's ui channel is the WebSocket; page blocks send messages, a widget's page runs on `POST …/page`, API clients press on `POST …/press`.
- **Files as refs** (RU-6): `reactor.ui.files` — uploads to `POST /agents/{agent}/files`, a run carrying a `data_url` refused, a file question answered by pressing its ref.
- **The host bridge** (RU-7): the host page's functions are a host plugin's commands and a `host` agent-tools bundle, handed to agents on a runtime too.
- **Agent protocols**: a runtime's protocols name their catalogue entry (PR-50); Signed requests and UCP checkout in the examples gallery (EX-10); A2A's paired fixture (PR-51); an application's own identity documented (DOC-06).

## 1.4.0

The ui channel on Reactor 1.2.0 (`reactor.ui`): a page and a runtime of this release move together — an older page loses what a newer runtime shows, and the other way round.

- **Answers, steps, elements, authors and window messages are `reactor.ui` displays** (REACTOR_UI RU-2, RU-3): no `render_a2ui_surface` tool call, no `answer-` prefix, no `loop.*` events; each button offered with a token the session minted, a press checked before anything runs (403 not offered, 422 unknown).
- **What the code asks is a display, a press its answer** (RU-4): `loop.ask` gone; a rule's *Ask first* is two buttons, Allow and Refuse; an answer checked before the code resumes (422, 409).
- **One WebSocket for the ui channel** (RU-W): `WS /api/v1/apps/ui` — first-frame auth, numbered ops, resume, heartbeats, backpressure; no `reactor.ui` op rides the AG-UI run.
- **Protocols as specs** (AGENT_PROTOCOLS PS-01 to PS-05, agentspecs 0.0.81): the protocols catalogue in both languages, `protocols` and `ui` on agents and applications, `Application(..., protocols=, ui=)`; UI plugins renamed **ui** (`UISpec`, `UI_CATALOGUE`), old keys refused.
- **A Preview run ends with an answer or a stated error**: MCP toolsets wait 30 s for the handshake (a cold gateway worker), their client 30 s / 300 s read; a stream that ends without RUN_FINISHED or RUN_ERROR gets a closing RUN_ERROR, the page says the run stopped.
- **PAP**: *Ask me first* reaches a company's confirmation (PAP_DATALAYER R-04); PAP and PACT in one task (EX-07); MCP and A2A inventory and the protocols docs (PR-01, PR-52, DOC-01, DOC-05).

## 1.3.114

- **A2A extensions an application declares** (`a2a.extensions` in its Appspec, agentspecs 0.0.80) published on its Agent Card after the runtime's own, in Python and TypeScript (AGENT_PROTOCOLS PR-02).
- **The protocols' tools classed by agentspecs** (`protocol-tools`): the PAP, PACT, UCP and ACP tool classes generated in both languages from one table (AGENT_PROTOCOLS PR-54, PAP_DATALAYER R-02).
- **Personal Agent Protocol in the Loop Python surface**, both roles: `app.company_connection`, `app.as_company`, `@app.company_operation` (PAP_DATALAYER S-04); the PAP examples run again on SDK 0.10.
- **Displays** on the Vercel AI stream and in a reloaded history (REACTOR_UI RU-1).

## 1.3.113

- **PACT** `poll_sign_in` / `pollSignIn`: one question to the Brand's token endpoint, `None` while the person has not signed in — what the MCP gateway's `pact` toolset asks (AGENT_PROTOCOLS PI-10).
- **What a runtime speaks** (AGENT_PROTOCOLS PR-50, EX-08): `GET {prefix}/protocols`, and `loop apps protocols [APP]` with what an application's spec uses.
- **Web Bot Auth, one key, two languages** (EX-01): Python signs the base Cloudflare's library signs (the target, the `Signature-Agent` member, then `@method`, `@path`, `@query`), held by a cross-language fixture.
- The Appspec type carries the `pact` block (agentspecs `pact.connections`).

## 1.3.112

- **Agent protocols as Reactor plugins** (AGENT_PROTOCOLS §3.1): the `agent-protocols` Reactor Extension delivers one plugin each for MCP, A2A, Web Bot Auth, UCP, ACP and PACT, in Python and TypeScript; each protocol's extensions are contribution points of its plugin (`<protocol>.extension.*`), held by its `reactor-points.json` and table-driven tests. Web Bot Auth signs and verifies (the draft's vectors byte for byte) and every A2A route refuses a bad or replayed signature; UCP and ACP checkouts become exact proposals spent once; PACT's personal-agent side with a local provider. Examples under `examples/protocols/`, docs under *Protocols*.
- **Personal Agent Protocol in the Studio**: the sign-in card as a display (`DisplayMCPToolset`), the company role's MCP server and registered agents (agentspecs 0.0.77), and the Order Desk and Exchange Desk examples.
- **Avatars kept prefixed** (agentspecs 0.0.78, now required): an Appspec's avatar is `emoji:…` or `@datalayer/icons-react:…`, checked in TypeScript too.
- The applications catalogue writes PAP keys in TypeScript's names and leaves a default `pap` block out.

## 1.3.110

- The examples' catalogue from agentspecs 0.0.76, now required (STUDIO E-01): *Report from a File* reports a cell's text as data, *Support Desk*'s sample documentation speaks to its customers — the four switched-on examples *Ready* on Datalayer.

## 1.3.109

- **A test can be a short conversation** (STUDIO E-01; agentspecs 0.0.75, now required): `tests.cases[].turns`, each what the person says, the choice they make or the action they press; played on the session API turn by turn (`run_cloud_app_conversation`, and in process for `loop apps validate --local`), the judge reading what the code kept.
- **A response that also calls a tool does not end the turn's record** (E-01): words and a call in one response carried the run on while the record closed at the words, losing the call and the answer after it.
- The examples' catalogue regenerated: Quote Calculator and Support Desk search before their first words, Report from a File refuses a file that is not a CSV.

## 1.3.108

1.3.107 was tagged but not published: its type check failed on the PAP example, which needs `@datalayer/personal-agent-protocol` 0.3.3 (now required, with `personal-agent-protocol>=0.3.3`).

- **What it sends says who wrote it** (STUDIO I-10; agentspecs 0.0.74, now required): a call through a connection that sends — Gmail, Google Chat, Slack, any tool whose catalogue entry names the argument it `signs` — carries the application's byline and the person it acts for, added before the person approves it; the person named from their verified token, never their uid.
- **The computer's browser** (STUDIO R-23): with *computer: browse* on, an application opens, reads and takes screenshots of pages (`open_page`, `read_page`, `page_screenshot`), and clicks and types by its rules (`click_on_page`, `type_on_page`); a visitor's turn only reads; private and loopback addresses refused. The computer view shows the page live, with *Take over* and *Hand back*.
- The Personal Agent Protocol: signed app controls and a live guided journey.

## 1.3.106

- **A test gives its application files** (STUDIO E-01; agentspecs 0.0.73, now required): `tests.cases[].files` in the types, the Appspec reader and writer, the checks and the catalogue.
- **The transcript draws an answer's words as the chat does** (`ChatMarkdown`): a table, a list, bold — not its markdown run into one line; the A2A recorder keeps an answer's line breaks.
- The Personal Agent Protocol's examples and docs.

## 1.3.105

- **A visitor's turn refuses a call that waits for a person, and goes on** (STUDIO H-03): deferred, an approval-required tool ended an A2A task whose run takes no `DeferredToolRequests` (Disaster Assessment's *Storm* on the home page); the tool-approval guardrail now denies it in the visitor's sentence (*Without an account nobody is asked …*). Test: deferred inline +1.
- **An MCP server that is not running is started again** (STUDIO H-03): in the background, at most once a minute and as it was first started, by the turn that finds it stopped — Disaster Assessment's `earthdata` had failed at the runtime's start and every turn after skipped it. Test: retry in background (2).
- **The Personal Agent Protocol** as a runtime capability (`personal-agent-protocol>=0.3.1`, `@datalayer/personal-agent-protocol` ^0.3.1).

## 1.3.104

- **An application's code runs in the page** (STUDIO E-11): turned in the page, its agent runs its code through `execute_code` in the browser sandbox (`AppBrowserSandbox`), its sample documents written to `/tmp/inputs/` first and a file given on the page put in the sandbox — so a visitor signed out tries *Quote Calculator* and *Report from a File* with only model calls leaving the page. A host closing the conversation refuses the widget's own Run too.
- **`samples`** (STUDIO E-06, E-11; agentspecs 0.0.72, now required): an example's sample documents and a decision's alternatives, in the types, the Appspec reader and writer and the catalogue; the four decisions decide with `cloudflare:wrk/typesafe/jev`.
- **A visitor's refusal said once in the transcript** (STUDIO H-03): the A2A spans read a chunk without `append` as the artifact whole, as the runtime's last chunk is. Test: agentInspector +1.

## 1.3.103

- **A kept deployment's principal is renewed** (STUDIO A-08): a deployment kept always on that only answers over A2A called nothing about an hour after its agent was made, because its principal's token expired and nothing asked for it again. `POST /api/v1/apps/principal` now asks ai-agents again with the owner's key, whatever the runtime holds, and ai-agents' keeper calls it every half hour.
- **A peer's refusal is said in its route's sentence** (STUDIO H-25): a visitor at Accounting's limit read the A2A client's raw `HTTP error establishing stream … 429 . Response: {"detail": …}` in the balloon. The peer now says the route's own sentence. Test: vitest `a2aPeer` (+1).

## 1.3.102

- **A kept runtime is given its deployment's user secret** (STUDIO D-21): the secrets a runtime is given are what its specs declare (R-19), and a deployment that takes a signed user declares `DATALAYER_APP_USER_SECRET_<UID>` — read from `deployment.embedded.host.user: signed`, as the Appspec says it. A `signed_user` key no Appspec has was read instead, so a kept runtime was never given the secret and answered every session *This runtime was not given the secret …* (503), seen on r1. The test now builds its application from the real `AppSpec`.

## 1.3.101

- **A visitor talks to an application at its address** (STUDIO D-15) ([Session API, Visitors without an account](https://agent-runtimes.datalayer.tech/docs/apps/session-api#visitors-without-an-account)). Signed out, a hosted page or an embed of an `at:<slug>` address opened with its prompt, but a message went to a route the visitors' runtime does not publish. Two causes, both fixed. *Runtime:* the visitors' runtime made an address's agent only at the first message, and until then held no plugin of the application, so the page's plugin of the pair stood down; `POST /api/v1/apps/visitors/agent` now makes it for a visitor's token and says `{agent, app_id}`, and the page (`DatalayerAgentBridge`, `ensureVisitorAgent`) asks it before it follows the runtime, saying the runtime's refusal in its sentence. *Page:* the chat named the agent by the application's id, which a visitor's `at:` token does not reach; it names `at-<slug>` (`appAgentOf`, `visitorAgentOf`), and an application's chat speaks to its session API whether or not its plugin is up — never to the bare `/api/v1/ag-ui/` route. The sandbox service passes an error's reason through to the chat. Tests: `test_app_visitors` (+4), vitest `visitor-token` (+4), `app-renderer` (+3), `datalayer-agent` (+1), `chat-view-application` (+1). The e2e suite's element mount embeds the address `E2E_ADDRESS` names, the same application as the hosted mount, and an example only when none is named.

## 1.3.100

- **An application is a Reactor plugin, extended in Reactor's vocabulary** (STUDIO P-35) ([Python applications, Extending with Reactor](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)). The runtime holds one `PluginPlatform` (`plugins.PLATFORM`: the catalogue's plugin and each configured application's extension `loop-app-<id>`), and each `AppHost` holds its own for an application's code. An `Application` has its `manifest` and is delivered as its `extension()`, registered and taken away with Reactor's public calls; its author contributes to or extends any point (`app.contribute`, `app.extend`), declares points other plugins extend (`app.contribution_point`, read by `session.contributions`), composes other plugins (`app.uses(plugin, tools=...)`, their named agent tools given to its agent as its rules decide), writes Reactor commands (`@app.reactor_command`, `app.command(run=...)`) and routes (`@app.route`, mounted by `app.mount` and `loop apps run --web`). The packaged entry point resolves to `app.extension()`. Example: `examples/reactor-extensible`. `datalayer_reactor>=1.0.5` is a dependency of the package.
- **A runtime that refuses an application says so once** (STUDIO D-21): `ApplicationRefused`, with the runtime's sentence as its reason, not asked again; a runtime that does not answer stays `SessionNotStarted`.

## 1.3.99

- **An embedded application is offered the page's functions** (STUDIO D-10) ([Embedding, The page and the application, talking](https://agent-runtimes.datalayer.tech/docs/apps/embedding#the-page-and-the-application-talking)). Seen on a host page on 2026-10-10: the run carried no tool at all, so the agent never had `host_<name>` or `host_context`. Two causes, both fixed. The chat sends the page's own tools (`chatExtras.frontendTools`) with each run to an agent on a server and runs them when it calls one; before, they were only handed to an in-page agent. And `element.functions` and `element.context` set by the page before the async script defined `<datalayer-app>` hid the element's own setters; they are now taken over as it is constructed (`adoptPropertiesSetEarly`). Tests: `embed-config` (+2). `examples/embed-host` takes `spec=` (an Appspec's address, run instead of `app`) and `user-token=`.
- CI: `loop apps package`'s build tools (`build`, `hatchling`) are in the `cli` extra; tests read a refusal without CI's colours and the embed's sentence without its stylesheet.

## 1.3.98

- **A Python application's page side, as a package** (STUDIO P-29) ([Python applications, Its page side, as a package](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)). `loop apps package app.py` writes the distribution `loop-app-<id>` and builds its wheel: the application's module, the files its custom components name from its folder under `share/datalayer/reactor/extensions/loop-app-<id>/`, and a `datalayer.reactor.extensions` entry point — a Reactor extension whose Python half is the application's server plugin and whose page half requires it (F-15). The server it is installed beside serves it at `/api/v1/apps/<id>/plugins/frontend-extensions` and `/api/v1/apps/<id>/reactor-extensions/loop-app-<id>/<path>`; the page installs it (`bootstrapExtensions`, the `loop.app.files` point) and draws a component of a folder file from there, in the same sandboxed frame. Requires `agentspecs>=0.0.70`.
- **A floating embed bridges the page once** (STUDIO P-25, P-27): in a bubble, a panel or the assistant, each window message of a turn reached the page twice.
- mypy clean again: `SceneStore.create_scene` (was `create`, which shadowed `Deployments.create`).

## 1.3.97

- **A step that streams, and tool calls as steps** (STUDIO P-31, P-33) ([Python applications](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)). `await step.stream(pieces)` writes a step's output as the model writes it — the terminal under the step's line, the Session API as `loop.step` again for each piece, the chat redrawing the row in place; every tool call of a session's agent is a `tool` step of its own, in this process and on a runtime, started when the model makes it and ended with its result or why it failed, nested in the step the code was in.
- **A blank agent this process can build** (STUDIO P-32): `example-blank` (agentspecs 0.0.69), a model and nothing else; `loop apps init --python` writes it. Per-call model settings: `session.agent.run/stream(..., model_settings=...)`.
- **Chainlit's documentation, rebuilt** (STUDIO P-27): text to SQL from words, conversational document QA, a PII guard, in `examples/chainlit-parity`.
- **A host function decided by its rule on the runtime too** (STUDIO D-10): the runtime decides `host_<name>` by the rule naming it, as the page does, and shows its model none left to the person, no `host_` tool the Appspec does not name, and no `host_context` when the Appspec passes nothing.
- **A page served by its own server runs there again** (STUDIO P-08, P-25): *Local* is held on the web only when no server is named, so `loop apps run --web` and `app.mount` pages talk to their own agent-runtimes server, not to the visitors' runtime (a regression of 1.3.96).
- **`loop scenes push` keeps the spec as the Studio's item spells it** (STUDIO P-30): a `talks_to` kept as written was read in the Studio as no link.
- **`npm run build` makes `dist-embed/` too**, and `make dist-embed` builds it alone from source; the release and the pull-request build check it rather than build it twice.
- **The suite's bundle from anywhere** (STUDIO D-15): `E2E_EMBED_URL` names where the element's bundle is served (the landing's `/embed/` unless said), and the probe skips the element's mount when `datalayer-app-main.js` comes without `Access-Control-Allow-Origin`.
- Requires `agentspecs>=0.0.69`.

## 1.3.96

- **An application served on this machine, with hot reload** (STUDIO P-08) ([CLI](https://agent-runtimes.datalayer.tech/docs/cli)). `loop apps run app.py --web --watch` serves the application in the embed's page at `http://127.0.0.1:8000/app`; a change that builds reloads the page with the new code, one that does not is said in a band at its foot and in the terminal while the last good version keeps running. The embed's loader declares `__webpack_public_path__` before importing its module, without which no application loaded on any page.
- **A scene and a stage written in Python** (STUDIO P-30) ([Python applications](https://agent-runtimes.datalayer.tech/docs/apps/python-applications)). `loop.scene(...)` and `loop.stage(...)` beside `loop.app(...)` write agentspecs' scene spec and are refused in its sentences; `loop scenes rehearse scene.py`, `loop scenes build scene.py` (its `loop.scene/v1` YAML) and `loop scenes push scene.py` (kept in the Space as the Studio keeps a scene). Example: `examples/scene-in-python`.
- **Chainlit's cookbook, rebuilt** (STUDIO P-27): document QA, text to SQL, an assistant with tools, a file analysis, a voice assistant and a copilot in a page, in `examples/chainlit-parity`.
- **The agent's toolbox is a contribution point** (STUDIO C-20): `loop.canvas.part` (`apps/core/canvasParts`), contributed by `apps/plugins/canvas-parts` — every server, skill and chat model of the catalogue, and rules, tests and events — each with an example the Appspec takes; an organization turns a source off as it turns off the Canvas's blocks.
- **A scene is checked in the browser as `loop` checks it** (STUDIO S-10): a scene's checks and its reader live beside an application's (`apps/apps/sceneChecks`, `sceneYaml`), in agentspecs' words — a scene of the wrong shape is refused rather than crashing the reader, a cast under a team is judged on what was written, and a member that is one of the person's own applications by what it truly reaches. Local is shown and held on the web.
- The apps and scenes catalogues follow agentspecs 0.0.68: the four scenes as they were rehearsed on r1 (STUDIO A-14). Requires `agentspecs>=0.0.68`.

## 1.3.94

- **A session woken for a person's mailbox reads it in their name** (STUDIO W-03) ([Inbox triage, the session a message wakes](https://agent-runtimes.datalayer.tech/docs/apps/inbox-triage); [Session API, Start](https://agent-runtimes.datalayer.tech/docs/apps/session-api#the-routes)). An event whose details name the `person` whose mailbox a message arrived in and their `grant` wakes a session the scheduler gives that person's token naming the application, minted from the grant for the one wake, in `X-Datalayer-Acting-Token` (`deployments.start_session(acting_token=)`, with the session request alone). The route holds it where a person's own session's token would be (`loop.apps.acting.given`), so the session's Gmail toolset and the gateway's servers in the person's name find it through `acting_token` as any session's do — one path; it is the only token the session acts with, and once ended nothing more is reached in their name, never the owner's key exchanged in its place. Refused (422): a session woken for a person without it, a token not minted for that person from that grant or ended, one given to a session not woken for a person. Tests: `test_app_woken_for_a_person` (8).
- **A public application embedded without a token runs for any visitor** (STUDIO D-07) ([Embedding, Where the application comes from](https://agent-runtimes.datalayer.tech/docs/apps/embedding#where-the-application-comes-from)). `<datalayer-app app="web-research">` or `app="<address>"` with no token reads what it is as Datalayer's pages read it for somebody signed out — an example the visitors' runtime keeps warm from the bundle's catalogue, an address from ai-agents with no credentials — and runs it on the visitors' runtime in every mode (inline, bubble, panel, assistant): the conversation mints a visitor's token from ai-inference for that one application and talks to the runtime with it, nothing launched, nothing kept (`visitorApp.ts`; `AppEmbed`'s `visitors`). An application a visitor may not talk to (a private address, one that reaches its owner's connections or documents, an example not kept) says so in one sentence in ai-agents' words, naming the embed token, before anything is drawn; a decision is framed as before. Tests: `visitor-app` (8), `embed-element` (+2, CI). Not seen in a browser.
- **The host's functions, from a runtime's side, and a host page to try them** (STUDIO D-10) ([Embedding, Trying it on a host page](https://agent-runtimes.datalayer.tech/docs/apps/embedding#trying-it-on-a-host-page)). `examples/embed-host/index.html` is a plain page on an origin of its own that writes the script tag and the element, passes `context`, offers `open_ticket` and logs every event; served with `python3 -m http.server 8788 --directory examples/embed-host`, told what to embed by its query. `host-bridge-runtime.test.ts` (7) drives the bridge as a runtime drives the chat's frontend tools: a call of `host_open_ticket` refused before the page is called under no rule or *leave it to me*, the person asked under *ask me first* and *do it if I asked* (a no refuses it), done with nobody asked under *do it*, each result sent back to the runtime as the tool's result.
- **One end-to-end suite, two mounts** (STUDIO D-15) ([Embedding, One suite, two mounts](https://agent-runtimes.datalayer.tech/docs/apps/embedding#one-suite-two-mounts)). `npm run test:e2e` (`e2e/mounts.spec.ts`, Playwright on the system Chrome, one page at a time) runs the same cases on the landing's hosted page (`/apps/<slug>`) and on the element on the host page above: the page loads with its conversation ready, a visitor's message is answered (one model request per mount), a table is drawn in that answer, an address a visitor may not talk to shows ai-agents' refusal and asks no model. `e2e/global-setup.ts` probes the landing, the rebuilt bundle at `/embed/`, the visitors' runtime and the addresses before any browser opens; what is not reachable skips with a sentence. Written and collected (8 skipped here: no dev server); not run against either mount.

- **The checks of a session's start run** (STUDIO R-06) ([Applications, Checks](https://agent-runtimes.datalayer.tech/docs/apps#checks)). The catalogue's three preflight Guards — `required-frame-guard`, `permission-guard`, `data-source-authorization-guard`, the ones `configuration-check` reads — are executed once per session before its model is first asked, on the Appspec: every context it names is there and enabled (an organization's own, its organization's); what it does needs only permissions its guardrail grants (`permissions_needed`); its connections, documents and Spaces are within the guardrail's data scope and no denied field is named. Before them, a credential-shaped string in what it tells its model stops the session. Every Guard's verdict is a `check` entry of the record (`stage: preflight`, `guard`, `passed`, its sentence; the in-flight and answer entries carry `guard` and `passed` too), and a failed Guard stops the session with its sentence, a Gate reading it or not. A Python application's session preflights the same way. `loop apps validate` and the Studio's instant checks no longer say the three are judged by a method the runtime does not run yet; `pipeline-report` says seven of its twelve checks cannot run yet. Tests: `test_apps_guards` (+8), `test_apps_record` (+3), vitest `app-checks` (+1).

- **A scene's rehearsal on Datalayer, and *Live* read from it** (STUDIO A-14) ([CLI, A scene's rehearsal](https://agent-runtimes.datalayer.tech/docs/cli#a-scenes-rehearsal), [Teams over A2A, Rehearsal](https://agent-runtimes.datalayer.tech/docs/apps/teams-over-a2a#rehearsal)). `loop scenes rehearse --cloud` launches each runtime member for its own application, so that the runtime is given the secrets its connections declare (R-19) — until now it launched the bootstrap agent and every member was refused for `DATALAYER_API_KEY` or `TAVILY_API_KEY` "not given", with the account's secrets untouched; a member the scene puts in the browser is played as the page plays it (`browser_agent`: model and prompt, no connections, skills or backend tools) instead of being refused; `--address <member>=<url>`, or the variable the scene's `deployment.addresses` names, rehearses a member where it is already served (a runtime kept with `--keep` once its key is minted, a deployment's stable address) and launches nothing for it; a runtime Datalayer refuses or does not set up in time is the member's sentence, not a traceback; with `--json`, stdout is the verdict alone. What a rehearsal of every beat on Datalayer finds is kept beside the specs as the catalogue scene's last (agentspecs 0.0.67's `write_played`, `<id>/rehearsal.json`), and *Live* is read from it in `loop scenes ls` (*Live*, *Not Live* with the verdict's day and sentence), in the generated catalogue (`played` on the scene spec) and on the landing's home page — never from a sentence written by hand. Tests: `test_scenes_rehearse` (+8).

- **A command's crash shows the error, not what it held**: a `loop` command that crashed printed Typer's pretty traceback with every frame's locals, a runtime's token among them. Every Typer app of the CLI (the root, each group, `chat`, and core's `executions`) says `pretty_exceptions_show_locals=False`; the traceback keeps its frames and lines, never the variables. `test_cli_tracebacks_hide_locals` holds it: a crashed command's stderr has no locals panel, no local's name or value.

- **A key granted to a route is let through** (STUDIO A-14's second drill, 2026-10-08): the runtime's A2A gate read the key's task as a `task_uid` claim, which IAM never mints — the claim is `task_id` (IAM's `oauth_provider` since 2026-09-26, read as such by the gateway through `datalayer_common.auth.GRANT_CLAIMS`) — so every real key was refused as *granted to another route than <app>'s on this runtime* (403), the demo's Accounting among them. `task_prefix` is matched against `task_id` now, in the route gate and in `visitors_key_problem`; `test_apps_a2a`'s tokens carry the claim IAM does. The runtime image on r1 keeps the old gate until agent-runtimes is released and the image rebuilt.
- **What a runtime says is to set up does not stop a rehearsal**: `loop scenes rehearse --cloud` read the configure's `setup` notes — the catalogue's own, *The agent 'worker-accountant:0.0.1' is not enabled*, *The MCP server 'odoo-accounting:0.0.1' is not enabled* — as the member not set up, and ran no beat, where `loop apps run` prints the same notes and serves the application. They are the member's notes now (`StageMember.notes`, *Accounting, on its runtime: …* among the verdict's notes); a secret the runtime was not given stays a refusal of the configure, said as the member's sentence (`test_scenes_rehearse` 26 green).
- **`loop agents ls` lists an unmetered runtime**: its `expired_at` is `''`, not `None`, and the listing crashed on it (*could not convert string to float*); it says *Never*.

What changed for the people who build and use applications since 1.3.93 (the versions 1.3.75 to 1.3.93 are in their release commits).

- **Your own Python application runs on its deployment** (STUDIO R-14, P-24) ([Python applications, Where its code runs](https://agent-runtimes.datalayer.tech/docs/apps/python-applications#where-its-code-runs)). An `app.py` pushed with `loop apps push` is kept with its version and handed to the deployment's runtime when its agent is made (`app_code`): its `start`, `message` and `schedule` handlers run there — kept always on, on a tick, in a hosted session — with nobody present. The deployed version is the authority: a `SPEC` that says no version runs as the version stored; another application's code is refused; a deployment record without its code is refused a relaunch (deploy it again). The hosted page's model is called through ai-inference. Tests: `test_app_schedule_code`, `test_app_sessions`.
- **A test judged on its record, not its answer alone** (STUDIO V-08) ([Validate](https://datalayer.ai/docs/applications/validate)). The Evals engine reads each test's record back from ai-agents, names the check that stopped it (`blockedSays`), and hands the judge what the application did beside its answer; a record that cannot be read fails the test rather than grading its words. Tests written, not yet run on Datalayer.
- **The gateway's own tools held to the application's Spaces** (STUDIO R-25) ([Session API, A Preview held to its Spaces](https://agent-runtimes.datalayer.tech/docs/apps/session-api)). `gateway_toolsets_of_the_run` (`agent_runtimes.loop.apps.principal`, used by the AG-UI and Vercel AI transports): a session's run reaches the Datalayer MCP gateway as the application — a deployment with its principal's token, the person's for `as: user`, a Preview with its narrowed run token — never with the runtime's key; the gateway lists only the Spaces granted and refuses one not granted in the runtime's sentence. Test: `test_app_gateway_toolsets`.
- **The embed shrunk** (STUDIO D-08) ([Embedding](https://agent-runtimes.datalayer.tech/docs/apps/embedding)). `dist-embed` is a 0.6 kB loader (`datalayer-app.js`, which imports `datalayer-app-main.js` beside it), the element's module and lazy chunks under `chunks/`, with the stylesheet `datalayer-app.css`: the first load is 2.36 MB gzipped (from 15.7 MB) and 197 kB of CSS (from 4.2 MB), under a 2.5 MB budget checked by `embed-weight.test.ts` in the release and PR CI (`build:embed`, `vite.embed.config.ts`). The plugin graph left the `loopPlugins` preset: a host that shows it adds `GraphViewPlugin` (`./plugins/graph`), as the Loop Workspace example does; the landing's `LoopEmbed` no longer passes `graph`.
- **Gmail through Google Workspace** (STUDIO W-02) ([Inbox triage](https://agent-runtimes.datalayer.tech/docs/apps/inbox-triage)). The `google-workspace` MCP server reaches a person's Gmail in their own name, or the owner's, with the hour's token IAM holds from Google's consent — *can read*, or *can read and send* — never what Google gave Datalayer; a draft is held to 20,000 characters (`saving.DRAFT_LIMIT`). Off in the catalogue (`enabled=False`) until Datalayer's own Google project is in place.
- **Model prices in the catalogue** (STUDIO R-09): the models catalogue regenerated from agentspecs 0.0.66, each model with its price, so that a call is metered in credits at IAM (100 credits a dollar, provisional) and the Usage page says what each place of an application cost.
- **`loop apps deploy`** documented with every option ([CLI, Deploy](https://agent-runtimes.datalayer.tech/docs/cli#deploy-an-application-at-its-address)): `--version`, `--slug`, `--site`, `--visibility`, `--always-on`/`--not-always-on`, `--spend-limit`, `--a2a`/`--no-a2a`, `--visitors`/`--no-visitors`; `loop apps threads --limit`; `loop scenes ls --json` and `rehearse -e/-m/--keep`. Docs: `apps/python-applications` says the code runs on the deployment's runtime; `apps/session-api` says the gateway is held; `apps/index` and `apps/app-renderer` say the graph is a host's plugin; `apps/embedding`'s *Not done yet* no longer says the bundle is not built.

## 1.3.74

- **The Assistant examples**: *Chat Assistant* and *Chat Assistant Gallery* are now *Assistant* and *Assistant Gallery* (`AssistantExample`, `AssistantGalleryExample`; files, components, ids, headings), in a group of their own, **Assistant**, right before Chat (`exampleGroups`, extracted from the shell so the order is tested). No aliases: a stored old id falls back to the default example.
- **History lists the conversation** (LOOP T-23) ([History or current](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant#history-or-current)). Closed, a `history` balloon showed only the newest line; it now lists every message, the person's and the agent's, under *Conversation · N*, scrolled to the newest (`balloon.history`, `balloonHistoryOf`, `plainWordsOf`). `ChatFloating` hands the chat's messages to it; the gallery its sample conversation so far.
- **What goes with the words stays**: a notebook given showed only in `current`, and dropped out while a tool line was up; it now shows in either display, with a tool line or not (`SpeechBalloon`, the gallery's `balloonForPose`, `A2ATeamGraph`).
- **A large visual in the balloon** ([A large visual in the balloon](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant#a-large-visual-in-the-balloon)): `balloon.visual` (`BalloonVisual`: id, title, `render`) offers *Expand*; drawn into `expandTarget` (on `AssistantStage`, `ChatFloating`, a team's members), through a portal, scrolled to and focused, or, without one, in an 80% dialog that Esc closes. `expandOnArrival` draws it as it arrives. A notebook's large view is the one that runs, editable on the browser sandbox (`notebookBalloonVisual` → `TeamNotebook`, loaded only then). The team example names the area under its graph (`expandTarget`, `notebookTitle`) in place of its own `TeamNotebook`.
- Examples: *History* and *Expand into the page* are Primer `ToggleSwitch`es with their state in words; the gallery has an *Expanded here* area under the stage.
- Tests: vitest `balloon-visual` (new), `balloon-display`, `chat-floating-balloon`, `teamBalloon`, `assistantGallery`, `exampleRegistry`.

## 1.3.72

- **The balloon's two displays** (LOOP T-23) ([The floating assistant, History or current](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant#history-or-current)). `balloonDisplay: 'history' | 'current'` on `ChatFloating` and `AssistantStage`, `balloon` in the LOOP assistant plugin's config, and the Appspec's `interface.balloon` (agentspecs 0.0.42; `AppInterfaceSpec.balloon`, checked by `checkAppspec`, passed by `AppEmbed`).
  - `history` (the floating chat's default): closed, a peek of the newest words; open, the whole conversation under a header that counts it (*Conversation · 6*), scrolled, the composer last.
  - `current` (a team's default): only what is said or done now — *Thinking…*, the tool it calls, the answer as it is written, whole (four lines, nothing to scroll) — in a compact bubble edged with the accent, *Now* on it with a dot that breathes while it works; open, that line over the composer.
- **Tool calls in the balloon**, in plain words: *Using **list_invoices**…*, *Done: list_invoices*, *list_invoices failed* (`toolLine`: `newestToolLine`, `toolLineOfStep`, `toolDisplayName` — a runtime tool's display name, an MCP tool without its server), with the catalogue's mark. Closed, the peek is the tool line while the call runs, in either display; open in `current` it replaces the line; in `history` it is the chat's own tool line. Heard once as a call starts and once as it ends, from a live region of its own (`ToolLineAnnouncer`); `current`'s words are read out once they have all arrived.
- **A team speaks in `current` balloons** (`A2ATeamGraph`, `A2ATeamPersona.tool`): Sales says *Asking Accounting…* during `ask_accounting`, Accounting *Using list_invoices…* from the tool steps A2A carries (`toolOwnName`). A notebook Accounting gives shows in Sales' balloon read-only (`persona.notebook`, `NotebookPreview`): jupyter-react's `Notebook` with `readonly` on `ServiceManagerLess`, no kernel, no Pyodide, loaded only when one arrives, with *Open it below to run it*; a click there scrolls to and focuses `TeamNotebook` (`focusTeamNotebook`), which the team example now puts right under the graph.
- Examples: *Chat Assistant* has a History / Current switch; the *Chat Assistant Gallery* has both displays, *Use a tool* (running, done, failed) and *Give a notebook* (a small recorded notebook, read-only, jupyter-react), and the displays under its grid (`GalleryBalloons`).
- Pictures: `assistant-current` (new), `assistant-open` (its header), `assistant-gallery` (re-taken: the baseline predated the current wizard drawing). Tests: vitest `balloon-display`, `chat-floating-balloon`, `teamBalloon`, `loop-assistant`, `app-checks`. agentspecs>=0.0.42.

## 1.3.71

- **Unmetered runtimes on the platform's magic key** ([CLI, Datalayer](https://agent-runtimes.datalayer.tech/docs/cli)). With `DATALAYER_MAGIC_API_KEY` set in the environment, every runtime the client creates is sent it (`magic_api_key` on `POST /runtimes`) and the platform starts it unmetered: no credits, no expiry. Unset, nothing is sent; the key is never logged. `loop --cloud` and `loop apps run --cloud` then ask no minutes and check no credits. A runtime says whether it is unmetered (`RuntimeService.unmetered`). Tests: test_runtime_create_magic_key.

## 1.3.70

- **Output formats over A2A** (LOOP H-29) ([A team of applications over A2A, Output formats](https://agent-runtimes.datalayer.tech/docs/apps/teams-over-a2a#output-formats)).
  - An application's agent card declares the formats its answers come in, from its Appspec's `interface.outputs` (agentspecs 0.0.41): `defaultOutputModes` and its skill's `outputModes`, plain text when unsaid; `defaultInputModes` is `text/plain`. Needs fasta2a 2.1.1, which takes the card's modes and hands the worker the modes a request accepts.
  - The `A2AWorker` gives besides words what both its card and the caller name (`acceptedOutputModes`), as an artifact of that media type beside the text (`agent_runtimes.output.formats`). Accounting answers in Markdown and, to a caller that accepts one, in a Jupyter notebook.
  - **The notebook.** `write_notebook(title, cells)`, offered only in a run that accepts a notebook, and decided as reading by an application's rules (a visitor's run writes one too). The runtime keeps it only when it is valid nbformat 4 and runs offline in the reader's browser: pandas, numpy, matplotlib and the standard library only, no URL, no `open` or `__import__`, no magics, nothing that looks like a credential; a refused one is written again. It travels as one data part, `application/x-ipynb+json`, with a file name; while it is written, the call's status says `Writing a notebook…`, without the cells.
  - **In the browser.** `askA2APeer(peer, request, { accept })` sends `acceptedOutputModes` and resolves to `{ answer, artifacts }`, each artifact `{ mediaType, name, filename?, data }`; `answered` carries them. `a2aPeerTool({ peer, accept })` describes the formats the peer gives and takes an optional `formats` argument; the model is told a notebook came, not its content. `useA2ATeam({ accept })` keeps `artifacts` and the latest `notebook`; `NOTEBOOK_AND_WORDS`.
  - `TeamNotebook` draws a notebook a member gave, with *Download .ipynb*, on the browser sandbox (the loop notebook view's `EphemeralNotebook` on `createBrowserSandboxService`, Pyodide in the page), to run, change and add cells; the view, JupyterLab and Pyodide load only when a notebook is drawn. `AgentA2ATeamExample` accepts a notebook and shows it under the conversation in place of the report.
  - `EphemeralNotebook` asks for the runtimes list only when it has a pod to look up.
- Tests: pytest `test_output_formats` (the notebook valid, run in plain Python with pandas, every refusal), `test_apps_a2a` (the card's modes, the notebook over A2A to a caller that accepts it and not to one that does not, a visitor's); vitest `a2aPeer` (artifacts, `acceptedOutputModes`, `formats`), `teamNotebook` (the team keeps the notebook, the view loads only when drawn).

## 1.3.68

- **Odoo in the team's graph** (LOOP H-28) ([A team of applications over A2A](https://agent-runtimes.datalayer.tech/docs/apps/teams-over-a2a)). `A2ATeamGraph` draws a member's connections under it: each MCP server it reaches, half a member's size, with the server's mark (`SpecMark`), its name and *via MCP*, read from the Appspec by `teamConnectionsOf` (Accounting: Odoo, through `odoo-accounting`). The edge to a connection flows while the member calls one of its tools, with the tool's name on it; under reduced motion, the arrow and the words. `useA2ATeam` keeps the calls (`calls`, `callsAfter`), from each `working` event's `tool`.
- **Tool calls over A2A.** The pydantic-ai adapter's stream tells each tool call and its end (`tool_call`, `tool_result`), which the A2A worker publishes as `working` statuses; `askA2APeer` reads them into `A2APeerEvent.tool`.
- The graph no longer shows React Flow's credit (MIT).

## 1.3.67

- Voice: the *Voice chat* example asks Datalayer's speech service, `datalayer-speech` on r1, by default (`?speechUrl=` names another); the Voice page says so ([Voice](https://agent-runtimes.datalayer.tech/docs/chat/voice)).

## 1.3.66

- **The team's edge stays drawn** (LOOP H-28). `A2ATeamGraph` keeps its nodes as the same objects and reads each member from a context. Before, a node whose data changed with its character's state was measured again, and the edge vanished, or stayed out of place, until it was.

## 1.3.65

- **The team as a graph** (LOOP H-28) ([A team of applications over A2A](https://agent-runtimes.datalayer.tech/docs/apps/teams-over-a2a)).
  - `components/teams` (not in the components barrel: it brings React Flow): `A2ATeamGraph` draws a team of two in `@xyflow/react`, each member its character (`AssistantStage`) with its name and where it runs, one edge between them. The edge flows from the entry to the peer while the entry asks and back while the peer answers (`flowAfter`, from the `A2APeerEvent` phases), still otherwise; under reduced motion the arrow and the edge's words say which way. Nothing is dragged, panned or zoomed; the character, its balloon and its menu take the pointer as on a page.
  - `useA2ATeam` runs the entry's loop in the page with its one tool to the peer, and keeps the personas, the conversation, the exchange, the report and the flow. `AgentA2ATeamExample` uses both, and opens signed out.
- **Open to visitors over A2A** (LOOP R-30, H-28). `POST /apps/configure` takes `visitors: true` (with `a2a`), and optionally `visitors_key`, the owner's key granted to the route. The A2A gate then answers a visitor's token from ai-inference naming the application (`CallerVerifier.verify_visitor`, `/anonymous/whoami`). A visitor's run never acts with the visitor's token and only reads (`datalayer.visitor`, `visitor_refusal`). It keeps the runtime's credential, or `visitors_key`. Each visitor has 3 runs a day (`AGENT_RUNTIMES_A2A_VISITOR_TURNS`), and all visitors together 100 (`AGENT_RUNTIMES_A2A_VISITORS_TURNS_A_DAY`); past either, the gate answers 429 with a sentence.

## 1.3.64

- Voice, its first phases (VOICE.md V0 and V1; agentspecs 0.0.39) ([Voice](https://agent-runtimes.datalayer.tech/docs/chat/voice)).
  - **Push-to-talk in the composer.** Hold the microphone or `Ctrl`+`Space`, speak and let go (VO-10). A click starts and the next click stops; `Esc` cancels. The speech is found by Silero VAD and heard in the page, Moonshine for English and Whisper for French (VO-14), with transformers.js.
  - **Pinned models.** They come from Datalayer's origin only (`modelsUrl`, VO-49), each file checked against the SHA-256 the catalogue pins before it is read.
  - **What is said goes in the composer**, marked as said: `metadata.input: "voice"` with its language, model and where it ran, a small microphone on the message, and `forwardedProps.voice` over AG-UI (VO-27). The record keeps the turn as its transcript, marked `spoken` (VO-29).
  - **Consent.** One sentence before the first microphone prompt, remembered per application (VO-61). The microphone closes when the tab is hidden (VO-62), and its state is said in a polite live region (VO-67).
  - **Answers heard.** `ChatFloating`'s `voice` cuts the answer into sentences as it is written, read as plain words (VO-20). Each is said by ai-agents' speech service (Kokoro, decision 1) and played as it arrives (`ServerSpeaker`, `useSpokenAnswers`).
  - **The assistant speaks.** It is *speaking* while the audio plays (`voicing`, VO-22), its mouth opens with the sound in three openings (`mouthLevel`, still under reduced motion, VO-23), and while closed its balloon shows the sentence being said (VO-26). *Stop speaking* and `Esc` stop the voice, and so does opening the microphone.
  - **On the runtime.** An Appspec's `interface.voice` (`AppVoiceSpec`, VO-41) is answered by `/apps/configure` and `/apps/current`, resolved against the catalogue (VO-45). An application whose answers are heard runs with `VoiceCapability` (VO-44).
  - **The catalogue.** `agent_runtimes/specs/voices.py` and `src/specs/voices.ts` (`generate_voices.py`). `scripts/voice/pin_store.py` fills the pinned store and `serve_store.py` serves it locally.
  - **Measured.** `scripts/voice/measure.py` measures the models on the recorded fixtures (`tests/voice`, LibriSpeech and Multilingual LibriSpeech, CC BY 4.0), and `test_voice_wer.py` checks them within two points of their baselines (VO-50, VO-51).
  - **The example.** *Voice chat* (`VoiceChatExample`). New dependencies: `@huggingface/transformers` 4.3.0 and `@ricky0123/vad-web` 0.0.31, loaded only when the microphone is first used; `jiwer` for the tests.

## 1.3.62

- A team of applications over A2A (agentspecs 0.0.37, the team `sales-and-accounting`). *Accounting* on a runtime: `POST /api/v1/apps/configure` with `a2a` serves an application's agent with fasta2a at `/api/v1/a2a/agents/<id>/`. Its card is written from the Appspec, and A2A 1.0 is spoken through fasta2a 2.1. The route answers the machine itself and a key granted to it (an IAM task grant naming that runtime's route). The run acts with that key, which reaches the Datalayer MCP gateway (and `odoo-accounting`, a catalogue server that is the gateway) in place of the runtime's own key. `loop apps run … --a2a` serves it until Ctrl-C, and `-r/--runtime` runs it on a running cloud runtime. *Sales* in the browser: `runtimes/browser/a2aPeer` asks a peer with `@a2a-js/sdk` 1.x itself (now `^1.3.0`): `connectA2APeer` reads its card and `a2aPeerTool` is the tool an in-page agent asks with, its steps told as they happen. The *Agent A2A Team* example shows Sales (the paper clip) and Accounting (the wizard) as Office Assistant characters, Sales asking and Accounting working and answering, then the report. `examples/sales-accounting-a2a` serves Accounting on a running runtime and mints a temporary key, narrowed and confirmed before minting. Generated team specs carry `app`, `runsIn`, `talksTo` and `entry`. `useA2A` reads its own wire types ([A team of applications over A2A](https://agent-runtimes.datalayer.tech/docs/apps/teams-over-a2a)).

## 1.3.61

- The floating assistant's conversation is its balloon (LOOP T-23): a click on the character toggles it; open, it holds the conversation itself over the character, its tail toward it — the history as the chat draws it, the welcome first, an approval as a message with *Approve* and *Deny*, *Ask a decision* beside the composer, the Lexical composer last — with no header nor footer, a close in its corner that keeps the conversation, 60% of the window tall at most 560px, scrolled on the newest message. Closed, the character peeks: one short line that opens the conversation — a new message by its first words, dismissed with its ×; a notification; an approval with *Approve*, *Deny* and how many more, which stays until answered. `ChatBase` takes `welcome` and `trailingContent`. Pictured: `assistant-open`, and the peeks re-accepted ([The floating assistant](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant)).
- *Ask a decision*: a typed decision asked of Jev from the floating assistant — the situation, the question and its type (yes or no; a choice with its options; a score with its range) — through the runtime's `/api/v1/configure/inference/decisions`, the `decide` tool's route and token; the answer said in plain words with its confidence (`Urgent: yes (0.87)`, `Team: Billing (0.94)`, `Score: 4 of 5 (0.5)`). `ChatFloating` and `LoopAssistantPlugin` take the runtime as `decisions` ([Ask a decision](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant#ask-a-decision)).
- *Decide* (agentspecs 0.0.35): an application that answers by asking Jev typed decisions with `decide`, deciding a read; the *Decide* example draws it in the workspace on the Local target with the floating assistant beside it.

## 1.3.60

- Backend tools (agentspecs 0.0.36): the tools catalogue is `backend-tools`, beside `frontend-tools` — the tools that run on the runtime, in Python, apart from those the page runs. `agent_runtimes/specs/backend_tools.py` and `src/specs/backendTools.ts` in place of `tools.py` and `tools.ts`: `BackendToolSpec`, `BackendToolRuntimeSpec`, `BACKEND_TOOL_CATALOG`, `get_backend_tool_spec`, `getBackendToolSpec`, `BACKEND_TOOL_ACTIONS`, from `generate_backend_tools.py`. An agent, an application and a Frame name them under `backend_tools` (`backendTools`), and so does the request creating an agent (`POST /api/v1/agents`: `backend_tools` / `backendTools`; the TypeScript `AgentConfig.backendTools`). No alias: `tools` is refused by `Agentspec`, `CreateAgentRequest`, the Appspec reader and `generate_agents.py`. The chat's marks, the Tools menu and the application checks read the backend tools ([Agentspecs](https://agent-runtimes.datalayer.tech/docs/agentspecs)).

## 1.3.59

- The floating assistant's gallery (LOOP T-16, T-21 to T-27): the *Chat Assistant Gallery* example shows every character — Datalayer's four, the owl the example plugin contributes to `loop.assistant.character`, and Pixel, a test sprite of our own read through the clippy.js reader — in every state, stepped aside included, with its balloon (the latest saying, the approval with *Approve* and *Deny*, paused), in light and dark side by side and with reduced motion; one at a time, dragged, sent away and called back, or all at once as a grid. Static data, no agent: it opens signed out. The grid is pictured in both modes (`assistant-gallery-light`, `assistant-gallery-dark`) ([The floating assistant](https://agent-runtimes.datalayer.tech/docs/chat/floating-assistant), *The gallery*).

## 1.3.58

- Marks, seen: a brand from the Datalayer icons is drawn in its own colours (the Odoo accounting server's Odoo, the notebook tools' Jupyter); a reference screen, `tool-marks`, shows an MCP tool, a skill and a frontend tool each led by its mark, in every theme and both modes ([Chat](https://agent-runtimes.datalayer.tech/docs/chat), *Marks*).

## 1.3.57

- An application says what was verified, and how (LOOP E-14, agentspecs 0.0.33): `tests.verified` — what was tried live, what runs on recorded data, what is not verified yet — read and written by the Appspec (`AppVerifiedSpec`, `AppTestsSpec.verified`; `parseAppspec`, `dumpAppspec`) and carried by the examples' catalogue; *Report from a File*'s page takes its CSV with a File upload (E-01).
- `loop apps init` writes `tests/test_app.py` beside the spec (LOOP E-13): what the folder's CI runs with `pytest tests` — the instant checks, each test conversation said in full, and in Python that `app.py` still builds `app.yaml`. Documented on [the CLI page](https://agent-runtimes.datalayer.tech/cli#a-new-application) and *Python applications*.

## 1.3.56

- Marks: a tool call in the chat leads with the mark of whoever the tool belongs to — its MCP server, its skill, its frontend tool set or its runtime tool — the icon, else the emoji, else nothing (`chat/marks`: `marksOfToolCall`, `SpecMark`). An icon says its package, `<package>:<name>` (`@datalayer/icons-react:odoo`, `@primer/octicons-react:mark-github`, agentspecs 0.0.31's `agentspecs.marks`), and each package is imported the first time one of its icons is drawn. The Tools menu names the runtime's tools and the **Frontend tools** apart, each with its mark, and each MCP server's row with the server's; the Skills menu each skill with its own ([Chat](https://agent-runtimes.datalayer.tech/docs/chat), *Marks*).
- Catalogues regenerated from agentspecs 0.0.32: every MCP server, skill, tool and frontend tool set's icon in the new form, and `odoo-accounting`, the Datalayer MCP server with its `odoo-accounting` toolset alone (`mcp.datalayer.run/mcp?only=odoo-accounting`), icon `@datalayer/icons-react:odoo`. The MCP server, skill, tool and frontend tool generators refuse an entry whose marks break `agentspecs.marks`, naming it; `make specs` checks out and fast-forwards `feat/apps-next` unless told otherwise ([Agentspecs](https://agent-runtimes.datalayer.tech/docs/agentspecs)).

## 1.3.55

- The `loops` catalogue is now `strategies` (agentspecs 0.0.34): the control-loop reasoning strategies — data analysis, human-in-the-loop, OODA, plan → execute → critic — no longer share a name with LOOP and its applications. `agent_runtimes.specs.strategies` (`Strategies`, `STRATEGY_CATALOGUE`, `DEFAULT_STRATEGY`, `get_strategy`, `get_default_strategy`, `list_strategies`) and `src/specs/strategies.ts` (`StrategyId`, `getStrategy`, `getDefaultStrategy`, `listStrategies`), generated by `scripts/codegen/generate_strategies.py`; the types `StrategySpec`, `StrategyHuman`, `StrategyTermination`; the example `AgentStrategyExample`. No alias for the old names ([Agentspecs](https://agent-runtimes.datalayer.tech/docs/agentspecs)).

## 1.3.52

- What an application knows (LOOP U-24, R-29): an application whose Appspec names documents (`contents`, their Home Folder paths) gives its agent one tool, `search_documents`, which asks Contents for the passages of those documents that answer a question and gives each with its document and where in it, to answer from and cite — as its principal on a deployment, as the person in a Preview; it only reads, so a rule letting it read does not ask ([What an application knows](https://agent-runtimes.datalayer.tech/docs/apps/documents)).

## 1.3.51

- *Do it if I asked* decided from what the person approved in advance (LOOP U-25): before the person is asked, the runtime reads the application's standing approvals from IAM with the token it acts with, and a call one covers — its action, to whom it names, until it ends — runs without asking, its decision recorded with the person's words ([Applications in Python](https://agent-runtimes.datalayer.tech/docs/apps/python-applications), *Approved in advance*). Every approval a rule or a Gate asks names its application (`_app`, `_app_uid`), and the sidebar's rules card lists an application's approvals by them (LOOP U-19).

## 1.3.50

- An application's computer, beside its page (LOOP R-23, R-01b): the `app-computer` plugin in the workspace's sidebar shows the sandbox its agent runs on, live — its parts (browse, files, shell) on or off, what its agent ran on it from the conversation's tool calls, its files read-only to download — with *Take over* (what runs is interrupted, its agent's calls to its computer wait, the person runs Python on it) and *Hand back*, through `/api/v1/apps/agents/{agent}/computer`. Its three permissions gate the tools its agent is given: shell off gives no tool that runs code, files off none of its files' tools (`list_computer_files`, `read_computer_file`, `write_computer_file`, new), browse nothing — no sandbox has a browser yet ([Rendering an application](https://agent-runtimes.datalayer.tech/docs/apps/app-renderer), *Its computer*).

## 1.3.49

- A deployment's session is held only by whom its level lets in: before a session of a deployment is opened, and on each request of one, the runtime asks ai-agents with the caller's token, and refuses in its sentence whoever its owner does not let in — the principal's token it already holds is no reason to let anybody else talk to it. Nobody signed out holds a session of a deployment yet ([Who may open a deployment](https://agent-runtimes.datalayer.tech/docs/apps/session-api#who-may-open-a-deployment), D-02).

## 1.3.48

- An application's notifications are sent through the channels its Appspec names, not its agent's own: when a rule or a Gate asks a person through the tool-approval path, mail goes to the account's address and Slack to the incoming webhook kept as `SLACK_WEBHOOK_URL`, through ai-agents — as the application's principal on a deployment (its owner), as the person in a Preview. A channel not offered (Teams) is refused in the setup states' sentence, and every channel's outcome is kept in the record as a `notification` entry ([Its notifications](https://agent-runtimes.datalayer.tech/docs/apps/python-applications#its-notifications), R-37).

## 1.3.47

- The workspace's chat honours its host's `ChatAvailabilityProvider`: an application whose model is not offered, or not served today, is switched off with the reason in a sentence — as a sandbox's gate switches it off — rather than sent a question nothing answers. The Studio's Preview and the hosted page say so ([When it cannot answer](https://agent-runtimes.datalayer.tech/docs/apps/app-renderer#when-it-cannot-answer), R-27).

## 1.3.46

- An application remembers each person apart: a visitor at its address, signed in, under their own uid, apart from its owner and from each other; a visitor not signed in, or one of an embed, has nothing remembered nor read, and its agent is told so in a sentence — never the owner's memories in their place. The memory routes (`/api/v1/apps/memories/{app}`) answer the caller's own, owner or visitor ([Each person apart](https://agent-runtimes.datalayer.tech/docs/apps/memory#each-person-apart), R-36).
- What one application remembers of a person is read by another only when that person allows it: the agent reads its own, then what the applications allowed remember (`remembered_by`), the allowances read once per turn from the runtimes service with the caller's token; it writes under its own key only. `listRuntimeMemoryShares`, `allowRuntimeMemoryShare` and `stopRuntimeMemoryShare` in the runtimes client ([Shared with the applications a person allows](https://agent-runtimes.datalayer.tech/docs/apps/memory#shared-with-the-applications-a-person-allows), R-35). Needs the runtimes service 1.0.42.

## 1.3.45

- An application's agent keeps to its organization's contexts: told after its agent's prompt, the version the organization's owners saved of a catalogue Frame in place of the catalogue's, and the organization's own `org-…` contexts beside, read from Datalayer IAM with the caller's token; the organization said as `app_instance.organization_uid` (`AppInstance.organizationUid`) or `organization_uid` on `/apps/configure`. What cannot be read refuses the agent with a sentence; nothing falls back to the catalogue's. `loop apps validate --organization` and `checkApp(…, { organizationFrames })` check an `org-…` context against the organization's ([The contexts it works under](https://agent-runtimes.datalayer.tech/docs/loop#the-contexts-it-works-under), U-31, U-32). Needs agentspecs 0.0.28.

## 1.3.44

- What an application remembers, corrected in place: its owner changes one thing's words at `PATCH /api/v1/apps/memories/{app}/{memory_id}` — mem0 embeds them again — kept with who corrected it and when (`corrected_by`, `corrected_at`), which the list answers; and through the runtimes service with `correctRuntimeMemory` ([What an application remembers](https://agent-runtimes.datalayer.tech/docs/apps/memory), R-34).

## 1.3.43

- What an application remembers: it remembers when its Appspec names `mem0` — no longer its agent's memory — per person and application (`app:<its uid>`), its Preview and its deployments together, and only in conversations its owner opened; its owner reads it and forgets one thing or everything (no more than the count confirmed) at `/api/v1/apps/memories/{app}`, and through the runtimes service with `forgetRuntimeMemory` and `forgetRuntimeMemories`. `Mem0Backend` speaks mem0 2.x: its search and its list answered nothing before ([What an application remembers](https://agent-runtimes.datalayer.tech/docs/apps/memory), R-18).

## 1.3.42

- The embed's floating modes — bubble, panel, assistant — draw the application with `AppRenderer`, as inline does: its kind's preset, its layout and its page in `ChatFloating`'s window, whose button, balloon, blink, panel and assistant are kept and told by the workspace what it does and says (`conversation`, `onSaying`); the conversation wears the embed's colour mode; a panel in an embed stands at the viewport's full height ([Embedding an application](https://agent-runtimes.datalayer.tech/docs/apps/embedding), R-01).
- Beside an application's page, asked with `sidebar`: its rules and the approvals waiting for the person, answered there over the ai-agents approvals path, and its activity from its record, as the workspace's plugins `app-rules` and `app-activity` ([Rendering an application](https://agent-runtimes.datalayer.tech/docs/apps/app-renderer), R-01b).

## 1.3.41

- An application's face given as an emoji is drawn in Fluent Emoji, the same on every platform and from Datalayer's own bundle — in its chat's header and empty state and on the embed's floating button ([Presence](https://agent-runtimes.datalayer.tech/docs/chat/presence), T-20). Needs `@datalayer/core` with `lib/components/emoji` (core ed393f16).

## 1.3.40

- An application's chat sends the person's token to its session, which checks who is calling (R-04, R-32).

## 1.3.39

- The session API: an application's sessions started, messaged, acted on, given settings, stopped and resumed over the wire, streamed as AG-UI events; a file given goes to the session's sandbox, and a Python example's code runs on the runtime ([Session API](https://agent-runtimes.datalayer.tech/docs/apps/session-api), R-04).
- An application's page and embed speak to its agent through its session (R-04).
- The preset per kind, a decision on the workspace, and the page drawn with the blocks contributed (R-01, R-01b, R-02).

## 1.3.38

- A message from an application's page starts its turn: /status, /answer and /output follow it.
- A chat application publishes its conversation at /messages, and a Chat block sends through it; a widget takes text files at /files and an upload action (C-18, E-01).

## 1.3.36

- Datalayer's own components drawn: Table, Chart, File upload, Chat, Evidence and Form in `datalayerCatalog`, behind `visible_when` (C-18).
- An application's accent inside its conversation, inline, floating, in assistant mode and in the embed; the embed's character resolved from the enabled extensions (T-18, D-07); the chat's empty face at the page size; an application's chat without the agent counters.

## 1.3.35

- The floating assistant in the LOOP workspace, its character chosen by the application, then by the person, from what the enabled extensions contribute (T-24); `interface.assistant` takes any character id; agentspecs 0.0.27.

## 1.3.34

- `/models <id>` completes the models the runtime lists — what ai-inference serves on Datalayer — not the whole catalog.

- `/notebook` and `/document` on a cloud runtime (`loop --cloud`, `loop --runtime`, `loop connect`): the page opens through the relay, which adds your Datalayer token, with the runtime's Jupyter server at its ingress and the runtime's own Jupyter token, not the pod's `127.0.0.1:2300`; `loop connect` to a Datalayer runtime's address goes back to it as `loop --runtime` does ([Slash commands on a cloud runtime](https://agent-runtimes.datalayer.tech/cli#slash-commands-on-a-cloud-runtime)).
- The package carries the pages it serves: a wheel or sdist build without `index.html`, `agent.html`, `agent-node.html`, `agent-notebook.html`, `agent-document.html`, `loop.html`, `loop-example.html`, or a file one of them loads, fails (`hatch_build.py`), so `pip install` from a git checkout with no frontend built is refused. The release checks the wheel and the sdist for them; the Python test, style and docs workflows install editable.

## 1.3.33

- `/suggestions` shows each suggestion as its summary and its text, and sends the text of the one chosen, not the record; the `--suggestions` flag's are listed after the agent's. Under `loop --prompt` it lists them and asks nothing, so the next line is the next prompt ([Loop CLI](https://agent-runtimes.datalayer.tech/cli#slash-commands)).
- An agent created from an agentspec on Datalayer serves that agentspec's suggestions: `configure-from-spec`, as the pod companion calls it, kept no `suggestions` in the creation spec (`/api/v1/configure/agents/{id}/spec`, `/api/v1/configure`), so a cloud runtime had none. They are kept from the spec forwarded, else the library's, and survive a `/models` switch.
- `/decisions` asks Jev typed questions from `loop`: `/decisions "<text>" --yes-no "<question>"`, `--choice "<question>" A,B,C`, `--score "<question>" 1-5`, each answer in a line. The runtime asks them as the `decide` tool does, at its new `POST /api/v1/configure/inference/decisions`, with its own ai-inference token, on this machine and on Datalayer alike ([The decide tool](https://agent-runtimes.datalayer.tech/cli#the-decide-tool)).
- A runtime older than `loop` that answers without what a command reads (`/suggestions`, `/decisions`) is said to be older in a sentence, with both versions, never a raw `KeyError`; `/api/v1/runtime/status` says the package's version rather than `0.1.0`.
- When ai-inference decides which models can be used (`source` `ai-inference`), `/api/v1/configure/models` and `/api/v1/configure` list only the models it serves: none of the agent's it does not serve, no local model, no local runtime and no uncatalogued local install. `/models` and the chat's model menu follow; a switch to a model not listed is refused with what ai-inference serves ([Models on a cloud runtime](https://agent-runtimes.datalayer.tech/cli#models-on-a-cloud-runtime)). With the `local` provider nothing changes.

## 1.3.32

- LOOP G-08: [Rendering an application](https://agent-runtimes.datalayer.tech/loop/app-renderer) — `AppRenderer`'s props (`app`, `instance`, `onPresence`, `frame`), what it sets on `LoopEmbed` (`presence`, `showTokenUsage`, the layout's options) and how a host wins over it, and what the light home page says beside the chat: *Live*, the model, *nothing is kept*, and that its limit is not built (H-04).
- LOOP G-10: the docs' examples checked (`docs/scripts/check_examples.py`, run first by the docs workflow) — every name a page imports from `@datalayer/agent-runtimes` or `agent_runtimes` exists, and every link to another page resolves; a broken Markdown link fails the build (`markdown.hooks.onBrokenMarkdownLinks: 'throw'`). The plugin example of [Extending Loop](https://agent-runtimes.datalayer.tech/loop#extending-loop) imports its contribution points from `lib/apps/core`, where they are; the older pages that still name calls which no longer exist are listed in `docs/scripts/known_drift.txt`.
- LOOP R-09: an application's model calls name it — `X-Datalayer-App-Uid` and `X-Datalayer-Deployment-Uid` on every call through ai-inference.
- LOOP V-09: `loop apps validate --safety`, the safety set every application runs ([Loop CLI](https://agent-runtimes.datalayer.tech/cli)).
- A runtime on Datalayer calls its models through ai-inference with its user's token narrowed to ai-inference, given when it is assigned (`PUT /api/v1/configure/inference/token`); until then it says so and calls none — [Models on a cloud runtime](https://agent-runtimes.datalayer.tech/cli#models-on-a-cloud-runtime).
- The typed-decision models ai-inference serves, Jev on Workers AI (`cloudflare:wrk/typesafe/jev`), listed as Decisions: apart from the models an agent may run on (`decision_models` and `decisions_note` on `/api/v1/configure/models`, `decisionModels` and `decisionsNote` on `/api/v1/configure`), under their own heading in `/models` and, read-only, in the chat's model menu (`DecisionsGroup`); `/models cloudflare:wrk/typesafe/jev`, and any request naming a typed-decision model as an agent's, is refused in a sentence ("… answers typed decisions, not a conversation: an agent cannot run on it …") — [Models on a cloud runtime](https://agent-runtimes.datalayer.tech/cli#models-on-a-cloud-runtime), [Chat](https://agent-runtimes.datalayer.tech/chat).
- Decisions, never judgments, on the wire too, with agentspecs 0.0.26: ai-inference lists Jev under `decision_models` and asks it at `POST /decisions`; the catalogue's capabilities are `decisions` and `decider`, an Appspec decision's model is `decision_model` (`decisionModel`). No older name is read.
- The `decide` tool (agentspecs `tools/decide.yaml`, `agent_runtimes.tools.decisions.decide`, action class `read`): typed questions — `noul`, `choice`, `score` — about a text, asked of Jev (`cloudflare:wrk/typesafe/jev`) at ai-inference's `POST /decisions` with the runtime's ai-inference token; with none, or no ai-inference configured, it asks nothing and says why. *A Simple Agent* (`example-simple`, the default cloud agent) lists it and suggests three decisions — [Tools](https://agent-runtimes.datalayer.tech/cli#the-decide-tool).

## 1.3.30

- LOOP T-21 to T-28, the floating assistant played: a character one brings drawn from its sprite sheet (T-26), sent away and called back (T-27), the balloon inside the window (T-23), characters as contributions (T-24, T-21), the popup's ring still under reduced motion (T-28) — [The floating assistant](https://agent-runtimes.datalayer.tech/chat/floating-assistant).
- LOOP G-02, G-03, G-05, G-07, the documentation: [The floating assistant](https://agent-runtimes.datalayer.tech/chat/floating-assistant), [An application's presence](https://agent-runtimes.datalayer.tech/chat/presence), [UI plugins](https://agent-runtimes.datalayer.tech/agentspecs/ui-plugins), [Applications in Python](https://agent-runtimes.datalayer.tech/loop/python-applications).
- LOOP E-01, E-02, E-05: agentspecs 0.0.20 to 0.0.24 — the eleven examples, each written in Python building the spec beside it, and `APP_BUILT`, how each was built.
- LOOP R-01, R-01b, C-04: an application's page drawn beside its conversation (the `app-page` plugin) — [An application's page](https://agent-runtimes.datalayer.tech/loop#an-applications-page).
- LOOP R-01, T-07: an application drawn as its `interface.layout` says — `chat`, `page`, `split` — [An application's layout](https://agent-runtimes.datalayer.tech/loop#an-applications-layout).
- LOOP D-07, D-08, D-09, D-11, T-13: the embed, `<datalayer-app>` and `AppEmbed`, in four modes — [Embedding an application](https://agent-runtimes.datalayer.tech/loop/embedding).
- LOOP P-07, P-08, P-09: `loop apps build` writes the Appspec an `app.py` amounts to; `loop apps run` takes an `app.py` — [Applications in Python](https://agent-runtimes.datalayer.tech/loop/python-applications).
- LOOP L-01, L-02, L-04, L-06, L-07: `loop` asks where before which agent, and on Datalayer asks for an environment — [Loop CLI](https://agent-runtimes.datalayer.tech/cli).
- LOOP R-07: a session run to test an application says so. LOOP R-14: a deployed application's schedule wakes a session.

## 1.3.29

- LOOP T-21, T-22, T-23, T-25, T-27: the floating assistant, a fifth display mode, with Datalayer's own characters — [The floating assistant](https://agent-runtimes.datalayer.tech/chat/floating-assistant).
- LOOP T-26: a character one brings — readers of clippy.js maps and Microsoft Agent `.acs` files.
- LOOP P-01 to P-03: the application API in Python — `Application`, `AppHost`, `Session` — [Applications in Python](https://agent-runtimes.datalayer.tech/loop/python-applications).

## 1.3.28

- LOOP T-08, T-06, T-10: an application's presence — its line of status and the ring around its face, told to a host through `onPresence` — [An application's presence](https://agent-runtimes.datalayer.tech/chat/presence).
- Depends on agentspecs 0.0.19: the components the UI plugins render.

## 1.3.27

- LOOP C-13: the catalog of visual components hosted by the UI plugins, generated with them — [UI plugins](https://agent-runtimes.datalayer.tech/agentspecs/ui-plugins).
- LOOP T-08: an application meets the person as itself — its face, name and welcome, no token counters — [An application's presence](https://agent-runtimes.datalayer.tech/chat/presence).
- UI plugins by that name everywhere; `LoopEmbed` fills its host.

## 1.3.26

- LOOP C-13: the catalog of visual components generated for Python and TypeScript, and an application's components checked against it — [UI plugins](https://agent-runtimes.datalayer.tech/agentspecs/ui-plugins).
- An application's agent always served over AG-UI; an app item's version and a record's retention read from one place only.

## 1.3.25

- An application's session record sent before the stream it wraps is closed (LOOP R-07).

## 1.3.24

- The record sent when the final answer's stream ends (LOOP R-07).

## 1.3.23

- A session's record sent when its client goes before the run ends (LOOP R-07).

## 1.3.22

- LOOP T-10: a message arrives at the theme's pace.
- LOOP S-04, S-06, R-11: `loop apps pull`, `push` and `deploy` — the same Appspec in a repository and in the Studio, deployments kept by ai-agents — [Loop CLI](https://agent-runtimes.datalayer.tech/cli).
- LOOP R-06: an application's checks executed — nothing that looks like a credential leaves.
- LOOP R-07: the record of every session sent to ai-agents.
- An agent recreated under its id is the one that answers.

## 1.3.21

- LOOP T-06, T-12: a host names the theme the conversation wears — an application's is `loop`; the bubbles and the composer take their radius from the theme's shape tokens — [An application's presence](https://agent-runtimes.datalayer.tech/chat/presence).

## 1.3.20

- `AppRenderer` on the `datalayer` target runs the application on a runtime: allocated with a plain agentspec, its agent created there with `app_spec`, so that the runtime registers the application and decides every tool call by its rules. `LoopEmbed` and `loopPlugins` take `datalayerAgentSpecId` and `datalayerCreatePayload`, which the agents plugin hands to the agent it creates on a Datalayer runtime.
- The Appspec's JSON Schema in TypeScript (`APPSPEC_SCHEMA`), generated with the catalogue, for the editors of the page.

## 1.3.19

- `loop` on Datalayer offers the agent runtimes already running — with the minutes left on each — before launching another, so a runtime kept from an earlier session is reached again rather than paid for twice.
- `loop apps run FILE`: an application in the terminal, here or on Datalayer, asked the same way. The runtime is configured with the Appspec (`/api/v1/apps/configure`, where its rules decide every tool call), its starters are the suggestions, `--ask` answers one question and stops. Checked on this machine and on r1, where the configuration crossed the ingress with the person's token and the runtime verified it with IAM.
- `loop` asks where the agent runs: on this machine, or on Datalayer (`--local`, `--cloud`; the last answer is offered first; a script without a terminal runs here). On Datalayer it asks the environment and how long to reserve, with what that costs at most, launches the runtime, and reaches it through a relay on this machine that carries the person's token — the terminal and its slash commands are unchanged. When the session ends it asks whether to stop the runtime (`--keep` leaves it). Not signed in, it says how and offers to run here. One-shot queries (`loop --cloud "…"`) stop their runtime when answered.
- Docs: Docusaurus 3.10 with `@docusaurus/faster` (Rspack, SWC, Lightning CSS), as Reactor's docs; the docs workflow without conda — uv and Node, the package without its test and examples extras, npm downloads cached, and the site built once rather than again to publish it. Conda is gone from both Makefiles, and the conda recipe with them.
- CI: each check once — TypeScript built, type-checked and tested in Build alone (Node 24 on main), Python versions in parallel (two on a pull request), strict mode and the docs off pull requests that do not need them, and a newer push cancels the older run.

## 1.3.18

- Every route of an application checks who is calling (`agent_runtimes.loop.apps.callers`): `configure` and the list of applications take a person; `current` and `decide` a person, an embed token for that application, or nobody when the application is public. A token is verified by asking the platform — IAM's `whoami` for a person, Spacer's `/apps/{uid}/embedded` for an embed — never with the platform's signing secret, which a runtime is not given; a verified token is trusted until it expires, five minutes at most. A browser is answered only from the platform's origins and those the application's deployment names. A call from the machine itself needs no token; any other call that cannot be verified is refused, and a runtime that does not know where IAM is refuses.
- `avatar` and `banner` on an application: drawings chosen by name, as a person chooses theirs on their profile, read and written by `parseAppspec` and `dumpAppspec`, with the shape of a name checked by `checkAppspec`. Depends on agentspecs >= 0.0.17.

## 1.3.17

- Frames: a catalogue generated from `agentspecs/frames` (agentspecs 0.0.12) — `FRAME_CATALOGUE`, `getFrame`, `listFrames`; `get_frame`, `list_frames`. A Frame is owned, scoped context (rules, terminology, goals, style, norms, process) with the Guards an output has to pass; it arrives resolved, with what it inherits through `extends` and its `lineage`.
- Cogs: a catalogue generated from `agentspecs/cogs` — `COG_CATALOGUE`, `getCog`, `listCogs`, `cogsUsing`; `get_cog`, `list_cogs`, `cogs_using`. A Cog extends an agent spec and is equipped with Frames; its `spec` is a complete `Agentspec` (the agent, the Cog's changes, the Frames' skills, tools and MCP servers, and their context on the system prompt), beside its `frames`, `lineage` and `guards`.
- Ops, Guards, Gates and Tracks: four catalogues generated from `agentspecs/ops`, `guards`, `gates` and `tracks` (agentspecs 0.0.14) by `generate_ops.py` — `OP_CATALOGUE`, `GUARD_CATALOGUE`, `GATE_CATALOGUE`, `TRACK_CATALOGUE`, each with `get…` and `list…`. A `GuardSpec` **extends `GuardrailSpec`**: a Guard arrives with the policy of the guardrail it extends, and adds its category, stages, check and signals. An `OpSpec` arrives resolved, with its Cogs, its Guards by stage, its Gates and its Track in it.
- Applications: a catalogue generated from `agentspecs/apps` (agentspecs 0.0.15) by `generate_apps.py` — `APP_CATALOGUE`, `getApp`, `listApps`; `get_app`, `list_apps`. An `AppSpec` is the Appspec: an agent with an interface, rules, tests, a record and a deployment — a chat, a widget, a decision or a worker — with its face (`emoji`) and its `permissions`. It arrives with its layout and with what it names that is not enabled (`setup`).
- Action classes: what every tool does to the world — `TOOL_ACTIONS`, `SERVER_ACTIONS` (read, write, send, buy, delete, publish; `conditions` where a tool's effect depends on what it is asked). A tool nobody classed is unknown, and unknown is the most restricted.
- Rules: what an application does when its agent calls a tool — `agent_runtimes.loop.apps` (`behaviour_for`, `classes_of`, `tool_behaviours`, `tool_escalations`) and, in TypeScript, `behaviourFor`, `classesOf`, `toolBehaviours`, `toolEscalations`. One of `do_it`, `if_asked`, `ask_first`, `leave_to_me`; with no rule, reading is done and anything that acts waits for a person. `APP_BEHAVIOURS` and `APP_ESCALATIONS`, generated from agentspecs, are what both have to reproduce. Nothing calls them yet: this is the decision, not its enforcement.
- The Appspec as a file: `parseAppspec` reads a YAML or JSON document in the spec's own words into an `AppSpec`, tolerantly — a draft opens whole, with what is wrong said beside it — and `dumpAppspec` writes it back, keys in one fixed order and nothing at its default, so that the same application always writes the same document. `APP_SOURCES`, generated from agentspecs, is what both have to give back.
- The Appspec as a YAML file a person also edits: `readAppspecYaml` reports what YAML itself refuses with its line, and `writeAppspecYaml(app, previous)` writes an application **into** the file that is there — what did not change keeps its comments, its order and its quoting, an item of a list is followed by what identifies it, and a key that is new goes where the spec puts it. With no file to write into, the canonical document. Adds the `yaml` dependency.
- `decision_for` says why a tool call was decided as it was — the rule in its author's words, or the step that decided (not connected, left out by the connection, a read-only connection, an unclassed tool, the default) — with a sentence a person reads. `behaviour_for` is its behaviour.
- `AppRulesCapability`: an application's rules, enforced before every tool call — a pydantic-ai capability that does the reading, asks the person before what the rules say to ask about (through the tool-approval path), and refuses what is left to them, with the rule's own words. It decides a tool by its runtime name, `call_tool` on the tool it calls and its arguments, a catalogue tool by its id or method, and code (`execute_code`, `run_skill_script`) only when the application's shell is on, then on every tool the code names, for the worst each can do. Not attached to any agent yet.
- `loop apps validate PATH…`: the instant checks of an Appspec, in a terminal and in CI — what the spec refuses and every reference that does not resolve (*Not ready*, exit 1), what the application can do with no rule of its own and what it reaches with its builder's account (*Needs attention*, exit 2 with `--strict`), and what it names that is not enabled. `--json` for CI. Depends on agentspecs >= 0.0.16, whose checks it runs.
- Applications on a runtime: `POST /api/v1/apps/configure` makes the runtime's agent the one an application runs — its agent or Cog, its model and instructions, only the MCP servers it connects to, and its rules enforced before every tool call in place of the default approvals; an application its builder's checks refuse is refused (422) with the same sentences. `GET /api/v1/apps/current` names it; `POST /api/v1/apps/decide` says what it would do about a tool call without making it. `CreateAgentRequest.app_spec` carries the application through `configure-from-spec`, which no longer turns a 422 into a 500. A Cog is found where an agent of the library is looked for.
- `AppRenderer` and `defineAppPlugin`: an application rendered in the LOOP workspace — its agent created with the application in its payload, its starters on the empty chat, the conversation alone for a chat.
- `checkApp`, `checkAppspec`: the instant checks of an application in the page — what the spec refuses, references that do not resolve, what it can do with no rule of its own, what is not enabled — in the words `loop apps validate` uses, with no model call.
- Applications are Reactor plugins on the runtime too, as they are in the page: a `loop.app` contribution point (`agent_runtimes.loop.apps.plugins`), the catalogue contributed by agent-runtimes' own plugin, an application a runtime is configured with by a plugin of its own (`loop-app-<id>`, its manifest carrying its name and emoji), and its rules capability an *extension* of its contribution that another plugin can replace. `GET /api/v1/apps` lists the applications a runtime knows; `configure`, `current` and `decide` read them from the registry. Depends on `datalayer_reactor`'s Python contribution points.
- `AppRenderer` says that an application run by a team cannot run in the page yet, instead of throwing, runs under the application's id, and keeps its plugin across renders. `checkAppspec` reports what the reader would otherwise replace with a default (an unknown behaviour, layout or access, a `ready_at` outside 0 to 1, an origin with a path…), counts a rule on a versioned tool as a rule on that tool, and says what is not enabled for every reference, as agentspecs' `app_setup` does.
- `make specs` generates both (`generate_frames.py`, `generate_cogs.py`), resolving them with the `agentspecs` package of the clone it checked out, and checks out `main` by default.

## 1.3.16

- UI plugins: what was called a UI extension. A catalogue generated from `agentspecs/ui-plugins` (`UI_PLUGIN_CATALOGUE`, `getUIPlugin`, `listUIPlugins`; `get_ui_plugin`, `list_ui_plugins`); the agent field is `uiPlugin` / `ui_plugin`, and `uiExtension` / `ui_extension` are still read by the Python model. **The TypeScript `Agentspec.uiExtension` is renamed `uiPlugin`.**
- Models: Cloudflare Workers AI and AI Gateway in the catalogue and as a direct provider; `route`, `contextWindow`, `zeroDataRetention`, `requestLogging`, `pricing`, `providerUrl`, `billing` and `aliases` on a model; `AI_MODEL_ALIASES`, `getModel`, `isChatModel`, `listChatModels` (`get_model`, `is_chat_model`, `list_chat_models`): a chat picker leaves the typed-judgment models out.
- Model providers: `MODEL_PROVIDER_CATALOGUE`, `getModelProvider` — who serves a model, with its terms, privacy policy and data usage.
- Specs regenerated from agentspecs 0.0.11: four agents enabled (`example-simple`, `worker-crawler`, `jupyter-notebook-compactor`, `example-one-trigger`); of the Cloudflare models only Jev is available; the Tavily and Earthdata MCP servers enabled; events `agent-output`, `agent-assigned` and `generic`; the `csv` and `json` outputs and the `crawl` skill enabled; a memory spec says whether it is `enabled` (`mem0` is).
- Loop: `headerContainer` renders the header's controls in a host's own bar; `data-loop-fullscreen-root` takes that bar into full screen.

## 1.3.15

- Requires code-sandboxes 1.10.0 (one subpackage per provider, no flat module paths); the identity docs import `EvalSandbox` from `code_sandboxes`.
