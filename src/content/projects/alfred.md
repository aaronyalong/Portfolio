---
title: Alfred
summary: Turns course files (PDF, PPTX, DOCX) into practice questions, each citing an exact quote that code checks is on the cited page.
stack: [Python, Pydantic, Claude API, pypdfium2, python-pptx, python-docx]
repo: https://github.com/aaronyalong/alfred
status: in-progress
featured: true
order: 3
highlight:
  value: 37/37
  label: benchmark facts recovered with Claude vision, vs 10/37 from text alone
thumbnail:
  src: /diagrams/alfred-architecture.light.svg
  dark: /diagrams/alfred-architecture.dark.svg
  alt: "Alfred's pipeline: ingest course files, flag diagram pages for Claude vision, then generate and check questions."
  width: 736
  height: 560
---

> **In progress.** This page covers what's built so far: ingestion of course files and a
> command-line question generator with deterministic checks. The quiz interface, web app and
> answer verification step are planned, not built.

## Problem

Practice questions are one of the best ways to study, and an LLM can write them from a
student's own lecture slides. But a generated question can be wrong, or based on something
the slides never say, and a student has no easy way to tell. Alfred's rule is that every
question cites the page and the exact quote it came from, so it can be checked, by code first
and then by the student.

Getting the content out is harder than it looks. In a cloud architecture deck, 16 of 19 slides
are diagrams. In an NLP review PDF, about one page in five has formulas or diagrams that text
extraction can't see. Questions can only be as good as what ingestion recovers.

## Architecture

<picture>
	<source srcset="/diagrams/alfred-architecture.dark.svg" media="(prefers-color-scheme: dark)" />
	<img
		src="/diagrams/alfred-architecture.light.svg"
		alt="Step 1, ingest: a course file (PDF, PPTX or DOCX) goes through a baseline parser for text, tables and notes. Pages flagged for large images or vector drawings also go to Claude vision, which reads formulas and diagrams and is cached per page. Both produce a document of citable pages and blocks. Step 2, generate and check: a topic map (one call per document), then question generation as schema-validated JSON where each question cites a page and an exact quote, then code checks (quote on the cited page, 4 distinct options, known topics, no duplicates), which either pass a question or reject it with reasons."
		width="736"
		height="560"
	/>
</picture>

- **Ingest.** Every format is parsed into the same immutable `Document → Page → Block`
  structure, where a page is one citable unit: a PDF page, a slide, or a section of a Word
  document. Baseline parsers read the text layer, tables and speaker notes. Pages where they miss
  content are flagged and sent to Claude vision, which returns only what's missing, as
  structured blocks: formulas in LaTeX, diagrams as a description plus their labels.
- **Generate.** One call maps the document's topics, then one streamed call writes multiple-choice
  and true/false questions as JSON validated against Pydantic models. Each question includes an
  answer key, an explanation, a difficulty band, its topic and the page and quote it came from.
- **Check.** Plain code verifies each question. The quote must appear on the cited page. A
  multiple-choice question needs 4 distinct options, exactly one correct, with no "all/none of
  the above". Its topics must come from the map, and duplicates are rejected. Failing questions
  are rejected with reasons, not repaired. The set as a whole gets a warning if its true/false
  answers are unbalanced.
- **Label.** `alfred label` walks through generated questions for hand-labeling against a
  six-criterion rubric (correct, supported, unambiguous, good distractors, worth studying,
  difficulty).

## Key decisions

### Route pages to the extractor they need

The baseline gets text and tables right in a fraction of a second, but misses most formulas
and diagrams. Running a heavy extractor on every page would cost about 400× the time for no
gain on text pages. So the baseline runs everywhere and flags the pages it can't handle:

- **PDF pages** with an image covering at least 10% of the page, or with 500 or more vector
  paths. Formula and diagram pages drew 2,381–5,797 paths each; every other page drew at most
  about 60. On the NLP PDF this flagged 13 of 60 pages, up from 0.
- **Slides** with any picture or chart covering at least 10% of the slide. The first rule only
  fired on slides with almost no text and caught 1 of 16 diagram slides; this one catches all 16.

Only flagged pages go to Claude vision, and each reading is cached so a page is paid for once.

### Structured output plus a home-made citation check

