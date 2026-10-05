/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant (LOOP T-21 to T-27): the chat as a character on the
 * page, after the Office Assistant — Datalayer's own characters, chosen
 * here, acting out what the agent does and speaking in a balloon.
 *
 * The characters offered are what the enabled plugins contribute to
 * `loop.assistant.character` (T-24): Datalayer's four, and an owl from a
 * small example plugin (`utils/owlCharacterPlugin`). Pixel, the test sprite,
 * is read through the clippy.js reader, as a character a person brings is,
 * and so are the characters clippy.js publishes, fetched when picked.
 */

import React, { useEffect, useRef, useState } from 'react';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { Button, Heading, Text, ToggleSwitch } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import type { BalloonDisplay } from '../chat/assistant/toolLine';
import type { AssistantCharacter } from '../chat/assistant/characters';
import {
  AssistantCharactersPlugin,
  assistantCharacterNamed,
  assistantCharactersOf,
} from '../loop/plugins/assistant-characters';
import { OwlCharacterPlugin } from './utils/owlCharacterPlugin';
import { readTestSpriteCharacter } from './utils/testSpriteCharacter';
import {
  CLIPPY_JS_CHARACTERS,
  CLIPPY_JS_VERSION,
  readClippyJsCharacter,
  type ClippyJsCharacterName,
} from './utils/clippyJsCharacters';
import {
  readAcsCharacter,
  readClippyCharacter,
  type AssistantCharacterData,
} from '../chat/assistant/formats';

/**
 * The agent-runtimes server the assistant talks to: `?agentRuntimesUrl=`
 * when given, else this machine's on port 8765. It serves the `assistant`
 * agent, and asks Jev the decisions asked from the balloon.
 */
const SERVER = (
  (typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('agentRuntimesUrl')) ||
  'http://127.0.0.1:8765'
).replace(/\/+$/, '');

/** The agent the assistant talks to on that server. */
const AGENT_ID = 'assistant';

/**
 * Make sure the server has the assistant's agent: `npm run examples` starts
 * the server with none, so the page creates it from the
 * `example-agentic-chat` spec the first time, over AG-UI, the spec's own
 * protocol.
 */
