/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every representation of the floating assistant, as a gallery (LOOP T-21
 * to T-27): each character — Datalayer's four, the owl an example plugin
 * contributes to `loop.assistant.character`, a test sprite read through
 * the clippy.js reader, and, when asked, the characters clippy.js publishes,
 * fetched from jsDelivr — in each state it acts, stepped aside, with its
 * balloon, in light and dark, moving or still. The balloon shows the
 * conversation either way (T-23): a peek of it (`history`), or only what is
 * said or done now (`current`); a tool call is said in plain words ("Using
 * list_invoices…", "Done: list_invoices", "list_invoices failed"), and a
 * recorded notebook shows read-only in the current balloon.
 *
 * Static data, no agent: it opens without a server or an account.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import {
  Button,
  Checkbox,
  FormControl,
  Heading,
  SegmentedControl,
  Text,
  ToggleSwitch,
} from '@primer/react';
import {
  Box,
  DatalayerThemeProvider,
  themeConfigs,
} from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { useExampleThemeStore } from './utils/themeStore';
import { AssistantStage } from '../chat/assistant/AssistantStage';
import { useViewportDrag } from '../chat/useViewportDrag';
import type { AssistantAway, AssistantState } from '../chat/assistant/state';
import type { BalloonExpandTarget } from '../chat/assistant/BalloonVisual';
import type { BalloonDisplay, ToolLinePhase } from '../chat/assistant/toolLine';
import {
  AssistantGalleryGrid,
  GalleryBalloons,
  GalleryNotebook,
  GalleryObstacle,
  galleryNotebookVisual,
  Still,
  useGalleryCharacters,
  type GalleryCharacter,
} from './utils/AssistantGalleryGrid';
import {
  GALLERY_POSES,
  GALLERY_POSE_LABELS,
  SAMPLE_NOTEBOOK_SAYING,
  balloonForPose,
  sampleApproval,
  sampleHistory,
  sampleSaying,
  sampleToolLine,
  stateOfPose,
  type GalleryPose,
} from './utils/assistantGallery';
import {
  CLIPPY_JS_VERSION,
  useClippyJsCharacters,
} from './utils/clippyJsCharacters';

type Modes = 'light' | 'dark' | 'both';
type View = 'stage' | 'grid';
/** Where the character is: here, leaving, gone, or coming back (T-27). */
type Presence = 'here' | 'leaving' | 'away' | 'arriving';

const STAGE_SIZE = 96;
const PANEL_HEIGHT = 640;
const LEAVE_MS = 700;
const ARRIVE_MS = 1900;

const AWAY_WORDS: Record<AssistantAway, string> = {
  none: '',
  page: 'for now',
  session: 'for this session',
  always: 'for good',
};

/** One colour mode's panel, with the character on its own stage. */
function ModePanel({
  mode,
  character,
  pose,
  presence,
  balloon,
  insist,
  onToggle,
  onDismiss,
  onCallBack,
  away,
  replay,
  display,
  expandTarget,
}: {
  display: BalloonDisplay;
  /** Where the balloon's notebook is expanded: the area under the stage, or none (a dialog). */
  expandTarget?: BalloonExpandTarget;
  mode: 'light' | 'dark';
  character: GalleryCharacter;
  pose: GalleryPose;
  presence: Presence;
  balloon: React.ComponentProps<typeof AssistantStage>['balloon'];
  insist: boolean;
  onToggle: () => void;
  onDismiss: (away: AssistantAway) => void;
  onCallBack: () => void;
  away: AssistantAway;
  replay: number;
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useViewportDrag(stageRef, { whole: true });
  // Where it stands in the panel: the drag's viewport place, made the
  // panel's own once, so a scroll does not move it.
  const [spot, setSpot] = useState({ left: 48, top: PANEL_HEIGHT - 150 });
  useEffect(() => {
    const panel = panelRef.current;
    if (drag.position && panel) {
      const box = panel.getBoundingClientRect();
      setSpot({
        left: drag.position.left - box.left,
        top: drag.position.top - box.top,
      });
    }
  }, [drag.position]);
  const state: AssistantState =
    presence === 'leaving'
      ? 'goodbye'
      : presence === 'arriving'
        ? 'greeting'
        : stateOfPose(pose);
  return (
    <Box
      ref={panelRef}
      data-gallery-mode={mode}
      sx={{
        position: 'relative',
        flex: '1 1 320px',
        minWidth: 0,
        height: PANEL_HEIGHT,
        bg: 'canvas.default',
        color: 'fg.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'visible',
      }}
    >
      <Text
        sx={{
          position: 'absolute',
          top: 2,
          left: 3,
          fontSize: 0,
          fontWeight: 600,
          color: 'fg.muted',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {mode}
      </Text>
      {presence === 'away' ? (
        <Box
          sx={{
            position: 'absolute',
            left: spot.left,
            top: spot.top + STAGE_SIZE / 2 - 16,
          }}
        >
          <Button size="small" onClick={onCallBack} data-gallery-call-back="">
            Call {character.name} back
          </Button>
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 1 }}>
            Sent away {AWAY_WORDS[away]}.
          </Text>
        </Box>
      ) : (
        <AssistantStage
          key={`${character.id}-${replay}`}
          character={character.character}
          state={state}
          size={STAGE_SIZE}
          place={{ position: 'absolute', left: spot.left, top: spot.top }}
          stageRef={stageRef}
          onDragStart={drag.onHandlePointerDown}
          open={false}
          onToggle={onToggle}
          balloon={presence === 'here' ? balloon : undefined}
          balloonDisplay={display}
          expandTarget={expandTarget}
          insist={insist}
          onDismiss={onDismiss}
        />
      )}
      {pose === 'aside' && presence === 'here' && (
        <GalleryObstacle
          sx={{
            left: spot.left - 12,
            top: spot.top - 12,
            width: STAGE_SIZE + 24,
            height: STAGE_SIZE + 24,
          }}
        />
      )}
    </Box>
  );
}

/** A two-way choice as a Primer toggle: its label, the switch, what is on. */
function GalleryToggle({
  id,
  label,
  on,
  onChange,
  state,
  ...rest
}: {
  id: string;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** What is chosen, in words: `History` or `Current`. */
  state: string;
} & Record<`data-${string}`, string>): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }} {...rest}>
      <Text id={id} sx={{ fontSize: 1, fontWeight: 'semibold' }}>
        {label}
      </Text>
      <ToggleSwitch
        aria-labelledby={id}
        size="small"
        checked={on}
        // Controlled, Primer's switch flips only through its click.
        onClick={() => onChange(!on)}
      />
      <Text
        aria-live="polite"
        data-toggle-state=""
        sx={{ fontSize: 1, color: 'fg.muted' }}
      >
        {state}
      </Text>
    </Box>
  );
}

