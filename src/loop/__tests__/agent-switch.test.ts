/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Assigning a different agent has to reach the workspace.
 *
 * The picker used to keep the new name in its own state. That changed the
 * label in the header and nothing else: the chat kept talking to the old
 * agent's endpoint, the sandbox stayed connected as the old agent, and the
 * notebook kept the old id — a switch that looked like it happened and had
 * not, which is worse than one that visibly fails.
 *
 * So the id lives in the workspace, and everything that follows an agent reads
 * it from there.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { loopSurfaceId } from '../core';

const LOOP = join(__dirname, '..');

function read(...parts: string[]): string {
  return readFileSync(join(LOOP, ...parts), 'utf8');
}

describe('the workspace owns which agent it talks to', () => {
  it('offers a way to change it', () => {
    expect(read('core', 'index.ts')).toContain('setAgentId:');
  });

  it('holds it as state rather than passing the prop through', () => {
    // A prop straight through cannot be changed from inside, which is why the
    // picker had nowhere to put the new value.
    const shell = read('shell', 'LoopWorkspace.tsx');
    expect(shell).toContain('const [agentId, setAgentId] = useState(');
    expect(shell).toContain('setAgentId,');
  });

  it('still follows the host when it re-mounts on another agent', () => {
    // The host's prop is the session it means to open; a stale in-page choice
    // must not outlive it.
    expect(read('shell', 'LoopWorkspace.tsx')).toContain(
      'setAgentId(initialAgentId)',
    );
  });
});

describe('the picker', () => {
  const picker = read('plugins', 'agentspecs', 'AgentspecPicker.tsx');

  it('tells the workspace, not only itself', () => {
    expect(picker).toContain('workspace.setAgentId(agentId)');
  });

  it('does so only once the server has accepted the switch', () => {
    // Announcing a switch the server refused would leave the workspace
    // pointing at an agent that is not there.
    const guarded = picker.slice(picker.indexOf('if (response.ok)'));
    expect(guarded.indexOf('workspace.setAgentId(agentId)')).toBeGreaterThan(0);
  });
});

describe('what follows the agent', () => {
  it('is not the surface: the notebook stays put across a switch', () => {
    /*
     * The surface is named from the session, so the id the notebook renders
     * under is the same before and after. It used to be named from the agent,
     * which made every switch a remount: you changed who you were talking to
     * and lost the work you were talking about.
     */
    const shell = read('shell', 'LoopWorkspace.tsx');
    expect(shell).toContain('const surfaceIdRef = useRef(');
    expect(shell).not.toContain('loopSurfaceId(agentId)');
  });

  it('connects the sandbox as the workspace’s agent', () => {
    expect(read('plugins', 'agents', 'SandboxStatusBridge.tsx')).toContain(
      'service?.connect(agentId)',
    );
  });
});

describe('the Datalayer bridge', () => {
  it('calls the sandbox running when its ingress is, not when the agent is', () => {
    /*
     * `runtime.isReady` is about the agent being registered. A Datalayer
     * runtime serves kernels well before that, so reporting the agent's
     * readiness as the sandbox's left the workspace with a live server URL,
     * no notebook, no chat, and a kernel indicator saying `connected-dead`.
     */
    const bridge = read('plugins', 'agents', 'DatalayerAgentBridge.tsx');
    expect(bridge).toContain(
      'sandbox_running: Boolean(runtime.serviceManager)',
    );
    expect(bridge).not.toContain('sandbox_running: Boolean(runtime.isReady)');
  });
});

describe('the prompt', () => {
  const chat = () => read('plugins', 'chat', 'ChatView.tsx');

  it('is the Lexical one, which is the only one with an `@` menu', () => {
    /*
     * `InputPrompt` defaults to a plain textarea. Handing it
     * `mentionableAgents` compiles and renders and does nothing: the menu
     * lives in `InputPromptLexical`, so typing `@` produced no overlay.
     *
     * `promptVariant` rather than `variant`: the loop renders the footer
     * toolbar, which is chrome around the same prompt and forwards the choice
     * under that name.
     */
    expect(chat()).toContain('promptVariant="lexical"');
    expect(chat()).toContain('mentionableAgents={mentionable}');
  });

  it('carries the agent chooser and the context bar in its footer', () => {
    // Three of the four controls that decide what the next message does were
    // already there; the agent was the one that lived only in the header.
    expect(chat()).toContain('showAgentsMenu');
    expect(chat()).toContain('showTokenUsage');
  });

  it('takes focus, so the workspace opens ready to type', () => {
    expect(chat()).toMatch(/\n\s+autoFocus\n/);
  });
});

