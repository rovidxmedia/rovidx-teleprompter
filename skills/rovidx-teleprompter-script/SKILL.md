---
name: rovidx-teleprompter-script
description: Prepare scripts for Rovidx Teleprompter as readable UTF-8 text files while preserving the supplied wording. Use when formatting, cleaning up, or exporting a script for this app.
---

# Rovidx Teleprompter Script

Turn supplied prose or a script into a plain UTF-8 `.txt` file ready to open in Rovidx Teleprompter. The app also accepts pasted plain text; there is no custom markup or metadata.

## Prepare the script

- Preserve wording, punctuation, sentence order, names, numbers, and supplied reading cues unless the user explicitly asks for a rewrite. Do not invent delivery directions or remove material simply because it resembles a heading.
- Remove document presentation such as Markdown heading markers, bold delimiters, page numbers, running headers, or code fences when they are clearly formatting rather than spoken content. Keep literal symbols that belong to the text. Ask only when an ambiguity would change what the user reads.
- Rejoin hard-wrapped lines within paragraphs. Add blank lines at existing sentence boundaries to form short, readable paragraphs, generally one to three sentences. Do not hard-wrap lines to a fixed width: the app wraps to its adjustable reading column.
- Preserve `[PAUSE]` and other supplied cues as literal text. The app displays them as written; they do not trigger commands or automatic pauses.
- Export UTF-8 text with ordinary newlines and a final newline. Do not add a title, explanation, metadata, or Markdown around the script unless that content belongs in the reading copy.

## Save and check

Save beside the source as `<source-name>.teleprompter.txt`, or use the user's requested location. Preserve the original. If the destination already exists, choose a numbered filename unless the user asked to update it. When only pasted prose is supplied, use a descriptive filename in the current workspace.

Read the saved file back. Check that Unicode punctuation and paragraph breaks survived, that no unintended spoken text was added or lost, and that no presentation wrappers remain. Return a clickable link to the result, with a short note only if wording was changed at the user's request or some source material was ambiguous.

See [the example](references/example.md) when a concrete formatting example helps.
