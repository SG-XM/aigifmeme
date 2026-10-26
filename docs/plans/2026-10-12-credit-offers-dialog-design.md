# Unified credit offers dialog

## Goal

Make the purchase choice opened from video generation, chat, the plan card, and the credits page consistent. Present one-time credit packs and subscription plans together, with current generation cost shown when the dialog comes from video creation.

## Design

- Reuse the existing pricing catalog and checkout path so prices, payment-provider selection, current-plan state, and redirects continue to use the configured product data.
- Use one dialog for all offer entry points. Keep one-time packs and subscription plans as separate, clearly labeled sections.
- On phones, show one pricing card per row and keep scrolling inside the dialog, with the title and optional current-video context remaining visible.
- In video creation, show the selected generation's credit cost and the existing failed-generation refund reassurance. Other entry points use the general purchase description.
- Do not change product pricing, checkout behavior, or backend APIs.

## Acceptance

- Every existing offer entry point opens the same catalog and checkout choices.
- Video creation shows its actual selected credit cost in the dialog.
- The dialog remains usable at narrow mobile widths and short viewport heights.
- English, Chinese, and Spanish copy is provided through Paraglide message sources.
