// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Deployed to GitHub Pages at https://tjwjdl23.github.io/playground/
// If you rename the repo or move to a custom domain, update `site` and `base`.
export default defineConfig({
  site: 'https://tjwjdl23.github.io',
  base: '/playground',
  integrations: [mdx(), sitemap()],
});