describe('the `@` menu', () => {
  const chat = () => read('plugins', 'chat', 'ChatView.tsx');

  it('offers the whole team, not only the members you are not', () => {
    // `subagentsFor(member)` alone made a team of two offer exactly one name.
    expect(chat()).toContain('team.members.map(entry => ({');
    expect(chat()).toContain('disabled: entry.id === member.id');
  });

  it('greys the member already being addressed rather than dropping it', () => {
    const plugin = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'chat',
        'prompt',
        'plugins',
        'AgentMentionPlugin.tsx',
      ),
      'utf8',
    );
    // Shown but not choosable: the keyboard walks `choosable`, the list
    // renders `matches`.
    expect(plugin).toContain(
      'const choosable = matches.filter(agent => !agent.disabled)',
    );
    expect(plugin).toContain('const agent = choosable[highlighted]');
  });
});

describe('a host that asked for no view chooser', () => {
  it('gets neither of them', () => {
    /*
     * There are two: the shell's `ViewSwitcher` and the chat's own strip.
     * Hiding the shell's and leaving the chat's is why the selector was still
     * on screen after being switched off.
     */
    const example = readFileSync(
      join(__dirname, '..', '..', 'examples', 'LoopWorkspaceExample.tsx'),
      'utf8',
    );
    expect(example).toContain('showSurfaceSelector: showViewSelector');
    expect(example).toContain('showViewSelector={showViewSelector}');
  });
});

describe('the prompt while the agent is working', () => {
  it('reads a busy flag it owns, not one round-tripped through the shell', () => {
    /*
     * `onSendReady` fires again during a send — ChatBase rebuilds `handleSend`
     * when the send starts — and it used to write `{ stop }` with no `busy`,
     * erasing the flag one tick after the agent began. The prompt came back to
     * life at exactly the moment it must not.
     */
    const chat = read('plugins', 'chat', 'ChatView.tsx');
    expect(chat).toContain('const [busy, setBusy] = useState(false)');
    expect(chat).toContain('isLoading={busy}');
    expect(chat).not.toContain('isLoading={workspace.viewControls.busy}');
  });
});

describe('the prompt component', () => {
  it('is one component, with the editor chosen by a prop', () => {
    const dir = join(__dirname, '..', '..', 'chat', 'prompt');
    /*
     * `InputPrompt` is the composed one — editor plus the menus under it —
     * and it renders `InputPromptBase`, which is where the choice between the
     * Lexical editor and the plain textarea is actually made. Two files, one
     * prompt: a caller never picks an editor directly.
     */
    const prompt = readFileSync(join(dir, 'InputPrompt.tsx'), 'utf8');
    expect(prompt).toContain('InputPromptBase');
    expect(prompt).toContain('variant={promptVariant}');

    const base = readFileSync(join(dir, 'InputPromptBase.tsx'), 'utf8');
    expect(base).toContain("variant === 'lexical'");
  });

  it('keeps each menu in its own module', () => {
    // They were private sub-components of one 1100-line file, which made the
    // file hard to read and each menu hard to find.
    const menus = join(__dirname, '..', '..', 'chat', 'prompt', 'menus');
    for (const name of [
      'AgentsMenu',
      'ToolsMenu',
      'SkillsMenu',
      'ModelSelector',
    ]) {
      expect(readFileSync(join(menus, `${name}.tsx`), 'utf8')).toContain(
        `export function ${name}(`,
      );
    }
  });
});

