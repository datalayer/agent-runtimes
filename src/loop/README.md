<!--
  Copyright (c) 2025-2026 Datalayer, Inc.
  Distributed under the terms of the Modified BSD License.
-->

# Writing a LOOP plugin

The workspace is a prompt at the bottom and one view above it. Everything else
— the views, the commands, the header controls — is contributed by plugins.
This is how to write one.

A plugin depends on `@datalayer/loop-core` and on the reactor, never on the
shell. That is what lets the same plugin run in the standalone page, inside the
Datalayer application, and (later) inside a JupyterLab panel.

## The smallest plugin

```tsx
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopViewType } from '@datalayer/loop-core';

export const HelloPlugin = definePlugin({
  name: '@acme/loop-plugin-hello',
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'hello',
        title: 'Hello',
        order: 50,
        load: () => import('./HelloView'),
      },
      { id: 'hello', order: 50 },
    ),
  ],
});
```

```tsx
// HelloView.tsx — the default export is what the host renders.
import type { LoopViewProps } from '@datalayer/loop-core';

export default function HelloView({ workspace }: LoopViewProps) {
  return <p>Talking to {workspace.serverUrl}</p>;
}
```

Mount it and it is a tab.

**`load` is a thunk, not a component**, and that is not stylistic: a view is
downloaded when someone opens it. The document view pulls
`@datalayer/jupyter-lexical`, which initialises Lumino nodes at import time; a
plugin that imported its view eagerly would put all of that in the shell's
bundle for everyone, including people who never open it.

## Contribution points

| Point | For | Rendered by |
| --- | --- | --- |
| `LoopViewType` | a view the workspace may open | the view host, one at a time |
| `LoopCommand` | a slash command | the prompt, on `/name` |
| `LoopMention` | an `@` namespace | the prompt's typeahead |

And three slots, which render *everything* contributed rather than choosing:
`LoopSlots.header`, `LoopSlots.promptAction`, `LoopSlots.status`.

Reach for a **slot** when everything contributed should appear (a status chip, a
header control). Reach for a **point** when something has to pick.

## Saying when a view can open

```ts
canOpen: workspace => workspace.sandbox.state === 'running',
unavailableReason: () => 'Needs a running sandbox',
```

Give the reason. A greyed-out tab with no explanation is worse than no tab.

## Commands

```ts
contribution(
  LoopCommand,
  {
    name: 'hello',
    aliases: ['hi'],
    description: 'Say hello',
    group: 'Session',
    args: [{ name: 'who', description: 'Who to greet' }],
    run: async ({ workspace, argv }) => ({ content: `Hello ${argv || 'there'}` }),
  },
  { id: 'hello' },
);
```

`CommandContribution` is mirrored by `SlashCommandSpec` in Python, so the same
command is described the same way in the terminal and in the browser — even when
the two implementations differ, a Rich panel there and a React panel here.

## Toolbars are contribution points too

An editor offers a toolbar point; anyone fills it. The notebook plugin offers
`LoopNotebookToolbar` and renders whatever is on it — it does not know what
that will be:

```ts
definePlugin({
  name: '@datalayer/loop-plugin-notebook',
  contributionPoints: [LoopNotebookToolbar],   // declared, so the graph shows it empty
});
```

```tsx
const toolbarExtraItems = useEditorToolbarItems(LoopNotebookToolbar, {
  workspace,
  editorId: notebookId,
});
```

Filling one from another plugin:

```ts
contribution(
  LoopNotebookToolbar,
  {
    items: ({ workspace, editorId }) => [
      {
        key: 'my-action',
        type: 'button',
        ariaLabel: 'Do the thing',
        icon: ZapIcon,
        order: 300,
        onClick: () => workspace.prompts.submit('@Agent do the thing'),
      },
    ],
  },
  { id: 'my-action' },
);
```

`items` is called during the editor's render and must be pure — build the
descriptors, do the work in `onClick`, or render a component for anything that
needs state of its own.

This is why the chat's "Compact" and "Reproduce" buttons live on the *chat*
plugin rather than on the notebook. They only work because there is a
conversation to submit to, so having the notebook draw them meant the notebook
knew about the chat. Now switching the chat off takes its buttons off the
toolbar with it, and the notebook never mentions agents.