async function ensureAssistantAgent(): Promise<void> {
  const found = await fetch(`${SERVER}/api/v1/agents/${AGENT_ID}`);
  if (found.ok) {
    return;
  }
  if (found.status !== 404) {
    throw new Error(
      `The server could not say whether the ${AGENT_ID} agent exists (${found.status}).`,
    );
  }
  const created = await fetch(`${SERVER}/api/v1/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: AGENT_ID,
      agent_spec_id: 'example-agentic-chat',
      transport: 'ag-ui',
    }),
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(
      `The server could not create the ${AGENT_ID} agent (${created.status}).`,
    );
  }
}

/** The plugins this page enables: Datalayer's characters and the owl's. */
const reactor = buildReactorFromPlugins([
  AssistantCharactersPlugin,
  OwlCharacterPlugin,
]);
reactor.start();

/** The catalogue: what the enabled plugins contribute. */
const CATALOGUE = assistantCharactersOf(reactor).map(entry => ({
  id: entry.id,
  name: entry.character.name,
}));

/**
 * A character file a person picked, read in the page (T-26): one `.acs`, or
 * a clippy.js character's `agent.js` and `map.png` (and its sounds file).
 */
async function readPicked(files: File[]): Promise<AssistantCharacterData> {
  const acs = files.find(file => file.name.toLowerCase().endsWith('.acs'));
  if (acs) {
    return readAcsCharacter(await acs.arrayBuffer());
  }
  const agentJs = files.find(file => file.name.toLowerCase() === 'agent.js');
  const mapPng = files.find(file => /\.(png|gif|webp|jpe?g)$/i.test(file.name));
  const soundsJs = files.find(file => /^sounds-.*\.js$/i.test(file.name));
  if (!agentJs || !mapPng) {
    throw new Error(
      'Pick one .acs file, or a clippy.js character: its agent.js and its map image (and a sounds file if you have one).',
    );
  }
  return readClippyCharacter({
    agentJs: await agentJs.text(),
    mapPng,
    soundsJs: soundsJs ? await soundsJs.text() : undefined,
  });
}

const AssistantExample: React.FC = () => {
  const [character, setCharacter] = useState<string | AssistantCharacterData>(
    'paperclip',
  );
  // A character chosen by id is the one its plugin contributes.
  const drawn: AssistantCharacter | AssistantCharacterData =
    typeof character === 'string'
      ? assistantCharacterNamed(reactor, character)
      : character;
  const [loadError, setLoadError] = useState<string | undefined>();
  // The agent on the server, made if it is not there yet.
  const [agentReady, setAgentReady] = useState(false);
  const [agentError, setAgentError] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    ensureAssistantAgent().then(
      () => !cancelled && setAgentReady(true),
      error =>
        !cancelled &&
        setAgentError(
          `${error instanceof Error ? error.message : String(error)} The assistant talks to an agent-runtimes server at ${SERVER}.`,
        ),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  // How the balloon shows the conversation (T-23): history, or current.
  const [balloon, setBalloon] = useState<BalloonDisplay>('history');
  // Pixel, the test sprite, read once through the clippy.js reader.
  const [pixel, setPixel] = useState<AssistantCharacterData>();
  useEffect(() => {
    let cancelled = false;
    readTestSpriteCharacter().then(
      read => {
        if (!cancelled) {
          setPixel(read);
        }
      },
      error => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  // The object URL lives as long as the page does.
  useEffect(
    () => () => {
      if (pixel) {
        URL.revokeObjectURL(pixel.sprite);
      }
    },
    [pixel],
  );
  // The clippy.js characters, each fetched the first time it is picked.
  const [clippyJs, setClippyJs] = useState<
    Partial<Record<ClippyJsCharacterName, AssistantCharacterData>>
  >({});
  const [fetching, setFetching] = useState<ClippyJsCharacterName>();
  const fetched = useRef<AssistantCharacterData[]>([]);
  useEffect(
    () => () => {
      for (const read of fetched.current) {
        URL.revokeObjectURL(read.sprite);
      }
    },
    [],
  );
  const pickClippyJs = async (name: ClippyJsCharacterName) => {
    const known = clippyJs[name];
    if (known) {
      setCharacter(known);
      setLoadError(undefined);
      return;
    }
    setFetching(name);
    try {
      const read = await readClippyJsCharacter(name);
      fetched.current.push(read);
      setClippyJs(previous => ({ ...previous, [name]: read }));
      setCharacter(read);
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setFetching(undefined);
    }
  };
  const isClippyJs =
    typeof character !== 'string' &&
    Object.values(clippyJs).includes(character);
  return (
    <ThemedProvider>
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', p: 4 }}>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          <Heading as="h1" sx={{ mb: 2 }}>
            Assistant
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3 }}>
            The chat as a character on the page. It greets you, acts out what
            the agent is doing, and says the agent&rsquo;s words in a balloon
            while the conversation is closed. Click it to talk, drag it to move
            it, hover it to send it away.
          </Text>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {CATALOGUE.map(option => (
              <Button
                key={option.id}
                variant={option.id === character ? 'primary' : 'default'}
                onClick={() => {
                  setCharacter(option.id);
                  setLoadError(undefined);
                }}
                aria-pressed={option.id === character}
                data-assistant-character={option.id}
              >
                {option.name}
              </Button>
            ))}
            {pixel && (
              <Button
                variant={character === pixel ? 'primary' : 'default'}
                onClick={() => {
                  setCharacter(pixel);
                  setLoadError(undefined);
                }}
                aria-pressed={character === pixel}
                data-assistant-character="sprite"
              >
                {pixel.name} (sprite)
              </Button>
            )}
          </Box>
          <Box as="section" sx={{ mt: 4 }}>
            <Heading as="h2" sx={{ fontSize: 2, mb: 1 }}>
              The balloon
            </Heading>
            <Text as="p" sx={{ color: 'fg.muted', mb: 2 }}>
              <strong>History</strong>: the whole conversation, counted in its
              header — closed, every message listed and scrolled; open, the
              composer last. <strong>Current</strong>: only what it says or does
              now — the answer as it is written, or the tool it calls
              (&ldquo;Using current_time…&rdquo;) — in one compact balloon.
              Either way, a tool call is said in the balloon.
            </Text>
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
              data-assistant-balloon-toggle=""
            >
              <Text
                id="assistant-balloon-history"
                sx={{ fontWeight: 'semibold' }}
              >
                History
              </Text>
              <ToggleSwitch
                aria-labelledby="assistant-balloon-history"
                size="small"
                checked={balloon === 'history'}
                // Controlled, Primer's switch flips only through its click.
                onClick={() =>
                  setBalloon(balloon === 'history' ? 'current' : 'history')
                }
              />
              <Text
                aria-live="polite"
                data-toggle-state=""
                sx={{ color: 'fg.muted' }}
              >
                {balloon === 'history' ? 'History' : 'Current'}
              </Text>
            </Box>
          </Box>
          <Box as="section" sx={{ mt: 4 }}>
            <Heading as="h2" sx={{ fontSize: 2, mb: 1 }}>
              The clippy.js characters
            </Heading>
            <Text as="p" sx={{ color: 'fg.muted', mb: 2 }}>
              Fetched when picked from the{' '}
              <code>clippyjs@{CLIPPY_JS_VERSION}</code> package on jsDelivr and
              read as data by the same reader. They are not in this repository:
              clippy.js&rsquo;s licence covers its code only, and the characters
              are Microsoft&rsquo;s.
            </Text>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {CLIPPY_JS_CHARACTERS.map(name => {
                const picked =
                  clippyJs[name] !== undefined && character === clippyJs[name];
                return (
                  <Button
                    key={name}
                    variant={picked ? 'primary' : 'default'}
                    onClick={() => void pickClippyJs(name)}
                    disabled={fetching !== undefined}
                    aria-pressed={picked}
                    data-assistant-character={`clippy-js-${name.toLowerCase()}`}
                  >
                    {fetching === name ? `${name}…` : name}
                  </Button>
                );
              })}
            </Box>
          </Box>
          <Box as="section" sx={{ mt: 4 }}>
            <Heading as="h2" sx={{ fontSize: 2, mb: 1 }}>
              A character you bring
            </Heading>
            <Text as="p" sx={{ color: 'fg.muted', mb: 2 }}>
              The characters of Microsoft Office — Clippy, Merlin, Links and the
              others — are Microsoft&rsquo;s. Load only a character file you
              have the right to use: a Microsoft Agent <code>.acs</code> file,
              or a clippy.js character&rsquo;s <code>agent.js</code> and map
              image. It is read in this page and sent nowhere.
            </Text>
            <input
              type="file"
              multiple
              accept=".acs,.js,.png,.gif,.webp,.jpg,.jpeg"
              aria-label="Character files"
              onChange={async event => {
                const files = Array.from(event.target.files ?? []);
                if (!files.length) {
                  return;
                }
                try {
                  setCharacter(await readPicked(files));
                  setLoadError(undefined);
                } catch (error) {
                  setLoadError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              }}
            />
            {loadError && (
              <Text as="p" role="alert" sx={{ color: 'danger.fg', mt: 2 }}>
                {loadError}
              </Text>
            )}
            {typeof character !== 'string' &&
              character !== pixel &&
              !isClippyJs && (
                <Text as="p" sx={{ mt: 2 }}>
                  Playing {character.name}.
                </Text>
              )}
          </Box>
        </Box>
        {agentError && (
          <Box sx={{ maxWidth: 720, mx: 'auto', mt: 3 }}>
            <Text as="p" role="alert" sx={{ color: 'danger.fg' }}>
              {agentError}
            </Text>
          </Box>
        )}
        {agentReady && (
          <ChatFloating
            key={typeof character === 'string' ? character : character.sprite}
            defaultViewMode="assistant"
            assistantCharacter={drawn}
            balloonDisplay={balloon}
            protocol="ag-ui"
            endpoint={`${SERVER}/api/v1/ag-ui/${AGENT_ID}/`}
            title="Assistant"
            description="Hello! Ask me anything about this page."
            position="bottom-right"
            useStore={false}
            // Ask a decision beside the composer: Jev, through this server.
            decisions={{ serverUrl: SERVER }}
          />
        )}
      </Box>
    </ThemedProvider>
  );
};

export default AssistantExample;
