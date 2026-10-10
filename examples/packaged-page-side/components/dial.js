/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// The Dial of the Dial desk: a file of its application's folder (LOOP P-29),
// drawn in a sandboxed frame from the server its package is installed beside.
export default function draw(root, { props }) {
  const label = document.createElement('div');
  const dial = document.createElement('meter');
  label.id = 'dial-label';
  dial.id = 'dial';
  dial.style.width = '100%';
  root.append(label, dial);
  const update = next => {
    label.textContent = `${next.label ?? ''}: ${next.value ?? 0} of ${next.most ?? 100} (drawn from components/dial.js)`;
    dial.max = next.most ?? 100;
    dial.value = next.value ?? 0;
  };
  update(props);
  return { update };
}
