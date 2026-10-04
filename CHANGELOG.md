# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

Each version names the LOOP boxes it carries (the plan's ids, as its commits
say them) and links the page that documents them, at <https://agent-runtimes.datalayer.tech>.

## 1.3.39

- The session API: an application's sessions started, messaged, acted on, given settings, stopped and resumed over the wire, streamed as AG-UI events; a file given goes to the session's sandbox, and a Python example's code runs on the runtime ([Session API](https://agent-runtimes.datalayer.tech/docs/loop/session-api), R-04).
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
- LOOP G-10: the docs' examples checked (`docs/scripts/check_examples.py`, run first by the docs workflow) — every name a page imports from `@datalayer/agent-runtimes` or `agent_runtimes` exists, and every link to another page resolves; a broken Markdown link fails the build (`markdown.hooks.onBrokenMarkdownLinks: 'throw'`). The plugin example of [Extending Loop](https://agent-runtimes.datalayer.tech/loop#extending-loop) imports its contribution points from `lib/loop/core`, where they are; the older pages that still name calls which no longer exist are listed in `docs/scripts/known_drift.txt`.
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
