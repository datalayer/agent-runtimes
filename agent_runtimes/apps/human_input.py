# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person's pointer and keys, as DevTools events, for the sign-in browser.

On r1 (15 November 2026) LinkedIn's sign-in met Google's reCAPTCHA Enterprise
after the email and the password, and its image challenge came back however
it was answered: the browser was scored a bot. Three of its signals were the
browser's own: it ran headless, each click was a move, a press and a release
at one point in one instant, and typing arrived as ``Input.insertText``, with
no key at all. The browser now runs headful on a virtual display
(:mod:`agent_runtimes.mcp.jupyter_host`), and what a person does on its
screenshot reaches the page as a hand would make it:

- a click (:func:`mouse_path`, :func:`click_timing`): the pointer travels
  from where it was along a short eased curve, a few pixels off a straight
  line, each step 10 to 25 ms apart, rests, then presses and releases;
- typing (:func:`keystrokes`): each character its own key — ``rawKeyDown``,
  ``char``, ``keyUp``, Shift held around a capital or a symbol — 40 to 140 ms
  apart.

Pure functions of a :class:`random.Random`, so a test reads what they give.
The jitter is timing and position, never a secret: ``random`` is enough.
"""

from __future__ import annotations

import math
import random
import string
from typing import Any, Dict, List, Tuple

#: A point of the pointer's travel: x, y, and the wait before it, in seconds.
Step = Tuple[float, float, float]

#: A key event for ``Input.dispatchKeyEvent`` and the wait after it, in seconds.
Keystroke = Tuple[Dict[str, Any], float]

#: How far apart the pointer's moves are, in seconds.
MOVE_GAP = (0.010, 0.025)

#: How many moves a travel takes, at least and at most, and pixels per move.
MOVES = (6, 24)
PIXELS_PER_MOVE = 35.0

#: How far a move strays from its curve, and the curve from a line, in pixels.
JITTER = 1.5
BOW = 0.12

#: The rest before pressing, and how long the button stays down, in seconds.
REST = (0.06, 0.18)
HOLD = (0.05, 0.12)

#: How long a key stays down, and the gap to the next one, in seconds.
KEY_HOLD = (0.02, 0.06)
KEY_GAP = (0.04, 0.14)

#: DevTools' modifier bit for Shift.
SHIFT = 8

_SHIFTED_DIGITS = ")!@#$%^&*("
# The US layout's punctuation keys: the key unshifted, shifted, its code and
# its Windows virtual key code.
_PUNCTUATION = (
    ("-", "_", "Minus", 189),
    ("=", "+", "Equal", 187),
    ("[", "{", "BracketLeft", 219),
    ("]", "}", "BracketRight", 221),
    ("\\", "|", "Backslash", 220),
    (";", ":", "Semicolon", 186),
    ("'", '"', "Quote", 222),
    (",", "<", "Comma", 188),
    (".", ">", "Period", 190),
    ("/", "?", "Slash", 191),
    ("`", "~", "Backquote", 192),
)


def _layout() -> Dict[str, Tuple[str, int, bool]]:
    """Each character a US keyboard types: its code, virtual key code, Shift."""
    keys: Dict[str, Tuple[str, int, bool]] = {" ": ("Space", 32, False)}
    for letter in string.ascii_lowercase:
        code = (f"Key{letter.upper()}", ord(letter.upper()))
        keys[letter] = (*code, False)
        keys[letter.upper()] = (*code, True)
    for digit in string.digits:
        code = (f"Digit{digit}", ord(digit))
        keys[digit] = (*code, False)
        keys[_SHIFTED_DIGITS[int(digit)]] = (*code, True)
    for plain, shifted, name, virtual in _PUNCTUATION:
        keys[plain] = (name, virtual, False)
        keys[shifted] = (name, virtual, True)
    return keys


#: What :func:`keystrokes` presses for each character a US keyboard has.
LAYOUT = _layout()


def _between(rng: random.Random, bounds: Tuple[float, float]) -> float:
    return rng.uniform(*bounds)


def _ease(t: float) -> float:
    """Slow out, fast across, slow in: a hand's travel."""
    return 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def mouse_path(
    start: Tuple[float, float],
    end: Tuple[float, float],
    rng: random.Random,
    width: float,
    height: float,
) -> List[Step]:
    """
    The pointer's moves from ``start`` to ``end``, each with its wait.

    A quadratic curve bowed to one side by up to :data:`BOW` of the distance,
    walked on an eased clock in :data:`MOVES` steps (more for a longer way),
    each point but the last off it by up to :data:`JITTER` pixels and kept on
    the page; the last point is ``end`` exactly, where the click lands.

    Parameters
    ----------
    start, end : tuple of float
        Where the pointer is, and where it goes, in the page's CSS pixels.
    rng : random.Random
        The source of the jitter.
    width, height : float
        The page's size: no point leaves it.

    Returns
    -------
    list of (x, y, wait)
        The moves in order, ``wait`` the seconds before each.
    """
    (x0, y0), (x1, y1) = start, end
    distance = math.hypot(x1 - x0, y1 - y0)
    count = int(min(MOVES[1], max(MOVES[0], round(distance / PIXELS_PER_MOVE))))
    # The control point: the middle, pushed sideways.
    bow = rng.uniform(-BOW, BOW) * distance
    normal = ((y0 - y1) / distance, (x1 - x0) / distance) if distance else (0.0, 0.0)
    cx = (x0 + x1) / 2 + normal[0] * bow
    cy = (y0 + y1) / 2 + normal[1] * bow
    steps: List[Step] = []
    for index in range(1, count + 1):
        t = _ease(index / count)
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t**2 * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t**2 * y1
        if index < count:
            x += rng.uniform(-JITTER, JITTER)
            y += rng.uniform(-JITTER, JITTER)
        else:
            x, y = x1, y1
        x = min(max(x, 0.0), width)
        y = min(max(y, 0.0), height)
        steps.append((round(x, 2), round(y, 2), _between(rng, MOVE_GAP)))
    return steps


