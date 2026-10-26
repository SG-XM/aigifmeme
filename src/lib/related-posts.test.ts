import { describe, expect, it } from 'vitest';

import { sorryDemoSources } from '@/lib/im-so-sorry-demos';
import {
  HOME_RELATED_SLUG,
  parseTagList,
  presentRelatedPosts,
  resolveRelatedPostTags,
  selectRelatedPosts,
  type RelatedPostSource,
} from '@/lib/related-posts';
import { imSoSorryGeoPosts } from '@/content/posts/im-so-sorry-geo';

const bulin: RelatedPostSource = {
  id: 'bulin-post',
  slug: 'bulin-47-guide',
  title: 'Bulin 47 tips',
  tags: ['bulin-47', 'window-peeper'],
};

const peeper: RelatedPostSource = {
  id: 'peeper-post',
  slug: 'window-peeper-bite',
  title: 'Window Peeper at night',
  tags: ['window-peeper'],
};

const untagged: RelatedPostSource = {
  id: 'plain',
  slug: 'hello-world',
  title: 'Hello',
  tags: [],
};

describe('related posts', () => {
  it('uses the effect slug when tags are not configured', () => {
    expect(
      resolveRelatedPostTags({ slug: 'window-peeper', relatedPostTags: [] })
    ).toEqual(['window-peeper']);
    expect(
      resolveRelatedPostTags({
        slug: 'window-peeper',
        relatedPostTags: ['night-window'],
      })
    ).toEqual(['night-window']);
  });

  it('keeps Bulin 47 posts off the Window Peeper list', () => {
    const posts = [bulin, peeper, untagged, ...imSoSorryGeoPosts('en')];
    expect(
      selectRelatedPosts(posts, { slug: 'window-peeper' }).map(
        (post) => post.id
      )
    ).toEqual(['peeper-post']);
  });

  it('lists only im-so-sorry posts on that effect', () => {
    const posts = [bulin, peeper, untagged, ...imSoSorryGeoPosts('en')];
    expect(
      selectRelatedPosts(posts, { slug: 'im-so-sorry' }).map(
        (post) => post.slug
      )
    ).toEqual([
      'im-so-sorry-photo-trend',
      'im-so-sorry-filter-tiktok',
      'im-so-sorry-photo-trend-download',
    ]);
  });

  it('still drops a foreign brand when the id is listed', () => {
    expect(
      selectRelatedPosts([bulin], {
        slug: 'window-peeper',
        relatedPostIds: ['bulin-post'],
      })
    ).toEqual([]);
  });

  it('parses comma and newline tags', () => {
    expect(parseTagList("I'm so sorry, window-peeper\nbulin-47")).toEqual([
      'im-so-sorry',
      'window-peeper',
      'bulin-47',
    ]);
  });

  it('matches an effect keyword in the title without a slug tag', () => {
    const dance: RelatedPostSource = {
      id: 'dance',
      slug: 'shoulder-move',
      title: 'Dame Hombro in five steps',
      tags: [],
    };
    expect(
      selectRelatedPosts([dance], { slug: 'bulin-47' }).map((post) => post.id)
    ).toEqual(['dance']);
    expect(
      selectRelatedPosts([dance], {
        slug: 'bulin-47',
        relatedPostTags: ['night-window'],
      }).map((post) => post.id)
    ).toEqual(['dance']);
  });

  it('matches burning bridges phrases in the title, summary, or body', () => {
    const titleOnly: RelatedPostSource = {
      id: 'bridges-title',
      slug: 'burning-bridges-ai-trend-explained',
      title: 'Burning Bridges AI: Recreate the Official Original Video',
      description: 'A short note about a party.',
      tags: [],
    };
    const summaryOnly: RelatedPostSource = {
      id: 'bridges-summary',
      slug: 'preset-note',
      title: 'A short note',
      description: 'Try the burning-bridges preset.',
      tags: [],
    };
    const bodyOnly: RelatedPostSource = {
      id: 'bridges-body',
      slug: 'party-note',
      title: 'A short note',
      description: 'No brand here',
      content: 'The clip is a chandelier party.',
      tags: [],
    };
    const bridgesOnly = [titleOnly, summaryOnly, bodyOnly];
    expect(
      selectRelatedPosts(bridgesOnly, { slug: 'burning-bridges' }).map(
        (post) => post.id
      )
    ).toEqual(['bridges-title', 'bridges-summary', 'bridges-body']);
    for (const slug of ['bulin-47', 'window-peeper', 'im-so-sorry'] as const) {
      expect(selectRelatedPosts(bridgesOnly, { slug })).toEqual([]);
    }
    expect(
      selectRelatedPosts(bridgesOnly, { slug: HOME_RELATED_SLUG })
    ).toEqual([]);
  });

  it('keeps a titled window peeper guide when the body mentions a chandelier party', () => {
    const guide: RelatedPostSource = {
      id: 'peeper-party',
      slug: 'night-bite',
      title: 'How to make a window peeper clip',
      content: 'The last shot is a chandelier party.',
      tags: [],
    };
    expect(
      selectRelatedPosts([guide], { slug: 'window-peeper' }).map(
        (post) => post.id
      )
    ).toEqual(['peeper-party']);
    expect(selectRelatedPosts([guide], { slug: 'burning-bridges' })).toEqual(
      []
    );
  });

  it('drops a shared photo guide that matches bulin and burning bridges equally', () => {
    const guide: RelatedPostSource = {
      id: 'photo',
      slug: 'ai-video-photo-preparation-guide',
      title: 'What Photo Should You Upload for AI Video? A One-Photo Checklist',
      description:
        'Prepare a clear portrait for an AI video before replacing the lead in the original Bulin 47 video or making a Burning Bridges recast.',
      content:
        'Open Bulin 47 AI to replace the lead in the official original freestyle, or Burning Bridges AI to replace the lead in the party video. The checklist also mentions the official original Burning Bridges video.',
      tags: [],
    };
    expect(selectRelatedPosts([guide], { slug: 'bulin-47' })).toEqual([]);
    expect(selectRelatedPosts([guide], { slug: 'burning-bridges' })).toEqual(
      []
    );
    expect(
      selectRelatedPosts([guide], { slug: HOME_RELATED_SLUG }).map(
        (post) => post.id
      )
    ).toEqual(['photo']);
  });

  it('matches a keyword in the summary or body', () => {
    const summary: RelatedPostSource = {
      id: 'summary',
      slug: 'party-note',
      title: 'A party note',
      description: 'The room is lit by a chandelier.',
      tags: [],
    };
    const body: RelatedPostSource = {
      id: 'body',
      slug: 'short-note',
      title: 'A short note',
      description: 'Nothing special',
      content: 'The night window stayed shut until the curtain moved.',
      tags: [],
    };
    expect(
      selectRelatedPosts([summary], { slug: 'burning-bridges' }).map(
        (post) => post.id
      )
    ).toEqual(['summary']);
    expect(
      selectRelatedPosts([body], { slug: 'window-peeper' }).map(
        (post) => post.id
      )
    ).toEqual(['body']);
  });

  it('keeps a titled window peeper guide when the summary names Bulin 47', () => {
    const guide: RelatedPostSource = {
      id: 'peeper-guide',
      slug: 'night-bite',
      title: 'How to make a window peeper clip',
      description: 'Shot on Bulin 47 AI with one photo.',
      tags: [],
    };
    expect(
      selectRelatedPosts([guide], { slug: 'window-peeper' }).map(
        (post) => post.id
      )
    ).toEqual(['peeper-guide']);
    expect(selectRelatedPosts([guide], { slug: 'bulin-47' })).toEqual([]);
  });

  it('hides a post that matches two effects equally in the title', () => {
    const both: RelatedPostSource = {
      id: 'both',
      slug: 'compare',
      title: 'Bulin 47 versus burning bridges',
      tags: [],
    };
    expect(selectRelatedPosts([both], { slug: 'bulin-47' })).toEqual([]);
    expect(selectRelatedPosts([both], { slug: 'burning-bridges' })).toEqual([]);
  });

  it('prefers the effect with more title keywords', () => {
    const post: RelatedPostSource = {
      id: 'party',
      slug: 'party',
      title: 'Bulin 47 and the burning bridges chandelier',
      tags: [],
    };
    expect(selectRelatedPosts([post], { slug: 'bulin-47' })).toEqual([]);
    expect(
      selectRelatedPosts([post], { slug: 'burning-bridges' }).map(
        (item) => item.id
      )
    ).toEqual(['party']);
  });

  it('lets a matching tag include a post with no keyword in the text', () => {
    const tagged: RelatedPostSource = {
      id: 'tagged',
      slug: 'plain-note',
      title: 'Notes',
      tags: ['window-peeper'],
    };
    expect(
      selectRelatedPosts([tagged], { slug: 'window-peeper' }).map(
        (post) => post.id
      )
    ).toEqual(['tagged']);
  });

  it('matches sorry phrases with or without an apostrophe', () => {
    const post: RelatedPostSource = {
      id: 'sorry',
      slug: 'sorry-note',
      title: 'Im so sorry photo trend',
      tags: [],
    };
    expect(
      selectRelatedPosts([post], { slug: 'im-so-sorry' }).map((item) => item.id)
    ).toEqual(['sorry']);
  });

  it('uses site keywords on home and does not apply effect exclusion', () => {
    const guide: RelatedPostSource = {
      id: 'guide',
      slug: 'sync-audio',
      title: 'Silent renders',
      description: 'Copyright can block a soundtrack.',
      content: 'Use the AI video generator and check credits before you start.',
      tags: ['burning-bridges'],
    };
    const peeperGuide: RelatedPostSource = {
      id: 'peeper-guide',
      slug: 'night-bite',
      title: 'How to make a window peeper clip',
      description: 'Shot on Bulin 47 AI',
      tags: [],
    };
    const lamp: RelatedPostSource = {
      id: 'lamp',
      slug: 'lamp',
      title: 'Chandelier lighting',
      tags: [],
    };
    expect(
      selectRelatedPosts([guide, peeperGuide, lamp, bulin], {
        slug: HOME_RELATED_SLUG,
      }).map((post) => post.id)
    ).toEqual(['guide', 'peeper-guide']);
    expect(selectRelatedPosts([lamp], { slug: 'not-an-effect' })).toEqual([]);
  });

  it('drops the article body after the page match', () => {
    const post: RelatedPostSource = {
      id: 'body',
      slug: 'short-note',
      title: 'A short note',
      content: 'A freestyle clip from one photo.',
      tags: [],
    };
    expect(presentRelatedPosts([post], { slug: 'bulin-47' })).toEqual([
      {
        id: 'body',
        slug: 'short-note',
        title: 'A short note',
        tags: [],
      },
    ]);
    expect(
      presentRelatedPosts([post], { slug: HOME_RELATED_SLUG }).map(
        (item) => item.id
      )
    ).toEqual(['body']);
  });
});

describe('sorry demo sources', () => {
  it('uses the shipped slide files', () => {
    expect(sorryDemoSources()).toEqual([
      '/images/im-so-sorry/01-dream.jpg',
      '/images/im-so-sorry/02-wig.jpg',
      '/images/im-so-sorry/03-costume.jpg',
      '/images/im-so-sorry/04-party.jpg',
      '/images/im-so-sorry/05-original.jpg',
    ]);
  });
});
