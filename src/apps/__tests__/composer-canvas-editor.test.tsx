/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent surface, drawn: the agent in the
 * centre of a React Flow graph, a node per kind around it — the connections'
 * called *MCP* — a part selected opening its properties, Delete taking one
 * off; and a part dragged from the toolbox lighting the node of its kind
 * only, dropped there and nowhere else. The Python surface, when given, sits
 * in the switch before the Preview and stays mounted while hidden.
 *
 * jsdom draws no layout: the box's width is given, and what is checked is
 * what is rendered and what a drag and a drop do, not how it looks.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
  vi,
} from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { dumpAppspec, emptyAppspec, parseAppspec } from '../apps/appspec';
import type { AppSpec } from '../../types/agentspecs';
import { canvasPartsOf, canvasPartsReactor } from '../plugins/canvas-parts';
import { withPartAdded } from '../composer/appDesign';
import {
  AppCanvasEditor,
  type AppCanvasEditorEditProps,
} from '../composer/AppCanvasEditor';
import { besideEditor, clampDock } from '../composer/DesignerShell';

/** An application that asks one business over PACT, as the Studio adds one. */
const withPactConnection = (
  app: AppSpec,
  connection: {
    brand: string;
    audience: string;
    access: string;
    scopes: string[];
  },
): AppSpec => {
  const read = parseAppspec({
    ...(dumpAppspec(app) as Record<string, unknown>),
    protocols: ['pact'],
    pact: {
      connections: [
        { id: connection.brand.replace(/\W+/g, '-'), ...connection },
      ],
    },
  });
  if (read.problems.length) {
    throw new Error(read.problems.join(' '));
  }
  return read.app;
};

vi.mock('@datalayer/primer-addons', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@datalayer/primer-addons',
  );
  const react = await vi.importActual<typeof import('react')>('react');
  // What a Box passes to its element: behaviour and names, not paint.
  const Box = react.forwardRef(({ as, children, ...rest }: any, ref: any) =>
    react.createElement(
      as ?? 'div',
      {
        ref,
        ...Object.fromEntries(
          Object.entries(rest).filter(
            ([key]) =>
              /^(on[A-Z]|data-|aria-)/.test(key) ||
              [
                'type',
                'hidden',
                'className',
                'title',
                'disabled',
                'id',
                'role',
                'draggable',
              ].includes(key),
          ),
        ),
      },
      children,
    ),
  );
  // The demo's warning: open or not, and what it says.
  const SlidingPanel = ({ isOpen, message, details, variant }: any) =>
    isOpen
      ? react.createElement(
          'div',
          { 'data-sliding-panel': '', 'data-variant': variant },
          message,
          details,
        )
      : null;
  return {
    ...actual,
    Box,
    Card: Box,
    SlidingPanel,
    usePaletteColor: () => (color?: string) => color,
  };
});

vi.mock('../composer/SchemaProperties', async () => {
  const react = await vi.importActual<typeof import('react')>('react');
  return {
    SchemaProperties: ({ title }: any) =>
      react.createElement('div', { 'data-properties-of': title }),
  };
});

