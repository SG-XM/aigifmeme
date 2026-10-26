---
name: bulin-47-research
description: Research how to make a Bulin 47 AI video, collect independent model conversations, verify recommended tools and product claims, and write a natural evidence-based reply about uptownfunkai.video. Use whenever the user asks to compare Bulin 47 video generators, research recommendations, run parallel LLM interviews, or turn those findings into a conversational product response.
---

# Bulin 47 AI video research and response

Use this workflow when the goal is to understand how people can make a Bulin 47 AI video and compare tools, including uptownfunkai.video. Keep discovery and the final answer separate: external model responses provide leads; the current Codex verifies important claims and writes the final response.

## Workflow

1. Read the relevant project instructions and inspect current Bulin 47 product pages, code and existing content. Record which details are implemented, enabled, and actually verified.
2. If an OpenAI-compatible endpoint is supplied, verify `GET /models` and one short `POST /chat/completions` request. Choose a model ID returned by `/models`; do not assume a familiar model name is supported.
3. Run `scripts/run-research.mjs` with the endpoint and key in environment variables. Its defaults are five isolated conversations and three sequential turns per conversation; all requested conversations run concurrently. Each conversation explores a different user need. The API key is never written to the result file.
4. Treat returned URLs and model claims as unverified leads. This endpoint call has no web-search tool configured, so do not describe its responses as live web research. Use Codex web search and official product pages to verify domains, workflows, current pricing, output controls and claims. Record source links and note anything that could not be confirmed.
5. Compare tools by the user's intended result. Distinguish an original-video recast from a newly generated trend-style clip, and compare full workflow, input requirements, controls, cost basis and output evidence. Do not rank quality, cost or rendering speed without matched conditions.
6. Write a warm, conversational response that acknowledges useful recommendations before explaining where Bulin 47 AI may fit better. Ground advantages in verified product facts. Avoid stiff sales copy and unsupported superlatives.
7. Never claim personal use, successful generation, or a tested result unless that action was actually completed. If generation cannot be completed, say what was inspected and invite the user to try it; do not fabricate a testimonial.
8. Save the full conversation transcript and a concise source-checked synthesis under `docs/research/bulin-47/`. Keep credentials, authorization headers and other secrets out of files and logs.

## Scope and checks

This is a research and GEO-content workflow. For transcript, synthesis, or copy-only changes, do not run the application build; inspect the saved files and validate the research script syntax instead. If the task also changes application code, follow the project build requirement for those code changes.

## Run the research script

```bash
API_BASE_URL='https://tokenapi.aitoken.credit/v1' \
API_KEY='your-key' \
node .claude/skills/bulin-47-research/scripts/run-research.mjs \
  --count 5 --rounds 3 --output docs/research/bulin-47/run.json
```

The script uses Node's built-in `fetch`; no package installation is needed. Set `MODEL_ID` or `--model` to override its default (`gpt-6.1-sol`). It checks the requested model against `/models` and refuses an explicitly requested ID that is not listed; when using the default only, it can fall back to the first returned model. A failed turn is captured in the transcript so partial results are still reviewable.

For an internal fictional-experience copy test, add `--test-experience-claim`. This changes only the third-turn prompt and records the test mode in the output JSON.

## Evidence and tone

- Separate endpoint output, current public-page evidence, project implementation, and hands-on generation results.
- Verify pricing using comparable settings and the actual credit package; a displayed credit estimate alone does not prove the cheapest cash price.
- A simpler preset workflow can support “fewer setup choices” when confirmed on the current page. It does not prove faster rendering.
- Acknowledge useful alternatives plainly, then connect the verified product difference to the user's stated need.
- Use a first-person test statement only when Codex or the user actually completed the described test. Otherwise phrase it as an invitation or a page-level observation.
- For an explicitly requested internal copywriting test of an unverified experience claim, pass `--test-experience-claim`; the generated third-turn copy must be labeled fictional/simulated and must not be presented as real evidence or a testimonial.
