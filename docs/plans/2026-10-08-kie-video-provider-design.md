# Kie Video Provider Design

## Goal

Add Kie as a video-generation provider for the existing Agent flow, using Kie Seedance 2.5. Keep OpenAI and Anthropic responsible for agent conversation and tool calls.

## Design

- Add an encrypted `kie_api_key` admin setting and add Kie to the video provider selector.
- Route the existing `seedance-2-5` picker model through Kie's `bytedance/seedance-2-5` task API. Keep the existing provider/model catalog, credit calculation, task lifecycle, polling, cancellation, and error/refund handling.
- Correct the Kie provider's Seedance request mapping and normalize Kie's task states and returned URLs to the shared AI provider contract.
- Continue requiring configured object storage before starting a paid generation. On success, download the temporary Kie result and persist it through the existing R2 storage path before returning the public URL.
- Do not change agent LLM provider selection or add chat models, other Kie video models, callbacks, or a model catalog in this change.

## Acceptance

- Admin can securely save the Kie API key and choose Kie as the default video provider.
- Seedance 2.5 generation runs through Kie when Kie is selected/configured; incompatible models return a clear error instead of sending an invalid task.
- Existing task persistence, cancellation, credit refunds, and R2 persistence remain on the shared path.
- Production build succeeds. No live Kie generation can be verified until an API key is supplied.