## Waiting until you are wanted

A plugin that only matters once somebody looks at a point can say so, and its
module is not fetched until then:

```ts
export const MyToolbarPlugin = defineLazyPlugin({
  name: '@acme/loop-plugin-my-toolbar',
  displayName: 'My toolbar',            // listed and describable meanwhile
  activationEvents: [onContributionPoint(LoopNotebookToolbar)],
  load: () => import('./plugin'),
});
```

Nothing has to name it. The notebook renders its toolbar, that read fires the
point's activation event, and the module arrives. A workspace where nobody
opens a notebook never fetches it at all.

The shell also announces the open view, so a plugin that only matters inside
one can wait for it — and stand down when it closes:

```ts
definePlugin({
  name: '@acme/loop-plugin-notebook-only',
  activationEvents: [onView('notebook')],
  deactivationEvents: [onView('chat')],
});
```

Standing down is not the same as being unticked in the sidebar. Unticking is a
person's decision and it sticks; deactivating says only that the reason for
running has passed, so the plugin keeps its place, keeps its module, and comes
back the next time one of its activation events fires. See the reactor's README
for the three states.

## Shipping several plugins as one thing

Splitting an editor from its toolbar is right, and it doubles the length of the
plugin list. An extension groups them back for the reader without joining their
fates:

```ts
export const NotebookExtension = defineExtension({
  name: '@datalayer/loop-extension-notebook',
  displayName: 'Notebooks',
  plugins: [NotebookPlugin, NotebookToolbarPlugin],
});
```

The sidebar lists them under one heading; each is still enabled, disabled and
drawn on the graph as itself. An extension has no lifecycle of its own — see
the reactor's README for why it is deliberately that thin.

## Depending on another plugin

Declare it, and read its build output:

```ts
import { CodeSandboxPlugin, useSandboxService } from '@datalayer/loop-plugin-code-sandbox';

export const MyPlugin = definePlugin({
  name: '@acme/loop-plugin-mine',
  dependencies: [CodeSandboxPlugin],   // pulled in whether or not the host mounted it
  // …
});
```

```tsx
const sandbox = useSandboxService();      // throws if the dependency is missing
const snapshot = useSignalValue(sandbox.snapshot);
```

The dependency lives in the extension graph rather than in a comment, which is
what makes it true.

## If your plugin owns something

A plugin that holds a connection, a kernel or a cache must say so:

```ts
definePlugin({
  name: '@acme/loop-plugin-mine',
  preserveOutput: true,     // enable() keeps what I built
  build: () => ({ connection: connect() }),
});
```

Without it, disabling and re-enabling hands every consumer a fresh instance
while the old one keeps the connection — a detached object nobody notices.

## State that belongs to the plugin, not to a component

Use reactor signals rather than React state for anything the plugin owns. The
owner of a sandbox is an extension, not a component, so it keeps working when
someone switches tabs:

```ts
const state = signal<'idle' | 'running'>('idle');
const ready = computed(() => state.value === 'running');
// in a component:
const isReady = useSignalValue(ready);
```

## Rules the shell holds you to

- **No providers.** The entry point owns the theme, the router and the query
  client; a plugin that mounts its own fights the host. See §3.5 of the plan.
- **Theme through the tokens.** Colours come from the Primer tokens the host set;
  no plugin reads `prefers-color-scheme` itself.
- **Keep the entry light.** Anything a plugin's `index` imports lands in the
  shell's bundle. Heavy things go behind `load()` or a dynamic `import()` inside
  a method — that is how the browser sandbox keeps JupyterLite out of the page
  until someone chooses it.
- **One navigation element.** The workspace has the view switcher and no
  settings tree; management belongs to the application around it.

## Testing one

A plugin is testable without a DOM, because contributions are data:

```ts
const reactor = buildReactorFromPlugins([MyPlugin]);
reactor.start();

expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual(['hello']);

reactor.disable('@acme/loop-plugin-mine');
expect(reactor.getContributions(LoopViewType)).toHaveLength(0);
```

If disabling your plugin leaves anything behind, something is holding a
reference it should have asked for.
