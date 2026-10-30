/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The backdrops: the same scene — an entry, two peers, a connection, the
 * links between them — drawn by each of `studio`, `hero` and `plain`, with
 * every member and link, the same words for a screen reader; the hero's
 * dot flies along its edge, out and back; the plain edge does not move and
 * says the state in words; an unknown backdrop is drawn as `studio`, said
 * once.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import {
  A2ATeamGraph,
  DEFAULT_SCENE_BACKDROP,
  SCENE_BACKDROPS,
  SCENE_BACKDROP_CHOICES,
  sceneBackdrop,
  sceneBackdropChoice,
  sceneStageSx,
  type A2ATeamFlow,
  type A2ATeamConnection,
  type A2ATeamGraphMember,
} from '..';
import { HeroCallEdge, HeroLinkEdge, HERO_BACKDROP } from '../backdrops/hero';
import { PlainLinkEdge, PLAIN_BACKDROP } from '../backdrops/plain';
import { LinkEdge, STUDIO_BACKDROP } from '../backdrops/studio';
import {
  SpaceCallEdge,
  SpaceLinkEdge,
  SPACE_BACKDROP,
} from '../backdrops/space';
import { edgeSelected } from '../A2ATeamGraph';
import { faceCharacter } from '../backdrops/faces';
import { AT_REST } from '../useA2ATeam';
import { getColorPalette, useThemeStore } from '@datalayer/primer-addons';
import { appColorOf } from '../sceneStage';
import { resolveSpecColor } from '../backdrops/paletteColor';

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  if (!('DOMMatrixReadOnly' in window)) {
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m22 = 1;
        constructor() {}
      },
    );
  }
});

afterEach(() => cleanup());

const ODOO: A2ATeamConnection = {
  id: 'odoo-accounting',
  name: 'Odoo Accounting',
  label: 'Odoo',
  emoji: '🧮',
  via: 'via MCP',
  tools: ['odoo_accounting_list_invoices'],
  prefix: 'odoo_accounting_',
};

const member = (
  id: string,
  name: string,
  extra: Partial<A2ATeamGraphMember> = {},
): A2ATeamGraphMember => ({
  id,
  name,
  character: id === 'sales' ? 'paperclip' : 'wizard',
  where: id === 'sales' ? 'in your browser' : 'on a runtime',
  persona: AT_REST,
  ...extra,
});

/** Sales asks Accounting and Shipping; Accounting reaches Odoo. */
function Scene({
  backdrop,
  flows = {},
  selected,
}: {
  backdrop?: string;
  flows?: Record<string, A2ATeamFlow>;
  selected?: React.ComponentProps<typeof A2ATeamGraph>['selected'];
}) {
  return (
    <A2ATeamGraph
      entry={member('sales', 'Sales', { emoji: '🤝' })}
      peers={[
        member('accounting', 'Accounting', {
          emoji: '📒',
          connections: [ODOO],
          persona: { ...AT_REST, state: 'working' },
        }),
        member('shipping', 'Shipping'),
      ]}
      links={[
        { from: 'sales', to: 'accounting' },
        { from: 'sales', to: 'shipping' },
      ]}
      positions={{
        sales: { x: 0.2, y: 0.5 },
        accounting: { x: 0.7, y: 0.2 },
        shipping: { x: 0.7, y: 0.8 },
      }}
      flows={flows}
      connected
      calls={[
        {
          member: 'accounting',
          connection: 'odoo-accounting',
          tool: 'odoo_accounting_list_invoices',
          started: 0,
        },
      ]}
      backdrop={backdrop as 'studio'}
      selected={selected}
    />
  );
}