vi.mock('@primer/react', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@primer/react');
  const react = await vi.importActual<typeof import('react')>('react');
  const plain =
    (tag: string): any =>
    ({
      children,
      sx: _sx,
      variant: _v,
      size: _s,
      block: _b,
      leadingVisual: _l,
      ...rest
    }: any) =>
      react.createElement(tag, rest, children);
  // As Primer's: each child's index from `Children.map`, which counts a `null` child too.
  const SegmentedControl = ({ children, onChange }: any) =>
    react.createElement(
      'div',
      { 'data-switch': '' },
      react.Children.map(children, (child: any, index: number) =>
        child
          ? react.cloneElement(child, { onClick: () => onChange(index) })
          : null,
      ),
    );
  SegmentedControl.Button = ({
    children,
    selected,
    leadingIcon: _icon,
    onClick,
  }: any) =>
    react.createElement(
      'button',
      {
        type: 'button',
        'aria-pressed': selected,
        onClick,
        'data-surface': children,
      },
      children,
    );
  const ActionList = plain('ul');
  ActionList.Item = ({ children, active: _a, onSelect }: any) =>
    react.createElement('li', { onClick: onSelect }, children);
  ActionList.LeadingVisual = plain('span');
  ActionList.Description = plain('span');
  const ActionMenu = plain('div');
  ActionMenu.Button = plain('button');
  ActionMenu.Overlay = plain('div');
  const FormControl = plain('label');
  FormControl.Label = plain('span');
  FormControl.Caption = plain('span');
  const Select = plain('select');
  Select.Option = plain('option');
  Select.OptGroup = plain('optgroup');
  return {
    ...actual,
    ActionList,
    ActionMenu,
    Button: plain('button'),
    Flash: plain('div'),
    FormControl,
    // The dock's toggle (DesignerShell) and its header's and footer's labels.
    IconButton: ({ icon: _icon, 'aria-label': label, onClick, ...rest }: any) =>
      react.createElement('button', {
        type: 'button',
        'aria-label': label,
        onClick,
        'data-designer-dock-toggle': rest['data-designer-dock-toggle'],
      }),
    Label: plain('span'),
    SegmentedControl,
    Select,
    Text: plain('span'),
    useConfirm: () => async () => true,
    useTheme: () => ({ colorScheme: 'light' }),
  };
});

const OFFERED = canvasPartsOf(canvasPartsReactor());
const CONNECTION = OFFERED.find(part => part.kind === 'connection')!;
const RULE = OFFERED.find(part => part.kind === 'rule')!;

/** Support desk: one connection, one rule. */
const definition = () => {
  let data: unknown = dumpAppspec({
    ...emptyAppspec('chat'),
    name: 'Desk',
    agent: 'desk-agent',
    instructions: 'Answer from the docs.',
  });
  data = withPartAdded(data, CONNECTION).data;
  data = withPartAdded(data, RULE).data;
  return { spec: parseAppspec(data).app, interface: null } as any;
};

/** A drag event as a browser sends it: its data carried, what it says it does written back. */
const dragEvent = (type: string, carried: Record<string, string>) => {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as Event & { dataTransfer: any };
  const dataTransfer = {
    types: Object.keys(carried),
    getData: (key: string) => carried[key] ?? '',
    setData: (key: string, value: string) => {
      carried[key] = value;
    },
    dropEffect: 'move',
    effectAllowed: 'all',
  };
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
};

let root: Root;
let host: HTMLDivElement;
const onChange = vi.fn();

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no structuredClone; a part's example is plain data.
  (globalThis as any).structuredClone ??= (value: unknown) =>
    JSON.parse(JSON.stringify(value));
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // The surface's box, as wide as a desktop's: React Flow is drawn once it is measured.
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 900,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 600,
  });
  (globalThis as any).DOMMatrixReadOnly = class {
    m22 = 1;
    constructor() {}
  };
});

