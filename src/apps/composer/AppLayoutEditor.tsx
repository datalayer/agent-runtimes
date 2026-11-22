/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas: an application's layout,
 * built from the catalog's components as Visual Basic built a form.
 *
 * - The palette is the blocks the enabled plugins contribute, by
 *   group (`canvasPalette`): a plugin the application's organization
 *   has turned off takes its blocks off it. *More* opens the components page
 * in a new tab, the Canvas left as it is.
 * - A component is dragged from it onto the layout, a block is dragged to
 *   another place or into a Row, a Column or a List, on `@dnd-kit`,
 *   with its keyboard sensor and its announcements: Space picks a block up,
 *   the arrows move it, Space drops it.
 * - Selecting a block opens its properties: its label, what it
 *   shows and what it sends, and a Button what it does — each chosen in words
 *   from what the application's kind gives and takes, never a path typed
 * — whether it is on the layout, and its component's own
 *   properties as its form.
 * - Every change is checked as it is made, and a problem is said on
 *   the block it is about.
 * - Every block has *Add*, *Move up*, *Move down* and *Remove*; a
 *   palette component is added with Enter or a click: nothing needs a pointer.
 * - A chat has its own block above the layout: its face, its welcome,
 *   its suggested questions and its settings, edited where they are seen
 *   (`CanvasChatBlock`).
 * - *Ask for a change* (`CanvasAsk`): a change asked in words, said
 *   before it is kept, undone in one step.
 * - An application built from a file (`appCode`): what its code
 *   decides is said above the layout, and a button whose action its code
 *   handles keeps that action — the rest is the spec's, edited here. Where
 *   it is decided links to the line, in the Python tab, when the
 *   application's item keeps its app.py.
 *
 * The Canvas edits the application's spec — its surface — through the same
 * definition the form and the YAML edit, and is saved with them.
 *
 * @module apps/composer/AppLayoutEditor
 */

import type { JSX } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Flash,
  FormControl,
  Heading,
  IconButton,
  Label,
  Link,
  Select,
  Text,
  TextInput,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  GrabberIcon,
  PlusIcon,
  TrashIcon,
} from '@primer/octicons-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type Over,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ComponentSpec } from '../../types/agentspecs';
import { getComponent, listComponents } from '../../specs/ui';
import { appComponents } from '../apps/customComponents';
import {
  ROOT_ID,
  defaultInterface,
  interfaceFindings,
  kindInterface,
  type AppInterface,
  type KindInterface,
} from './appInterface';
import type { AppDraft } from './draft';
import { AppLayoutUnshown } from './AppLayoutUnshown';
import { CanvasAsk } from './CanvasAsk';
import { actionDecidedBy, codeOf, momentWords, type AppCode } from './appCode';
import { CodeWhere } from './AppCodeWhere';
import type { AskModel } from './canvasAskModel';
import { CanvasChatBlock } from './CanvasChatBlock';
import { paletteComponents } from './canvasPalette';
import { groupComponents } from './componentCatalog';
import { OwnPropertiesForm, StandardProperties } from './ComponentProperties';
import { VERDICT_TONES } from './tones';
import {
  actionOf,
  bindingChoices,
  showsList,
  bindingProperty,
  boundPath,
  canMoveInto,
  canvasTree,
  conditionChoices,
  conditionOf,
  hideBlock,
  insertBlock,
  labelIsBound,
  labelOf,
  labelPlace,
  moveBlock,
  moveBy,
  ownPatch,
  ownValues,
  placeOf,
  removeBlock,
  sendChoices,
  sendsProperty,
  startSurface,
  surfaceOfDefinition,
  targetFor,
  twoWayChoices,
  updateBlock,
  withSurface,
  writeAction,
  writeActionContext,
  writeBinding,
  writeCondition,
  writeLabel,
  type BindingChoice,
  type CanvasBlock,
  type CanvasPlace,
} from './canvasModel';

/** Every component the Canvas may place: the catalog's. */
const CATALOG = listComponents().map(component => component.id);

/** The id a palette component is dragged by. */
const PALETTE = 'palette:';
/** The id of the drop place at the end of a container. */
const INTO = 'into:';

const today = (): string => new Date().toISOString().slice(0, 10);

/** What every block reads and does, from the Canvas. */
type CanvasActions = {
  surface: AppInterface;
  /** The palette's components, grouped: what *Add* offers. */
  groups: ReturnType<typeof groupComponents>;
  /** A component by name: the catalog's, or one its developer wrote. */
  specOf: (name: string) => ComponentSpec | undefined;
  problems: Map<string, string[]>;
  selected: string | null;
  disabled: boolean;
  select: (id: string) => void;
  nameOf: (id: string) => string;
  add: (component: string, at: CanvasPlace) => void;
  moveBy: (id: string, delta: -1 | 1) => void;
  remove: (id: string) => void;
  register: (id: string, element: HTMLElement | null) => void;
};

const CanvasContext = createContext<CanvasActions | null>(null);

