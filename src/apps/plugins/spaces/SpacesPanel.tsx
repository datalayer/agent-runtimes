/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Spaces side panel: a tab listing the person's spaces and the documents
 * and notebooks of the one chosen, then a tab for each item open in the
 * conversation, opened by the person from the list or by the agent
 * (`spacesOpenItem`). An item's tab saves it back to its space and closes.
 *
 * The tabs are a tablist as core's `ViewTabs` draws one (which has no close
 * button on a tab): the shown tab alone in the Tab order, Left and Right
 * moving to the tab before or after and showing it, Home and End to the
 * first and the last; each tab controls the one tab panel, labelled by the
 * tab shown.
 *
 * @module apps/plugins/spaces/SpacesPanel
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type KeyboardEvent,
} from 'react';
import {
  ArrowLeftIcon,
  FileIcon,
  RepoIcon,
  RowsIcon,
  XIcon,
} from '@primer/octicons-react';
import { Button, IconButton, SegmentedControl, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  closeSpaceItem,
  openSpaceItemsOf,
  selectSpaceItem,
  subscribeSpaceItems,
  type OpenSpaceItem,
  type SpaceItemType,
} from './openItems';
import {
  SPACES_WORDS,
  listSpaceItems,
  listSpaces,
  loadSpaceItem,
  saveSpaceItem,
  type SpaceItemSummary,
  type SpaceSummary,
} from './tools';

const SpaceItemView = lazy(() => import('./SpaceItemView'));

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The conversation's open items, kept current. */
export function useOpenSpaceItems(conversation: string) {
  return useSyncExternalStore(
    subscribeSpaceItems,
    () => openSpaceItemsOf(conversation),
    () => openSpaceItemsOf(conversation),
  );
}

const TYPE_FILTERS: ReadonlyArray<{
  label: string;
  type: SpaceItemType | undefined;
}> = [
  { label: 'All', type: undefined },
  { label: 'Documents', type: 'document' },
  { label: 'Notebooks', type: 'notebook' },
];

const iconOf = (type: SpaceItemType) =>
  type === 'document' ? FileIcon : RowsIcon;

