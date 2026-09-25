# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A worker's answer is read as the markdown it usually is (O1-10).

Found live, 2026-09-13: a document opened at `.../documents/{uid}` showed
`# Heading` and `**bold**` literally — the `#`s and `*`s as text — because
`artifact_document` wrapped every line of the body as a plain paragraph with
no markdown read at all. `jupyter-lexical`'s own
`convert/markdown/MarkdownTransformers.ts` is the reference for both the
syntax and the priority a marker is tried in.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_orchestration_artifact_markdown.py -v
```
"""

from __future__ import annotations

from agent_runtimes.orchestration.adapter import answer_artifact
from agent_runtimes.orchestration.documents import artifact_document
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution


def _blocks(body: str) -> list[dict]:
    execution = an_execution()
    artifact = answer_artifact(execution, an_attempt(execution), "placeholder")
    return artifact_document(execution, artifact, body)["root"]["children"]


def _words(block: dict) -> str:
    return "".join(child.get("text", "\n") for child in block["children"])


class TestHeadings:
    def test_a_hash_line_is_a_heading_not_literal_text(self):
        [_, _produced, block] = _blocks("# Title")
        assert block["type"] == "heading" and block["tag"] == "h1"
        assert _words(block) == "Title"

    def test_the_hash_count_is_the_level(self):
        [_, _produced, block] = _blocks("### Section")
        assert block["tag"] == "h3"

    def test_a_bare_hash_word_with_no_space_is_not_a_heading(self):
        """`#tag` is a hashtag, not `HEADING`'s own `^(#{1,6})\\s` rule."""
        [_, _produced, block] = _blocks("#tag")
        assert block["type"] == "paragraph" and _words(block) == "#tag"


class TestLists:
    def test_dash_lines_become_one_bullet_list(self):
        [_, _produced, block] = _blocks("- first\n- second\n- third")
        assert (
            block["type"] == "list"
            and block["listType"] == "bullet"
            and block["tag"] == "ul"
        )
        assert [_words(item) for item in block["children"]] == [
            "first",
            "second",
            "third",
        ]

    def test_numbered_lines_become_one_ordered_list(self):
        [_, _produced, block] = _blocks("1. first\n2. second")
        assert block["listType"] == "number" and block["tag"] == "ol"
        assert [_words(item) for item in block["children"]] == ["first", "second"]

    def test_a_list_ends_where_a_paragraph_resumes(self):
        blocks = _blocks("- one\n- two\n\nAfter the list.")
        kinds = [block["type"] for block in blocks[2:]]
        assert kinds == ["list", "paragraph"]
        assert _words(blocks[-1]) == "After the list."


class TestInlineEmphasis:
    def test_bold_star_is_the_bold_format_bit(self):
        [_, _produced, block] = _blocks("This is **important**.")
        texts = block["children"]
        assert [node["text"] for node in texts] == ["This is ", "important", "."]
        assert texts[1]["format"] == 1  # bold

    def test_italic_star_is_the_italic_format_bit(self):
        [_, _produced, block] = _blocks("This is *notable*.")
        assert block["children"][1]["format"] == 2  # italic

    def test_inline_code_is_the_code_format_bit(self):
        [_, _produced, block] = _blocks("Run `pytest -q` first.")
        assert block["children"][1]["text"] == "pytest -q"
        assert block["children"][1]["format"] == 16  # code

    def test_bold_italic_star_combines_both_bits(self):
        [_, _produced, block] = _blocks("***critical***")
        assert block["children"][0]["format"] == 1 | 2

    def test_a_double_star_is_not_read_as_two_single_stars(self):
        [_, _produced, block] = _blocks("**bold**, not *two spans*")
        # "bold" is one bold run, not split into single-asterisk italics.
        assert block["children"][0]["format"] == 1
        assert block["children"][0]["text"] == "bold"

    def test_plain_text_with_no_markdown_is_one_unformatted_node(self):
        """The common case stays exactly as cheap as it was."""
        [_, _produced, block] = _blocks("Nothing special here.")
        assert len(block["children"]) == 1
        assert block["children"][0]["text"] == "Nothing special here."
        assert block["children"][0]["format"] == 0


class TestParagraphsStillWork:
    def test_a_blank_line_still_separates_paragraphs(self):
        blocks = _blocks("First finding.\nStill the first.\n\nSecond finding.")
        first, second = blocks[2], blocks[3]
        assert _words(first) == "First finding.\nStill the first."
        assert _words(second) == "Second finding."


class TestEveryBlockCarriesTheEvidence:
    def test_a_heading_and_a_list_are_marked_evidence_too(self):
        blocks = _blocks("# Title\n\n- one\n- two")
        marks = {block["$"]["evidence"]["artifact"] for block in blocks}
        assert len(marks) == 1, (
            "every block, old and new kinds alike, names the same artifact"
        )
