import rss from '@astrojs/rss';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { getPublishedPosts, postPath } from '../lib/posts';

export async function GET(context) {
  // Published posts only — drafts never appear in the feed.
  const posts = await getPublishedPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: new URL(import.meta.env.BASE_URL, context.site),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: postPath(post),
      categories: post.data.tags,
    })),
  });
}