def click_timing(rng: random.Random) -> Tuple[float, float]:
    """The rest before the press and how long the button is held, in seconds."""
    return _between(rng, REST), _between(rng, HOLD)


def keystrokes(text: str, rng: random.Random) -> List[Keystroke]:
    """
    The key events that type ``text``, one character at a time, each with its wait.

    A character of the US layout is its key: ``rawKeyDown``, ``char`` carrying
    the character, ``keyUp``, with Shift pressed around it (and its events
    flagged) for a capital or a symbol. A line break is Enter. Any other
    character (an accented letter, a symbol no US key has) is its own key with
    no code, as an input method sends it: ``rawKeyDown``, ``char``, ``keyUp``.

    Parameters
    ----------
    text : str
        What is typed.
    rng : random.Random
        The source of the timing.

    Returns
    -------
    list of (event, wait)
        ``Input.dispatchKeyEvent`` parameters in order, ``wait`` the seconds
        after each.
    """
    strokes: List[Keystroke] = []
    for character in text:
        if character in ("\n", "\r"):
            name, code, virtual, shifted, typed = "Enter", "Enter", 13, False, "\r"
        elif character == "\t":
            name, code, virtual, shifted, typed = "Tab", "Tab", 9, False, "\t"
        elif character in LAYOUT:
            code, virtual, shifted = LAYOUT[character]
            name, typed = character, character
        else:
            name, code, virtual, shifted, typed = character, "", 0, False, character
        modifiers = SHIFT if shifted else 0
        key = {
            "key": name,
            "code": code,
            "windowsVirtualKeyCode": virtual,
            "modifiers": modifiers,
        }
        shift = {
            "key": "Shift",
            "code": "ShiftLeft",
            "windowsVirtualKeyCode": 16,
        }
        if shifted:
            strokes.append(
                (
                    {"type": "rawKeyDown", **shift, "modifiers": SHIFT},
                    _between(rng, KEY_HOLD),
                )
            )
        strokes.append(({"type": "rawKeyDown", **key}, 0.0))
        if typed != "\t":
            strokes.append(
                (
                    {
                        "type": "char",
                        **key,
                        "text": typed,
                        "unmodifiedText": typed,
                    },
                    _between(rng, KEY_HOLD),
                )
            )
        strokes.append(
            ({"type": "keyUp", **key}, 0.0 if shifted else _between(rng, KEY_GAP))
        )
        if shifted:
            strokes.append(
                ({"type": "keyUp", **shift, "modifiers": 0}, _between(rng, KEY_GAP))
            )
    return strokes


__all__ = [
    "KEY_GAP",
    "KEY_HOLD",
    "LAYOUT",
    "MOVE_GAP",
    "SHIFT",
    "click_timing",
    "keystrokes",
    "mouse_path",
]