describe('the backdrops', () => {
  it('are studio, hero, plain and space, studio first, with a name and a line each', () => {
    expect(SCENE_BACKDROPS.map(backdrop => backdrop.id)).toEqual([
      'studio',
      'hero',
      'plain',
      'space',
    ]);
    expect(SCENE_BACKDROPS.map(backdrop => backdrop.name)).toEqual([
      'Studio',
      'Hero',
      'Plain',
      'Space',
    ]);
    for (const backdrop of SCENE_BACKDROPS) {
      expect(backdrop.description).toMatch(/\S/);
      expect(Object.keys(backdrop.nodeTypes).sort()).toEqual([
        'connection',
        'member',
      ]);
      expect(Object.keys(backdrop.edgeTypes).sort()).toEqual(['a2a', 'mcp']);
    }
    // The catalogue, pure, says the same names and lines as the drawings.
    expect(
      SCENE_BACKDROPS.map(({ id, name, description }) => ({
        id,
        name,
        description,
      })),
    ).toEqual(SCENE_BACKDROP_CHOICES);
    expect(sceneBackdropChoice('plain').name).toBe('Plain');
    expect(sceneBackdropChoice('neon').id).toBe('studio');
    // Each draws a member alone as it draws it in the graph: the studio its
    // character, the hero and the plain a face, the same object each time.
    const sales = member('sales', 'Sales', { emoji: '🤝' });
    expect(STUDIO_BACKDROP.figure(sales)).toBe('paperclip');
    expect(HERO_BACKDROP.figure(sales)).toBe(HERO_BACKDROP.figure(sales));
    expect(HERO_BACKDROP.figure(sales)).not.toBe(PLAIN_BACKDROP.figure(sales));
    // The hero's theme tints a box deep, in both modes; the studio's leaves it to the page.
    const tinted = sceneStageSx(HERO_BACKDROP.theme) as Record<string, unknown>;
    expect(tinted['--scene-stage-bg']).toMatch(/^#/);
    expect(
      (tinted['[data-color-mode="dark"] &'] as Record<string, string>)[
        '--scene-stage-bg'
      ],
    ).toMatch(/^#/);
    expect(sceneStageSx(STUDIO_BACKDROP.theme)).not.toHaveProperty(
      '--scene-stage-bg',
    );
    expect(sceneBackdrop('hero')).toBe(HERO_BACKDROP);
    expect(sceneBackdrop('plain')).toBe(PLAIN_BACKDROP);
    expect(sceneBackdrop('space')).toBe(SPACE_BACKDROP);
    // The space's colours are Primer's tokens, light and dark; it has a ground.
    const space = sceneStageSx(SPACE_BACKDROP.theme) as Record<string, unknown>;
    expect(space['--scene-stage-bg']).toMatch(/^var\(--bgColor-/);
    expect(space['--scene-space-glow']).toMatch(/^var\(--fgColor-accent/);
    expect(
      (space['[data-color-mode="dark"] &'] as Record<string, string>)[
        '--scene-stage-bg'
      ],
    ).toMatch(/^var\(--bgColor-/);
    expect(SPACE_BACKDROP.ground).toBeDefined();
    expect(SPACE_BACKDROP.figure(sales)).toBe(SPACE_BACKDROP.figure(sales));
    expect(sceneBackdrop()).toBe(STUDIO_BACKDROP);
    expect(DEFAULT_SCENE_BACKDROP).toBe(STUDIO_BACKDROP);
  });

  it('draw an unknown backdrop as studio, and say so once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(sceneBackdrop('neon')).toBe(STUDIO_BACKDROP);
    expect(sceneBackdrop('neon')).toBe(STUDIO_BACKDROP);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('no scene backdrop "neon"');
    const { container } = render(<Scene backdrop="neon" />);
    expect(
      container
        .querySelector('[data-a2a-team-graph]')
        ?.getAttribute('data-scene-backdrop'),
    ).toBe('studio');
    warn.mockRestore();
  });

  it.each(['studio', 'hero', 'plain', 'space'] as const)(
    'draw the same scene on %s: every member, its connection, and the links',
    backdrop => {
      const { container } = render(<Scene backdrop={backdrop} />);
      const graph = container.querySelector('[data-a2a-team-graph]');
      expect(graph?.getAttribute('data-scene-backdrop')).toBe(backdrop);
      expect(graph?.getAttribute('data-a2a-members')).toBe('3');
      for (const id of ['sales', 'accounting', 'shipping']) {
        const node = container.querySelector(`[data-team-member="${id}"]`);
        expect(node, id).not.toBeNull();
        expect(
          node?.querySelector('[data-assistant-figure]'),
          `${id}'s figure`,
        ).not.toBeNull();
      }
      expect(
        container.querySelector('[data-team-member="sales"]')?.textContent,
      ).toContain('Sales');
      expect(
        container.querySelector('[data-team-connection="odoo-accounting"]')
          ?.textContent,
      ).toContain('Odoo');
      // Accounting calls Odoo: its mark is busy, and a screen reader hears it.
      expect(
        container
          .querySelector('[data-team-connection="odoo-accounting"]')
          ?.getAttribute('data-connection-busy'),
      ).toBe('true');
      expect(graph?.textContent).toContain(
        'Accounting calls Odoo · list invoices',
      );
      // The links and the call, as React Flow keeps them.
      expect(
        graph?.getAttribute('aria-label') ??
          container.querySelector('.react-flow')?.getAttribute('aria-label'),
      ).toContain('Sales and Accounting, Shipping, over A2A');
    },
  );

  it('say the same flow to a screen reader on every backdrop', () => {
    for (const backdrop of ['studio', 'hero', 'plain', 'space'] as const) {
      const { container, unmount } = render(
        <Scene backdrop={backdrop} flows={{ accounting: 'asking' }} />,
      );
      const graph = container.querySelector('[data-a2a-team-graph]');
      expect(graph?.getAttribute('data-a2a-flow')).toBe('asking');
      expect(
        graph?.querySelector('[aria-live="polite"]')?.textContent,
      ).toContain('Sales asks Accounting');
      unmount();
    }
  });

  it('frame a face: the emoji, else the character drawn small, else the initial', () => {
    const emoji = faceCharacter(member('sales', 'Sales', { emoji: '🤝' }), {
      id: 'f',
      ring: {},
    });
    expect(emoji.name).toBe('Sales’s face');
    const { container: withEmoji } = render(<emoji.Drawing size={64} />);
    expect(
      withEmoji
        .querySelector('[data-scene-face]')
        ?.getAttribute('data-scene-face'),
    ).toBe('emoji');
    expect(withEmoji.textContent).toBe('🤝');
    const drawn = faceCharacter(member('sales', 'Sales'), {
      id: 'f',
      ring: {},
    });
    const { container: withCharacter } = render(<drawn.Drawing size={64} />);
    expect(
      withCharacter
        .querySelector('[data-scene-face]')
        ?.getAttribute('data-scene-face'),
    ).toBe('character');
    expect(withCharacter.querySelector('svg')).not.toBeNull();
    const initial = faceCharacter(
      member('ops', 'Operations', {
        character: { kind: 'model3d', id: 'model3d', name: 'Robot', url: 'x' },
      }),
      { id: 'f', ring: {} },
    );
    const { container: withInitial } = render(<initial.Drawing size={64} />);
    expect(withInitial.textContent).toBe('O');
  });
});

/** Where an edge's words go, as `ReactFlow` makes it: its labels' layer, in the store's node. */
function LabelLayer() {
  const store = useStoreApi();
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    if (node) {
      store.setState({ domNode: node });
    }
  }, [node, store]);
  return (
    <div ref={setNode}>
      <div className="react-flow__edgelabel-renderer" />
    </div>
  );
}

const EDGE = {
  id: 'sales->accounting',
  source: 'sales',
  target: 'accounting',
  sourceX: 0,
  sourceY: 50,
  targetX: 200,
  targetY: 50,
};

function HeroEdge({ flow }: { flow: A2ATeamFlow }) {
  return (
    <ReactFlowProvider>
      <LabelLayer />
      <svg>
        <HeroLinkEdge
          {...({
            ...EDGE,
            data: {
              flow,
              connected: true,
              label: flow === 'still' ? 'A2A' : 'A2A · Sales asks Accounting',
            },
          } as unknown as React.ComponentProps<typeof HeroLinkEdge>)}
        />
      </svg>
    </ReactFlowProvider>
  );
}

describe('the hero edge', () => {
  it('flies a dot along the edge: out while asking, back while answering, none at rest', () => {
    const { container, rerender } = render(<HeroEdge flow="still" />);
    expect(container.querySelector('[data-a2a-edge-flow]')).toBeNull();
    expect(container.querySelector('[data-scene-dot]')).toBeNull();
    expect(container.textContent).toContain('A2A');
    act(() => rerender(<HeroEdge flow="asking" />));
    const out = container.querySelector('[data-scene-dot]');
    expect(out?.getAttribute('data-scene-dot')).toBe('out');
    expect(
      container
        .querySelector('[data-a2a-edge-flow]')
        ?.getAttribute('data-a2a-edge-flow'),
    ).toBe('asking');
    // The dot and its trail follow the edge's own path, from Sales to Accounting.
    const motions = Array.from(out!.querySelectorAll('animateMotion'));
    expect(motions.length).toBe(2);
    for (const motion of motions) {
      expect(motion.getAttribute('path')).toBe('M 0,50 L 200,50');
      expect(motion.getAttribute('repeatCount')).toBe('indefinite');
    }
    expect(container.textContent).toContain('Sales asks Accounting');
    act(() => rerender(<HeroEdge flow="answering" />));
    const back = container.querySelector('[data-scene-dot]');
    expect(back?.getAttribute('data-scene-dot')).toBe('back');
    expect(back?.querySelector('animateMotion')?.getAttribute('path')).toBe(
      'M 200,50 L 0,50',
    );
  });

  it('stands the dot at the end the message goes to under reduced motion', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { container } = render(
        <ReactFlowProvider>
          <LabelLayer />
          <svg>
            <HeroCallEdge
              {...({
                ...EDGE,
                data: {
                  flow: 'asking',
                  calling: 'list invoices',
                  label: 'MCP · list invoices',
                },
              } as unknown as React.ComponentProps<typeof HeroCallEdge>)}
            />
          </svg>
        </ReactFlowProvider>,
      );
      const still = container.querySelector('[data-scene-dot]');
      expect(still?.getAttribute('data-scene-dot')).toBe('still');
      expect(still?.querySelector('animateMotion')).toBeNull();
      expect(still?.querySelector('circle')?.getAttribute('cx')).toBe('200');
      expect(
        container
          .querySelector('[data-mcp-edge-call]')
          ?.getAttribute('data-mcp-edge-call'),
      ).toBe('list invoices');
      expect(
        container.querySelector('[data-mcp-edge-label]')?.textContent,
      ).toBe('MCP · list invoices');
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});

describe('the space', () => {
  it('draws its ground behind the flow, and each member beside its name', () => {
    const { container } = render(<Scene backdrop="space" />);
    const graph = container.querySelector('[data-a2a-team-graph]');
    const ground = graph?.querySelector('[data-scene-ground="space"]');
    expect(ground?.getAttribute('aria-hidden')).toBe('true');
    expect(ground?.querySelectorAll('pattern').length).toBe(4);
    expect(
      container.querySelector('[data-team-member="sales"] [data-scene-orbit]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector('[data-team-member="sales"] [data-member-beside]')
        ?.getAttribute('data-member-beside'),
    ).toBe('left');
    expect(
      container
        .querySelector('[data-team-member="accounting"] [data-member-beside]')
        ?.getAttribute('data-member-beside'),
    ).toBe('right');
    // No other backdrop has a ground.
    const { container: hero } = render(<Scene backdrop="hero" />);
    expect(hero.querySelector('[data-scene-ground]')).toBeNull();
  });

  it('draws each node compact: its mark and its name, the details on hover or focus, kept by a click, closed by Escape', () => {
    const { container } = render(<Scene backdrop="space" />);
    const accounting = container.querySelector(
      '[data-team-member="accounting"]',
    )!;
    const name = accounting.querySelector(
      'button[data-member-name]',
    ) as HTMLButtonElement;
    const card = accounting.querySelector('[data-member-details]')!;
    // At rest: the name alone; where it runs is in the card, hidden.
    expect(name.textContent).toBe('Accounting');
    expect(accounting.querySelector('[data-member-where]')).toBeNull();
    expect(card.hasAttribute('hidden')).toBe(true);
    expect(name.getAttribute('aria-controls')).toBe(card.id);
    expect(card.textContent).toContain('On a runtime.');
    expect(card.textContent).toContain('Working.');
    expect(card.textContent).toContain('Reaches Odoo over MCP.');
    // Hovered or focused: a peek.
    act(() => {
      fireEvent.mouseEnter(name);
    });
    expect(card.hasAttribute('hidden')).toBe(false);
    expect(card.getAttribute('data-member-details')).toBe('peek');
    act(() => {
      fireEvent.mouseLeave(name);
    });
    expect(card.hasAttribute('hidden')).toBe(true);
    act(() => {
      fireEvent.focus(name);
    });
    expect(card.hasAttribute('hidden')).toBe(false);
    act(() => {
      fireEvent.blur(name);
    });
    // Clicked: kept, said expanded; Escape closes it; a second click too.
    act(() => {
      fireEvent.click(name);
    });
    expect(name.getAttribute('aria-expanded')).toBe('true');
    expect(card.getAttribute('data-member-details')).toBe('kept');
    act(() => {
      fireEvent.keyDown(name, { key: 'Escape' });
    });
    expect(name.getAttribute('aria-expanded')).toBe('false');
    expect(card.hasAttribute('hidden')).toBe(true);
    act(() => {
      fireEvent.click(name);
    });
    act(() => {
      fireEvent.click(name);
    });
    expect(card.hasAttribute('hidden')).toBe(true);
    // A system: its mark and its label; how it is reached in its card.
    const odoo = container.querySelector(
      '[data-team-connection="odoo-accounting"]',
    )!;
    const mark = odoo.querySelector('button[data-connection-figure]')!;
    const told = odoo.querySelector('[data-connection-details]')!;
    expect(told.hasAttribute('hidden')).toBe(true);
    act(() => {
      fireEvent.mouseEnter(mark);
    });
    expect(told.hasAttribute('hidden')).toBe(false);
    expect(told.textContent).toContain('via MCP');
    act(() => {
      fireEvent.keyDown(mark, { key: 'Escape' });
    });
    expect(told.hasAttribute('hidden')).toBe(true);
    // Another backdrop keeps its words under the figure.
    const { container: hero } = render(<Scene backdrop="hero" />);
    expect(
      hero.querySelector('[data-team-member="accounting"] [data-member-where]')
        ?.textContent,
    ).toBe('on a runtime');
  });

  it('flows a light along the edge: out while asking, back while answering, none at rest', () => {
    const draw = (flow: A2ATeamFlow) => (
      <ReactFlowProvider>
        <LabelLayer />
        <svg>
          <SpaceLinkEdge
            {...({
              ...EDGE,
              data: { flow, connected: true, label: 'A2A' },
            } as unknown as React.ComponentProps<typeof SpaceLinkEdge>)}
          />
        </svg>
      </ReactFlowProvider>
    );
    const { container, rerender } = render(draw('still'));
    expect(container.querySelector('[data-scene-light]')).toBeNull();
    act(() => rerender(draw('asking')));
    const out = container.querySelector('[data-scene-light]');
    expect(out?.getAttribute('data-scene-light')).toBe('out');
    expect(out?.querySelector('animate')?.getAttribute('attributeName')).toBe(
      'stroke-dashoffset',
    );
    for (const motion of Array.from(out!.querySelectorAll('animateMotion'))) {
      expect(motion.getAttribute('path')).toBe('M 0,50 L 200,50');
    }
    act(() => rerender(draw('answering')));
    const back = container.querySelector('[data-scene-light]');
    expect(back?.getAttribute('data-scene-light')).toBe('back');
    expect(back?.querySelector('animateMotion')?.getAttribute('path')).toBe(
      'M 200,50 L 0,50',
    );
  });

  it('stands the light at the end the message goes to under reduced motion', () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { container } = render(
        <ReactFlowProvider>
          <LabelLayer />
          <svg>
            <SpaceCallEdge
              {...({
                ...EDGE,
                data: {
                  flow: 'answering',
                  calling: 'list invoices',
                  label: 'MCP · list invoices',
                },
              } as unknown as React.ComponentProps<typeof SpaceCallEdge>)}
            />
          </svg>
        </ReactFlowProvider>,
      );
      const still = container.querySelector('[data-scene-light]');
      expect(still?.getAttribute('data-scene-light')).toBe('still');
      expect(container.querySelector('animateMotion, animate')).toBeNull();
      expect(still?.querySelector('circle')?.getAttribute('cx')).toBe('0');
      expect(
        container
          .querySelector('[data-mcp-edge-call]')
          ?.getAttribute('data-mcp-edge-call'),
      ).toBe('list invoices');
    } finally {
      window.matchMedia = matchMedia;
    }
  });
});

describe('the plain edge', () => {
  it('does not move: an arrow toward the end the message goes to, the state in words', () => {
    const draw = (flow: A2ATeamFlow) => (
      <ReactFlowProvider>
        <LabelLayer />
        <svg>
          <PlainLinkEdge
            {...({
              ...EDGE,
              data: {
                flow,
                connected: true,
                label:
                  flow === 'still'
                    ? 'A2A'
                    : flow === 'asking'
                      ? 'A2A · Sales asks Accounting'
                      : 'A2A · Accounting answers Sales',
              },
            } as unknown as React.ComponentProps<typeof PlainLinkEdge>)}
          />
        </svg>
      </ReactFlowProvider>
    );
    const tip = (container: HTMLElement) =>
      container
        .querySelector('[data-a2a-edge-flow] [data-scene-arrow]')
        ?.getAttribute('d')
        ?.split(' ')[1];
    const { container, rerender } = render(draw('still'));
    expect(container.querySelector('animateMotion')).toBeNull();
    expect(container.querySelector('.a2a-team-flow')).toBeNull();
    expect(tip(container)).toBe('200,50');
    expect(container.textContent).toContain('A2A');
    act(() => rerender(draw('asking')));
    expect(tip(container)).toBe('200,50');
    expect(container.textContent).toContain('A2A · Sales asks Accounting');
    act(() => rerender(draw('answering')));
    expect(tip(container)).toBe('0,50');
    expect(container.textContent).toContain('A2A · Accounting answers Sales');
    expect(container.querySelector('animateMotion')).toBeNull();
  });
});

describe('the selected exchange on the stage (S3-02)', () => {
  it('is on the edge by its id, or by its ends either way: an answer travels the ask’s edge back', () => {
    const on = {
      id: 'sales->accounting',
      from: 'sales',
      to: 'accounting',
      over: 'a2a' as const,
      key: 'k1',
    };
    expect(edgeSelected(on, 'sales', 'accounting')).toBe(true);
    expect(edgeSelected(on, 'accounting', 'sales')).toBe(true);
    expect(edgeSelected(on, 'sales', 'shipping')).toBe(false);
    expect(edgeSelected(null, 'sales', 'accounting')).toBe(false);
    expect(
      edgeSelected(
        {
          ...on,
          id: 'accounting->accounting/odoo-accounting',
          from: 'accounting',
          to: 'accounting/odoo-accounting',
          over: 'mcp',
        },
        'accounting',
        'accounting/odoo-accounting',
      ),
    ).toBe(true);
  });

  it('says the selection on the graph’s box, and draws a halo under the edge on every backdrop', () => {
    const { container } = render(
      <Scene
        backdrop="hero"
        selected={{
          id: 'sales->accounting',
          from: 'sales',
          to: 'accounting',
          over: 'a2a',
          key: 'k1',
        }}
      />,
    );
    expect(
      container
        .querySelector('[data-a2a-team-graph]')
        ?.getAttribute('data-a2a-selected'),
    ).toBe('sales->accounting');
    for (const [name, EdgeView] of [
      ['studio', LinkEdge],
      ['hero', HeroLinkEdge],
      ['plain', PlainLinkEdge],
      ['space', SpaceLinkEdge],
    ] as const) {
      const draw = (selected: boolean) => (
        <ReactFlowProvider>
          <LabelLayer />
          <svg>
            <EdgeView
              {...({
                ...EDGE,
                data: {
                  flow: 'still',
                  connected: true,
                  label: 'A2A',
                  selected,
                },
              } as unknown as React.ComponentProps<typeof EdgeView>)}
            />
          </svg>
        </ReactFlowProvider>
      );
      const drawn = render(draw(false));
      expect(
        drawn.container.querySelector('[data-edge-selected]'),
        name,
      ).toBeNull();
      act(() => drawn.rerender(draw(true)));
      const halo = drawn.container.querySelector('[data-edge-selected]');
      expect(halo, name).not.toBeNull();
      expect(halo?.getAttribute('d'), name).toBe('M 0,50 L 200,50');
      drawn.unmount();
    }
  });
});

describe('a member’s colour', () => {
  const palette = () => {
    const { theme, colorMode } = useThemeStore.getState();
    return getColorPalette(theme, colorMode);
  };

  function Colored({ backdrop }: { backdrop: string }) {
    return (
      <A2ATeamGraph
        entry={member('sales', 'Sales', { emoji: '🤝', color: 'indigo' })}
        peers={[
          member('accounting', 'Accounting', {
            emoji: '📒',
            color: '#0F766E',
            connections: [ODOO],
          }),
          member('shipping', 'Shipping', { color: 'navy' }),
        ]}
        links={[
          { from: 'sales', to: 'accounting' },
          { from: 'sales', to: 'shipping' },
        ]}
        connected
        backdrop={backdrop as 'studio'}
      />
    );
  }

  it('is the theme’s value of its name, a hex as it is, nothing else', () => {
    for (const backdrop of ['studio', 'hero', 'plain', 'space']) {
      const { container, unmount } = render(<Colored backdrop={backdrop} />);
      const tone = (id: string) =>
        (
          container.querySelector(`[data-team-member="${id}"]`) as HTMLElement
        ).style.getPropertyValue('--scene-member');
      expect(tone('sales'), backdrop).toBe(
        resolveSpecColor('indigo', palette()) ?? '',
      );
      expect(tone('accounting'), backdrop).toBe('#0F766E');
      expect(tone('shipping'), backdrop).toBe('');
      unmount();
    }
  });

  it('follows the mode', () => {
    const before = useThemeStore.getState().colorMode;
    try {
      act(() => useThemeStore.setState({ colorMode: 'light' }));
      const { container, unmount } = render(<Colored backdrop="space" />);
      const sales = container.querySelector(
        '[data-team-member="sales"]',
      ) as HTMLElement;
      expect(sales.style.getPropertyValue('--scene-member')).toBe(
        resolveSpecColor(
          'indigo',
          getColorPalette(useThemeStore.getState().theme, 'light'),
        ) ?? '',
      );
      act(() => useThemeStore.setState({ colorMode: 'dark' }));
      expect(sales.style.getPropertyValue('--scene-member')).toBe(
        resolveSpecColor(
          'indigo',
          getColorPalette(useThemeStore.getState().theme, 'dark'),
        ) ?? '',
      );
      unmount();
    } finally {
      useThemeStore.setState({ colorMode: before });
    }
  });

  it('draws the space’s line to a member in its colour', () => {
    const drawn = render(
      <ReactFlowProvider>
        <LabelLayer />
        <svg>
          <SpaceLinkEdge
            {...({
              ...EDGE,
              data: {
                flow: 'still',
                connected: true,
                label: 'A2A',
                selected: false,
                color: '#0F766E',
              },
            } as unknown as React.ComponentProps<typeof SpaceLinkEdge>)}
          />
        </svg>
      </ReactFlowProvider>,
    );
    expect(drawn.container.innerHTML).toContain('#0F766E');
    expect(drawn.container.innerHTML).not.toContain('--scene-space-glow');
  });

  it('of an application is its agent’s', () => {
    expect(appColorOf({ agent: '' })).toBeUndefined();
    expect(appColorOf(undefined)).toBeUndefined();
    expect(appColorOf({ agent: 'no-such-agent:0.0.1' })).toBeUndefined();
  });

  it('resolves a hex as it is, a role by the palette, nothing else', () => {
    const dark = getColorPalette('datalayer', 'dark');
    expect(resolveSpecColor('#abc', dark)).toBe('#abc');
    expect(resolveSpecColor('primary', dark)).toBe(dark.primary);
    expect(resolveSpecColor('isLight', dark)).toBeUndefined();
    expect(resolveSpecColor('toString', dark)).toBeUndefined();
    expect(resolveSpecColor('#12345', dark)).toBeUndefined();
    expect(resolveSpecColor('', dark)).toBeUndefined();
  });
});
