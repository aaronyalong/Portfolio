---
title: Oracle
summary: Fully local cited Q&A over Obsidian notes.
stack: [Python, Ollama, Chroma, FastAPI, TypeScript, MCP]
repo: https://github.com/aaronyalong/oracle
order: 1
highlight:
  value: "0.90"
  label: held-out top-3 search score with hybrid search, vs 0.80 vector-only
thumbnail:
  src: /screenshots/oracle-ask.webp
  alt: Oracle's Ask panel in Obsidian, showing a cited answer and its numbered sources.
  width: 706
  height: 965
---

## Problem

Obsidian's search bar matches words, not meaning. Typing a question into it finds the section
that answers it for 15% of the development questions in Oracle's benchmark, and for none of the
held-out ones. Oracle lets you ask a vault questions in plain language and get answers that cite
the notes they came from. Notes are private, so everything runs on your machine: no cloud APIs.

Generating an answer is the easy part. The hard part is trusting it: small local models
sometimes answer from their own training data and still cite a note, which looks grounded but
isn't.

<figure>
	<img
		src="/screenshots/oracle-ask.webp"
		alt="Oracle's sidebar panel in Obsidian, Ask tab. The question 'Artificial Intelligence' is answered with a summary of a degree plan by semester, each course followed by a numbered citation. Below: '73.5s · 5 of 5 sources cited' and five source cards, each linking to a section of the degree-plan note."
		width="706"
		height="965"
		loading="lazy"
	/>
	<figcaption>
		Ask in the Obsidian sidebar, on a personal vault. A one-word topic question is answered from
		a degree-plan note, and each claim cites the section it came from. qwen2.5:7b on CPU took
		73.5 s.
	</figcaption>
</figure>

## Architecture

<picture>
	<source srcset="/diagrams/oracle-architecture.dark.svg" media="(prefers-color-scheme: dark)" />
	<img
		src="/diagrams/oracle-architecture.light.svg"
		alt="Indexing: Obsidian vault, parse and chunk by heading, embed with nomic-embed-text, store in Chroma. Two paths use the index. Search: search query, hybrid search (vector + BM25, merged with RRF), ranked sections. Ask: question, vector search (k=5), local LLM (qwen2.5:7b via Ollama), grounding check, answer with cited sources."
		width="746"
		height="609"
	/>
</picture>

- **Indexing.** Notes are parsed (frontmatter, tags, aliases, `[[links]]`) and split by heading.
  Each chunk starts with a breadcrumb (`Title (aliases) > Heading`) so it makes sense on its own,
  then is embedded with `nomic-embed-text` into Chroma. Re-indexing is incremental, per note.
- **Search** returns ranked sections without calling an LLM: vector and BM25 results merged with
  Reciprocal Rank Fusion, in about 0.1–0.5 s.
- **Ask** gives the top 5 sections from vector search to `qwen2.5:7b` via Ollama, prompted to
  answer only from the numbered excerpts and cite them as `[n]`. A grounding check then verifies
  the answer against what it cites.
- **Three front ends, one pipeline:** a FastAPI server that streams answers over Server-Sent
  Events (with a single-file web UI), an Obsidian sidebar plugin that starts the server and
  re-indexes as you edit, and an MCP server (`search`, `answer`, `reindex`) for Claude Code,
  Claude Desktop or any MCP client.

## Key decisions

### Separate retrieval for Search and Ask

Hybrid search was best at putting the right section first: top 1 on both question sets, top 3
on the held-out set. That's what a list of search results shows first, so Search uses hybrid.

At 5 results, the context Ask gives the model, hybrid and vector were mixed (dev 0.92 vs 0.97,
held-out 1.00 vs 0.90), and every answer benchmark had been run with vector. So Ask keeps vector
search at k=5. One function, `build_retrievers()`, defines both for every front end.

### A deterministic grounding check instead of a better prompt

Both models fabricated during the experiments: one gave Redis's default port, which the notes
never mention; the other wrote "BRIN stands for Block Range INdex", which is true but not in the
notes. Each cited a note that didn't say it. Changing the prompt moved the failure around rather
than removing it.

The fabrications shared a pattern: the key detail wasn't in the excerpt being cited. The check
splits an answer into sentences, pulls out checkable details (multi-digit numbers, code, short
quotes, multi-word names) and looks for each one in the excerpts that sentence cites. It needs no
second model call, so it's cheap, repeatable and easy to explain.

- **Strict** (CLI and MCP): sentences with unsupported details are removed, and the answer becomes
  a refusal if nothing cited remains.
- **Warn** (web UI and plugin): unsupported details are flagged after the answer, because streamed
  text is already on screen.

