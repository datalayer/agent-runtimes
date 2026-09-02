/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat view: a conversation, a prompt, and whatever editors plugins add.
 *
 * The prompt lives here rather than in the shell. It is the chat's input — a
 * workspace with no chat plugin should have no input box — and putting it in
 * the base meant every workspace carried one whether or not anything answered
 * it. Slash commands still work, because dispatch stayed with the workspace:
 * `workspace.submit` sees every command every plugin contributed, which no
 * single plugin can.
 *
 * The editors beside the conversation are contributed, not built in. A notebook
 * and a document are what the conversation is *about*, so they belong next to
 * the reply rather than one tab away — and this view holds the point they
 * arrive through without knowing what either of them is.
 *
 * @module loop/plugins/chat/ChatView
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, IconButton, SegmentedControl, Text } from '@primer/react';
import { useColorPalette } from '@datalayer/primer-addons';
import { ScreenFullIcon, ScreenNormalIcon } from '@primer/octicons-react';
import { signal } from '@datalayer/reactor';
import {
  useContributions,
  useSignalValue,
  useGate,
  useReactorPlatform,
  ReactorLazy,
  ReactorSlot,
  useSlotComponents,
} from '@datalayer/reactor/react';
import { ChatBase } from '../../../chat/base/ChatBase';
import { AnonymousKeyExpired } from '../../../components/anonymous/AnonymousKeyExpired';
import { browserProtocolConfig } from '../../../runtimes/browser';
import { useBrowserInference } from '../../../hooks/useBrowserInference';
import { getAgentspecs } from '../../../specs/agents';
import { useNotebookTools } from '../../../tools/adapters/agent-runtimes/notebookHooks';
import type { ProtocolConfig } from '../../../types/protocol';
import {
  targetRunsAgentInPage,
  type SandboxTarget,
} from '../agents/switchable';
import { agentIcon } from '../agents/agentIcons';
import { subagentsFor } from '../agents/team';
import { useOptionalTeamSelection } from '../agents/useTeamSelection';

/**
 * Stands in for a workspace with no team.
 *
 * `useSignalValue` needs a signal on every render, and a hook cannot be
 * skipped for the ordinary single-agent case.
 */
const EMPTY_SELECTION = signal('');
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from './index';
import {
  InputPrompt,
  type FooterAgent,
} from '../../../chat/prompt/InputPrompt';
import { useAgentRuntimeContextSnapshot } from '../../../stores';
import { useIAMStore } from '../../../state';
import { useConfig } from '../../../hooks/useConfig';
import { useSkills, useSkillActions } from '../../../hooks/useSkills';
import type { ContextSnapshotData, ModelConfig } from '../../../types';
import { AI_MODEL_CATALOGUE } from '../../../specs/models';
import {
  LoopAgentGate,
  LoopChatSurface,
  canOpenView,
  type ChatSurfaceContribution,
  LoopSlots,
  useLoopPromptStore,
  type LoopViewProps,
} from '../../core';

type ChatControls = { send: (message: string) => void; stop: () => void };

/** No editor: the conversation on its own. */
const NO_SURFACE = '';

/**
 * How fast the full-screen control breathes once it starts asking.
 *
 * Slow enough to read as breathing rather than blinking — a fast pulse on a
 * small control reads as an error state, and this one is an invitation.
 */
const FULLSCREEN_HINT_PERIOD_MS = 1400;

