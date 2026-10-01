# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->

## 1.3.16

- UI plugins: what was called a UI extension. A catalogue generated from `agentspecs/ui-plugins` (`UI_PLUGIN_CATALOGUE`, `getUIPlugin`, `listUIPlugins`; `get_ui_plugin`, `list_ui_plugins`); the agent field is `uiPlugin` / `ui_plugin`, and `uiExtension` / `ui_extension` are still read by the Python model. **The TypeScript `Agentspec.uiExtension` is renamed `uiPlugin`.**
- Models: Cloudflare Workers AI and AI Gateway in the catalogue and as a direct provider; `route`, `contextWindow`, `zeroDataRetention`, `requestLogging`, `pricing`, `providerUrl`, `billing` and `aliases` on a model; `AI_MODEL_ALIASES`, `getModel`, `isChatModel`, `listChatModels` (`get_model`, `is_chat_model`, `list_chat_models`): a chat picker leaves the typed-judgment models out.
- Model providers: `MODEL_PROVIDER_CATALOGUE`, `getModelProvider` — who serves a model, with its terms, privacy policy and data usage.
- Specs regenerated from agentspecs 0.0.11: four agents enabled (`example-simple`, `worker-crawler`, `jupyter-notebook-compactor`, `example-one-trigger`); of the Cloudflare models only Jev is available; the Tavily and Earthdata MCP servers enabled; events `agent-output`, `agent-assigned` and `generic`; the `csv` and `json` outputs and the `crawl` skill enabled; a memory spec says whether it is `enabled` (`mem0` is).
- Loop: `headerContainer` renders the header's controls in a host's own bar; `data-loop-fullscreen-root` takes that bar into full screen.

## 1.3.15

- Requires code-sandboxes 1.10.0 (one subpackage per provider, no flat module paths); the identity docs import `EvalSandbox` from `code_sandboxes`.
