---
title: Logbook
summary: Grounded Q&A over 3,080 NASA aviation maintenance safety reports, with every cited report ID checked.
stack: [Python, DuckDB, BM25, fastembed, Claude API, Ollama, Streamlit]
repo: https://github.com/aaronyalong/logbook
context: CMPE 259 project
featured: true
order: 2
highlight:
  value: 22/22
  label: valid filter tool calls from Claude in the model screening
thumbnail:
  src: /screenshots/logbook-answer.webp
  alt: Logbook answering a question about landing-gear errors, each claim citing a report ID.
  width: 716
  height: 720
---

## Problem

NASA's Aviation Safety Reporting System (ASRS) collects voluntary, de-identified reports of
safety incidents. Logbook covers its maintenance reports: 3,080 reports from 2010 to 2026, with
3,632 narratives written by technicians, inspectors and other maintenance staff. Each report also
has fields coded by analysts, such as aircraft, component, human factors and anomaly.

Analysts' questions mix the two. "Boeing 737 reports from 2022 to 2024" is a filter on coded
fields. "Compare what reporters said about deferred maintenance in 2019 versus 2023" needs both a
filter and the narratives. Logbook answers such questions in plain language and cites every claim
to a report by its ID (ACN). It gives counts only for this corpus and never as real-world rates,
because voluntary reports can't support rates.

<figure>
	<img
		src="/screenshots/logbook-answer.webp"
		alt="The ASRS Maintenance Report Assistant in Streamlit. The question 'What kinds of errors do mechanics report during landing gear inspections?' is answered in sections. The answer says the filter matched 306 landing-gear reports and that the shown reports can't indicate how often each error occurs; each example ends with a highlighted citation such as ACN 1290978."
		width="716"
		height="720"
		loading="lazy"
	/>
	<figcaption>
		An answer in the Streamlit app. The filter matched 306 landing-gear reports; the answer
		scopes that count, and every example cites its report.
	</figcaption>
</figure>

## Architecture

<picture>
	<source srcset="/diagrams/logbook-architecture.dark.svg" media="(prefers-color-scheme: dark)" />
	<img
		src="/diagrams/logbook-architecture.light.svg"
		alt="Data preparation: ASRS export of 3,080 reports, expand abbreviations in the search text, store in DuckDB and an embedding index. Step 1, build a filter: the question goes to an LLM tool call that writes a JSON filter spec, which is validated against observed field values; a rejected spec goes back to the model with the problems listed, up to 3 calls; a valid one runs in DuckDB. Step 2, retrieve and answer: hybrid retrieval (BM25 + dense, merged with RRF) over the filtered narratives, an LLM answer from the top 10 where each claim cites an ACN, a check that sorts every cited ACN into verified, not shown, or not in the corpus, and the answer with verified sources."
		width="596"
		height="760"
	/>
</picture>

- **Data preparation.** The ASRS export is loaded into DuckDB. ASRS's own abbreviation list is
  written for flight operations and covers only 24% of the abbreviations in these narratives. A
  hand-curated maintenance supplement of 117 terms raises that to 60%, and overrides meanings that
  are wrong in a maintenance context (MM is Maintenance Manual, not Middle Marker). Expansion
  applies only to the text used for search; the original narratives are kept for display and
  citation.
- **Build a filter.** The LLM calls a `build_filter` tool with a JSON spec: coded-field values,
  years, keywords and an optional grouping. The spec is validated before it runs, and the model
  sees only how many reports it matched.
- **Retrieve and answer.** BM25 and dense embeddings (`bge-small-en-v1.5`, run locally through
  `fastembed`) each rank the filtered narratives, merged with reciprocal rank fusion. The answer
  model gets the filter with its counts and the top 10 narratives, and must cite each claim as
  `[ACN n]`.
- **Models.** Each LLM step runs on Claude through the Anthropic API or on a local model through
  Ollama, chosen separately per step. The Streamlit app, the command line and the evaluation all
  call the same `answer()` function, so what testers see is what gets evaluated.

## Key decisions

### Validate filters against the data, not just the schema

A model writing a filter can invent a value, such as "Spacecraft" as an aircraft model, which
would quietly return nothing. Every value in a spec is checked against the values actually
observed in the corpus. An invalid spec goes back to the model with the problems listed,
including where a misplaced key belongs, and the model gets up to three calls.

The messages matter. Before they said where a key belonged, `qwen3.5:9b` deleted the years from
a filter to get it accepted (506 reports instead of 109). Afterwards it moved them to the right
place and matched 109.

### Whole-word keyword matching

Keywords first matched as substrings, so "MEL" (Minimum Equipment List) also matched *extremely*
and *timely*, and "ISS" matched *missing* and *issue*. Keywords now match whole words with an
optional plural, and a trailing `*` matches a prefix (`defer*` for *deferred* and *deferral*).
Across the corpus, "MEL" went from 503 reports to 405, and "ISS" from 1,114 to 0.

### Check every citation after generation

