import { describe, expect, it } from 'vitest';

import type { StoredPart } from '@/modules/chats/service';

import { mapRowsToHistory } from './history';

// The runtime is stateless: every turn replays the conversation from these
// rows. If the mapping drops a tool call or detaches it from its result, the
// model either forgets what it just did or the provider rejects the request.
type Row = { role: 'user' | 'assistant'; parts: StoredPart[] };

const text = (t: string): StoredPart => ({ type: 'text', text: t });
const call = (
  id: string,
  name: string,
  args: string,
  result?: string
): StoredPart => ({ type: 'tool_call', id, name, arguments: args, result });

describe('mapRowsToHistory', () => {
  it('carries a plain exchange through in order', () => {
    const rows: Row[] = [
      { role: 'user', parts: [text('draw a cat')] },
      { role: 'assistant', parts: [text('here you go')] },
    ];
    expect(mapRowsToHistory(rows)).toEqual([
      { role: 'user', content: 'draw a cat' },
      { role: 'assistant', content: [{ type: 'text', text: 'here you go' }] },
    ]);
  });

  it('splits a tool call into tool_use and a following tool_result', () => {
    const rows: Row[] = [
      { role: 'user', parts: [text('draw a cat')] },
      {
        role: 'assistant',
        parts: [
          text('on it'),
          call('c1', 'generate_image', '{"prompt":"a cat"}', '{"files":["a"]}'),
        ],
      },
    ];

    const history = mapRowsToHistory(rows);

    expect(history).toHaveLength(3);
    expect(history[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'on it' },
        {
          type: 'tool_use',
          id: 'c1',
          name: 'generate_image',
          input: { prompt: 'a cat' },
        },
      ],
    });
    // The result belongs to the *user* turn — that is the shape providers
    // expect, and the id has to match or the call dangles.
    expect(history[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'c1', content: '{"files":["a"]}' },
      ],
    });
  });

  it('marks a call that never got a result as an error', () => {
    const rows: Row[] = [
      { role: 'assistant', parts: [call('c1', 'generate_image', '{}')] },
    ];
    const [, result] = mapRowsToHistory(rows);
    // Leaving it out would strand the tool_use; leaving it blank would let the
    // model believe the call succeeded.
    expect(result).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'c1',
          content: 'No result recorded.',
          is_error: true,
        },
      ],
    });
  });

  it('keeps several calls in one turn together, results in step', () => {
    const rows: Row[] = [
      {
        role: 'assistant',
        parts: [
          call('c1', 'generate_image', '{"prompt":"a"}', 'ok-a'),
          call('c2', 'generate_image', '{"prompt":"b"}', 'ok-b'),
        ],
      },
    ];
    const [assistant, results] = mapRowsToHistory(rows);
    expect((assistant.content as unknown[]).length).toBe(2);
    expect(results.content).toEqual([
      { type: 'tool_result', tool_use_id: 'c1', content: 'ok-a' },
      { type: 'tool_result', tool_use_id: 'c2', content: 'ok-b' },
    ]);
  });

  it('survives arguments that are not valid JSON', () => {
    const rows: Row[] = [
      {
        role: 'assistant',
        parts: [call('c1', 'generate_image', '{oops', 'r')],
      },
    ];
    const [assistant] = mapRowsToHistory(rows);
    // An empty object still lets the turn replay; throwing would lose the
    // whole conversation over one malformed row.
    expect((assistant.content as Array<{ input: unknown }>)[0].input).toEqual(
      {}
    );
  });

  it('drops empty text rather than sending a blank message', () => {
    const rows: Row[] = [
      { role: 'user', parts: [text('   ')] },
      { role: 'assistant', parts: [text('')] },
    ];
    expect(mapRowsToHistory(rows)).toEqual([]);
  });
});
