import { defineConfig } from 'vitepress';

const base = process.env.DOCS_BASE ?? '/';
const publicAsset = (filename: string) => `${base.endsWith('/') ? base : `${base}/`}${filename}`;

export default defineConfig({
  title: 'Roost2D',
  description: 'A manifest-first TypeScript 2D engine.',
  base,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: publicAsset('roost2d-icon.svg') }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: publicAsset('favicon-32x32.png') }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: publicAsset('favicon-16x16.png') }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: publicAsset('apple-touch-icon.png') }],
  ],
  themeConfig: {
    logo: '/roost2d-icon.svg',
    nav: [{ text: 'Quick start', link: '/getting-started' }, { text: 'Packages', link: '/packages' }, { text: 'Chikn assets', link: '/chikn-assets' }, { text: 'Showcase', link: '/showcase/' }],
    sidebar: [
      { text: 'Foundations', items: [{ text: 'Getting started', link: '/getting-started' }, { text: 'Architecture', link: '/architecture' }, { text: 'Scenes and fixed updates', link: '/scenes' }, { text: 'Input', link: '/input' }] },
      { text: 'Game systems', items: [{ text: 'Assets', link: '/assets' }, { text: 'Chikn asset integration', link: '/chikn-assets' }, { text: 'Rig2D', link: '/rig2d' }, { text: 'Controlled actions', link: '/actions' }, { text: 'Isometric worlds', link: '/isometric' }, { text: 'Effects and audio', link: '/effects-audio' }, { text: 'Networking', link: '/networking' }] },
      { text: 'Ship', items: [{ text: 'Tooling and releases', link: '/tooling-releases' }, { text: 'Packages', link: '/packages' }, { text: 'Live showcase', link: '/showcase/' }] },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Roost2D/roost2d' }],
  }
});
