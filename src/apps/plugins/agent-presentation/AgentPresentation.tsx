/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's or an application's presentation, drawn from its own spec: the
 * emoji and name as the heading, then its `presentation`, one Markdown
 * document (agentspecs), drawn by the Markdown renderer the chat uses with
 * this panel's own elements — a paragraph in the muted ink, a bullet list
 * with a check mark before each item, a note wholly in emphasis quieter and
 * in italics, and a paragraph of links as the actions: the one in bold the
 * main button, the others links beside it.
 *
 * An address of the site (`/…`) is the host's to open first
 * (`PresentationLinks.open`: Datalayer's pages open their documentation in
 * a docs panel), else it is navigated to (core's `useNavigate`); an address
 * elsewhere opens in a new tab. No word of it is the host's: with no
 * presentation there is no panel.
 *
 * @module apps/plugins/agent-presentation/AgentPresentation
 */

import type { JSX, MouseEvent, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { Button, Heading, Link, Text } from '@primer/react';
import { ArrowRightIcon, CheckCircleFillIcon } from '@primer/octicons-react';
import type { Icon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { Streamdown } from 'streamdown';
import { useNavigate } from '@datalayer/core/lib/hooks';
import { FluentEmoji } from '@datalayer/core/lib/components/emoji';
import { REHYPE_PLUGINS_WITHOUT_HTML } from '../../../chat/messages/markdownWithoutHtml';
import {
  actionsOf,
  isNote,
  isSiteLink,
  type MarkdownNode,
  type PresentationAction,
} from './presentationBlocks';

/** What a host says of the presentation's links. */
export type PresentationLinks = {
  /**
   * Open an address of the host's site its own way (a docs panel): true
   * when it did, false to let it be navigated to.
   */
  open?: (href: string) => boolean;
  /** The icon before a link of the actions, if any: none unless said. */
  visual?: (href: string) => Icon | undefined;
};

/** The host's word on the links, for every element of the document. */
export const PresentationLinksContext = createContext<PresentationLinks>({});

/** No word of the host's: one object, so that it never reads as a change. */
const NO_LINKS: PresentationLinks = {};

type ElementProps = { node?: MarkdownNode; children?: ReactNode };

/** What a click on an address of the site does: the host's own way, else the site's navigation. */
function useOpen(): (
  href: string,
) => ((event: MouseEvent) => void) | undefined {
  const navigate = useNavigate();
  const { open } = useContext(PresentationLinksContext);
  return href => {
    if (!isSiteLink(href)) {
      return undefined;
    }
    return event => {
      event.preventDefault();
      if (!open?.(href)) {
        navigate(href);
      }
    };
  };
}

/** Elsewhere: a new tab, nothing of this page handed over. */
const elsewhere = (href: string) =>
  isSiteLink(href) ? {} : { target: '_blank', rel: 'noopener noreferrer' };

function Actions({ actions }: { actions: PresentationAction[] }): JSX.Element {
  const open = useOpen();
  const { visual } = useContext(PresentationLinksContext);
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={3}
      flexWrap="wrap"
      mt={1}
      data-agent-presentation-actions=""
    >
      {actions.map(action => {
        if (action.primary) {
          const onSite = open(action.href);
          return (
            <Button
              key={action.href}
              variant="primary"
              size="large"
              trailingVisual={ArrowRightIcon}
              onClick={(event: MouseEvent) =>
                onSite
                  ? onSite(event)
                  : window.open(action.href, '_blank', 'noopener,noreferrer')
              }
              data-agent-presentation-action="primary"
            >
              {action.label}
            </Button>
          );
        }
        const Visual = visual?.(action.href);
        return (
          <Link
            key={action.href}
            href={action.href}
            {...elsewhere(action.href)}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
            onClick={open(action.href)}
            data-agent-presentation-action="link"
          >
            {Visual ? <Visual size={16} /> : null}
            {action.label}
          </Link>
        );
      })}
    </Box>
  );
}

function Paragraph({ node, children }: ElementProps): JSX.Element {
  const actions = actionsOf(node);
  if (actions.length > 0) {
    return <Actions actions={actions} />;
  }
  if (isNote(node)) {
    return (
      <Text
        as="p"
        sx={{ fontSize: 1, fontStyle: 'italic', color: 'fg.muted', m: 0 }}
        data-agent-presentation-note=""
      >
        {children}
      </Text>
    );
  }
  return (
    <Text
      as="p"
      sx={{ fontSize: 2, color: 'fg.muted', m: 0 }}
      data-agent-presentation-paragraph=""
    >
      {children}
    </Text>
  );
}

function List({ children }: ElementProps): JSX.Element {
  return (
    <Box
      as="ul"
      listStyle="none"
      m={0}
      p={0}
      display="grid"
      gap={2}
      data-agent-presentation-list=""
    >
      {children}
    </Box>
  );
}

function Item({ children }: ElementProps): JSX.Element {
  return (
    <Box as="li" display="flex" alignItems="flex-start" gap={2}>
      <Box
        as="span"
        color="success.fg"
        pt="2px"
        flexShrink={0}
        aria-hidden="true"
      >
        <CheckCircleFillIcon size={14} />
      </Box>
      <Text sx={{ fontSize: 1 }}>{children}</Text>
    </Box>
  );
}

/** A note's emphasis is the paragraph's own italics: its words, no second element. */
function Emphasis({ children }: ElementProps): JSX.Element {
  return <em style={{ fontStyle: 'inherit' }}>{children}</em>;
}

function InlineLink({ node, children }: ElementProps): JSX.Element {
  const open = useOpen();
  const href =
    typeof node?.properties?.href === 'string' ? node.properties.href : '';
  return (
    <Link href={href} {...elsewhere(href)} inline onClick={open(href)}>
      {children}
    </Link>
  );
}

/** The presentation's elements: what the Markdown renderer draws each block with. */
export const PRESENTATION_COMPONENTS = {
  p: Paragraph,
  ul: List,
  li: Item,
  a: InlineLink,
  em: Emphasis,
};

/** The heading's type: large and tight, as a title. */
const TITLE = { fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' };

export type AgentPresentationProps = {
  /** The face, from its spec. */
  emoji: string;
  /** The name, from its spec. */
  name: string;
  /** Its presentation: one Markdown document, from its spec. */
  presentation: string;
  /** What the host says of its links. */
  links?: PresentationLinks;
};

export function AgentPresentation({
  emoji,
  name,
  presentation,
  links,
}: AgentPresentationProps): JSX.Element {
  return (
    <PresentationLinksContext.Provider value={links ?? NO_LINKS}>
      <Box display="grid" gap={3} data-agent-presentation="">
        {/* Room on its right for the panel's Close cross, level with it (44px on a phone, 32px beyond). */}
        <Box
          display="flex"
          alignItems="center"
          gap={3}
          flexWrap="wrap"
          pr={['52px', '40px']}
        >
          {/* Core's Fluent drawing, as the chat draws it; decorative, the name beside it says it. */}
          <FluentEmoji emoji={emoji} size={48} label="" />
          <Heading as="h3" style={TITLE} sx={{ fontWeight: 'normal', m: 0 }}>
            {name}
          </Heading>
        </Box>
        {/* Each block a row of the grid: the renderer's own wrapper draws no box. */}
        <Box
          sx={{ display: 'contents', '& > div': { display: 'contents' } }}
          data-agent-presentation-document=""
        >
          <Streamdown
            mode="static"
            rehypePlugins={REHYPE_PLUGINS_WITHOUT_HTML}
            components={PRESENTATION_COMPONENTS}
            controls={false}
          >
            {presentation}
          </Streamdown>
        </Box>
      </Box>
    </PresentationLinksContext.Provider>
  );
}

export default AgentPresentation;
