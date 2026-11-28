/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/** The Personal Agent Protocol's tools, as the chat calls them: Poppy. */

/** Poppy's mark beside its tools: the protocol's icon, as the Studio's Agent Protocols draw it. */
export const POPPY_ICON = '@primer/octicons-react:arrow-switch';

/**
 * A Personal Agent Protocol tool, which the chat calls Poppy (the user, 27
 * November 2026): `pap_<action>` (a visitor's) or `pap_<company>_pap_<action>`
 * (a company's, its domain in plain characters, `pap_connections.server_id`).
 * Its id is kept; only what is shown says Poppy.
 */
export function poppyToolOf(
  name: string,
): { action: string; company: string } | null {
  const company = /^pap_(.+?)_{1,2}pap_([a-z_]+)$/.exec(name);
  if (company) {
    return { company: company[1], action: company[2] };
  }
  const bare = /^pap_([a-z_]+)$/.exec(name);
  return bare ? { company: '', action: bare[1] } : null;
}
