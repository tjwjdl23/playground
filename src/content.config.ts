import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    section: z.enum(['log', 'essays', 'projects', 'notes']),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(true),
    lang: z.enum(['ko', 'en']).default('ko'),
    description: z.string(),
  }),
});

export const collections = { posts };