function Row({
  icon: Glyph,
  title,
  detail,
  onClick,
  data,
}: {
  icon: typeof FileIcon;
  title: string;
  detail?: string;
  onClick: () => void;
  data: string;
}): JSX.Element {
  return (
    <Box
      as="li"
      sx={{
        listStyle: 'none',
        borderBottom: '1px solid',
        borderColor: 'border.muted',
      }}
    >
      <Box
        as="button"
        type="button"
        onClick={onClick}
        data-spaces-row={data}
        display="flex"
        alignItems="flex-start"
        width="100%"
        px={2}
        py={2}
        sx={{
          gap: 2,
          bg: 'transparent',
          border: 0,
          textAlign: 'left',
          cursor: 'pointer',
          color: 'fg.default',
          '&:hover': { bg: 'canvas.subtle' },
        }}
      >
        <Box as="span" aria-hidden="true" sx={{ color: 'fg.muted', pt: '2px' }}>
          <Glyph size={16} />
        </Box>
        <Box as="span" display="flex" flexDirection="column" minWidth={0}>
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
            {title || 'Untitled'}
          </Text>
          {detail ? (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{detail}</Text>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

/** The list of spaces, and the documents and notebooks of the one chosen. */
function SpacesBrowser({
  conversation,
}: {
  conversation: string;
}): JSX.Element {
  const [spaces, setSpaces] = useState<SpaceSummary[]>();
  const [space, setSpace] = useState<SpaceSummary>();
  const [items, setItems] = useState<SpaceItemSummary[]>();
  const [type, setType] = useState<SpaceItemType | undefined>();
  const [said, setSaid] = useState<string>();
  useEffect(() => {
    let current = true;
    listSpaces().then(
      found => current && setSpaces(found),
      error => current && setSaid(reasonOf(error)),
    );
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    if (!space) {
      setItems(undefined);
      return;
    }
    let current = true;
    setItems(undefined);
    listSpaceItems(space.uid, type).then(
      found => current && setItems(found),
      error => current && setSaid(reasonOf(error)),
    );
    return () => {
      current = false;
    };
  }, [space, type]);
  const open = useCallback(
    (item: SpaceItemSummary) => {
      setSaid(undefined);
      loadSpaceItem(item.uid, item.type, conversation).catch(error =>
        setSaid(reasonOf(error)),
      );
    },
    [conversation],
  );
  return (
    <Box
      display="flex"
      flexDirection="column"
      minHeight={0}
      data-spaces-browser=""
    >
      {said ? (
        <Text
          as="p"
          sx={{ m: 2, fontSize: 1, color: 'danger.fg' }}
          role="alert"
        >
          {said}
        </Text>
      ) : null}
      {space ? (
        <>
          <Box display="flex" alignItems="center" px={2} py={1} sx={{ gap: 2 }}>
            <IconButton
              icon={ArrowLeftIcon}
              aria-label="Back to the spaces"
              size="small"
              variant="invisible"
              onClick={() => setSpace(undefined)}
            />
            <Text sx={{ fontSize: 1, fontWeight: 'semibold', flex: 1 }}>
              {space.name}
            </Text>
          </Box>
          <Box px={2} pb={2}>
            <SegmentedControl aria-label="Kind of item" size="small">
              {TYPE_FILTERS.map(filter => (
                <SegmentedControl.Button
                  key={filter.label}
                  selected={filter.type === type}
                  onClick={() => setType(filter.type)}
                >
                  {filter.label}
                </SegmentedControl.Button>
              ))}
            </SegmentedControl>
          </Box>
          {items === undefined ? (
            <Box minHeight={120} aria-busy="true" />
          ) : items.length === 0 ? (
            <Text as="p" sx={{ m: 2, fontSize: 1, color: 'fg.muted' }}>
              Nothing of this kind in this space.
            </Text>
          ) : (
            <Box as="ul" m={0} p={0} aria-label={`Items of ${space.name}`}>
              {items.map(item => (
                <Row
                  key={item.uid}
                  icon={iconOf(item.type)}
                  title={item.name}
                  detail={item.description}
                  onClick={() => open(item)}
                  data={item.uid}
                />
              ))}
            </Box>
          )}
        </>
      ) : spaces === undefined ? (
        said ? null : (
          <Box minHeight={120} aria-busy="true" />
        )
      ) : spaces.length === 0 ? (
        <Text as="p" sx={{ m: 2, fontSize: 1, color: 'fg.muted' }}>
          No spaces yet.
        </Text>
      ) : (
        <Box as="ul" m={0} p={0} aria-label="Your spaces">
          {spaces.map(each => (
            <Row
              key={each.uid}
              icon={RepoIcon}
              title={each.name}
              detail={each.description}
              onClick={() => {
                setSaid(undefined);
                setSpace(each);
              }}
              data={each.uid}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

/** An open item's tab: its name, Save, and its editor. */
function ItemTab({
  item,
  conversation,
}: {
  item: OpenSpaceItem;
  conversation: string;
}): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<string>();
  const save = () => {
    setSaving(true);
    setSaid(undefined);
    saveSpaceItem(item.uid, conversation).then(
      () => {
        setSaving(false);
        setSaid(SPACES_WORDS.saved(item.name));
      },
      error => {
        setSaving(false);
        setSaid(reasonOf(error));
      },
    );
  };
  return (
    <Box display="flex" flexDirection="column" flex={1} minHeight={0}>
      <Box
        display="flex"
        alignItems="center"
        px={2}
        py={1}
        sx={{ gap: 2, borderBottom: '1px solid', borderColor: 'border.muted' }}
      >
        <Text
          sx={{
            fontSize: 1,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {said ?? item.name}
        </Text>
        <Button
          size="small"
          onClick={save}
          disabled={saving}
          data-spaces-save={item.uid}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Box>
      <Box flex={1} minHeight={0} sx={{ overflow: 'auto' }}>
        <Suspense fallback={<Box minHeight={240} aria-busy="true" />}>
          <SpaceItemView
            key={`${item.uid}:${item.loaded}`}
            item={item}
            conversation={conversation}
          />
        </Suspense>
      </Box>
    </Box>
  );
}

export default function SpacesPanel({
  conversation = '',
}: {
  conversation?: string;
}): JSX.Element {
  const { items, selected } = useOpenSpaceItems(conversation);
  const shown = items.find(item => item.uid === selected);
  const ids = useId();
  // The list of spaces is the tab keyed '', an item's tab its uid.
  const tabId = (key: string) => `${ids}-tab-${key || 'spaces'}`;
  const panelId = `${ids}-panel`;
  const shownKey = shown?.uid ?? '';
  const tabs = useRef(new Map<string, HTMLElement | null>());
  const keys = ['', ...items.map(item => item.uid)];
  const onTabKeyDown = (event: KeyboardEvent<HTMLElement>, at: string) => {
    const index = keys.indexOf(at);
    const next =
      event.key === 'ArrowRight'
        ? keys[(index + 1) % keys.length]
        : event.key === 'ArrowLeft'
          ? keys[(index - 1 + keys.length) % keys.length]
          : event.key === 'Home'
            ? keys[0]
            : event.key === 'End'
              ? keys[keys.length - 1]
              : undefined;
    if (index < 0 || next === undefined) {
      return;
    }
    event.preventDefault();
    selectSpaceItem(next || undefined, conversation);
    tabs.current.get(next)?.focus();
  };
  const tabProps = (key: string) => ({
    as: 'button' as const,
    type: 'button' as const,
    role: 'tab',
    id: tabId(key),
    'aria-selected': key === shownKey,
    'aria-controls': panelId,
    tabIndex: key === shownKey ? 0 : -1,
    ref: (node: HTMLElement | null) => {
      tabs.current.set(key, node);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => onTabKeyDown(event, key),
  });
  const tabSx = (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    px: 2,
    py: 1,
    fontSize: 1,
    bg: 'transparent',
    border: 0,
    borderBottom: '2px solid',
    borderColor: active ? 'accent.emphasis' : 'transparent',
    color: active ? 'fg.default' : 'fg.muted',
    fontWeight: active ? 'semibold' : 'normal',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  });
  return (
    <Box
      display="flex"
      flexDirection="column"
      height="100%"
      minHeight={0}
      data-spaces-panel=""
    >
      <Box
        role="tablist"
        aria-label="Spaces and open items"
        display="flex"
        alignItems="center"
        sx={{
          overflowX: 'auto',
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Box
          {...tabProps('')}
          onClick={() => selectSpaceItem(undefined, conversation)}
          sx={tabSx(!shown)}
        >
          <RepoIcon size={14} />
          Spaces
        </Box>
        {items.map(item => {
          const Glyph = iconOf(item.type);
          const active = item.uid === shown?.uid;
          return (
            <Box key={item.uid} display="inline-flex" alignItems="center">
              <Box
                {...tabProps(item.uid)}
                data-spaces-tab={item.uid}
                onClick={() => selectSpaceItem(item.uid, conversation)}
                sx={tabSx(active)}
              >
                <Glyph size={14} />
                {item.name || 'Untitled'}
              </Box>
              <IconButton
                icon={XIcon}
                aria-label={`Close ${item.name || 'the item'}`}
                size="small"
                variant="invisible"
                onClick={() => closeSpaceItem(item.uid, conversation)}
              />
            </Box>
          );
        })}
      </Box>
      <Box
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(shownKey)}
        display="flex"
        flexDirection="column"
        flex={1}
        minHeight={0}
      >
        {shown ? (
          <ItemTab key={shown.uid} item={shown} conversation={conversation} />
        ) : (
          <SpacesBrowser conversation={conversation} />
        )}
      </Box>
    </Box>
  );
}
