/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The language the chat speaks in (LOOP P-26): the one its host says — the
 * `language` of `AppRenderer` and of the embed — else the browser's.
 *
 * @module chat/ChatLanguage
 */

import {
  createContext,
  useContext,
  useMemo,
  type JSX,
  type ReactNode,
} from 'react';
import { preferredLanguages } from '../apps/apps/language';
import { CHAT_WORDS, chatLanguage, type ChatWords } from './words';

/** The language the host says, as BCP 47 tags it; unsaid, the browser's. */
const ChatLanguageContext = createContext<string | undefined>(undefined);

/** The chat in a language its host says; the browser's when it says none. */
export function ChatLanguage({
  language,
  children,
}: {
  language?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <ChatLanguageContext.Provider value={language || undefined}>
      {children}
    </ChatLanguageContext.Provider>
  );
}

/** The language the chat speaks: the host's, else the browser's, else English. */
export function useChatLanguage(): string {
  const said = useContext(ChatLanguageContext);
  return useMemo(
    () => chatLanguage(said ? [said] : preferredLanguages()),
    [said],
  );
}

/** The chat's own words, in the language it speaks. */
export function useChatWords(): ChatWords {
  return CHAT_WORDS[useChatLanguage()];
}