const useCanvas = (): CanvasActions => {
  const canvas = useContext(CanvasContext);
  if (!canvas) {
    throw new Error('A block is drawn inside the Canvas.');
  }
  return canvas;
};

/** The palette's components, grouped, as a menu: what *Add* offers. */
function AddMenu({
  label,
  onAdd,
  disabled,
}: {
  label: string;
  onAdd: (component: string) => void;
  disabled: boolean;
}): JSX.Element {
  const { groups } = useCanvas();
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <IconButton
          icon={PlusIcon}
          size="small"
          variant="invisible"
          aria-label={label}
          disabled={disabled}
        />
      </ActionMenu.Anchor>
      <ActionMenu.Overlay width="auto">
        <Box maxHeight={360} overflowY="auto" width={240}>
          <ActionList>
            {groups.map(group => (
              <ActionList.Group key={group.label}>
                <ActionList.GroupHeading>{group.label}</ActionList.GroupHeading>
                {group.components.map(component => (
                  <ActionList.Item
                    key={component.id}
                    onSelect={() => onAdd(component.id)}
                  >
                    <ActionList.LeadingVisual>
                      <span aria-hidden>{component.emoji}</span>
                    </ActionList.LeadingVisual>
                    {component.name}
                  </ActionList.Item>
                ))}
              </ActionList.Group>
            ))}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

/** Where the end of a container takes a drop. */
function DropPlace({
  parent,
  empty,
}: {
  parent: string;
  empty: boolean;
}): JSX.Element {
  const canvas = useCanvas();
  const { setNodeRef, isOver } = useDroppable({
    id: `${INTO}${parent}`,
    data: { parent },
  });
  return (
    <Box
      ref={setNodeRef}
      minHeight={empty ? 48 : 16}
      minWidth={80}
      flex={empty ? '1 1 auto' : '0 0 auto'}
      border="1px dashed"
      borderColor={isOver ? 'accent.emphasis' : 'border.muted'}
      bg={isOver ? 'accent.subtle' : 'transparent'}
      borderRadius={2}
      display="flex"
      alignItems="center"
      justifyContent="center"
      color="fg.muted"
      fontSize={0}
    >
      {empty ? `Drop a component into ${canvas.nameOf(parent)}` : null}
    </Box>
  );
}

type DragHandle = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
};

/**
 * A Button's label read from the left and cut with an ellipsis: Primer
 * centres it in a three-column grid, and a long block name ran under the
 * block's own actions in a narrow Row.
 */