beforeEach(() => {
  onChange.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const draw = (props: Partial<AppCanvasEditorEditProps> = {}) =>
  act(() => {
    root.render(
      <AppCanvasEditor
        definition={definition()}
        onChange={onChange}
        layout={<div data-layout="" />}
        {...props}
      />,
    );
  });
const $ = (selector: string) => host.querySelector(selector) as HTMLElement;
const fire = (element: Element, event: Event) =>
  act(() => {
    element.dispatchEvent(event);
  });
/** The panels open folded: unfold the Toolbox by its title bar. */
// One folded menu per kind of part (12 October 2026): open them all.
const openToolbox = () =>
  [...host.querySelectorAll('[id^="designer-toolbox-"]')].forEach(menu =>
    fire(menu, new MouseEvent('click', { bubbles: true })),
  );

describe('the Agent surface on React Flow', () => {
  it('draws the agent in the centre and a node per kind, the connections’ called MCP (its edges: designerGraph.spec)', () => {
    draw();
    expect($('[data-designer-graph="radial"]')).not.toBeNull();
    expect(
      $('[data-designer-node="agent"] [data-designer-part="agent"]'),
    ).not.toBeNull();
    expect(
      [...host.querySelectorAll('[data-designer-frame]')].map(node =>
        node.getAttribute('data-designer-frame'),
      ),
    ).toEqual([
      'model',
      'connection',
      'protocol',
      'skill',
      'rule',
      'ui',
      'test',
      'event',
      // The accountability plane (6 November 2026): a Guard, a Gate, the Track.
      'guard',
      'gate',
      'track',
    ]);
    // The agent drawn as the avatar its assistant shows: the paper clip when unsaid.
    expect(
      $('[data-designer-node="agent"] [data-designer-avatar="paperclip"]'),
    ).not.toBeNull();
    expect($('[data-designer-frame="connection"]').textContent).toContain(
      'MCP',
    );
    expect(
      $(
        '[data-designer-frame="connection"] [data-designer-part="connection-0"]',
      ),
    ).not.toBeNull();
    openToolbox();
    expect($('[data-designer-tool-group="connection"]').textContent).toContain(
      'MCP',
    );
  });

  it('opens a part’s properties when it is selected, and Delete takes it off', () => {
    draw();
    fire(
      $('[data-designer-part="connection-0"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-properties-of]').getAttribute('data-properties-of')).toBe(
      (CONNECTION.example as { server: string }).server,
    );
    expect(
      $('[data-designer-part="connection-0"]').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(host.textContent).toContain('Remove this MCP server');
    fire(
      $('[data-designer-part="connection-0"]'),
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('designer:remove:connection-0');
  });
});

describe('the panels and a click on the surface', () => {
  it('open folded, Properties first; a node clicked opens the Properties of what it picked', () => {
    draw();
    const panels = [...host.querySelectorAll('[data-designer-panel]')].map(
      panel => panel.getAttribute('data-designer-panel'),
    );
    // Properties first, then a menu per kind of part the plugins contribute, then the page's events.
    expect(panels[0]).toBe('properties');
    expect(panels.at(-1)).toBe('events');
    const menus = panels.slice(1, -1);
    expect(menus.every(id => id?.startsWith('toolbox-'))).toBe(true);
    expect(menus).toEqual(
      expect.arrayContaining([
        'toolbox-skill',
        'toolbox-protocol',
        'toolbox-rule',
        'toolbox-test',
      ]),
    );
    for (const id of panels as string[]) {
      expect([id, $(`#designer-${id}`).getAttribute('aria-expanded')]).toEqual([
        id,
        'false',
      ]);
    }
    // The agent's node, anywhere on it.
    fire(
      $('[data-designer-node="agent"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('#designer-properties').getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect($('[data-designer-part="agent"]').getAttribute('aria-pressed')).toBe(
      'true',
    );
    // A kind's node: its first part.
    fire(
      $('[data-designer-frame="connection"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect(
      $('[data-designer-part="connection-0"]').getAttribute('aria-pressed'),
    ).toBe('true');
    // A kind with none: what to add.
    fire(
      $('[data-designer-frame="skill"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-designer-panel="properties"]').textContent).toContain(
      'Skills: none yet. Drag one from the Toolbox onto it.',
    );
    // Folded again by its title bar, opened again by the next click.
    fire($('#designer-properties'), new MouseEvent('click', { bubbles: true }));
    expect($('#designer-properties').getAttribute('aria-expanded')).toBe(
      'false',
    );
    fire(
      $('[data-designer-part="connection-0"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('#designer-properties').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
});

describe('a part dragged from the toolbox: dropped on the node of its kind, nowhere else', () => {
  const DRAGGED = 'application/x-datalayer-designer-part';

  it('lights its node, refuses every other place, and is added only where it belongs', () => {
    draw();
    openToolbox();
    const carried: Record<string, string> = {};
    fire(
      $(`[data-designer-tool="${CONNECTION.id}"]`),
      dragEvent('dragstart', carried),
    );
    expect(carried[DRAGGED]).toBe(CONNECTION.id);
    expect(
      $('[data-designer-frame="connection"]').getAttribute(
        'data-designer-drop',
      ),
    ).toBe('target');
    for (const kind of [
      'model',
      'protocol',
      'skill',
      'rule',
      'ui',
      'test',
      'event',
    ]) {
      expect([
        kind,
        $(`[data-designer-frame="${kind}"]`).getAttribute('data-designer-drop'),
      ]).toEqual([kind, 'refused']);
    }

    // Over another kind's node, over the agent, over the surface around them: not here.
    for (const where of [
      '[data-designer-frame="rule"]',
      '[data-designer-node="agent"]',
      '[data-designer-graph]',
    ]) {
      const over = dragEvent('dragover', { ...carried });
      fire($(where), over);
      expect([
        where,
        over.defaultPrevented,
        over.dataTransfer.dropEffect,
      ]).toEqual([where, false, 'none']);
      fire($(where), dragEvent('drop', { ...carried }));
    }
    expect(onChange).not.toHaveBeenCalled();

    // Over its own: a copy, and dropped, added as a connection.
    const over = dragEvent('dragover', { ...carried });
    fire($('[data-designer-frame="connection"]'), over);
    expect([over.defaultPrevented, over.dataTransfer.dropEffect]).toEqual([
      true,
      'copy',
    ]);
    fire(
      $('[data-designer-frame="connection"]'),
      dragEvent('drop', { ...carried }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('designer:add:connection-1');
  });

  it('lights nothing once it is let go', () => {
    draw();
    openToolbox();
    const tool = $(`[data-designer-tool="${RULE.id}"]`);
    fire(tool, dragEvent('dragstart', {}));
    expect(
      $('[data-designer-frame="rule"]').getAttribute('data-designer-drop'),
    ).toBe('target');
    fire(tool, dragEvent('dragend', {}));
    expect(host.querySelector('[data-designer-drop]')).toBeNull();
  });

  it('puts an avatar on the agent, and nowhere else', () => {
    draw();
    openToolbox();
    const carried: Record<string, string> = {};
    fire(
      $('[data-designer-tool="avatar:wizard"]'),
      dragEvent('dragstart', carried),
    );
    expect(
      $('[data-designer-node="agent"]').getAttribute('data-designer-drop'),
    ).toBe('target');
    expect(
      $('[data-designer-frame="connection"]').getAttribute(
        'data-designer-drop',
      ),
    ).toBe('refused');
    const over = dragEvent('dragover', { ...carried });
    fire($('[data-designer-node="agent"]'), over);
    expect([over.defaultPrevented, over.dataTransfer.dropEffect]).toEqual([
      true,
      'copy',
    ]);
    // Worn while it is held over the agent.
    expect(
      $('[data-designer-node="agent"] [data-designer-avatar="wizard"]'),
    ).not.toBeNull();
    fire($('[data-designer-node="agent"]'), dragEvent('drop', { ...carried }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('designer:add:agent');
    expect(onChange.mock.calls[0][0].spec.interface.avatar).toBe('wizard');
  });

  it('chooses the agent’s avatar in its properties, as the toolbox places one', () => {
    draw();
    fire(
      $('[data-designer-part="agent"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    const choice = $('[data-designer-avatar-choice]') as HTMLSelectElement;
    expect(choice.value).toBe('');
    expect(Array.from(choice.options).map(option => option.value)).toContain(
      'wizard',
    );
    choice.value = 'wizard';
    fire(choice, new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][1]).toBe('designer:add:agent');
    expect(onChange.mock.calls[0][0].spec.interface.avatar).toBe('wizard');
  });

  it('groups the avatars it may choose: the orb, the clippy.js characters, the drawings, the 3D models', () => {
    draw();
    fire(
      $('[data-designer-part="agent"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    const choice = $('[data-designer-avatar-choice]') as HTMLSelectElement;
    const groups = [...choice.querySelectorAll('optgroup')].map(group => [
      group.getAttribute('label'),
      [...group.querySelectorAll('option')].length,
    ]);
    expect(groups).toEqual([
      ['Datalayer’s orb', 1],
      ['clippy.js characters', 10],
      ['Paper clips and drawings', 4],
      ['3D models', 1],
    ]);
    choice.value = 'orb';
    fire(choice, new Event('change', { bubbles: true }));
    expect(onChange.mock.calls[0][0].spec.interface.avatar).toBe('orb');
  });

  it('lists the clippy.js characters in the toolbox without fetching them, under the note that they are Microsoft’s', () => {
    const fetched = vi.fn();
    const before = globalThis.fetch;
    (globalThis as any).fetch = fetched;
    try {
      draw();
      openToolbox();
      const family = host.querySelector(
        '[data-designer-tool-family="clippy.js characters"]',
      )!;
      expect(family.textContent).toMatch(/Microsoft’s characters.*jsDelivr/);
      expect(
        family.querySelectorAll('[data-designer-avatar-fetched]'),
      ).toHaveLength(10);
      expect(fetched).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = before;
    }
  });

  it('offers a 3D model among the avatars, marked on the agent without drawing it in 3D', () => {
    draw();
    fire(
      $('[data-designer-part="agent"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    const choice = $('[data-designer-avatar-choice]') as HTMLSelectElement;
    expect(Array.from(choice.options).map(option => option.value)).toContain(
      'model3d',
    );
    choice.value = 'model3d';
    fire(choice, new Event('change', { bubbles: true }));
    expect(onChange.mock.calls[0][0].spec.interface.avatar).toEqual({
      kind: 'model3d',
    });
  });

  it('offers the protocols, the UI and the avatars, none of the protocols planned any more', () => {
    draw();
    openToolbox();
    for (const group of ['protocol', 'ui', 'avatar']) {
      expect([
        group,
        Boolean(host.querySelector(`[data-designer-tool-group="${group}"]`)),
      ]).toEqual([group, true]);
    }
    // Every protocol of the catalogue ships since TAP did (14 October 2026): none says it is not enabled.
    const protocols = [
      ...host.querySelectorAll('[data-designer-tool^="protocol:"]'),
    ];
    expect(protocols.length).toBeGreaterThan(0);
    expect(
      protocols.filter(tool => tool.textContent?.includes('Not enabled today')),
    ).toEqual([]);
    fire(
      $('[data-designer-tool="protocol:pap"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onChange.mock.calls[0][1]).toBe('designer:add:protocol-0');
    expect(onChange.mock.calls[0][0].spec.protocols).toEqual(['pap']);
  });

  it('says on the Protocols node what a block configures and it does not list, as stored before `protocols`', () => {
    // An application stored before `protocols` existed: its pact block, nothing listed.
    const listed = withPactConnection(emptyAppspec('chat'), {
      brand: 'air.example',
      audience: 'https://provider.example/a2a',
      access: 'read',
      scopes: ['bookings:read'],
    });
    draw({
      definition: {
        spec: { ...listed, protocols: [] },
        interface: null,
      } as any,
    });
    const node = $('[data-designer-frame="protocol"]');
    expect(node.textContent).toContain(
      'Not listed, yet configured: click to see.',
    );
    expect(
      node.querySelector('[role="img"]')!.getAttribute('aria-label'),
    ).toContain("add 'pact' to `protocols`");
    fire(node, new MouseEvent('click', { bubbles: true }));
    expect($('[data-designer-problems="protocol"]').textContent).toContain(
      "add 'pact' to `protocols`",
    );
    // Nothing listed for the Maker: no write until they add it.
    expect(onChange).not.toHaveBeenCalled();
    openToolbox();
    fire(
      $('[data-designer-tool="protocol:pact"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onChange.mock.calls[0][0].spec.protocols).toEqual(['pact']);
  });

  it('adds with a click where there is no pointer, to its own kind', () => {
    draw();
    openToolbox();
    fire(
      $(`[data-designer-tool="${RULE.id}"]`),
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onChange.mock.calls[0][1]).toBe('designer:add:rule-1');
  });
});

describe('the Python surface', () => {
  it('sits before the Preview, opens when asked, and stays mounted while hidden', () => {
    draw({
      python: <div data-python-file="" />,
      preview: <div data-preview="" />,
      openOnPython: true,
    });
    expect(
      [...host.querySelectorAll('[data-surface]')].map(
        button => button.textContent,
      ),
    ).toEqual(['Agent', 'Configuration', 'Python', 'Preview']);
    expect($('[data-designer-app]').getAttribute('data-designer-app')).toBe(
      'python',
    );
    expect(($('[data-designer-python]') as HTMLElement).hidden).toBe(false);
    expect(host.textContent).toContain(
      'The application written in Python: what the file builds is the application.',
    );
    fire(
      $('[data-surface="Agent"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-designer-app]').getAttribute('data-designer-app')).toBe(
      'agent',
    );
    expect($('[data-python-file]')).not.toBeNull();
    expect(($('[data-designer-python]') as HTMLElement).hidden).toBe(true);
    fire(
      $('[data-surface="Preview"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-designer-app]').getAttribute('data-designer-app')).toBe(
      'preview',
    );
  });

  it('is not in the switch when there is no file', () => {
    draw({ preview: <div data-preview="" /> });
    expect(
      [...host.querySelectorAll('[data-surface]')].map(
        button => button.textContent,
      ),
    ).toEqual(['Agent', 'Configuration', 'Preview']);
    // Each button opens its own surface, whichever are left out (the Preview toggle that never switched, 14 October 2026).
    fire(
      $('[data-surface="Preview"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-designer-app]').getAttribute('data-designer-app')).toBe(
      'preview',
    );
    fire(
      $('[data-surface="Configuration"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-designer-app]').getAttribute('data-designer-app')).toBe(
      'layout',
    );
  });
});

describe('the controls dock (asked 14 October 2026)', () => {
  beforeEach(() => window.localStorage.clear());

  it('docks on the right, floats over a full-width surface from its header, and docks again', () => {
    draw();
    const dock = () =>
      $('[data-designer-dock]').getAttribute('data-designer-dock');
    expect(dock()).toBe('docked');
    expect($('[data-designer-dock-bar="header"]').textContent).toContain(
      'Controls',
    );
    expect($('[data-designer-dock-bar="footer"]')).toBeTruthy();
    // Every panel is inside it.
    expect(
      $('[data-designer-dock] [data-designer-panel="properties"]'),
    ).toBeTruthy();
    act(() => $('[data-designer-dock-toggle]').click());
    expect(dock()).toBe('floating');
    // Kept for the next visit.
    expect(
      JSON.parse(window.localStorage.getItem('datalayer.designer.dock') ?? '{}')
        .floating,
    ).toBe(true);
    act(() => $('[data-designer-dock-toggle]').click());
    expect(dock()).toBe('docked');
  });

  it('moves with the arrow keys on its grip, floating once moved', () => {
    draw();
    const grip = $('[data-designer-dock-grip="footer"]');
    act(() => {
      grip.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect($('[data-designer-dock]').getAttribute('data-designer-dock')).toBe(
      'floating',
    );
  });

  it('says what is selected in its header, and the parts and what to fix in its footer', () => {
    draw();
    act(() => $('[data-designer-part]')?.click());
    expect($('[data-designer-dock-parts]').textContent).toMatch(/\d+ parts?/);
    expect($('[data-designer-dock-problems]')).toBeTruthy();
  });

  it('floats in the picture of the designer too, and is not remembered there', () => {
    act(() => {
      root.render(<AppCanvasEditor mock />);
    });
    act(() => $('[data-designer-dock-toggle]').click());
    expect($('[data-designer-dock]').getAttribute('data-designer-dock')).toBe(
      'floating',
    );
    expect(window.localStorage.getItem('datalayer.designer.dock')).toBeNull();
  });

  it('starts beside a spread editor on its right, the editor narrowed to leave a dock room on either side', () => {
    // Room enough: the editor keeps its width, the dock stands past its right edge.
    expect(besideEditor(2000, 1100)).toEqual({ editorWidth: 1100, x: 1566 });
    // The home page's frame: the editor gives way so the dock fits, and stays centred.
    expect(besideEditor(1618, 1100)).toEqual({ editorWidth: 850, x: 1250 });
  });

  it('stays in the designer, whatever it is dragged to', () => {
    expect(
      clampDock({ x: -50, y: 5000 }, { width: 1000, height: 800 }),
    ).toEqual({ x: 8, y: 752 });
    expect(
      clampDock({ x: 5000, y: -10 }, { width: 1000, height: 800 }),
    ).toEqual({ x: 632, y: 8 });
  });
});

describe('the mock designer (`mock`): a picture of the Accounting example', () => {
  const drawMock = () =>
    act(() => {
      root.render(<AppCanvasEditor mock />);
    });

  it('draws the example’s parts from its Appspec, the paper clip on the agent, and no switch', () => {
    drawMock();
    expect($('[data-designer-mock]')).not.toBeNull();
    expect(host.querySelector('[data-surface]')).toBeNull();
    expect(
      $('[data-designer-node="agent"] [data-designer-avatar="paperclip"]'),
    ).not.toBeNull();
    expect($('[data-designer-part="agent"]').textContent).toContain(
      'worker-accountant',
    );
    expect($('[data-designer-frame="connection"]').textContent).toContain(
      'odoo-accounting',
    );
    expect($('[data-designer-frame="connection"]').textContent).toContain(
      'read',
    );
    expect($('[data-designer-frame="rule"]').textContent).toContain(
      'Read the books',
    );
    expect($('[data-designer-frame="rule"]').textContent).toContain(
      'Change the books',
    );
    expect(
      $('[data-designer-frame="test"]').querySelectorAll(
        '[data-designer-part]',
      ),
    ).toHaveLength(4);
    expect($('[data-designer-frame="protocol"]').textContent).toContain(
      'Agent2Agent',
    );
    // Its UI plugins, as its file lists them: the chat, and its surfaces through A2UI.
    expect(
      $('[data-designer-frame="ui"]').querySelectorAll('[data-designer-part]'),
    ).toHaveLength(2);
    expect($('[data-designer-frame="ui"]').textContent).toContain('Chat');
    expect($('[data-designer-frame="ui"]').textContent).toContain(
      'Surfaces in the conversation',
    );
    expect($('[data-designer-frame="ui"]').textContent).toContain('A2UI');
  });

  it('selects and unfolds, and reaches no write: Remove and Delete are out of reach, a tool dropped says it is a demo', () => {
    drawMock();
    fire(
      $('[data-designer-part="rule-1"]'),
      new MouseEvent('click', { bubbles: true }),
    );
    expect($('[data-properties-of]').getAttribute('data-properties-of')).toBe(
      'Change the books',
    );
    expect(
      (
        $(
          '[data-designer-panel="properties"] button[disabled]',
        ) as HTMLButtonElement
      ).textContent,
    ).toContain('Remove');
    // Delete on a selected part is refused before it reaches a change (which would throw).
    fire(
      $('[data-designer-part="rule-1"]'),
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }),
    );
    openToolbox();
    const tools = [
      ...host.querySelectorAll('[data-designer-tool]'),
    ] as HTMLButtonElement[];
    expect(tools.length).toBeGreaterThan(0);
    // The toolbox drags and drops (asked 14 October 2026)…
    expect(
      tools.every(
        tool => !tool.disabled && tool.getAttribute('draggable') === 'true',
      ),
    ).toBe(true);
    expect($('[data-sliding-panel]')).toBeNull();
    // …and a tool placed changes nothing (a change would throw): it says the editor is a demo.
    fire(tools[0], new MouseEvent('click', { bubbles: true }));
    const notice = $('[data-sliding-panel]');
    expect(notice.getAttribute('data-variant')).toBe('warning');
    expect(notice.textContent).toContain('this visual editor is a demo');
  });
});