The Claude API's built-in citations can't be combined with schema-constrained output. So the
model returns `{page, quote}` as ordinary schema fields, and code checks the quote is really
on that page. Source fields come first in the schema, so the model picks its quote before it
writes the question.

### Shuffle answers in code

Models favor some answer positions. The model gives the answer as option text, and code
shuffles the options with a seed taken from the question, so the order is the same on every
run and the answer can't be guessed from its position. Answer text that matches no option fails
a check rather than being guessed.

### Section Word documents by headings and size

Word files have no fixed pages, so the plan was to split them at headings. The first real file,
an exam review, used no heading styles at all: every heading was plain or bold text. Sections
now start at each heading *and* whenever a section would grow past about one printed page,
always between paragraphs so quotes are never cut. A short heading-like last line moves into the
next section, so sections start where a reader would expect.

### No retrieval to start

A lecture deck is about 10–20K tokens and fits in context, and prompt caching makes reusing it
cheap. Retrieval will be added only if whole-course inputs show a measured quality or cost
problem.

### Keep course content out of the repo

Course files can't be committed, so tests generate their own PDF, PPTX and DOCX files.
Pre-commit hooks and CI block course files and API keys. Hand labels store only judgments,
keyed by a hash of the question and its document, so the repo never contains course text.

## Results

### Ingestion benchmark

37 facts on 13 pages from two real course files (an NLP review PDF and a cloud architecture
deck), written from the page images and committed before any engine was run. A fact counts only
if it's found on its labeled page.

| Engine | All facts | Formulas | Diagrams | Time (79 pages) | Cost |
|---|---|---|---|---|---|
| Baseline (text layer) | 10 / 37 (27%) | 1 / 13 | 1 / 16 | 0.2 s | — |
| docling with formula model | 21 / 37 (57%) | 10 / 13 | 3 / 16 | 143 s | — |
| **Baseline + Claude vision on flagged pages** | **37 / 37 (100%)** | **13 / 13** | **16 / 16** | 42 s | $0.47 |

All three engines found every text and table fact. Vision cost 1.6¢ per flagged page (29 pages),
about 0.6¢ per page across both files.

**A perfect score was suspicious, so the output was checked by eye.** The scorer only checks a
fact is present, not that what's next to it is right. Formulas were exact, including the attention-mask
slide where docling had read `\text{mask}` as `\max`, an error that would teach something wrong.
Diagrams were described by structure, not just labels. One label cut off as "SSH Basi" came back
as "SSH Bastion": right, but not verbatim.

### First generated questions

On the cloud architecture deck (19 slides), Alfred wrote 10 questions: **10 passed the checks,
0 were rejected**, in about a minute for $0.41, of which $0.23 was the first vision reading (now
cached). Every question was checked against its slide by hand: all answer keys were right,
every quote was real, and the distractors were plausible, such as swapping the customer gateway
and the virtual private gateway.

**Gap: no question used a diagram,** although 16 of the 19 slides are diagrams and vision had
read them. The prompt tells the model to prefer facts a page states plainly, and it did. For a
course where the diagrams are the content, that's the wrong trade-off.

## Limitations

- **Not built yet:** the verification step (a second model answering each question from its
  cited page), short-answer questions, flashcards, practice tests, a quiz interface, mistake
  tracking and the web app. Today Alfred is a command-line tool.
- **Question quality is barely measured.** One deck and 10 questions, checked by hand. The
  rubric and labeling tool are built, but the labeling run (about 100 questions from at least 3
  documents) hasn't been done.
- **The ingestion benchmark is small and now saturated.** 13 pages and 37 facts from two files
  show direction, not precise rates, and a perfect score can't tell cheaper vision settings
  apart. It needs harder pages, such as a scan and a math-heavy deck.
- **Code can't check that a quote supports the answer,** only that it's on the page. That's left
  to the rubric.
- **Vision can fill in more than the page shows,** as with "SSH Bastion", so a reading isn't
  always verbatim.

## Links

- [Repository](https://github.com/aaronyalong/alfred)
- [Dev log](https://github.com/aaronyalong/alfred/blob/main/DEVLOG.md)
- [Question rubric](https://github.com/aaronyalong/alfred/blob/main/evals/questions/RUBRIC.md)