export default function ChatView({ workspace }: LoopViewProps): JSX.Element {
  /* The active theme's own colours. Read from the store rather than a
     provider, so a workspace mounted without the addons theme still gets the
     default palette instead of throwing. */
  const palette = useColorPalette();
  const controlsRef = useRef<ChatControls | null>(null);
  const { setViewControls } = workspace;
  const [transient, setTransient] = useState<ReactNode>(null);
  // Read from the reactor rather than taken as a prop: the placeholder and the
  // default editor are the chat plugin's own configuration, so a host sets them
  // where it sets anything else about this plugin.
  const reactor = useReactorPlatform();
  const config = reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME);
  const placeholder =
    config?.placeholder ?? 'Ask anything, type / for commands or @ for mention';
  const defaultSurface = config?.defaultSurface ?? 'notebook';

  /*
   * The default editor is the opening selection, not something switched on
   * later.
   *
   * It used to be applied by an effect that waited for the surface to become
   * openable, which meant the picker read `None` until a sandbox existed —
   * a workspace configured for the notebook opened saying it was configured
   * for nothing. What the host configured is true from the first render; what
   * the surface can do about it yet is the surface's business.
   */
  /*
   * Nothing open yet, whatever the host asked for.
   *
   * Opening the default on the first render puts an editor on screen before
   * its surface exists — plugins arrive as they activate — and before the
   * sandbox it needs is running. What the reader saw then was not the notebook
   * but the notebook's "needs a running sandbox" placeholder, which is a worse
   * answer than an empty chat that fills in a moment later.
   *
   * The effect below opens it the moment it can actually be opened.
   */
  const [surfaceId, setSurfaceId] = useState<string>(NO_SURFACE);

  /**
   * Whether the reader has chosen a surface themselves.
   *
   * Once they have, the default is spent. Without this it re-applies every
   * time a new surface lands — so closing the notebook would reopen it as soon
   * as any other plugin activated, which reads as the close button not working.
   */
  const surfaceChosen = useRef(false);

  const surfaces = useContributions(LoopChatSurface);
  // Asked, not assumed: the chat cannot know whether anything is listening,
  // and whichever plugin does answers the gate. Re-asked on every render with
  // the live workspace, so switching the sandbox switches the prompt.
  const usable = useGate(LoopAgentGate, workspace);
  /* The sandbox's answer. It is not the only thing that can close the chat —
     an anonymous visitor's trial key runs out too — so the two are combined
     further down, once the key is known. */
  const gateBlocked = !usable.allowed;
  const gateReason = gateBlocked
    ? (usable.reason ?? 'Chat is unavailable for this sandbox')
    : undefined;

  // Stable: ChatBase calls these in effects, and a new identity every render
  // would make it re-publish on every render.
  /*
   * Whether the agent is working, held here rather than read back from the
   * shell.
   *
   * It used to live only in `workspace.viewControls`, written by two
   * callbacks that each replaced the whole object — and `onSendReady` fires
   * again during a send, because ChatBase rebuilds its `handleSend` when the
   * send starts. So the sequence was: loading true, then a fresh
   * `{ stop }` with no `busy` at all. The prompt went live again one tick
   * after the agent started, which is exactly when it must not be.
   *
   * Local state, and the shell is told from one place below.
   */
  const [busy, setBusy] = useState(false);
  const [sendReady, setSendReady] = useState(false);

  const handleSendReady = useCallback((controls: ChatControls | null) => {
    controlsRef.current = controls;
    setSendReady(!!controls);
  }, []);

  const handleLoadingChange = useCallback((next: boolean) => {
    setBusy(next);
  }, []);

  // One writer, so neither fact can erase the other.
  useEffect(() => {
    setViewControls(
      sendReady ? { busy, stop: controlsRef.current?.stop } : null,
    );
  }, [busy, sendReady, setViewControls]);

  // Stop reporting when the view goes away, or the shell would keep a stop
  // button for something that is no longer there.
  useEffect(() => () => setViewControls(null), [setViewControls]);

  useEffect(
    () =>
      workspace.prompts.subscribe(message => {
        // A prompt typed before the adapter is ready is dropped rather than
        // queued: silently sending it minutes later, out of context, is worse
        // than saying nothing happened.
        controlsRef.current?.send(message);
      }),
    [workspace.prompts],
  );

  const handleSend = useCallback(
    async (message: string) => {
      setTransient(null);
      const outcome = await workspace.submit(message);
      if (!outcome.handled) {
        /*
         * Nothing took it, so the words stay where they were typed.
         *
         * The reason appears under the prompt; emptying the box as well would
         * make a failed send look like a successful one and cost the person
         * the sentence they wrote.
         */
        setTransient(outcome.reason ?? null);
        return;
      }
      /*
       * Sent, so the composer is empty again.
       *
       * `InputPromptBase` clears itself only when it owns its own text. This
       * view hands it a controlled value — a page embedding the workspace can
       * offer a prompt, which needs somewhere outside the editor to put it —
       * and a controlled value is the owner's to clear. It was not being
       * cleared at all: the sentence stayed in the box after the agent had
       * answered it, so the next thing typed was appended to the last thing
       * asked, and the placeholder that suggests what to ask never came back.
       */
      setDraft('');
      if (outcome.result?.content) {
        setTransient(outcome.result.content as ReactNode);
      }
    },
    [workspace],
  );

  const active = useMemo(
    () => surfaces.find(entry => entry.value.surfaceId === surfaceId)?.value,
    [surfaces, surfaceId],
  );

  /**
   * The reader picking a surface, including picking none.
   *
   * It records the choice as well as making it: from here on the host's
   * default is spent, so a surface closed stays closed.
   */
  const chooseSurface = useCallback((next: string) => {
    surfaceChosen.current = true;
    setSurfaceId(next);
  }, []);

  /** The surface the host asked to open, once its plugin has contributed it. */
  const wanted = useMemo(
    () =>
      defaultSurface === NO_SURFACE || defaultSurface === 'none'
        ? undefined
        : surfaces.find(entry => entry.value.surfaceId === defaultSurface),
    [surfaces, defaultSurface],
  );

  /*
   * Open the default the moment it can be opened.
   *
   * Both conditions are the point. A surface arrives when its plugin
   * activates, so it may not exist on the first render; and these two need a
   * running sandbox, which takes as long as a Pyodide kernel takes to start.
   * Waiting for both is what turns "configured for the notebook" into a
   * notebook rather than a placeholder.
   */
  useEffect(() => {
    if (surfaceChosen.current || !wanted) {
      return;
    }
    if (canOpenView(wanted.value, workspace)) {
      setSurfaceId(defaultSurface);
    }
  }, [wanted, workspace, defaultSurface]);

  /*
   * An editor that stops being openable — its sandbox went away — should not
   * stay on screen claiming otherwise.
   *
   * Closed, but remembered. This used to set the surface to none and stop
   * there, which spent the reader's choice on an interruption: a sandbox
   * blinking during a target switch closed the notebook, `surfaceChosen`
   * meant the default could not reopen it, and the control settled on None
   * for a workspace nobody had asked to empty. What was on screen and what
   * the control said agreed with each other and with neither the reader nor
   * the configuration.
   */
  /* State, not a ref: the layout below keeps this surface's column while it
     is away, and a ref changing re-renders nothing. */
  const [suspendedId, setSuspendedId] = useState<string | null>(null);

  /*
   * Full screen: the whole view, on the whole screen.
   *
   * Everything the workspace is showing goes — the editor as well as the
   * conversation. An earlier version hid the editor, on the theory that a long
   * transcript wants the room; but somebody working on a notebook who asks for
   * more room is asking for more room *for the work*, and taking the notebook
   * away to give it is answering a question they did not ask.
   *
   * Done with the Fullscreen API rather than by drawing a big box, because a
   * component cannot know what it is inside of. `position: fixed` escapes only
   * as far as the nearest ancestor with a transform, and a page that animates
   * its sections in — the landing does — leaves one behind permanently: the
   * "full screen" chat then filled the card it was already in. The API
   * promotes the element to the browser's top layer, where no ancestor can
   * hold it, and unlike a portal it does not move in the DOM — so every
   * inherited theme variable the editors read still resolves.
   *
   * The CSS overlay is kept as the fallback for where the API is refused: an
   * iframe without `allow="fullscreen"`, mostly. Confined to a card is a worse
   * answer than full screen and a better one than nothing.
   */
  const viewRef = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  /* Which of the two is in play, so leaving uses the door it came in by. */
  const usingFullscreenApi = useRef(false);

  useEffect(() => {
    /* The browser can leave without asking us — Escape does exactly that — so
       the flag follows the document rather than the click. */
    const sync = () => {
      if (!usingFullscreenApi.current) {
        return;
      }
      // Whatever was promoted — the workspace, or this view where there is no
      // workspace around it — as long as it still contains us.
      const active =
        !!document.fullscreenElement &&
        !!viewRef.current &&
        document.fullscreenElement.contains(viewRef.current);
      setFullScreen(active);
      if (!active) {
        usingFullscreenApi.current = false;
      }
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  /*
   * The full-screen control, pointed at from the first run onwards.
   *
   * This view is usually a panel inside somebody else's page — a few hundred
   * pixels of a landing page or an example. The moment it becomes worth more
   * room is the moment it starts answering, and that is also the moment a
   * reader's attention is on the transcript rather than on a small grey icon
   * in a corner. So from the first answer the icon takes the theme's own
   * colour and breathes.
   *
   * It does not stop on a timer. A reader who is deep in the first answer has
   * not yet had the thought "this is too small", and a hint that has already
   * expired by the time they have it is a hint that was never given. What ends
   * it is the reader: taking the offer, or reaching the thing it was offering.
   *
   * `hinted` is a ref because it must not itself cause a render, and because
   * it has to survive `busy` going true again for the second message — this
   * starts once, on the first run, not on every turn.
   */
  const [hintFullScreen, setHintFullScreen] = useState(false);
  const hinted = useRef(false);
  useEffect(() => {
    if (!busy || hinted.current || fullScreen) {
      return;
    }
    hinted.current = true;
    setHintFullScreen(true);
  }, [busy, fullScreen]);

  // Arriving is the end of it, however they got there — the button, a
  // keyboard shortcut, the host promoting the workspace. There is nothing
  // left to point at, and it never comes back.
  useEffect(() => {
    if (fullScreen) {
      setHintFullScreen(false);
    }
  }, [fullScreen]);

  const toggleFullScreen = useCallback(() => {
    /*
     * The whole workspace, not this view alone.
     *
     * Promoting the chat view would leave the workspace's header on the page
     * underneath — the agent picker and the control saying where the code runs
     * — so at full screen a reader would lose the two controls most worth
     * having room for. The shell marks itself; anything else falls back to
     * this view, which is what a workspace mounted without a shell would get.
     */
    const node =
      (viewRef.current?.closest(
        '[data-loop-workspace]',
      ) as HTMLElement | null) ?? viewRef.current;
    if (fullScreen) {
      if (usingFullscreenApi.current && document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        setFullScreen(false);
      }
      return;
    }
    if (!node?.requestFullscreen) {
      setFullScreen(true);
      return;
    }
    usingFullscreenApi.current = true;
    node.requestFullscreen().then(
      () => setFullScreen(true),
      () => {
        // Refused. Cover what can be covered instead.
        usingFullscreenApi.current = false;
        setFullScreen(true);
      },
    );
  }, [fullScreen]);

  /*
   * Escape leaves the fallback overlay, as it does from anything covering the
   * window. Not bound for the real thing: the browser handles Escape itself
   * there, and a second listener would only race it.
   *
   * `defaultPrevented` is the guard that matters: a menu open inside the chat
   * closes on Escape too, and says so by consuming the event. Without the
   * check, dismissing the model list would drop the reader out of full screen
   * as well.
   */
  useEffect(() => {
    if (!fullScreen || usingFullscreenApi.current) {
      return undefined;
    }
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setFullScreen(false);
      }
    };
    window.addEventListener('keydown', leave);
    return () => window.removeEventListener('keydown', leave);
  }, [fullScreen]);

  useEffect(() => {
    if (active && !canOpenView(active, workspace)) {
      setSuspendedId(active.surfaceId);
      setSurfaceId(NO_SURFACE);
    }
  }, [active, workspace]);

  /**
   * The surface that is closed but coming back.
   *
   * Held so the layout can keep its column: what is missing is the editor,
   * not the half of the workspace it lives in.
   */
  const waiting = useMemo(() => {
    if (suspendedId) {
      return surfaces.find(item => item.value.surfaceId === suspendedId)?.value;
    }
    /*
     * The host's default, before it has managed to open.
     *
     * It needs a sandbox, and a sandbox takes as long as a kernel takes to
     * start — so for the first seconds of every workspace there is a
     * configured notebook that is not open yet. Counting it as "waiting" is
     * what lets the control say Notebook from the outset and the column hold
     * its half of the split, instead of both saying None and then changing
     * their minds.
     *
     * Only until somebody chooses for themselves. After that the default is
     * spent, and a reader who picked None must not be shown Notebook.
     */
    if (!surfaceChosen.current && surfaceId === NO_SURFACE) {
      return wanted?.value;
    }
    return undefined;
  }, [surfaces, suspendedId, surfaceId, wanted]);

  // And opened again when it can be. The reader asked for it once; an
  // interruption is not them changing their mind.
  useEffect(() => {
    if (!suspendedId || surfaceId !== NO_SURFACE) {
      return;
    }
    const entry = surfaces.find(item => item.value.surfaceId === suspendedId);
    if (entry && canOpenView(entry.value, workspace)) {
      setSuspendedId(null);
      setSurfaceId(suspendedId);
    }
  }, [surfaces, surfaceId, suspendedId, workspace]);

  // The AG-UI mount is per agent, and `default` is the agent a server runs when
  // it was not told otherwise, so a workspace opened without one still talks to
  // something.
  const agentId = workspace.agentId?.trim() || 'default';

  /*
   * Which protocol, decided by where the sandbox is.
   *
   * On the browser target there is no server to mount an agent on, so the loop
   * turns in this page with the Vercel AI SDK and the chat calls it rather
   * than addressing it. Everywhere else the agent lives on the runtime and the
   * chat speaks AG-UI to it, exactly as before.
   *
   * The spec's own `harness` does not decide this. It says where the agent
   * normally runs, and a page cannot turn a pydantic-ai loop whatever it asks
   * for — so the location wins, which is the same rule the examples follow.
   */
  const inPage = targetRunsAgentInPage(
    (workspace.sandbox.target as SandboxTarget) ?? 'local',
  );

  /*
   * Who is being addressed, when this workspace runs a team.
   *
   * The team's own answer, not the workspace's: `workspace.agentId` is the
   * session's agent, and a team has several behind one front door. Picking a
   * member changes which spec the next prompt is answered by, and nothing
   * else — the sandbox, the notebook and the transcript stay where they are.
   */
  const team = useOptionalTeamSelection();
  const selectedMemberId = useSignalValue(team?.selected ?? EMPTY_SELECTION);
  const member = team?.members.find(entry => entry.id === selectedMemberId);

  /*
   * Looked up through `getAgentspecs`, not by subscripting the record.
   *
   * Agent ids reach this component versioned as often as not —
   * `jupyter-data-analyst:0.0.1` — and the record is keyed on the bare id, so
   * a raw subscript on a versioned id silently misses. What follows from a
   * miss is not an error but a quiet wrong answer: no model, no openers, no
   * name. `getAgentspecs` strips the version and retries, which is the whole
   * reason the specs package exports it.
   */
  const spec = getAgentspecs(member?.specId ?? agentId);

  /* The team's openers, or the selected agent's own when it has no team. */
  const suggestions = useMemo(
    () =>
      team?.team.suggestions?.length
        ? team.team.suggestions
        : (spec?.suggestions ?? []),
    [team, spec],
  );

  /*
   * The same openers in the shape the chat's empty state asks for.
   *
   * Only the text survives the crossing. `Suggestion` is a title and a message
   * — what a chip shows and what it sends — and these are the same sentence
   * for a spec's openers, which offer the whole request rather than a label
   * for one.
   */
  const chatSuggestions = useMemo(
    () => suggestions.map(item => ({ title: item.text, message: item.text })),
    [suggestions],
  );

  /* The icon its spec asked for, at the size the empty state draws. */
  const BrandIcon = agentIcon(spec?.icon);

  /*
   * How an in-page agent reaches the notebook.
   *
   * On every other target the agent runs on a server with a sandbox of its
   * own, and "run this cell" happens there — in the same kernel the notebook
   * is bound to, which is why it appears to work by magic. In the browser
   * there is no server and no second kernel: the only way to touch the
   * notebook is a frontend tool, executed here.
   *
   * Without these the browser agent could hold a conversation and do nothing,
   * which is exactly how it behaved — it answered, and the cell never ran.
   *
   * Addressed by `loopSurfaceId` so the tools and the surface on screen can
   * never be pointed at different notebooks.
   */
  const notebookTools = useNotebookTools(workspace.surfaceId);

  /*
   * Where this workspace's agent actually lives.
   *
   * A Datalayer runtime brings its own agent-runtimes server: the agent is
   * created on the pod from an agentspec, not on the server the workspace was
   * opened against. Addressing the latter would be talking to a machine that
   * has never heard of it. The same value for every other target, where the
   * two are the same server.
   */
  const agentServerUrl = workspace.sandbox.agentBaseUrl || workspace.serverUrl;

  /*
   * Who a single request may be addressed to.
   *
   * The same set the harness gets as tools, and deliberately so: a menu that
   * offered a name the model could not reach would be a menu that produces
   * silent no-ops. Derived here rather than in the plugin because it changes
   * with the selected member.
   */
  const mentionable = useMemo(() => {
    if (!team || !member) {
      return [];
    }
    /*
     * The team, plus whatever specialists the selected member brings.
     *
     * It used to be `subagentsFor(member)` alone, which made the list read as
     * arbitrary: a team of two offered one name, and the name was whichever
     * member you were *not* talking to. Everyone the team contains is listed,
     * because "who is on this team" is the question a person types `@` to
     * ask; the one already being addressed is shown greyed rather than
     * dropped, so the list is stable as the selection moves.
     */
    const roster = team.members.map(entry => ({
      name: entry.name,
      description: entry.description,
      emoji: entry.emoji,
      icon: agentIcon(entry.icon),
      disabled: entry.id === member.id,
      disabledReason:
        entry.id === member.id
          ? `You are already talking to ${entry.name}`
          : undefined,
    }));
    const specialists = subagentsFor(team.team, member.id)
      .filter(subagent => !team.members.some(m => m.name === subagent.name))
      .map(subagent => ({
        name: subagent.name,
        description: subagent.description,
        icon: agentIcon(subagent.icon),
      }));
    return [...roster, ...specialists];
  }, [team, member]);
  /*
   * Where the model is reached, and on whose key.
   *
   * Told whether an in-page agent is going to ask at all: a workspace on a
   * server-backed agent authenticates itself, and minting a visitor's one
   * trial key for it would start a clock against a conversation that never
   * spends it.
   */
  const { inference, anonymous } = useBrowserInference(inPage);
  /* Read from the store rather than passed in: the sign-in form inside the
     expiry panel writes here, so the same render that gains a member gains
     the wording that goes with one. */
  const signedInUser = useIAMStore(state => state.user);
  /* The trial is over, and this chat is the thing that stops working. Only
     for an in-page agent: everywhere else the runtime holds its own
     credentials and never saw the visitor's key. */
  const keyExpired = inPage && anonymous.status === 'expired';
  /*
   * Whose key ran out, which decides what the chat is allowed to call it.
   *
   * The anonymous store only ever holds the trial key, so reaching this
   * through `anonymous.status` means the reader never signed in. A member
   * whose own session expires arrives by a different route and must not be
   * told a temporary key ran out — they never had one, and would go looking
   * for something that was never theirs.
   */
  const expiredKeyIsTemporary = !signedInUser;
  const chatDisabled = gateBlocked || keyExpired;
  const disabledReason = keyExpired
    ? expiredKeyIsTemporary
      ? 'Your temporary key has expired. Sign in to keep going.'
      : 'Your key has expired. Sign in to keep going.'
    : gateReason;

  /*
   * The prompt's text, held here rather than inside `InputPrompt`.
   *
   * A page embedding the workspace can offer a request — "try asking it
   * this" — and the only honest place to put such an offer is the box the
   * visitor would have typed it into, where they can read it, change their
   * mind, or send it. That needs a controlled prompt, which needs the text to
   * live somewhere both the suggestion and the composer can reach.
   */
  const [draft, setDraft] = useState('');

  /*
   * The model this conversation is on.
   *
   * Three answers, and the order matters more than it looks. The reader's own
   * pick wins, then the *agent's spec*, then whatever the host mounted the
   * workspace with.
   *
   * The spec used to come last, behind `workspace.model` — which is a
   * workspace-wide default, set once for whichever agent happens to be
   * addressed. So launching an agent whose spec names one model showed a
   * different one ticked in the menu, and the footer disagreed with the thing
   * actually answering. An agent's spec is the definition of that agent; a
   * host default is a fallback for when there is no definition, and a fallback
   * that overrides the definition is not a fallback.
   *
   * Held here rather than in the workspace because the choice belongs to the
   * conversation: it is what the next message is sent with, and it resets when
   * the member being addressed changes.
   */
  const [pickedModel, setPickedModel] = useState<string>();
  const activeModel = pickedModel ?? spec?.model ?? workspace.model ?? '';
  /*
   * The team, in the shape the footer asks for.
   *
   * The footer knows nothing about teamspecs, and should not: it renders a
   * list of names and reports which one was chosen. Everything that makes a
   * member a member stays on this side of the boundary.
   */
  /* What is left of the context window, as the runtime last reported it. The
     footer shows nothing at all until there is a real number, so a workspace
     whose agent has not answered yet simply has no bar. */
  /*
   * The window, and only for the agent being addressed now.
   *
   * The store keeps one snapshot rather than one per agent, so switching
   * member left the previous one's numbers on screen under the new one's
   * name. Ignored until the store hands back a different object, which is the
   * only evidence available that the new agent has reported.
   */
  const storedUsage = useAgentRuntimeContextSnapshot();
  const usageAtSwitch = useRef(storedUsage);
  const addressedAgent = useRef(selectedMemberId);
  const storedUsageRef = useRef(storedUsage);
  storedUsageRef.current = storedUsage;

  useEffect(() => {
    if (addressedAgent.current === selectedMemberId) {
      return;
    }
    addressedAgent.current = selectedMemberId;
    usageAtSwitch.current = storedUsageRef.current;
    // And the model goes back to whatever the new agent's spec asks for. A
    // pick made for one member is not a statement about the next.
    setPickedModel(undefined);
  }, [selectedMemberId]);

  const fromStore =
    storedUsage && storedUsage !== usageAtSwitch.current ? storedUsage : null;

  /*
   * What the chat itself accounts for, when nothing else does.
   *
   * A server-side runtime pushes a snapshot over the socket and that is what
   * `fromStore` holds. An in-page agent has no server to push one, and its
   * only account of the window is the totals its harness reports — which
   * `ChatBase` assembles and hands out. Without this the browser agent's
   * footer had no numbers at all, and the space kept for them showed as a
   * white stripe under the prompt.
   */
  const [chatUsage, setChatUsage] = useState<ContextSnapshotData>();
  const contextUsage = fromStore ?? chatUsage ?? null;
  // Read to decide whether the strip exists at all, not to render it.
  const inpromptMenu = useSlotComponents(LoopSlots.inpromptMenu);
  // Same question for the chat's own title bar, which plugins may add to.
  const chatHeaderItems = useSlotComponents(LoopSlots.chatHeader);

  const footerAgents = useMemo<FooterAgent[]>(
    () =>
      team?.members.map(entry => ({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        icon: agentIcon(entry.icon),
      })) ?? [],
    [team],
  );
  const suggestion = useLoopPromptStore(state => state.pending);

  useEffect(() => {
    if (!suggestion) {
      return;
    }
    setDraft(suggestion.text);
    // Taken, so a second click on the same button offers it again rather than
    // finding the store already holding it.
    useLoopPromptStore.getState().consume();
    if (suggestion.submit) {
      void handleSend(suggestion.text);
    }
    // `handleSend` is stable for the life of a connection; re-running this on
    // a new identity would resend the last suggestion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  const protocol = useMemo<ProtocolConfig>(
    () =>
      inPage
        ? browserProtocolConfig({
            agentId: member?.specId ?? agentId,
            instructions: spec?.systemPrompt,
            model: activeModel || undefined,
            inference,
            // Who this member may hand work to, and what they are told. Both
            // come from the teamspec: the supervisor routes to the others, a
            // member reaches only its own specialists, and `context.sharing`
            // decides whether the child sees this conversation.
            // The agent runs them itself, so they go to the harness rather
            // than to the chat — handing them to both would run each tool
            // twice.
            frontendTools: notebookTools,
            subagents:
              team && member ? subagentsFor(team.team, member.id) : undefined,
            sharing: team?.sharing,
          })
        : {
            type: 'ag-ui',
            endpoint: `${agentServerUrl}/api/v1/ag-ui/${agentId}/`,
            agentId,
            // `/api/v1/configure`, not `/api/v1/configure/config`: the hooks
            // strip one trailing `config`/`configure` segment to find the API
            // base, so the longer form doubles it.
            configEndpoint: `${agentServerUrl}/api/v1/configure`,
            enableConfigQuery: true,
          },
    [
      agentId,
      inPage,
      inference,
      member,
      notebookTools,
      team,
      spec?.model,
      spec?.systemPrompt,
      activeModel,
      agentServerUrl,
    ],
  );

  /*
   * The model catalogue, and the builtin tools and skills the agent reports.
   *
   * Read here rather than left to `ChatBase`, because this view draws its own
   * prompt: the toolbar under it can only offer what this component hands it.
   *
   * `useSkills` reads the runtime's codemode status out of the store, so it
   * needs no endpoint and works for an in-page agent too. `useConfig` does
   * need one, and a browser agent has none — hence the menus below being
   * gated on the data rather than switched on unconditionally.
   */
  const configQuery = useConfig(
    !inPage,
    protocol.type === 'ag-ui' ? protocol.configEndpoint : undefined,
    undefined,
    agentId,
  );
  const skillsQuery = useSkills(true);
  const skillActions = useSkillActions(agentId);
  const [catalogModels, setCatalogModels] = useState<ModelConfig[]>([]);

  useEffect(() => {
    /*
     * Only where there is a server to ask.
     *
     * An in-page agent has none, and `agentServerUrl` then holds whatever the
     * host defaulted to — on a public page that was a developer's localhost,
     * so every visitor's console carried a connection-refused error for a
     * catalogue that was never going to arrive. The agentspecs catalogue below
     * is the answer for this case and needs no request at all.
     */
    if (inPage) {
      return undefined;
    }
    let cancelled = false;
    void fetch(`${agentServerUrl}/api/v1/configure/models`)
      .then(response => (response.ok ? response.json() : { models: [] }))
      .then(payload => {
        if (!cancelled) {
          setCatalogModels(payload.models ?? []);
        }
      })
      // No catalogue is not an error worth a banner: the menu simply has
      // nothing to offer, and the agent answers on whatever it was given.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentServerUrl, inPage]);

  /*
   * What to offer when the server has no catalogue of its own.
   *
   * `/configure/models` answers for a server-backed agent and is
   * authoritative. An in-page agent has no server to ask, and a model menu
   * with nothing in it is a control that opens onto an empty list — so the
   * agentspecs catalogue stands in, filtered to the models marked available.
   */
  const offeredModels = useMemo<ModelConfig[]>(
    () =>
      catalogModels.length > 0
        ? catalogModels
        : Object.values(AI_MODEL_CATALOGUE)
            .filter(model => model.available)
            .map(model => ({
              id: model.id,
              name: model.name,
              provider: model.provider,
            })),
    [catalogModels],
  );

  /*
   * The tools the agent can call, from both sides.
   *
   * The server's builtins, and the notebook tools this workspace hands the
   * harness — which are the only ones an in-page agent has, and the reason
   * "run this cell" works at all. Listing a tool and running it are different
   * jobs, so a tool the chat does not execute still belongs in the menu.
   */
  const offeredTools = useMemo(() => {
    const fromServer = configQuery.data?.builtinTools ?? [];
    const seen = new Set(fromServer.map(tool => tool.name));
    return [
      ...fromServer,
      ...notebookTools
        .filter(tool => !seen.has(tool.name))
        .map(tool => ({ id: tool.name, name: tool.name })),
    ];
  }, [configQuery.data?.builtinTools, notebookTools]);

  /* Which skills are on, as the runtime last reported them. Derived rather
     than held: the source of truth is the agent, and a local copy would drift
     the moment a skill was enabled from anywhere else. */
  const enabledSkills = useMemo(
    () =>
      new Set<string>(
        (skillsQuery.data?.skills ?? [])
          // `enabled` and `loaded` both mean the agent has it; `available`
          // means it could. There is no `disabled` — a skill that is off is
          // simply one that is merely available.
          .filter(
            skill => skill.status === 'enabled' || skill.status === 'loaded',
          )
          .map(skill => skill.id),
      ),
    [skillsQuery.data],
  );

  /*
   * Taken here first, then told to the server.
   *
   * Locally, because an in-page agent has no server to tell and its model is
   * whatever this view hands the harness — without recording the choice, the
   * menu ticked a row for a moment and the next message went to the old model.
   * And on the server for the agents that live there, where the chip in its
   * header makes the same call: whichever control a person used, the other has
   * to agree.
   */
  const selectModel = useCallback(
    async (model: string) => {
      setPickedModel(model);
      if (inPage) {
        return;
      }
      await fetch(`${agentServerUrl}/api/v1/configure/inference/provider`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
      }).catch(() => undefined);
    },
    [agentServerUrl, inPage],
  );

  /* `bottom-chat` keeps the prompt in the chat column; `bottom`, the default,
     spans the workspace. */
  const besideChat = config?.promptPlacement === 'bottom-chat';

  /*
   * The prompt, as a value, because where it goes is configuration.
   *
   * `bottom` spans the workspace: the notebook and the conversation share one
   * composer, which is right when the agent's job is the document beside it.
   * `bottom-chat` keeps it inside the chat column, where every other example
   * puts it — the prompt then reads as part of the conversation rather than as
   * a bar the whole page sits on.
   */
  const prompt = (
    <Box sx={{ flex: '0 0 auto' }}>
      <InputPrompt
        onSend={() => void handleSend(draft)}
        // Controlled, so a suggestion from outside the workspace has
        // somewhere to land. Uncontrolled the prompt owns its text and
        // nothing else can write to it.
        input={draft}
        setInput={setDraft}
        // Bumped by each suggestion, which is what puts the caret back in
        // the box: a person who clicked "Try this" is being handed a
        // sentence to read and send, not one to go and find.
        focusTrigger={suggestion?.nonce}
        // The agent is working: no second request while the first is in
        // flight. `isLoading` both disables the editor and turns the send
        // button into a stop — the person keeps a way out, which a flatly
        // disabled prompt would not give them.
        isLoading={busy}
        onStop={() => workspace.viewControls.stop?.()}
        // The reason where the typing would go, so it is read before the
        // person types rather than after nothing happens.
        placeholder={disabledReason ?? placeholder}
        /*
          The agent's openers, typed out in the box on a loop.

          This view draws its own prompt, so `ChatBase` cannot hand them over
          — and the empty state's chips vanish with the first message while
          the prompt stays. It stops the moment the prompt has focus.
        */
        typingSuggestions={suggestions.map(item => item.text)}
        disableInputPrompt={chatDisabled}
        connectionConfirmed={!chatDisabled}
        padding={3}
        // The `@` menu lives in the Lexical editor, and the default variant
        // is the plain textarea — so `mentionableAgents` was being handed to
        // a prompt with nowhere to show them, and typing `@` did nothing at
        // all. A team is only addressable from a prompt that can offer it.
        promptVariant="lexical"
        // Ready to type. This prompt is the reason the workspace is on
        // screen; making someone click into it first is a step that exists
        // only because nobody removed it.
        autoFocus
        // Everyone this member may hand work to, offered on `@`. The same
        // list the harness was given, so a name the menu suggests is a name
        // the model can actually reach.
        mentionableAgents={mentionable}
        // Whatever the plugins put above the box: the agent being addressed,
        /*
            Whatever a plugin puts inside the prompt — and nothing does today,
            so nothing is passed.

            `InputPromptHeader` skips itself when it has no children, but a
            `ReactorSlot` with no contributions is still an element: truthy,
            padded, and worth a band of empty white above the typing. Asking
            the platform whether anyone contributed is the difference between
            "no header" and "an empty one".
          */
        headerContent={
          inpromptMenu.length > 0 ? (
            <ReactorSlot slot={LoopSlots.inpromptMenu} props={{ workspace }} />
          ) : undefined
        }
        /*
            The agent, beside the tools, the skills and the model.

            All four decide what the next message does, and three of them were
            already here — the odd one out was the agent, which lived only in
            the workspace header and therefore vanished for a host that mounts
            the workspace without one.
          */
        showAgentsMenu
        // One place for the controls, not two: this workspace already has a
        // header of its own above the view, and a chip inside the prompt as
        // well made three rows of chrome around one text box.
        showInlineAgentsMenu={false}
        agents={footerAgents}
        selectedAgentId={selectedMemberId}
        onSelectAgent={id => team?.select(id)}
        // What is left of the window. Shown here for the same reason it is
        // shown in the standalone chat: a person about to paste a notebook
        // into a prompt should be able to see whether it will fit.
        showTokenUsage
        // The ring as well as the numbers. A workspace where an agent works
        // through a whole notebook is the case that fills a window, so how
        // it is being spent is worth the picture.
        showContextRing
        agentUsage={contextUsage ?? undefined}
        /*
          All four, whatever they happen to contain.

          Each was switched on only when something was behind it, so the row
          gained and lost controls as answers arrived and an in-page agent —
          which has no config endpoint to ask — showed almost none of them.
          Worse, "no skills" and "skills not reported" both came out as an
          absent menu, which are not the same answer.

          `InputPrompt` draws a menu that opens onto nothing as exactly that:
          a count of zero and an empty list. That is a statement; a missing
          control is not.
        */
        showModelSelector
        models={offeredModels}
        selectedModel={activeModel}
        onModelSelect={model => void selectModel(model)}
        showToolsMenu
        availableTools={offeredTools}
        mcpServers={configQuery.data?.mcpServers ?? []}
        showSkillsMenu
        skills={skillsQuery.data?.skills ?? []}
        skillsLoading={skillsQuery.isLoading}
        enabledSkills={enabledSkills}
        onToggleSkill={skillId =>
          enabledSkills.has(skillId)
            ? skillActions.disableSkill(skillId)
            : skillActions.enableSkill(skillId)
        }
        onToggleAllSkills={(skillIds, enable) =>
          skillIds.forEach(skillId =>
            enable
              ? skillActions.enableSkill(skillId)
              : skillActions.disableSkill(skillId),
          )
        }
        codemodeEnabled={false}
        isA2AProtocol={false}
        hasConfigData={!!configQuery.data}
        hasSkillsData={!!skillsQuery.data}
      />
    </Box>
  );

  return (
    <Box
      ref={viewRef}
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        /*
          A background of its own once it is full screen, in both modes.

          The element is promoted out of whatever was painting behind it — the
          browser's top layer, or the page — and a workspace that inherited its
          canvas from an ancestor would arrive transparent over black.
        */
        ...(fullScreen ? { bg: 'canvas.default' } : null),
        // The fallback, for a host where the API was refused. Covers as much
        // as the nearest transformed ancestor allows; see the note above.
        ...(fullScreen && !usingFullscreenApi.current
          ? { position: 'fixed', inset: 0, zIndex: 1000 }
          : null),
      }}
    >
      {surfaces.length > 0 && config?.showSurfaceSelector !== false ? (
        <SurfacePicker
          surfaces={surfaces.map(entry => entry.value)}
          /*
            What is on screen, not what was asked for.
            
            It read `surfaceId` — the request — while the column beside it
            renders `active`, the surface that request actually resolved to.
            The two are the same once everything has settled and differ
            exactly while it has not: a surface still arriving, or one closed
            because its sandbox went away. So the control could say None over
            a notebook, which is the one thing a control must never do.
            
            Reporting the rendered surface makes them agree by construction.
          */
          active={active?.surfaceId ?? waiting?.surfaceId ?? NO_SURFACE}
          onChange={chooseSurface}
          workspace={workspace}
        />
      ) : null}

      <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        {/*
          The column stays while its editor is away.

          A surface that cannot open — its sandbox is being replaced, which is
          what every agent switch does — used to take its column with it, so
          the chat widened to the whole workspace and narrowed again a second
          later. The reader was mid-sentence and the box they were typing in
          moved twice.

          So the split is held whenever an editor is open *or* waiting to come
          back, and the waiting is said inside the column rather than by
          removing it.
        */}
        {active || waiting ? (
          <Box sx={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
            {active ? (
              <ReactorLazy
                load={active.load}
                props={{ surfaceId: active.surfaceId, workspace }}
                fallback={<Centered>Loading {active.title}…</Centered>}
                errorFallback={error => (
                  <Centered>
                    {active.title} failed to load: {error.message}
                  </Centered>
                )}
              />
            ) : (
              <Centered>Starting {waiting?.title ?? 'the editor'}…</Centered>
            )}
          </Box>
        ) : null}

        {/* The chat sits to the right of whatever is being worked on: the
            editor is the subject, and the conversation is about it. The rule
            goes on this side for the same reason, and only when there is
            something to its left to be separated from. */}
        <Box
          sx={{
            flex: '1 1 0',
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: active ? '1px solid' : undefined,
            borderColor: 'border.default',
            // So the expired-key panel below can cover exactly this column and
            // nothing else: the notebook beside it still works.
            position: 'relative',
          }}
        >
          <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
            <ChatBase
              // The header says why, beside the title, for the same reason the
              // placeholder does: a dead control with no explanation is worse
              // than an absent one.
              disabled={chatDisabled}
              disableReason={disabledReason}
              protocol={protocol}
              /*
                Who is answering, in the words its spec uses.

                `ChatBase` falls back to "Start a conversation with the AI
                agent", which is true of every chat ever built and says
                nothing about this one. The empty state is the first thing a
                person sees and the only place the agent introduces itself.
              */
              title={spec?.name ?? member?.name ?? agentId}
              description={spec?.description}
              /*
                Two sizes, because it is drawn in two places.

                The header wants a mark beside a line of text; the empty state
                wants the thing a person's eye lands on first. One `brandIcon`
                served both, so a 48px icon meant for the empty state sat in
                the header at three times the height of the words next to it.
              */
              // Big enough to read as the agent's mark rather than as
              // punctuation before its name, and still short enough not to
              // set the header's height.
              brandIcon={<BrandIcon size={20} />}
              emptyState={{
                icon: <BrandIcon size={48} />,
                // `ChatEmptyState` reads its heading from here and nowhere
                // else — the `title` above reaches the header only — so
                // without this the agent introduced itself as "Start a
                // conversation".
                title: spec?.name ?? member?.name ?? agentId,
              }}
              /*
                And what it can be asked. From the team rather than the
                member: the supervisor answers first, and somebody who has
                just opened the workspace does not yet know there are two
                agents behind it.
              */
              suggestions={chatSuggestions}
              showHeader={!config?.hideHeader}
              /*
                The (i), which opens the agent's details over the transcript.
                
                Worth having here in particular: this workspace can be moved
                between four runtimes and several agents, and the details pane
                is the only place that says which one is actually answering
                and where it is running.
              */
              showInformation
              /*
                Full screen: this view, on the whole screen, editor and all.
                See `toggleFullScreen` for why it is the browser's API rather
                than a big box.
              */
              headerActions={
                <Box
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  {/* The host's own additions first, then the plugins', then
                      the chat's — so what belongs to the page reads as part of
                      the page and the chat's controls stay together at the
                      trailing edge, where a reader looks for them.

                      The slot is asked whether anyone filled it before it is
                      drawn: an empty `ReactorSlot` is still an element, and
                      three of them would space a header out around nothing. */}
                  {workspace.chatHeaderActions}
                  {chatHeaderItems.length > 0 ? (
                    <ReactorSlot
                      slot={LoopSlots.chatHeader}
                      props={{ workspace }}
                    />
                  ) : null}
                  <IconButton
                    icon={fullScreen ? ScreenNormalIcon : ScreenFullIcon}
                    aria-label={
                      fullScreen ? 'Exit full screen' : 'Enter full screen'
                    }
                    variant="invisible"
                    size="small"
                    onClick={() => {
                      // Whether or not it takes, the hint has been answered:
                      // they found the control, which is all it was for.
                      setHintFullScreen(false);
                      toggleFullScreen();
                    }}
                    sx={
                      hintFullScreen
                        ? {
                            /*
                              Colour and opacity, never geometry.

                              The colour is the theme's own `primary` — the
                              same brand the page around this workspace is
                              already using — because a grey icon in a row of
                              grey icons cannot be picked out however hard it
                              fades. Colour is what makes it findable; the
                              fade is what makes it look like it is asking.

                              It never fades to nothing: a control that
                              vanishes and returns reads as a rendering fault,
                              not an invitation. And nothing here moves or
                              resizes, so the header does not reflow and the
                              controls beside it stay where a reader last saw
                              them.
                            */
                            '@keyframes dla-fullscreen-hint': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.4 },
                            },
                            /* `&&` doubles the specificity, because Primer
                               ships Button as a CSS module and
                               `prc-Button-*` outranks a single generated
                               class — without it the keyframes register and
                               the button sits there at `animation: none`.
                               The colour needs the same treatment: an
                               invisible IconButton sets `color` itself.

                               And no `:focus` or `:hover` clause to stop it:
                               anything that matches the button while it is
                               being pointed at would cancel the pointing —
                               which is exactly how the first version of this
                               silently did nothing. It ends when the reader
                               takes the offer, or arrives without it. */
                            '&&': {
                              /*
                                The brand on the box, not on the glyph.

                                Painting the icon `palette.primary` was the
                                obvious reading and it is measurably
                                backwards: in the theme this workspace ships
                                on, `primary` is #FFC107, which sits at 1.55
                                contrast against the header — where the
                                icon's ordinary olive sits at 5.07. Recolouring
                                the stroke made the control roughly three
                                times harder to see, and at the bottom of the
                                fade it was 1.2 and simply gone.

                                A ring and a wash carry the same colour on a
                                far larger area, and they do it without asking
                                the glyph to be legible in a brand colour that
                                changes with every theme — this palette has
                                six, from a dark teal to this amber, and a
                                rule that works for one fails for another. The
                                glyph keeps the colour it can be read in.
                              */
                              bg: `color-mix(in srgb, ${palette.primary} 16%, transparent)`,
                              boxShadow: `inset 0 0 0 1.5px ${palette.primary}`,
                              animation: `dla-fullscreen-hint ${FULLSCREEN_HINT_PERIOD_MS}ms ease-in-out infinite`,
                            },
                            // A reader who asked the machine to hold still
                            // keeps the colour and loses the knocking: the
                            // control is still the findable one, it just
                            // holds still.
                            '@media (prefers-reduced-motion: reduce)': {
                              '&&': { animation: 'none' },
                            },
                          }
                        : undefined
                    }
                  />
                </Box>
              }
              // This view owns the prompt, below, so the chat does not draw a
              // second one: two input boxes on one screen is one too many.
              showInput={false}
              onSendReady={handleSendReady}
              onContextSnapshot={setChatUsage}
              onLoadingChange={handleLoadingChange}
              enableStreaming
            />
          </Box>
          {besideChat ? prompt : null}
          {/*
            Over the conversation, not instead of it.

            Absolutely positioned so `ChatBase` stays mounted underneath: a
            visitor who signs in here gets the transcript they were reading
            back, with the same messages in it, rather than a fresh chat that
            has forgotten the question they just asked.
          */}
          {keyExpired ? (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                bg: 'canvas.default',
              }}
            >
              <AnonymousKeyExpired
                agentName={spec?.name ?? member?.name}
                // On the browser target the kernel is in this page and owes
                // the inference service nothing, so the notebook is genuinely
                // unaffected and the panel may say so.
                sandboxStillRuns={inPage}
                temporary={expiredKeyIsTemporary}
              />
            </Box>
          ) : null}
        </Box>
      </Box>

      {transient ? (
        <Box
          sx={{
            flex: '0 0 auto',
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'border.default',
            bg: 'canvas.subtle',
            fontSize: 1,
            maxHeight: '40%',
            overflowY: 'auto',
          }}
        >
          {transient}
        </Box>
      ) : null}

      {besideChat ? null : prompt}
    </Box>
  );
}