/** The panels in the modes asked, each in the examples' theme. */
function InModes({
  modes,
  stacked = false,
  children,
}: {
  modes: Modes;
  /** One above the other, for what is too wide to sit side by side. */
  stacked?: boolean;
  children: (mode: 'light' | 'dark') => React.ReactNode;
}): JSX.Element {
  const { theme } = useExampleThemeStore();
  const config = themeConfigs[theme] ?? themeConfigs.loop;
  const shown: ('light' | 'dark')[] =
    modes === 'both' ? ['light', 'dark'] : [modes];
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        gap: 3,
        flexWrap: 'wrap',
      }}
    >
      {shown.map(mode => (
        <Box key={mode} sx={{ flex: '1 1 320px', minWidth: 0 }}>
          <DatalayerThemeProvider
            colorMode={mode}
            theme={config.primerTheme}
            themeStyles={config.themeStyles}
          >
            {children(mode)}
          </DatalayerThemeProvider>
        </Box>
      ))}
    </Box>
  );
}

const AssistantGalleryExample: React.FC = () => {
  const { characters: ours, problem } = useGalleryCharacters();
  const [withClippyJs, setWithClippyJs] = useState(false);
  const clippyJs = useClippyJsCharacters(withClippyJs);
  const characters = [...ours, ...clippyJs.characters];
  const [characterId, setCharacterId] = useState('paperclip');
  const [pose, setPose] = useState<GalleryPose>('idle');
  const [view, setView] = useState<View>('stage');
  const [modes, setModes] = useState<Modes>('both');
  const [still, setStill] = useState(false);
  const [saying, setSaying] = useState<number | undefined>();
  const [said, setSaid] = useState(0);
  const [decision, setDecision] = useState<string>();
  const [presence, setPresence] = useState<Presence>('here');
  const [away, setAway] = useState<AssistantAway>('none');
  const [replay, setReplay] = useState(0);
  // How the balloon shows the conversation, a tool being called, a notebook (T-23).
  const [display, setDisplay] = useState<BalloonDisplay>('current');
  const [toolPhase, setToolPhase] = useState<ToolLinePhase | undefined>();
  const [withNotebook, setWithNotebook] = useState(false);
  // Where Expand draws the notebook: the area under the stage, or a dialog.
  const [expandIntoPage, setExpandIntoPage] = useState(true);
  const expandArea = useRef<HTMLDivElement>(null);
  const character =
    characters.find(entry => entry.id === characterId) ?? characters[0];

  // Leaving takes the goodbye's length; arriving, the greeting's.
  useEffect(() => {
    if (presence !== 'leaving' && presence !== 'arriving') {
      return;
    }
    const timer = window.setTimeout(
      () => setPresence(presence === 'leaving' ? 'away' : 'here'),
      presence === 'leaving' ? LEAVE_MS : ARRIVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [presence]);

  const sendAway = (choice: AssistantAway) => {
    setAway(choice);
    setPresence('leaving');
  };
  const callBack = () => {
    setAway('none');
    setPresence('arriving');
  };
  const say = () => {
    setSaying(said);
    setSaid(said + 1);
  };
  const approval = sampleApproval(
    () => setDecision('Approved: send_reply.'),
    () => setDecision('Denied: send_reply.'),
  );
  // History: the conversation so far, every message, as the chat holds it.
  const history =
    display === 'history'
      ? [
          ...sampleHistory(saying === undefined ? said : saying + 1),
          ...(withNotebook
            ? [
                {
                  id: 'notebook',
                  role: 'assistant' as const,
                  text: SAMPLE_NOTEBOOK_SAYING,
                },
              ]
            : []),
        ]
      : undefined;
  const balloon = balloonForPose(pose, {
    saying:
      saying === undefined
        ? withNotebook
          ? { text: SAMPLE_NOTEBOOK_SAYING, more: false }
          : undefined
        : sampleSaying(saying),
    approval,
    tool: toolPhase ? sampleToolLine(toolPhase) : undefined,
    attachment: withNotebook ? <GalleryNotebook /> : undefined,
    visual: withNotebook ? galleryNotebookVisual() : undefined,
    history,
  });
  const insist =
    saying !== undefined ||
    toolPhase !== undefined ||
    withNotebook ||
    pose === 'waiting' ||
    pose === 'paused';

  return (
    <ThemedProvider>
      <Box
        sx={{
          minHeight: '100vh',
          bg: 'canvas.default',
          color: 'fg.default',
          p: 4,
        }}
      >
        <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
          <Heading as="h1" sx={{ mb: 2 }}>
            Assistant gallery
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3, maxWidth: 760 }}>
            Every character in every state the floating assistant acts, with its
            balloon, in light and dark. Datalayer&rsquo;s four and the owl are
            what the enabled plugins contribute to{' '}
            <code>loop.assistant.character</code>; Pixel is a test sprite of our
            own, read through the clippy.js reader. No agent is behind it: the
            words are a sample conversation.
          </Text>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3, maxWidth: 760 }}>
            The characters clippy.js publishes — Clippy, Merlin, Links, Rover
            and the others — are loaded on request from the{' '}
            <code>clippyjs@{CLIPPY_JS_VERSION}</code> package on jsDelivr (about
            15 MB) and read by the same reader. They are not in this repository:
            clippy.js&rsquo;s licence covers its code only, and the characters
            are Microsoft&rsquo;s.
          </Text>

          <Box
            as="section"
            aria-label="Gallery controls"
            sx={{
              display: 'grid',
              gap: 3,
              mb: 4,
              p: 3,
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              bg: 'canvas.subtle',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 3,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <SegmentedControl aria-label="View">
                <SegmentedControl.Button
                  selected={view === 'stage'}
                  onClick={() => setView('stage')}
                >
                  One at a time
                </SegmentedControl.Button>
                <SegmentedControl.Button
                  selected={view === 'grid'}
                  onClick={() => setView('grid')}
                  data-gallery-view="grid"
                >
                  Grid
                </SegmentedControl.Button>
              </SegmentedControl>
              <SegmentedControl aria-label="Colour mode">
                {(['light', 'dark', 'both'] as const).map(option => (
                  <SegmentedControl.Button
                    key={option}
                    selected={modes === option}
                    onClick={() => setModes(option)}
                  >
                    {option === 'both'
                      ? 'Side by side'
                      : option === 'light'
                        ? 'Light'
                        : 'Dark'}
                  </SegmentedControl.Button>
                ))}
              </SegmentedControl>
              <FormControl>
                <Checkbox
                  checked={still}
                  onChange={event => setStill(event.target.checked)}
                />
                <FormControl.Label>Reduced motion</FormControl.Label>
              </FormControl>
              <FormControl>
                <Checkbox
                  checked={withClippyJs}
                  onChange={event => setWithClippyJs(event.target.checked)}
                  data-gallery-clippy-js=""
                />
                <FormControl.Label>
                  clippy.js characters
                  {clippyJs.loading ? ' (loading…)' : ''}
                </FormControl.Label>
              </FormControl>
              <Button onClick={() => setReplay(replay + 1)}>
                Replay the motions
              </Button>
            </Box>
            {view === 'stage' && (
              <>
                <Box
                  role="group"
                  aria-label="Character"
                  sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
                >
                  {characters.map(option => (
                    <Button
                      key={option.id}
                      size="small"
                      variant={
                        option.id === character.id ? 'primary' : 'default'
                      }
                      aria-pressed={option.id === character.id}
                      data-gallery-character={option.id}
                      onClick={() => setCharacterId(option.id)}
                    >
                      {option.name}
                    </Button>
                  ))}
                </Box>
                <Box
                  role="group"
                  aria-label="State"
                  sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
                >
                  {GALLERY_POSES.map(option => (
                    <Button
                      key={option}
                      size="small"
                      variant={option === pose ? 'primary' : 'default'}
                      aria-pressed={option === pose}
                      data-gallery-pose={option}
                      onClick={() => {
                        setPose(option);
                        setDecision(undefined);
                        setReplay(replay + 1);
                      }}
                    >
                      {GALLERY_POSE_LABELS[option]}
                    </Button>
                  ))}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    gap: 2,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <GalleryToggle
                    id="gallery-balloon-history"
                    label="History"
                    on={display === 'history'}
                    onChange={on => setDisplay(on ? 'history' : 'current')}
                    state={display === 'history' ? 'History' : 'Current'}
                    data-gallery-balloon-toggle=""
                  />
                  <GalleryToggle
                    id="gallery-expand-into-page"
                    label="Expand into the page"
                    on={expandIntoPage}
                    onChange={setExpandIntoPage}
                    state={expandIntoPage ? 'The page area' : 'An overlay'}
                    data-gallery-expand-toggle=""
                  />
                  <Button onClick={say} data-gallery-say="">
                    Say something
                  </Button>
                  <Button
                    data-gallery-tool={toolPhase ?? 'none'}
                    onClick={() =>
                      setToolPhase(
                        toolPhase === undefined
                          ? 'running'
                          : toolPhase === 'running'
                            ? 'done'
                            : toolPhase === 'done'
                              ? 'failed'
                              : undefined,
                      )
                    }
                  >
                    {toolPhase === undefined
                      ? 'Use a tool'
                      : toolPhase === 'running'
                        ? 'Tool done'
                        : toolPhase === 'done'
                          ? 'Tool failed'
                          : 'No tool'}
                  </Button>
                  <Button
                    data-gallery-notebook={withNotebook ? 'on' : 'off'}
                    aria-pressed={withNotebook}
                    onClick={() => setWithNotebook(!withNotebook)}
                  >
                    {withNotebook ? 'Take the notebook' : 'Give a notebook'}
                  </Button>
                  {saying !== undefined && (
                    <Button
                      variant="invisible"
                      onClick={() => setSaying(undefined)}
                    >
                      Hush
                    </Button>
                  )}
                  {presence === 'away' ? (
                    <Button onClick={callBack}>Call it back</Button>
                  ) : (
                    <Button
                      onClick={() => sendAway('page')}
                      disabled={presence !== 'here'}
                      data-gallery-send-away=""
                    >
                      Send it away
                    </Button>
                  )}
                  <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                    Drag the character to move it; hover it for its own
                    send-away menu.
                  </Text>
                  {decision && (
                    <Text role="status" sx={{ fontSize: 1 }}>
                      {decision}
                    </Text>
                  )}
                </Box>
              </>
            )}
          </Box>

          {problem && (
            <Text as="p" role="alert" sx={{ color: 'danger.fg', mb: 3 }}>
              The test sprite could not be read: {problem}
            </Text>
          )}
          {clippyJs.problem && (
            <Text as="p" role="alert" sx={{ color: 'danger.fg', mb: 3 }}>
              A clippy.js character could not be read: {clippyJs.problem}
            </Text>
          )}

          <Still still={still}>
            {view === 'stage' ? (
              <InModes modes={modes}>
                {mode => (
                  <ModePanel
                    mode={mode}
                    character={character}
                    pose={pose}
                    presence={presence}
                    balloon={balloon}
                    insist={insist}
                    onToggle={() =>
                      saying === undefined ? say() : setSaying(undefined)
                    }
                    onDismiss={sendAway}
                    onCallBack={callBack}
                    away={away}
                    replay={replay}
                    display={display}
                    expandTarget={expandIntoPage ? expandArea : undefined}
                  />
                )}
              </InModes>
            ) : (
              <InModes modes={modes} stacked>
                {mode => (
                  <Box
                    data-gallery-mode={mode}
                    sx={{
                      bg: 'canvas.default',
                      border: '1px solid',
                      borderColor: 'border.default',
                      borderRadius: 2,
                      p: 2,
                      overflowX: 'auto',
                    }}
                  >
                    <AssistantGalleryGrid
                      key={replay}
                      characters={characters}
                    />
                    {/* The balloon's displays: history, a tool, a notebook. */}
                    <GalleryBalloons character={character} />
                  </Box>
                )}
              </InModes>
            )}
          </Still>

          {view === 'stage' && expandIntoPage && (
            <Box
              as="section"
              aria-label="Expanded here"
              sx={{
                mt: 4,
                p: 3,
                border: '1px dashed',
                borderColor: 'border.default',
                borderRadius: 2,
              }}
            >
              <Text as="p" sx={{ m: 0, mb: 2, color: 'fg.muted', fontSize: 1 }}>
                Expanded here: what the balloon&rsquo;s <em>Expand</em> draws
                large when the page names an area for it — the notebook, to edit
                and run on the browser sandbox. Without one, it opens in an
                overlay.
              </Text>
              <Box ref={expandArea} data-gallery-expand-target="" />
            </Box>
          )}
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default AssistantGalleryExample;
