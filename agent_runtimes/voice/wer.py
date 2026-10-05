# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The word error rate of what a model heard (VOICE.md VO-51), with `jiwer`.

Both sides are read the same way before they are compared: lower case, the
ligatures written out (``œ`` as ``oe``), hyphens and apostrophes as spaces,
punctuation dropped. What is left is the words: a model is not marked down
for writing ``Dit-elle,`` where the corpus wrote ``dit elle``.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Tuple

#: How far a measure may rise above its baseline before the check fails: two points.
TOLERANCE = 0.02

_LIGATURES = {"œ": "oe", "æ": "ae", "ß": "ss"}
_SEPARATORS = re.compile(r"[-‐‑–—'’`´/]")
_NOT_A_WORD = re.compile(r"[^\w\s]", re.UNICODE)


def normalize(text: str) -> str:
    """The words of a sentence, as the check compares them."""
    text = unicodedata.normalize("NFC", text).lower()
    for ligature, written in _LIGATURES.items():
        text = text.replace(ligature, written)
    text = _SEPARATORS.sub(" ", text)
    text = _NOT_A_WORD.sub(" ", text).replace("_", " ")
    return " ".join(text.split())


def word_error_rate(pairs: Iterable[Tuple[str, str]]) -> float:
    """The WER of ``(what was said, what was heard)`` pairs, over all their words."""
    import jiwer

    said, heard = [], []
    for reference, hypothesis in pairs:
        said.append(normalize(reference))
        heard.append(normalize(hypothesis))
    return float(jiwer.wer(said, heard))


__all__ = ["TOLERANCE", "normalize", "word_error_rate"]
