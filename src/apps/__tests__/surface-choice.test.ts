/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_SURFACE, surfaceChoice } from '../plugins/chat/surfaceChoice';
import { NONE_EDITOR } from '../plugins/shell/editorChoice';

describe("a reader's choice of surface", () => {
  it("'Show the chat' asks for none, which is the chat's no surface", () => {
    expect(surfaceChoice(NONE_EDITOR)).toEqual({ surfaceId: NO_SURFACE, suspendedId: null });
    expect(surfaceChoice(NO_SURFACE)).toEqual({ surfaceId: NO_SURFACE, suspendedId: null });
  });

  it('forgets an editor waiting to come back, whatever is chosen', () => {
    expect(surfaceChoice('notebook')).toEqual({ surfaceId: 'notebook', suspendedId: null });
  });

  it('is what the chat does with every choice, the footer icons included', () => {
    const chat = readFileSync(join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'), 'utf8');
    const choose = chat.slice(chat.indexOf('const chooseSurface = useCallback'), chat.indexOf('}, []);', chat.indexOf('const chooseSurface = useCallback')));
    expect(choose).toContain('surfaceChoice(next)');
    expect(choose).toContain('setSuspendedId(chosen.suspendedId)');
    expect(choose).toContain('setSurfaceId(chosen.surfaceId)');
    expect(chat).toContain('useEffect(() => onSurfaceRequest(chooseSurface), [chooseSurface]);');
  });
});