describe('group headings inside a menu', () => {
  it('carry no heading level, which Primer refuses', () => {
    /*
     * An ActionList inside an ActionMenu has `role="menu"`, where a group
     * heading is presentational. `as="h3"` there is not a warning — Primer
     * throws an invariant, and the overlay takes the page down with it.
     */
    const picker = read('plugins', 'agents', 'TeamMemberPicker.tsx');
    expect(picker).toContain('<ActionList.GroupHeading>');
    expect(picker).not.toContain('GroupHeading as=');
    /*
     * And the role it depends on, stated. Primer throws *both* ways: a list
     * with no role needs an `as` on its heading, a listbox or menu refuses
     * one. Dropping the `as` without saying what the list is swapped one
     * crash for the other.
     */
    expect(picker).toContain('role="listbox"');
  });
});

describe('a host that asked for no header', () => {
  it('gets no header row, and none of the plugins’ controls in it', () => {
    /*
     * The slot has to go unrendered, not be emptied: an emptied header is a
     * bordered strip of nothing, and a mounted slot keeps every contributed
     * control on screen with only the switcher missing.
     */
    const shell = read('shell', 'LoopWorkspace.tsx');
    expect(shell).toContain('{showHeader ? (');
    const header = shell.slice(shell.indexOf('{showHeader ? ('));
    expect(header.indexOf('LoopSlots.header')).toBeGreaterThan(0);
  });
});

describe('the editor beside the chat', () => {
  it('reopens after the sandbox that closed it comes back', () => {
    /*
     * A surface that stops being openable is closed, and the control
     * correctly reads None. What was wrong is that it stayed there: the
     * reader's choice had already spent the host's default, so a sandbox
     * blinking during a target switch emptied the workspace for good — the
     * control agreeing with an empty view, and neither agreeing with what
     * anyone had asked for.
     */
    const chat = read('plugins', 'chat', 'ChatView.tsx');
    expect(chat).toContain('setSuspendedId(active.surfaceId)');
    expect(chat).toContain('setSuspendedId(null)');
    /*
     * And the column stays while it is away. Removing it widened the chat to
     * the whole workspace and narrowed it again a second later, moving the
     * box the reader was typing in — twice, for an editor that was coming
     * back either way.
     */
    expect(chat).toContain('{active || waiting ? (');
  });
});

describe('the Local target', () => {
  it('asks for a colocated sandbox, not whichever server was last named', () => {
    /*
     * `jupyter-server` names where the sandbox is *relative to the agent* —
     * colocated — not which server it is. The manager reads a missing
     * `jupyter_url` as "keep what you have", so arriving here from the Jupyter
     * target left a local agent driving the anonymous server on prod1. An
     * empty string is the other intention, spelled differently.
     */
    const source = read('plugins', 'agents', 'switchable.ts');
    // Written across lines by the formatter, so matched on the two fields
    // that carry the meaning rather than on one exact spelling of them.
    expect(source).toContain("jupyter_url: ''");
    expect(source).toContain("jupyter_token: ''");
  });
});

describe('the editor picker', () => {
  it('reports the surface on screen, not the one requested', () => {
    /*
     * The picker read `surfaceId` — the request — while the column beside it
     * renders `active`, what that request resolved to. They agree once things
     * have settled and differ exactly while they have not, which is how the
     * control came to say None over a notebook. Reading the rendered surface
     * makes them agree by construction.
     */
    const chat = read('plugins', 'chat', 'ChatView.tsx');
    expect(chat).toContain(
      'active={active?.surfaceId ?? waiting?.surfaceId ?? NO_SURFACE}',
    );
  });
});

describe('the editor picker on arrival', () => {
  it('names the configured default before it has opened', () => {
    /*
     * The default needs a sandbox, and a sandbox takes as long as a kernel
     * takes to start — so for the first seconds of every workspace there is a
     * configured notebook that is not open yet. The control said None and
     * changed its mind, which reads as the setting not having taken.
     */
    const chat = read('plugins', 'chat', 'ChatView.tsx');
    expect(chat).toContain(
      'if (!surfaceChosen.current && surfaceId === NO_SURFACE)',
    );
    expect(chat).toContain('return wanted?.value;');
  });
});
