#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Check that every registered example stays inside the browser viewport.

The examples app (``make examples``, http://localhost:3000/html/examples.html)
is a full-viewport shell: the page itself never scrolls, each example fills the
content area under the header and scrolls its own long panels. This sweep loads
every example registered in ``src/examples/example-selector.ts``, signed in, at
several window sizes and zoom levels, and asserts, once the example has settled:

- the page does not scroll: ``scrollHeight <= innerHeight`` and
  ``scrollWidth <= innerWidth``, and ``window.scrollTo(9999, 9999)`` leaves
  ``scrollX``/``scrollY`` at 0;
- no visible element reaches past the bottom or the right edge of the
  viewport unless an ancestor inside the viewport clips or scrolls it (it is
  then inside an internal scroller, which is allowed);
- nothing inside the example's frame is as tall as the window while the
  frame or the example's root scrolls or clips it (a ``100vh`` under the
  header);
- hovering the account's name in the header shows its hovercard inside the
  window and on top of the example (``elementFromPoint`` over the card hits
  the card).

Sign-in: set ``DATALAYER_API_KEY`` (and optionally ``DATALAYER_IAM_URL``,
default https://prod1.datalayer.run) in the environment, e.g. by sourcing your
datalayer rc file. The key is exchanged for a token at
``/api/iam/v1/login``; neither is printed. Every example runs on the ``local``
runtime target.

Usage::

    python scripts/check-examples-viewport.py                 # every example
    python scripts/check-examples-viewport.py AgentDecksExample ChatExample
    python scripts/check-examples-viewport.py --settle 4 --json out.json

Exit code 0 when every example passes at every size, 1 otherwise.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
SELECTOR = ROOT / "src" / "examples" / "example-selector.ts"

# (label, width, height, css zoom on <html>)
SIZES = [
    ("1400x900", 1400, 900, 1.0),
    ("1280x720", 1280, 720, 1.0),
    ("1366x657", 1366, 657, 1.0),
    ("1920x960", 1920, 960, 1.0),
    ("1400x900@0.9", 1400, 900, 0.9),
    ("1400x900@1.1", 1400, 900, 1.1),
    ("1400x900@1.25", 1400, 900, 1.25),
    ("1366x657@1.1", 1366, 657, 1.1),
    ("1366x657@1.25", 1366, 657, 1.25),
]

MEASURE_JS = r"""
async (zoom) => {
  const vw = window.innerWidth, vh = window.innerHeight, tol = 0.5;
  const se = document.scrollingElement || document.documentElement;
  const out = {
    vw, vh,
    scrollH: se.scrollHeight, scrollW: se.scrollWidth,
    bodyScrollH: document.body.scrollHeight,
  };
  window.scrollTo(9999, 9999);
  se.scrollTop = 9999; se.scrollLeft = 9999;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  out.scrollY = window.scrollY || se.scrollTop;
  out.scrollX = window.scrollX || se.scrollLeft;
  window.scrollTo(0, 0); se.scrollTop = 0; se.scrollLeft = 0;

  const clips = cs => cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
    || (cs.contain || '').match(/paint|strict|content/);
  const describe = e => {
    const id = e.id ? '#' + e.id : '';
    const cls = (typeof e.className === 'string' ? e.className : '')
      .split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return e.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };
  const offenders = [];
  for (const e of document.body.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const overB = r.bottom > vh + tol && r.top < vh;
    const overR = r.right > vw + tol && r.left < vw;
    if (!overB && !overR) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none'
        || cs.opacity === '0') continue;
    // Contained when an ancestor (or the element itself when it scrolls)
    // that sits inside the viewport clips it.
    let contained = false;
    for (let a = e.parentElement; a && a !== document.body
         && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.display === 'none' || acs.visibility === 'hidden') {
        contained = true; break;
      }
      if (clips(acs)) {
        const ar = a.getBoundingClientRect();
        if ((!overB || ar.bottom <= vh + tol) && (!overR || ar.right <= vw + tol)) {
          contained = true; break;
        }
      }
      // A fixed element is laid out against the viewport: stop climbing.
      if (acs.position === 'fixed') break;
    }
    if (contained) continue;
    offenders.push({
      el: describe(e),
      top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10,
      right: Math.round(r.right * 10) / 10,
    });
  }
  // An element as tall as the window inside the example's frame, which is
  // shorter than the window by the header: a `100vh` that the frame then has
  // to scroll (or clip) by the header's height.
  // Content that is long and scrolls in a panel of its own is fine, even
  // when it happens to be as tall as the window: only one clipped or
  // scrolled by the frame or the example's root (or a lone wrapper under it)
  // counts.
  const frame = document.querySelector('[data-example-frame]');
  const tall = [];
  if (frame) {
    const fr = frame.getBoundingClientRect();
    const rootChain = new Set([frame]);
    for (let r = frame.firstElementChild, i = 0; r && i < 6; i++) {
      rootChain.add(r);
      r = r.children.length === 1 ? r.firstElementChild : null;
    }
    for (const e of frame.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.height <= fr.height + tol) continue;
      if (Math.abs(r.height - vh) > 1 && Math.abs(r.height - vh * zoom) > 1) continue;
      // A layer fixed to the window (a floating chat's overlay) is as tall
      // as the window by design and scrolls nothing.
      let fixed = false;
      for (let f = e; f && f !== frame; f = f.parentElement) {
        if (getComputedStyle(f).position === 'fixed') { fixed = true; break; }
      }
      if (fixed) continue;
      let a = e.parentElement;
      while (a && a !== frame && getComputedStyle(a).overflowY === 'visible') {
        a = a.parentElement;
      }
      if (a && !rootChain.has(a)) continue;
      tall.push({ el: describe(e), height: Math.round(r.height * 10) / 10 });
    }
    // How far the example's root (or a lone wrapper under it) scrolls:
    // reported, not failed, since a long content page scrolls there.
    let root = frame.firstElementChild, rootScroll = 0;
    for (let i = 0; root && i < 6; i++) {
      const cs = getComputedStyle(root);
      if (/(auto|scroll)/.test(cs.overflowY)) {
        rootScroll = Math.max(rootScroll, root.scrollHeight - root.clientHeight);
      }
      root = root.children.length === 1 ? root.firstElementChild : null;
    }
    out.rootScroll = rootScroll;
  } else {
    out.noFrame = true;
  }
  out.tall = tall.slice(0, 3);
  for (const t of tall) offenders.push(t);
  out.offenders = offenders.length;
  out.sample = offenders.slice(0, 5);
  out.pass = out.scrollH <= vh + tol && out.scrollW <= vw + tol
    && out.scrollY === 0 && out.scrollX === 0 && offenders.length === 0;
  return out;
}
"""


# The account's hovercard in the header (core's UserBadge, drawn in place
# below the name): hovered, it must be inside the window and on top of the
# example, not clipped by the header nor painted under the content area.
BADGE_JS = r"""
() => {
  const header = document.querySelector('[data-examples-header]');
  if (!header) return { skip: 'no header' };
  const signOut = [...header.querySelectorAll('button')]
    .find(b => /sign out/i.test(b.textContent || ''));
  const badge = signOut && signOut.previousElementSibling;
  const name = badge && badge.firstElementChild;
  if (!name) return { skip: 'not signed in' };
  const r = name.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
"""

POPOVER_JS = r"""
() => {
  const header = document.querySelector('[data-examples-header]');
  const signOut = [...header.querySelectorAll('button')]
    .find(b => /sign out/i.test(b.textContent || ''));
  const badge = signOut.previousElementSibling;
  if (badge.children.length < 2) return { pass: true, skip: 'no hovercard' };
  const pop = badge.lastElementChild;
  const r = pop.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const inside = r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5
    && r.bottom <= vh + 0.5;
  // Probe a few points of the card: each must hit the card itself.
  const points = [[0.5, 0.5], [0.2, 0.8], [0.8, 0.8], [0.5, 0.95]];
  const covered = points.filter(([fx, fy]) => {
    const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
    return !(el && pop.contains(el));
  });
  return {
    pass: inside && covered.length === 0,
    rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v)),
    inside, covered: covered.length,
  };
}
"""


def example_ids() -> list[str]:
    return re.findall(r"makeEntry\(\s*'([A-Za-z0-9]+)'", SELECTOR.read_text())


def sign_in() -> tuple[str, dict]:
    iam = os.environ.get("DATALAYER_IAM_URL") or "https://prod1.datalayer.run"
    key = os.environ.get("DATALAYER_API_KEY")
    if not key:
        sys.exit("DATALAYER_API_KEY is not set (source your datalayer rc file).")
    req = urllib.request.Request(
        f"{iam}/api/iam/v1/login",
        data=json.dumps({"token": key}).encode(),
        headers={"Content-Type": "application/json"},
    )
    # The IAM address is https, from the environment or the default.
    resp = json.load(urllib.request.urlopen(req, timeout=30))  # nosec B310
    return resp["token"], resp.get("user") or {}


async def check_example(browser, url, ex, token, user, settle, sizes, check_badge=True):
    first = sizes[0]
    handle = user.get("handle") or user.get("handle_s") or user.get("handle_t") or ""
    simple = {"state": {"token": token, "handle": handle}, "version": 0}
    ctx = await browser.new_context(viewport={"width": first[1], "height": first[2]})
    init = (
        f"localStorage.setItem('selectedExample', {json.dumps(ex)});"
        f"localStorage.setItem('agent-runtimes.examples.runtime-target', 'local');"
        f"localStorage.setItem('@datalayer/iam:token', {json.dumps(token)});"
        f"localStorage.setItem('@datalayer/iam:user', {json.dumps(json.dumps(user))});"
        # The header's account (core's simple auth store, persisted).
        f"localStorage.setItem('datalayer-simple-auth', {json.dumps(json.dumps(simple))});"
    )
    await ctx.add_init_script(init)
    page = await ctx.new_page()
    results = {}
    try:
        try:
            await page.goto(url, wait_until="networkidle", timeout=45000)
        except Exception:
            pass  # long-polling examples never go idle; settle anyway
        await page.wait_for_timeout(settle * 1000)
        if check_badge:
            badge = await page.evaluate(BADGE_JS)
            if "x" in badge:
                await page.mouse.move(badge["x"], badge["y"])
                await page.wait_for_timeout(1200)
                results["account-hovercard"] = await page.evaluate(POPOVER_JS)
                await page.mouse.move(1, first[2] - 1)
                await page.wait_for_timeout(600)
            else:
                results["account-hovercard"] = {"pass": True, **badge}
        for label, w, h, zoom in sizes:
            await page.set_viewport_size({"width": w, "height": h})
            await page.evaluate(
                "z => { document.documentElement.style.zoom = z === 1 ? '' : String(z); }",
                zoom,
            )
            await page.wait_for_timeout(1500)
            try:
                results[label] = await page.evaluate(MEASURE_JS, zoom)
            except Exception as e:  # page crashed or navigated
                results[label] = {"pass": False, "error": str(e)[:200]}
    finally:
        await ctx.close()
    return results


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("examples", nargs="*", help="example ids (default: all)")
    ap.add_argument("--url", default="http://localhost:3000/html/examples.html")
    ap.add_argument("--settle", type=float, default=6, help="seconds after load")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--json", help="write the full results to this file")
    ap.add_argument("--sizes", help="comma-separated size labels to run")
    args = ap.parse_args()

    ids = args.examples or example_ids()
    sizes = SIZES
    if args.sizes:
        wanted = args.sizes.split(",")
        sizes = [s for s in SIZES if s[0] in wanted]
    token, user = sign_in()
    all_results: dict[str, dict] = {}
    queue: asyncio.Queue[str] = asyncio.Queue()
    for ex in ids:
        queue.put_nowait(ex)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        async def worker():
            while not queue.empty():
                ex = queue.get_nowait()
                try:
                    res = await check_example(
                        browser, args.url, ex, token, user, args.settle, sizes
                    )
                except Exception as e:
                    res = {s[0]: {"pass": False, "error": str(e)[:200]} for s in sizes}
                all_results[ex] = res
                bad = [k for k, v in res.items() if not v.get("pass")]
                status = "PASS" if not bad else "FAIL " + ",".join(bad)
                print(f"{ex:40s} {status}", flush=True)
                for k in bad:
                    v = res[k]
                    if "scrollH" not in v:
                        print(f"    {k}: {json.dumps(v)}", flush=True)
                        continue
                    print(
                        f"    {k}: scrollH={v.get('scrollH')} vh={v.get('vh')} "
                        f"scrollW={v.get('scrollW')} vw={v.get('vw')} "
                        f"scrollY={v.get('scrollY')} rootScroll={v.get('rootScroll')} "
                        f"offenders={v.get('offenders')} "
                        f"{json.dumps(v.get('sample') or v.get('error'))}",
                        flush=True,
                    )

        await asyncio.gather(*(worker() for _ in range(max(1, args.workers))))
        await browser.close()

    if args.json:
        Path(args.json).write_text(json.dumps(all_results, indent=2))
    failed = [
        ex
        for ex, r in all_results.items()
        if any(not v.get("pass") for v in r.values())
    ]
    print(
        f"\n{len(all_results) - len(failed)}/{len(all_results)} examples pass at every size."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