### Graph expansion: tried twice, not the default

Obsidian's link graph looked like an obvious advantage. Two versions (all of a note's links, then
only the links inside the retrieved section) were compared with vector search at the same number
of chunks, so neither could win just by retrieving more.

Expanding by whole-note links scored lower than vector search (0.76–0.87 vs 0.89 at k=3, dev), and
section-level links tied it on the held-out set. Linked notes are usually already similar to the
question, so the link rarely adds anything the embedding missed, while hub notes and look-alike
distractors push good results out. It stays available as an option.

### Choose by rules fixed before the results

- Held-out questions were written before choosing a strategy or model, and run once.
- The model and prompt were picked by a rule set before seeing the grid: the most fully correct
  answers with **zero** made-up ones, because a fabricated citation is worse than no answer.
  qwen2.5:7b was more accurate but fabricated on the held-out set, so the faster llama3.2 stayed
  the default until the grounding check existed. With the check on, qwen2.5:7b took over.
- When the first benchmark saturated (vector search was perfect at top 3 on 18 notes), the vault
  grew to 59 notes with deliberate distractors, such as Adam and learning-rate notes next to
  Gradient Descent, and questions whose answer is only reachable through a link.

### Incremental, failure-safe indexing

Each chunk stores a hash of its note and the embedding model's name. Unchanged notes are skipped.
Changed notes are embedded first and only then swapped in, so if Ollama fails mid-run the old
index survives. Switching embedding models refuses to run until a rebuild, since vectors from
different models aren't comparable. The MCP server keeps its own index because Chroma isn't safe
for two processes writing at once.

## Results

All results use a 59-note sample vault in the repo, with a development set and a held-out set of
questions written before the final setup was chosen.

### Search ranking

Score: the share of each question's answer phrases found in the top 3 results, i.e. whether the
right *section* was retrieved.

| Retrieval | Dev (31 questions) | Held-out (10 questions) |
|---|---|---|
| Question typed into Obsidian-style search¹ | 0.15 | 0.00 |
| Keyword (BM25) | 0.85 | 0.75 |
| Vector | 0.89 | 0.80 |
| **Hybrid (vector + BM25)** | **0.89** | **0.90** |

Hybrid ranks best on the held-out set and ties vector on dev, where it matches or beats vector on
every question type. With 10 held-out questions, 0.90 vs 0.80 is a one-question difference.

¹ An approximation of Obsidian's search bar, where every term must match. People type keywords
into a search bar, not questions, so this measures the question-answering use case, not the
search bar at its own job.

### Answers

| Answer setup | Fully correct (dev / held-out) | Made-up answers | Time (CPU) |
|---|---|---|---|
| llama3.2 | 0.88 / 0.80 | 0 of 9 | ~6 s |
| qwen2.5:7b | 0.91 / 0.90 | 2 of 9 | ~13 s |
| **qwen2.5:7b + strict grounding (default)** | **0.91 / 0.90** | **1 of 9** | ~13 s |

"Made-up answers" counts the 9 questions the notes can't answer, where the right response is a
refusal. The one left under the default is a grading call rather than a fabrication: the answer
("calendar sync is next") is in the notes, and the label was too strict.

Across about 470 saved answers, the grounding check caught all 3 fabrications observed and flagged
12 of 296 correct answers (4.1%), mostly harmless expansions of acronyms the notes don't spell out.

## Limitations

- **Small benchmark.** 59 synthetic notes, with 10 held-out retrieval questions and 17 held-out
  answer questions. Differences of one or two questions are noise.
- **The grounding check's numbers are optimistic.** Its rules were refined while looking at the
  same saved answers, held-out ones included, so its real test is new answers. It checks surface
  details (numbers, names, quotes), so a made-up claim without one gets through.
- **Strict-mode results are replayed, not live.** They were computed on saved answers, which is
  equivalent because strict mode only edits the generated text.
- **The streaming UI only warns.** In the web UI and plugin, unsupported details are flagged after
  the answer rather than removed.
- **Slow on CPU:** about 13 s per answer with qwen2.5:7b (about 6 s with llama3.2).
- **Parser gaps.** Only `[[wiki-links]]` in `.md` files are read: standard Markdown links, links in
  frontmatter properties, `.canvas` files and attachments are not.
- **One real vault.** Beyond the benchmark, Oracle has been tested on one private vault, and that
  test was qualitative.

## Links

- [Repository](https://github.com/aaronyalong/oracle)
- [Dev log](https://github.com/aaronyalong/oracle/blob/main/DEVLOG.md): every experiment,
  including the ones that didn't work
- [Evaluation results](https://github.com/aaronyalong/oracle/tree/main/eval/results)
