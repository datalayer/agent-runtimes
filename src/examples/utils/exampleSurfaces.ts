/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an example brings with it, read from its id.
 *
 * There used to be a second predicate here, `canBootstrapCloudSandbox`, gating
 * which examples were allowed a cloud runtime. It was wrong twice over.
 *
 * The first version excluded any id containing `Agent`, which deadlocked every
 * agent example: a cloud runtime was offered only to an example that had
 * already published one, and an example can only publish one once it has been
 * given one. The second version listed the surfaces that need a kernel —
 * notebook, cell, document — and refused everything else. That was wrong on
 * the premise rather than the details: an agent needs a runtime to run *on*,
 * not a notebook to run *against*. `AgentToolApprovalsExample` renders no code
 * surface at all and still wants an agent in the cloud.
 *
 * So there is no gate. Any example may be given a cloud runtime; whether it
 * renders a surface on that runtime is the example's business. Guessing wrong
 * in the permissive direction wastes a pod, and in the restrictive direction
 * breaks the example — which is the failure this file has now produced twice.
 *
 * @module examples/utils/exampleSurfaces
 */

/**
 * Whether this example is a sandbox and nothing else.
 *
 * An example with `Agent` in its name creates an agent of its own and so has an
 * agent base URL worth recording in the summary; one without is a bare surface.
 * A different question from where it can run, and the only one a name can
 * actually answer.
 */
export function isSandboxOnlyExample(exampleId: string): boolean {
  return (
    (exampleId.includes('Notebook') || exampleId.includes('Cell')) &&
    !exampleId.includes('Agent')
  );
}