/**
 * Which editor sits beside the conversation.
 *
 * Rendered only when a plugin contributed one — a chat on its own has nothing
 * to pick between, and a control with a single option is noise.
 */
function SurfacePicker({
  surfaces,
  active,
  onChange,
  workspace,
}: {
  surfaces: ChatSurfaceContribution[];
  active: string;
  onChange: (surfaceId: string) => void;
  workspace: LoopViewProps['workspace'];
}): JSX.Element {
  const ordered = [...surfaces].sort(
    (left, right) => (left.order ?? 100) - (right.order ?? 100),
  );

  return (
    <Box
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 3,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'border.default',
      }}
    >
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Beside the chat</Text>
      <SegmentedControl aria-label="Editor beside the chat" size="small">
        <SegmentedControl.Button
          selected={active === NO_SURFACE}
          onClick={() => onChange(NO_SURFACE)}
        >
          None
        </SegmentedControl.Button>
        {ordered.map(surface => {
          const openable = canOpenView(surface, workspace);
          const reason = openable
            ? undefined
            : (surface.unavailableReason?.(workspace) ??
              'Not available right now');
          return (
            <SegmentedControl.Button
              key={surface.surfaceId}
              selected={active === surface.surfaceId}
              // `aria-disabled` rather than `disabled`: a disabled button is
              // not focusable, so a keyboard or screen-reader user would never
              // hear *why* the editor is unavailable. It stays focusable, the
              // title explains, and the handler declines.
              aria-disabled={!openable}
              // The native attribute rather than Primer's `Tooltip`: that
              // component requires its child to *be* the interactive element,
              // and `SegmentedControl.Button` renders a list item around its
              // button — wrapping it throws before the workspace can paint.
              title={reason ?? surface.title}
              // Primer types this as its own icon shape; a contribution may
              // bring any component, which is the point of the extension point.
              leadingIcon={surface.icon as never}
              onClick={() => {
                if (openable) {
                  onChange(surface.surfaceId);
                }
              }}
            >
              {surface.title}
            </SegmentedControl.Button>
          );
        })}
      </SegmentedControl>
    </Box>
  );
}

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'fg.muted',
        fontSize: 1,
        px: 3,
        textAlign: 'center',
      }}
    >
      {children}
    </Box>
  );
}
