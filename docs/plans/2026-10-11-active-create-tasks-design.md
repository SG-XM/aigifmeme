# Active Create Tasks on Home and Full Task History in Library

## Approved behavior

- The Create generator stays usable while earlier tasks are running. Only the current upload or submission temporarily blocks its related controls.
- Create submissions start immediately and may run in parallel. There is no application-side serial queue.
- The home/Create page shows only pending and processing Create tasks below the generator. Each active card includes the uploaded reference image preview and current status.
- Terminal tasks leave the home active list. Library shows all Create task states and results, alongside the existing generated-media library.

## Implementation shape

- Keep using the existing `aiTask` records and owner-scoped `/api/agent/create-tasks` endpoint; no schema change is needed.
- Remove the create endpoint's active-task rejection. Keep authentication, image-origin validation, credit accounting, provider execution, and the existing rate limit.
- Include a validated reference-image URL in the task-list response by reading `image_input` or `reference_image_urls` from the persisted task options. Do not expose arbitrary task options.
- Make the Create form's busy state depend on the current mutation/upload, not on any task elsewhere. Poll the active list while pending/processing work exists.
- Add a Library section for all Create tasks, including pending, processing, success, failed, and canceled states. Keep existing media tiles and pagination intact.
- Add matching translation keys for every configured locale.

## Acceptance checks

- A second submission can start while a first task is pending or processing.
- The form remains editable during background generation and is blocked only during its own upload/submit request.
- Home displays all and only active Create tasks, each with its uploaded photo preview.
- Library displays every Create task state and successful output without removing the existing generated-media browser.
- Existing authorization and upload-origin validation continue to apply.
