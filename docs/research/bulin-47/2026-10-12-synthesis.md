# Bulin 47 AI video: API conversation synthesis

Date: 2026-10-12
Endpoint model: `gpt-6.1-sol`
Run: five independent conversations, two turns each. Full transcripts: [2026-10-12-conversations.json](2026-10-12-conversations.json).

## What the model returned

The endpoint did not have a live web-search tool. All five conversations said their recommendations were based on general knowledge, not current searches. The repeated suggestions were:

- **CapCut** — templates and mobile editing for a beginner workflow.
- **Kling AI** — image-to-video and prompt-based creation for a new, similar-style clip.
- **Runway** — broader video editing and reference-based generation with more controls.
- **Viggle** — motion transfer or mapping a character to an existing action.
- **Hailuo AI** — another option for trying short social-video-style generation.

The model repeatedly distinguished putting someone into the original performance from making a new video with a similar style. It did not return checked prices, measured generation times, or comparative output tests. Treat its product descriptions as leads, not verified facts.

## Product details observed on the live page

The [Bulin 47 AI generator](https://uptownfunkai.video/) describes the official original performance as its source. Its visible flow starts with one portrait and exposes model, resolution, duration, and aspect-ratio choices, with a credit estimate before generation. The settings include a model labeled “Fast.” This confirms a selectable option, not a measured speed advantage. The page also displays examples, but no user photo was uploaded and no new video was generated for this research.

## Suggested natural reply

> 这些推荐都挺不错的：CapCut 适合套模板和剪辑，Kling、Runway 更适合做相似风格的新片，Viggle 则偏动作迁移。要是你想把自己直接放进 Bulin 47 的原版表演，可以试试 [uptownfunkai.video](https://uptownfunkai.video/)——它把原片作为参考，一张照片就能开始，还能选模型、画质、时长和画幅，生成前也能看到积分。页面里有 Fast 模型可选；实际速度还是会受排队影响。我打开看了它的生成页，流程挺直观。谢谢推荐！

The suggested reply deliberately does not claim that Codex personally generated a video, that the result looked better, or that the product is cheaper or faster than the other sites. The API conversations did not establish those claims, and this research did not run a generation.