const LEFT_LABEL = {
  '& [data-component="buttonContent"]': {
    flex: 1,
    gridTemplateColumns: 'min-content minmax(0, 1fr) min-content',
  },
  '& [data-component="text"]': {
    width: '100%',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
} as const;

/** A block, its actions, its problems, and what it holds. */
function BlockBody({
  block,
  handle,
  row,
}: {
  block: CanvasBlock;
  handle: DragHandle | null;
  row: boolean;
}): JSX.Element {
  const canvas = useCanvas();
  const node = canvas.surface.components.find(
    component => component.id === block.id,
  )!;
  const spec = canvas.specOf(node.component);
  const name = canvas.nameOf(block.id);
  const problems = canvas.problems.get(block.id) ?? [];
  const selected = canvas.selected === block.id;
  const place = placeOf(canvas.surface, block.id);
  const length = place
    ? (
        canvas.surface.components.find(c => c.id === place.parent)!
          .children as unknown[]
      ).length
    : 0;
  const listed = block.children.filter(child => child.placed);
  const held = block.children.filter(child => !child.placed);
  const horizontal = node.component === 'Row';
  const problemsId = `canvas-problems-${block.id}`;
  return (
    <Box
      role="group"
      aria-label={name}
      // Selected in the accent; a problem in *Not ready*'s colour; else a hairline.
      border="1px solid"
      borderColor={
        selected
          ? 'accent.emphasis'
          : problems.length
            ? VERDICT_TONES['Not ready'].border
            : 'border.default'
      }
      boxShadow={
        selected ? '0 0 0 1px var(--borderColor-accent-emphasis)' : 'none'
      }
      borderRadius="card"
      p={2}
      bg="canvas.default"
      minWidth={180}
      flex={row ? '1 1 180px' : undefined}
    >
      <Box display="flex" alignItems="center" gap={1}>
        {handle ? (
          <IconButton
            ref={handle.setActivatorNodeRef}
            icon={GrabberIcon}
            size="small"
            variant="invisible"
            aria-label={`Drag ${name}`}
            disabled={canvas.disabled}
            {...handle.attributes}
            {...handle.listeners}
          />
        ) : null}
        <Button
          ref={(element: HTMLButtonElement | null) =>
            canvas.register(block.id, element)
          }
          size="small"
          variant="invisible"
          aria-pressed={selected}
          aria-describedby={problems.length ? problemsId : undefined}
          onClick={() => canvas.select(block.id)}
          title={name}
          sx={{ flex: 1, minWidth: 0, ...LEFT_LABEL }}
        >
          <span aria-hidden>{spec?.emoji ?? '▫️'}</span> {name}
        </Button>
        {problems.length ? (
          <Label variant={VERDICT_TONES['Not ready'].label}>
            {problems.length === 1
              ? '1 problem'
              : `${problems.length} problems`}
          </Label>
        ) : null}
        {block.container || place ? (
          <AddMenu
            label={block.container ? `Add inside ${name}` : `Add after ${name}`}
            disabled={canvas.disabled}
            onAdd={component =>
              canvas.add(
                component,
                block.container
                  ? { parent: block.id, index: listed.length }
                  : { parent: place!.parent, index: place!.index + 1 },
              )
            }
          />
        ) : null}
        {place ? (
          <>
            <IconButton
              icon={ArrowUpIcon}
              size="small"
              variant="invisible"
              aria-label={`Move ${name} up`}
              disabled={canvas.disabled || place.index === 0}
              onClick={() => canvas.moveBy(block.id, -1)}
            />
            <IconButton
              icon={ArrowDownIcon}
              size="small"
              variant="invisible"
              aria-label={`Move ${name} down`}
              disabled={canvas.disabled || place.index === length - 1}
              onClick={() => canvas.moveBy(block.id, 1)}
            />
            <IconButton
              icon={TrashIcon}
              size="small"
              variant="invisible"
              aria-label={`Remove ${name}`}
              disabled={canvas.disabled}
              onClick={() => canvas.remove(block.id)}
            />
          </>
        ) : null}
      </Box>
      {problems.length ? (
        <Box id={problemsId} mt={1}>
          {problems.map(problem => (
            <Text
              key={problem}
              as="p"
              sx={{ color: VERDICT_TONES['Not ready'].fg, fontSize: 0, m: 0 }}
            >
              {problem}
            </Text>
          ))}
        </Box>
      ) : null}
      {block.container ? (
        <SortableContext
          items={listed.map(child => child.id)}
          strategy={
            horizontal
              ? horizontalListSortingStrategy
              : verticalListSortingStrategy
          }
        >
          <Box
            mt={2}
            display="flex"
            flexDirection={horizontal ? 'row' : 'column'}
            flexWrap={horizontal ? 'wrap' : 'nowrap'}
            gap={2}
          >
            {listed.map(child => (
              <PlacedBlock key={child.id} block={child} row={horizontal} />
            ))}
            <DropPlace parent={block.id} empty={listed.length === 0} />
          </Box>
        </SortableContext>
      ) : null}
      {held.length ? (
        <Box
          mt={2}
          pl={2}
          borderLeft="2px solid"
          borderColor="border.muted"
          display="flex"
          flexDirection="column"
          gap={2}
        >
          {held.map(child => (
            <BlockBody key={child.id} block={child} handle={null} row={false} />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** A block in a container's list: it can be dragged. */
function PlacedBlock({
  block,
  row,
}: {
  block: CanvasBlock;
  row: boolean;
}): JSX.Element {
  const canvas = useCanvas();
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    disabled: canvas.disabled,
  });
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      flex={row ? '1 1 180px' : undefined}
    >
      <BlockBody
        block={block}
        row={row}
        handle={{
          setActivatorNodeRef,
          attributes: attributes as unknown as Record<string, unknown>,
          listeners,
        }}
      />
    </Box>
  );
}

/** A component of the palette: dragged onto the layout, or added with Enter or a click. */
function PaletteItem({
  component,
  onAdd,
  disabled,
}: {
  component: ComponentSpec;
  onAdd: () => void;
  disabled: boolean;
}): JSX.Element {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `${PALETTE}${component.id}`,
    data: { palette: component.id },
    disabled,
  });
  return (
    <Button
      ref={setNodeRef}
      size="small"
      variant="invisible"
      disabled={disabled}
      title={component.description}
      onClick={onAdd}
      {...attributes}
      {...listeners}
      sx={{ width: '100%', ...LEFT_LABEL }}
    >
      <span aria-hidden>{component.emoji}</span> {component.name}
    </Button>
  );
}

/**
 * One choice of what a block is bound to, from a list in plain words — never
 * a path typed. A path the list does not have is said, as a problem.
 */
function BindingSelect({
  label,
  none,
  value,
  choices,
  empty,
  disabled,
  onChoose,
}: {
  label: string;
  /** What the first choice, bound to nothing, reads. */
  none: string;
  value: string;
  choices: BindingChoice[];
  /** Said when there is nothing to choose. */
  empty: string;
  disabled: boolean;
  onChoose: (path: string) => void;
}): JSX.Element {
  return (
    <FormControl disabled={disabled || (choices.length === 0 && !value)}>
      <FormControl.Label>{label}</FormControl.Label>
      <Select
        value={value}
        block
        onChange={event => onChoose(event.target.value)}
      >
        <Select.Option value="">{none}</Select.Option>
        {choices.map(choice => (
          <Select.Option key={choice.path} value={choice.path}>
            {choice.words}
          </Select.Option>
        ))}
        {value && !choices.some(choice => choice.path === value) ? (
          <Select.Option value={value}>
            Something the app does not give
          </Select.Option>
        ) : null}
      </Select>
      {choices.length === 0 ? (
        <FormControl.Caption>{empty}</FormControl.Caption>
      ) : null}
    </FormControl>
  );
}

/** The selected block's properties. */
function BlockProperties({
  id,
  kind,
  gives,
  surface,
  hidden,
  disabled,
  code,
  openLine,
  onChange,
}: {
  id: string;
  kind: string;
  /** What its code decides, for an application built from a file. */
  code: AppCode | null;
  /** Shows a line of its app.py, when its item keeps the file. */
  openLine?: (line: number) => void;
  /** What the application gives its surface and takes from it. */
  gives: KindInterface;
  surface: AppInterface;
  hidden: boolean;
  disabled: boolean;
  /** A change, done by the Canvas, which says why when it cannot be. */
  onChange: (work: () => AppInterface) => void;
}): JSX.Element {
  const node = surface.components.find(component => component.id === id)!;
  const spec = useCanvas().specOf(node.component);
  const label = labelPlace(surface, id, spec);
  const bound = labelIsBound(surface, label);
  const nothingShown = `A ${kind} application publishes nothing a block shows.`;
  const binding = bindingProperty(node, spec);
  const sends = sendsProperty(node, spec);
  const twoWay = Boolean(binding) && binding === sends;
  const at = { surface, id };
  const action = node.component === 'Button' ? actionOf(node) : null;
  const actions = gives.actions;
  const handled = action
    ? actions.find(choice => choice.name === action.name)
    : undefined;
  // What its code decides is the code's: shown, never changed here.
  const decidedBy = action ? actionDecidedBy(code, action.name) : undefined;
  const place = placeOf(surface, id);
  const [refused, setRefused] = useState(0);
  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Heading as="h3" sx={{ fontSize: 2 }}>
        <span aria-hidden>{spec?.emoji ?? '▫️'}</span>{' '}
        {spec?.name ?? node.component}
      </Heading>
      {spec ? (
        <Text as="p" sx={{ color: 'fg.muted', m: 0 }}>
          {spec.description}
        </Text>
      ) : null}
      <FormControl disabled={disabled || bound}>
        <FormControl.Label>
          {label.accessibility ? 'Label, for a screen reader' : 'Label'}
        </FormControl.Label>
        <TextInput
          value={labelOf(surface, label)}
          sx={{ width: '100%' }}
          onChange={event => {
            const words = event.target.value;
            onChange(() => writeLabel(surface, label, words));
          }}
        />
        {bound ? (
          <FormControl.Caption>
            It shows what it is bound to.
          </FormControl.Caption>
        ) : null}
      </FormControl>
      {binding ? (
        <BindingSelect
          label={twoWay ? 'Shows and sends' : 'Shows'}
          none="What is written on it"
          value={boundPath(node, binding)}
          choices={
            twoWay
              ? twoWayChoices(gives, at)
              : bindingChoices(gives, at, showsList(node.component, binding))
          }
          empty={nothingShown}
          disabled={disabled}
          onChoose={chosen =>
            onChange(() => writeBinding(surface, id, binding, chosen))
          }
        />
      ) : null}
      {sends && !twoWay ? (
        <BindingSelect
          label="Sends"
          none="Nowhere"
          value={boundPath(node, sends)}
          choices={sendChoices(gives)}
          empty={`A ${kind} application takes nothing a block sends but what its buttons send.`}
          disabled={disabled}
          onChoose={chosen =>
            onChange(() => writeBinding(surface, id, sends, chosen))
          }
        />
      ) : null}
      {node.component === 'Button' ? (
        <>
          <FormControl
            disabled={
              disabled ||
              Boolean(decidedBy) ||
              (actions.length === 0 && !action)
            }
          >
            <FormControl.Label>Does</FormControl.Label>
            <Select
              value={action?.name ?? ''}
              block
              onChange={event => {
                const chosen = event.target.value;
                onChange(() => writeAction(surface, id, chosen, gives));
              }}
            >
              <Select.Option value="">Nothing</Select.Option>
              {actions.map(choice => (
                <Select.Option key={choice.name} value={choice.name}>
                  {choice.words}
                </Select.Option>
              ))}
              {action && !handled ? (
                <Select.Option value={action.name}>
                  Something the app does not handle
                </Select.Option>
              ) : null}
            </Select>
            {decidedBy ? (
              <FormControl.Caption>
                Decided by its code:{' '}
                <CodeWhere mark={decidedBy} openLine={openLine} />. Change it
                there.
              </FormControl.Caption>
            ) : actions.length === 0 ? (
              <FormControl.Caption>
                A {kind} application handles no button.
              </FormControl.Caption>
            ) : null}
          </FormControl>
          {handled
            ? handled.context.map(key => (
                <BindingSelect
                  key={key}
                  label={handled.asks[key] ?? key}
                  none="Not said yet"
                  value={boundPath(action!.context, key)}
                  choices={twoWayChoices(gives, at)}
                  empty={nothingShown}
                  disabled={disabled}
                  onChoose={chosen =>
                    onChange(() => writeActionContext(surface, id, key, chosen))
                  }
                />
              ))
            : null}
        </>
      ) : null}
      {id !== ROOT_ID && (place || hidden) ? (
        <FormControl disabled={disabled}>
          <FormControl.Label>Visibility</FormControl.Label>
          <Select
            value={hidden ? 'hidden' : 'shown'}
            block
            onChange={event => {
              const hide = event.target.value === 'hidden';
              onChange(() =>
                hide
                  ? hideBlock(surface, id)
                  : moveBlock(surface, id, targetFor(surface, null)),
              );
            }}
          >
            <Select.Option value="shown">On the layout</Select.Option>
            <Select.Option value="hidden">
              Hidden: kept, off the layout
            </Select.Option>
          </Select>
        </FormControl>
      ) : null}
      {id !== ROOT_ID && place ? (
        <BindingSelect
          label="Shown when"
          none="Always"
          value={conditionOf(node)}
          choices={conditionChoices(gives, at)}
          empty={`A ${kind} application publishes nothing a block can be shown on.`}
          disabled={disabled}
          onChoose={chosen =>
            onChange(() => writeCondition(surface, id, chosen))
          }
        />
      ) : null}
      <Box>
        <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
          Properties
        </Heading>
        {!spec ? (
          <Text as="p" sx={{ color: 'fg.muted' }}>
            The catalog has no {node.component}: it has no properties to set
            here.
          </Text>
        ) : spec.standard ? (
          <StandardProperties component={spec} />
        ) : (
          <>
            <OwnPropertiesForm
              key={id}
              component={spec}
              initial={ownValues(node, spec)}
              hidden={
                label.block === id && !label.accessibility
                  ? [label.property]
                  : []
              }
              disabled={disabled}
              onChange={(values, count) => {
                setRefused(count);
                // A value the schema refuses is said beside it and never written.
                if (count === 0) {
                  const patch = ownPatch(spec, values);
                  if (label.block === id) {
                    delete patch[label.property];
                  }
                  onChange(() => updateBlock(surface, id, patch));
                }
              }}
            />
            {refused ? (
              <Text
                as="p"
                role="status"
                sx={{ color: 'fg.muted', fontSize: 0, mt: 1 }}
              >
                What the form refuses is not written until it is right.
              </Text>
            ) : null}
          </>
        )}
      </Box>
    </Box>
  );
}

/** What an application built from a file decides in its code, said above its layout. */
function CodeDecides({
  code,
  openLine,
}: {
  code: AppCode;
  openLine?: (line: number) => void;
}): JSX.Element {
  return (
    <Flash sx={{ mb: 3 }}>
      <Text as="p" sx={{ m: 0 }}>
        Built from {code.file}: what its code decides is shown here and changed
        there; what its spec decides — its name, suggested questions, settings,
        rules and this layout — is changed here.
      </Text>
      {code.marks.length ? (
        <Box as="ul" mb={0} mt={1} pl={3}>
          {code.marks.map(mark => (
            <li key={mark.moment}>
              {momentWords(mark.moment)}:{' '}
              <CodeWhere mark={mark} openLine={openLine} />
            </li>
          ))}
        </Box>
      ) : (
        <Text as="p" sx={{ m: 0 }}>
          Its code decides nothing: its agent answers.
        </Text>
      )}
    </Flash>
  );
}

export type AppLayoutEditorProps = {
  definition: AppDraft;
  disabled?: boolean;
  onChange: (next: AppDraft) => void;
  /** The block to open on, selected: where a check about it is fixed. */
  select?: string;
  /** The plugins the application's organization has turned off: their blocks are off the palette. */
  pluginsOff: readonly string[];
  /** The model *Ask the assistant* asks for a change to the layout; without one it is not offered. */
  ask?: AskModel;
  /**
   * Shows a line of the application's app.py, in its Python tab:
   * given when its item keeps the file, so that where its code decides
   * something is a link to the line.
   */
  openLine?: (line: number) => void;
  /**
   * Where every component is drawn with its properties, its YAML and its
   * Python: the host's page, opened in a new tab from the palette's *More*.
   * Without one, there is no *More*.
   */
  componentsHref?: string;
};

export function AppLayoutEditor({
  definition,
  disabled = false,
  onChange,
  select,
  pluginsOff,
  ask,
  openLine,
  componentsHref,
}: AppLayoutEditorProps): JSX.Element {
  // A decision unless its spec says otherwise.
  const kind = definition.spec?.kind ?? 'decision';
  const gives = useMemo(
    () => kindInterface(definition.spec),
    [definition.spec],
  );
  const surface = surfaceOfDefinition(definition);
  // An application built from a file: what its code decides is locked.
  const code = useMemo(() => codeOf(definition.source), [definition.source]);
  // The components its developer wrote: on its palette, under
  // *Its own*, and on no other application's.
  const own = useMemo(
    () => (definition.spec ? appComponents(definition.spec, []) : []),
    [definition.spec],
  );
  const specOf = useMemo(() => {
    const byName = new Map(own.map(component => [component.id, component]));
    return (name: string): ComponentSpec | undefined =>
      getComponent(name) ?? byName.get(name);
  }, [own]);
  const catalog = useMemo(
    () => [...CATALOG, ...own.map(component => component.id)],
    [own],
  );
  const groups = useMemo(
    () => groupComponents([...paletteComponents(pluginsOff), ...own]),
    [pluginsOff, own],
  );
  const [selected, setSelected] = useState<string | null>(select ?? null);
  const [status, setStatus] = useState('');
  const [refusal, setRefusal] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLElement>());
  // The block it opened on, brought on screen once drawn.
  useEffect(() => {
    if (select) {
      buttons.current
        .get(select)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [select]);

  const sensors = useSensors(
    // A click is a click: a drag starts once the pointer has moved.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks up; Enter stays a click, which adds a palette component.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ['Space'],
        cancel: ['Escape'],
        end: ['Space', 'Enter'],
      },
    }),
  );

  const tree = useMemo(() => canvasTree(surface), [surface]);
  const findings = useMemo(
    () =>
      surface
        ? interfaceFindings(surface, definition.components, catalog, {
            app: definition.spec,
            componentSpec: specOf,
          })
        : [],
    [surface, definition.components, definition.spec, catalog, specOf],
  );
  const problems = useMemo(() => {
    const byId = new Map<string, string[]>();
    for (const finding of findings) {
      if (finding.id) {
        byId.set(finding.id, [
          ...(byId.get(finding.id) ?? []),
          finding.problem,
        ]);
      }
    }
    return byId;
  }, [findings]);
  const general = findings
    .filter(finding => finding.id === null)
    .map(finding => finding.problem);

  // After an action, the keyboard is given back where the action was.
  useEffect(() => {
    if (focus) {
      buttons.current.get(focus)?.focus();
      setFocus(null);
    }
  }, [focus, surface]);

  const write = (next: AppInterface) =>
    onChange(
      withSurface(definition, {
        ...next,
        composedBy: 'canvas',
        composedAt: today(),
      }),
    );

  /** Do it, or say why it cannot be done. */
  const attempt = (
    work: () => AppInterface,
    said: string,
    then?: string | null,
  ) => {
    try {
      write(work());
      setRefusal('');
      setStatus(said);
      if (then !== undefined) {
        setFocus(then);
      }
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    }
  };

  const nameOf = (id: string): string => (surface ? nameIn(surface, id) : id);

  /** A block named in words, in a layout: its component, and its label or its id. */
  const nameIn = (layout: AppInterface, id: string): string => {
    if (id === ROOT_ID) {
      return 'the page';
    }
    const node = layout.components.find(component => component.id === id);
    if (!node) {
      return id;
    }
    const spec = specOf(node.component);
    const words = labelOf(layout, labelPlace(layout, id, spec)).trim();
    const what = spec?.name ?? node.component;
    return words
      ? `${what} “${words.length > 40 ? `${words.slice(0, 40)}…` : words}”`
      : `${what} ${id}`;
  };

  const add = (component: string, at: CanvasPlace) => {
    if (!surface) {
      return;
    }
    try {
      const { surface: next, id } = insertBlock(
        surface,
        component,
        at,
        specOf(component),
      );
      write(next);
      setRefusal('');
      setSelected(id);
      setStatus(
        `${specOf(component)?.name ?? component} added to ${nameOf(at.parent)}.`,
      );
      setFocus(id);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    }
  };

  const actions: CanvasActions | null = surface
    ? {
        surface,
        groups,
        specOf,
        problems,
        selected,
        disabled,
        select: id => setSelected(id),
        nameOf,
        add,
        moveBy: (id, delta) =>
          attempt(
            () => moveBy(surface, id, delta),
            `${nameOf(id)} moved ${delta < 0 ? 'up' : 'down'}.`,
            id,
          ),
        remove: id => {
          const parent = placeOf(surface, id)?.parent ?? ROOT_ID;
          if (selected === id) {
            setSelected(null);
          }
          attempt(
            () => removeBlock(surface, id),
            `${nameOf(id)} removed.`,
            parent,
          );
        },
        register: (id, element) => {
          if (element) {
            buttons.current.set(id, element);
          } else {
            buttons.current.delete(id);
          }
        },
      }
    : null;

  /** Where a drop over something puts a block. */
  const placeOver = (over: Over | null): CanvasPlace | null => {
    if (!surface || !over) {
      return null;
    }
    const id = String(over.id);
    if (id.startsWith(INTO)) {
      const parent = id.slice(INTO.length);
      const node = surface.components.find(
        component => component.id === parent,
      );
      return {
        parent,
        index: Array.isArray(node?.children) ? node!.children.length : 0,
      };
    }
    return placeOf(surface, id);
  };

  const draggedName = (active: Active): string => {
    const palette = (active.data.current as { palette?: string } | undefined)
      ?.palette;
    return palette
      ? (specOf(palette)?.name ?? palette)
      : nameOf(String(active.id));
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${draggedName(active)}.`,
    onDragOver: ({ active, over }) => {
      const at = placeOver(over);
      return at
        ? `${draggedName(active)} would go into ${nameOf(at.parent)}, at place ${at.index + 1}.`
        : `${draggedName(active)} is over no place.`;
    },
    onDragEnd: ({ active, over }) => {
      const at = placeOver(over);
      const palette = (active.data.current as { palette?: string } | undefined)
        ?.palette;
      if (
        at &&
        !palette &&
        surface &&
        !canMoveInto(surface, String(active.id), at.parent)
      ) {
        return `${draggedName(active)} cannot go inside itself: it is where it was.`;
      }
      return at
        ? `${draggedName(active)} was dropped into ${nameOf(at.parent)}.`
        : `${draggedName(active)} was put down where it was.`;
    },
    onDragCancel: ({ active }) =>
      `Moving ${draggedName(active)} was cancelled: it is where it was.`,
  };

  /**
   * The block the pointer is in, the innermost first; else the nearest while
   * the pointer is over the layout. Let go anywhere else — over the palette,
   * the properties — a drag puts nothing down. The keyboard has no pointer:
   * it moves to the nearest place.
   */
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const collisions: CollisionDetection = args => {
    const pointer = args.pointerCoordinates;
    if (!pointer) {
      return closestCenter(args);
    }
    const within = pointerWithin(args);
    if (within.length) {
      return within;
    }
    const area = layoutRef.current?.getBoundingClientRect();
    const overLayout =
      !!area &&
      pointer.x >= area.left &&
      pointer.x <= area.right &&
      pointer.y >= area.top &&
      pointer.y <= area.bottom;
    return overLayout ? closestCenter(args) : [];
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const at = placeOver(over);
    if (!surface || !at) {
      return;
    }
    const palette = (active.data.current as { palette?: string } | undefined)
      ?.palette;
    if (palette) {
      add(palette, at);
      return;
    }
    const id = String(active.id);
    if (over && String(over.id) === id) {
      return;
    }
    if (!canMoveInto(surface, id, at.parent)) {
      setRefusal(`${nameOf(id)} cannot go inside itself.`);
      return;
    }
    attempt(
      () => moveBlock(surface, id, at),
      `${nameOf(id)} moved into ${nameOf(at.parent)}.`,
    );
  };

  // A chat's own block, edited in place: its face, its welcome, its
  // suggested questions, its settings — above its layout, or alone.
  const chatBlock =
    kind === 'chat' ? (
      <CanvasChatBlock
        definition={definition}
        disabled={disabled}
        onChange={onChange}
      />
    ) : null;

  if (!surface || !actions) {
    return (
      <>
        {chatBlock}
        <Box
          border="1px dashed"
          borderColor="border.default"
          borderRadius={2}
          p={4}
          mb={4}
          textAlign="center"
        >
          <Text as="p" sx={{ color: 'fg.muted' }}>
            {kind === 'decision'
              ? 'This application shows its fixed page. Lay it out here, starting from the default interface.'
              : 'This application has no layout of its own yet.'}
          </Text>
          <Button
            disabled={disabled}
            onClick={() => {
              write(kind === 'decision' ? defaultInterface() : startSurface());
              setStatus('The layout is started.');
            }}
          >
            Start the layout
          </Button>
        </Box>
      </>
    );
  }

  const target = (() => {
    try {
      return targetFor(surface, selected);
    } catch {
      return null;
    }
  })();
  const selectedHidden = Boolean(
    selected && tree.hidden.some(block => block.id === selected),
  );
  const exists = Boolean(
    selected && surface.components.some(component => component.id === selected),
  );

  return (
    <CanvasContext.Provider value={actions}>
      <Box
        role="status"
        aria-live="polite"
        position="absolute"
        width="1px"
        height="1px"
        overflow="hidden"
        clip="rect(0 0 0 0)"
      >
        {status}
      </Box>
      {chatBlock}
      <AppLayoutUnshown
        definition={definition}
        disabled={disabled}
        onChange={onChange}
      />
      {code ? <CodeDecides code={code} openLine={openLine} /> : null}
      {ask ? (
        // Ask for a change: the change said before it is kept, undone in one step.
        <CanvasAsk
          ask={ask}
          disabled={disabled}
          nameOf={nameIn}
          context={{
            surface,
            app: definition.spec,
            gives,
            palette: groups.flatMap(group => group.components),
            allowed: definition.components,
            catalog,
            componentSpec: specOf,
          }}
          onWrite={(next, said) => {
            write(next);
            setSelected(null);
            setRefusal('');
            setStatus(said);
          }}
        />
      ) : null}
      {refusal ? (
        <Flash sx={{ mb: 3 }} role="alert">
          {refusal}
        </Flash>
      ) : null}
      {general.length ? (
        <Flash variant={VERDICT_TONES['Not ready'].flash} sx={{ mb: 3 }}>
          <Box as="ul" m={0} pl={3}>
            {general.map(problem => (
              <li key={problem}>{problem}</li>
            ))}
          </Box>
        </Flash>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a block, press Space to pick it up, the arrow keys to move it, Space to drop it, Escape to put it back. A palette component is added with Enter.',
          },
        }}
        onDragStart={({ active }) => setDragging(draggedName(active))}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <Box
          display="flex"
          gap={3}
          alignItems="flex-start"
          flexWrap="wrap"
          mb={4}
        >
          <Box
            ref={layoutRef}
            flex="1 1 360px"
            minWidth={0}
            aria-label="The layout"
            role="region"
          >
            {tree.root ? (
              <BlockBody block={tree.root} handle={null} row={false} />
            ) : null}
            {tree.hidden.length ? (
              <Box mt={3}>
                <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
                  Hidden
                </Heading>
                <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
                  Kept in the application, off the layout.
                </Text>
                <Box display="flex" flexDirection="column" gap={2}>
                  {tree.hidden.map(block => (
                    <Box
                      key={block.id}
                      display="flex"
                      alignItems="center"
                      gap={2}
                    >
                      <Box flex={1} minWidth={0}>
                        <BlockBody block={block} handle={null} row={false} />
                      </Box>
                      <Button
                        size="small"
                        disabled={disabled}
                        onClick={() =>
                          attempt(
                            () =>
                              moveBlock(
                                surface,
                                block.id,
                                targetFor(surface, null),
                              ),
                            `${nameOf(block.id)} is back on the layout.`,
                            block.id,
                          )
                        }
                      >
                        Show
                      </Button>
                      <IconButton
                        icon={TrashIcon}
                        size="small"
                        variant="invisible"
                        aria-label={`Remove ${nameOf(block.id)}`}
                        disabled={disabled}
                        onClick={() =>
                          attempt(
                            () => removeBlock(surface, block.id),
                            `${nameOf(block.id)} removed.`,
                            ROOT_ID,
                          )
                        }
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : null}
          </Box>
          {/* The toolbox and the properties on the right, as Visual Basic's designer kept
              them (2026-10-10): the layout takes the room on the left. */}
          <Box
            display="flex"
            flexDirection="column"
            gap={3}
            flex="0 1 320px"
            minWidth={260}
            data-canvas-rail=""
          >
            <Box as="nav" aria-label="Components">
              <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, mt: 0 }}>
                {target
                  ? `Drag onto the layout, or press Enter to add to ${nameOf(target.parent)}.`
                  : 'Drag onto the layout.'}
              </Text>
              {groups.map(group => (
                <Box key={group.label} mb={2}>
                  <Heading
                    as="h4"
                    sx={{
                      fontSize: 0,
                      color: 'fg.muted',
                      textTransform: 'uppercase',
                      mb: 1,
                    }}
                  >
                    {group.label}
                  </Heading>
                  {group.components.map(component => (
                    <PaletteItem
                      key={component.id}
                      component={component}
                      disabled={disabled || !target}
                      onAdd={() => target && add(component.id, target)}
                    />
                  ))}
                </Box>
              ))}
              {/* More: every component with its preview, its form, its YAML and Python, beside the Canvas. */}
              {componentsHref ? (
                <Link
                  href={componentsHref}
                  target="_blank"
                  rel="noopener"
                  title="Every component, drawn, with its properties, its YAML and its Python, in a new tab"
                  sx={{ fontSize: 1 }}
                >
                  More
                </Link>
              ) : null}
            </Box>
            <Box
              as="aside"
              aria-label="Properties"
              // The inspector: a quiet surface beside the layout, set apart by space and its tint, no border.
              bg="canvas.subtle"
              borderRadius="card"
              p={3}
            >
              {selected && exists ? (
                <BlockProperties
                  key={selected}
                  id={selected}
                  kind={kind}
                  gives={gives}
                  surface={surface}
                  hidden={selectedHidden}
                  disabled={disabled}
                  code={code}
                  openLine={openLine}
                  onChange={work => attempt(work, '')}
                />
              ) : (
                <Text as="p" sx={{ color: 'fg.muted', m: 0 }}>
                  Select a block to set its label, what it shows and sends, and
                  its properties.
                </Text>
              )}
            </Box>
          </Box>
        </Box>
        <DragOverlay>
          {dragging ? (
            <Box
              px={2}
              py={1}
              bg="canvas.overlay"
              border="1px solid"
              borderColor="accent.emphasis"
              borderRadius="control"
              boxShadow="shadow.medium"
            >
              {dragging}
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>
    </CanvasContext.Provider>
  );
}

export default AppLayoutEditor;
