/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A case's deck, from the module's own export: the same deck the Datalayer home
 * page presents, the link to the case played there, and its YAML.
 */

import type { JSX } from 'react';
import CodeBlock from '@theme/CodeBlock';
import Deck from '@theme/Deck';
import Link from '@docusaurus/Link';
import { protocolDeck } from '@datalayer/agent-runtimes/lib/protocols/decks';

export default function ProtocolDeck({ id }: { id: string }): JSX.Element {
  const deck = protocolDeck(id);
  return (
    <>
      <Deck spec={deck.spec} />
      <p>
        <Link href={`https://datalayer.ai/examples?stage=${id}`}>Play this case on datalayer.ai</Link>, where you take the person’s part.
      </p>
      <details>
        <summary>
          This deck as YAML, from <code>@datalayer/agent-runtimes/lib/protocols/decks</code>
        </summary>
        <CodeBlock language="yaml">{deck.yaml}</CodeBlock>
      </details>
    </>
  );
}
