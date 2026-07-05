import { getCollection, type CollectionEntry } from 'astro:content';
import { SECTIONS, type Section } from '../consts';

export type Post = CollectionEntry<'posts'>;

/** Base path without trailing slash, e.g. "/playground". */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a root-relative path with the site base. */
export function url(path: string): string {
  return `${BASE}${path}`;
}

/**
 * Posts visible in the current mode, newest first.
 * Drafts are visible in dev (`npm run dev`) but excluded from
 * production builds entirely (pages, sitemap, RSS).
 */
export async function getVisiblePosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true,
  );
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** Published (non-draft) posts, newest first — used for RSS in any mode. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** URL slug for a post: its filename, regardless of subfolder. */
export function postSlug(post: Post): string {
  return post.id.split('/').pop()!;
}

/** Root-relative URL for a post, including the site base. */
export function postUrl(post: Post): string {
  return url(`/${post.data.section}/${postSlug(post)}/`);
}

/** Path for a post without the base — for RSS, which joins against `site`. */
export function postPath(post: Post): string {
  return `${BASE}/${post.data.section}/${postSlug(post)}/`;
}

/** Sections that currently have at least one visible post, in nav order. */
export async function getActiveSections(): Promise<Section[]> {
  const posts = await getVisiblePosts();
  const present = new Set(posts.map((p) => p.data.section));
  return (Object.keys(SECTIONS) as Section[]).filter((s) => present.has(s));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
