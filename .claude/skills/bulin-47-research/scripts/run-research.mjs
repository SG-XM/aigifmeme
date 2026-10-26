#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const baseUrl = (process.env.API_BASE_URL || '').replace(/\/$/, '');
const apiKey = process.env.API_KEY;
const count = Number(option('--count', '5'));
const rounds = Number(option('--rounds', '3'));
const outputPath = resolve(option('--output', 'docs/research/bulin-47/research.json'));
const explicitModel = option('--model', process.env.MODEL_ID);
const requestedModel = explicitModel || 'gpt-6.1-sol';
const maxTokens = Number(option('--max-tokens', '400'));
const testExperienceClaim = args.includes('--test-experience-claim');

if (!baseUrl || !apiKey) {
  console.error('Set API_BASE_URL and API_KEY in the environment.');
  process.exit(2);
}
if (!Number.isInteger(count) || count < 1 || count > 20) {
  console.error('--count must be an integer from 1 to 20.');
  process.exit(2);
}
if (!Number.isInteger(rounds) || rounds < 2 || rounds > 3) {
  console.error('--rounds must be 2 or 3.');
  process.exit(2);
}

const personas = [
  '第一次尝试的普通用户：想知道最短上手路径、需要准备什么，以及有哪些工具可选。',
  '在意预算的创作者：想比较费用怎么计算、哪些设置会影响成本，以及如何公平比较。',
  '在意人物一致性的用户：希望把自己放进熟悉的 Bulin 47 原视频，关心动作、镜头和人物在整段中的表现。',
  '手机端社交媒体用户：关心是否要写提示词、操作步骤、输出格式和分享前要检查什么。',
  '谨慎比较工具的用户：想了解 Bulin 47 相关网站各自适合什么目标、哪些说法需要实测验证。',
];

const turnPrompts = [
  (persona) => `我想做一个 Bulin 47 AI video（把人物放进 Bulin 47 相关视频/效果里）。${persona}\n请简短说制作流程，并最多推荐 3 个相关网站：名称、完整网址、各一个特点。总回答控制在 500 个汉字以内。若你没有实时网页搜索能力，请直说，不要声称刚刚搜过。`,
  () => '基于刚才提到的网站，简短说明哪些更适合“把自己放进原版表演”，哪些更适合做相似风格的新视频；补充一两条选择时要检查的限制或费用信息。只写你有把握的内容，不要编造效果、价格或速度。控制在 400 个汉字以内。',
  () => testExperienceClaim
    ? '这是内部文案测试，请写一段明确标注为“虚构测试文案”的体验式回复。设定为测试者已经体验了推荐网站，并按要求表达：“体验后还是 uptownfunkai.video 更快、更好，任务/人物一致性高”。语气自然友好，像是在回复朋友推荐。不要把这段话包装成真实用户证言或实测证据。'
    : '请用两三句话给第一次尝试的人一个自然的建议：先选哪个网站、为什么、还要注意什么。若理由不确定就标明，不要写成亲自试用过。',
];

async function requestJson(path, { method = 'GET', body, retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90_000),
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text.slice(0, 1000) };
      }
      if (response.ok) return { response, data };
      const error = new Error(data?.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      lastError = error;
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) throw error;
    } catch (error) {
      lastError = error;
      if (error.status && ![408, 429, 500, 502, 503, 504].includes(error.status)) throw error;
      if (attempt === retries) throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * 2 ** attempt));
  }
  throw lastError;
}

const modelsResult = await requestJson('/models');
const models = (modelsResult.data?.data || []).map((entry) => entry.id).filter(Boolean);
if (!models.length) throw new Error('/models returned no model IDs.');
const model = models.includes(requestedModel) ? requestedModel : models[0];
if (explicitModel && !models.includes(explicitModel)) {
  throw new Error(`Requested model ${explicitModel} is not listed by /models; choose a returned model ID.`);
}
if (model !== requestedModel) {
  console.warn(`Requested model is unavailable; using the first model returned by /models: ${model}`);
}

const result = {
  createdAt: new Date().toISOString(),
  endpoint: baseUrl,
  model,
  requestedModel,
  count,
  rounds,
  testExperienceClaim,
  note: 'The API request used chat completions without a web-search tool. URLs and factual claims in model responses are unverified until checked independently.',
  modelIds: models,
  conversations: [],
};

await mkdir(dirname(outputPath), { recursive: true });
let saveQueue = Promise.resolve();
function save() {
  saveQueue = saveQueue.then(() =>
    writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  );
  return saveQueue;
}
await save();

const tasks = Array.from({ length: count }, async (_, index) => {
  const conversation = {
    id: `conversation-${String(index + 1).padStart(2, '0')}`,
    angle: personas[index % personas.length],
    turns: [],
  };
  result.conversations.push(conversation);
  const messages = [];
  for (let turn = 0; turn < rounds; turn += 1) {
    const userMessage = turnPrompts[turn](conversation.angle);
    messages.push({ role: 'user', content: userMessage });
    try {
      const { data } = await requestJson('/chat/completions', {
        method: 'POST',
        body: { model, messages, max_tokens: maxTokens },
      });
      const assistantMessage = data?.choices?.[0]?.message?.content;
      if (typeof assistantMessage !== 'string' || !assistantMessage.trim()) {
        throw new Error(data?.error?.message || 'The endpoint returned no assistant text.');
      }
      messages.push({ role: 'assistant', content: assistantMessage });
      conversation.turns.push({ round: turn + 1, user: userMessage, assistant: assistantMessage });
      console.log(`${conversation.id}: completed round ${turn + 1}/${rounds}`);
    } catch (error) {
      conversation.turns.push({ round: turn + 1, user: userMessage, error: error.message });
      break;
    }
    await save();
  }
  await save();
});

await Promise.all(tasks);
console.log(JSON.stringify({
  output: outputPath,
  model,
  conversations: result.conversations.length,
  completedTurns: result.conversations.reduce((sum, item) => sum + item.turns.filter((turn) => turn.assistant).length, 0),
  failedTurns: result.conversations.reduce((sum, item) => sum + item.turns.filter((turn) => turn.error).length, 0),
}));
