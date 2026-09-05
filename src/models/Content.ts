/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a sandbox may use a content: read it, or read and write it.
 */
export type IContentPermissions = 'ro' | 'rw';

/**
 * A content an Environment selects.
 *
 * This is the selection as the Runtimes service lists it on an Environment —
 * which `RuntimeContent` (by `uid`), where it is mounted and how it may be
 * used. The name is for reading; the `uid` is what identifies the content,
 * and what a selection persists.
 */
export interface IContent {
  /**
   * The RuntimeContent identifier.
   */
  uid: string;
  /**
   * The RuntimeContent name.
   */
  name: string;
  /**
   * Where the content is mounted in the sandbox.
   */
  mount: string;
  /**
   * How the sandbox may use the content.
   */
  permissions: IContentPermissions;
}

export default IContent;