After the answer is written, every cited ACN is sorted into one of three groups: *verified* (a
report the model was shown), *not shown* (a real report the model wasn't given) or *not in the
corpus* (fabricated). Only verified reports appear as sources. The app highlights each citation
in blue if it passed and in red with ⚠ if it failed.

Citations are plain text rather than the Anthropic API's citation feature, so a local model can
follow exactly the same format. Narratives are HTML-escaped inside the prompt so a report can't
close its own tag and inject instructions.

<figure>
	<img
		src="/screenshots/logbook-source.webp"
		alt="An expanded source card for ACN 1011022, 2012, B747-400: the ASRS synopsis about a line mechanic missing an inspection item on a brake change after a merger, followed by the reporter's full narrative."
		width="656"
		height="690"
		loading="lazy"
	/>
	<figcaption>
		A cited report's source card: the ASRS synopsis and the reporter's full narrative, so any
		claim can be checked against the original.
	</figcaption>
</figure>

### No vector database

With 3,632 narratives, a brute-force NumPy dot product takes milliseconds, so the planned
Chroma/FAISS store was dropped. Embeddings run locally on ONNX, so retrieval needs no network or
GPU, and the local-model setup stays fully offline.

### One question at a time, on purpose

Each question is answered on its own. Follow-ups like "tell me more about the second one" don't
work, but every evaluation run is single-turn and reproducible.

## Results

The pipeline is complete. The scored evaluation is in progress: 25 queries with gold filters,
comparing Claude with local models. The results below are a model screening, a smoke test and a
side experiment, not that scored run.

### Filter step: Claude vs local models

A screening on 3 queries, each chosen to exercise a different part of the filter spec: Boeing
737 reports from 2022–2024 (109 reports), deferred maintenance in 2019 vs 2023, and spacecraft,
which has no coded value, so the right answer is 0 reports. Claude models ran 3 times each, local
models twice, on a laptop CPU with no GPU.

| Model (runs) | Boeing 737 | Deferrals | Spacecraft | Calls accepted | Median time |
|---|---|---|---|---|---|
| Claude Haiku 5.5 (3) | 3 correct | 3 correct | 2 imprecise, 1 wrong | 10 / 10 | 2.9 s |
| Claude Opus 5.5 (3) | 3 correct | 3 imprecise | 2 correct, 1 imprecise | 12 / 12 | 6.1 s |
| gemma4:12b (2) | 2 wrong | 2 imprecise | 2 imprecise | 6 / 6 | 29 s |
| qwen3.5:9b (2) | 2 correct | 2 wrong | 2 correct | 4 / 14 | 76 s |
| llama3.1:8b (2) | 2 correct | 2 wrong | 2 wrong | 4 / 10 | 64 s |
| gpt-oss:20b (2) | 1 correct, 1 wrong | 2 wrong | 2 imprecise | 3 / 10 | 23 s |
| qwen3:30b-a3b (2) | 2 wrong | 2 correct | 2 wrong | 2 / 6 | 260 s |

"Imprecise" means a valid filter that's broader or narrower than the gold one; for example, Opus
added MEL and CDL keywords to the deferral filter.

- **Both Claude models produced a valid call every time** (22 of 22), and Haiku matched the gold
  filter exactly on the first two queries in every run.
- **No local model got all three right** in this round, and most of their failures were about
  format, not content: a correct filter sent as a text string, or JSON Ollama couldn't parse.
- **Reading tool calls written as text fixed the best local model.** `qwen3:30b-a3b` had written
  correct filters as plain JSON instead of tool calls. Once the pipeline read those, it was
  correct on all three, at roughly 4–8 minutes per filter on this laptop.

### Citations

In a smoke test on Claude, all 60 citations across 6 questions were verified. A question takes
about 15–30 seconds and costs roughly $0.10 in API usage.

### Side experiment: filling in a missing field

Analysts coded the deferred-maintenance flag for only 38% of reports, so deferral questions have
to fall back on keywords. Could the flag be predicted from the narratives? Each model was scored on
the same 237 held-out coded reports (69 deferred), using F1 on the deferred class:

| Model | F1 (95% CI) |
|---|---|
| Always "not deferred" | 0.00 (accuracy 0.71) |
| Keyword rule (`defer*` or MEL) | 0.79 (0.71–0.86) |
| TF-IDF + logistic regression | 0.76 (0.68–0.84) |
| Sentence embeddings + logistic regression | 0.73 (0.65–0.81) |
| **Claude Haiku 5.5, zero-shot** | **0.82** (0.74–0.89) |

- **Haiku scored highest, but not significantly.** The keyword rule and Haiku disagree on 13
  reports (McNemar exact test, p = 0.58).
- **A one-line rule matched machine learning.** Deferral is an administrative detail inside the
  story, not its topic, so embeddings trained to group texts by topic did worst.
- **The labels set the ceiling.** Both methods get the same 21 reports wrong. In about half of
  them the analysts coded "not deferred" although a deferral is plainly mentioned. A sharper
  definition in the prompt didn't help, because the analysts aren't consistent either.
- **Not wired in.** About one in five filled-in values would be wrong, and for the deferral
  question 6 to 8 of the top 10 retrieved reports stayed the same either way.

## Limitations

- **Not yet scored end-to-end.** Generated filters haven't been scored against the gold filters,
  the answer step has only been smoke-tested on 6 questions, and the model screening covers 3
  queries.
- **Valid filters can still be wrong.** Validation rejects invented fields and values, but not a
  filter that drops a constraint or splits into several. `gemma4:12b` added the aircraft type as a
  keyword and matched 4 reports instead of 109.
- **Words used in another sense get through.** For the spacecraft question, keyword filters
  matched "space" (hangar space) and "booster" (oxygen booster carts). The answer step has to
  reject them.
- **Failed citations are flagged, not corrected.**
- **Long narratives are only partly embedded.** 14% exceed the embedding model's 512-token input,
  so dense retrieval sees only their opening; BM25 still scores the full text.
- **No follow-up questions, and it runs locally only.**
- **Local models are slow** on a laptop CPU: from about 20 seconds to several minutes per filter.

## Links

- [Repository](https://github.com/aaronyalong/logbook)
- [Design notes](https://github.com/aaronyalong/logbook/blob/main/docs/design.md)
- [Model screening](https://github.com/aaronyalong/logbook/blob/main/evaluation/model_screening.md)
- [NLP experiments](https://github.com/aaronyalong/logbook/blob/main/nlp/README.md)
