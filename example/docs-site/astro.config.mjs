// @ts-check
import starlight from '@astrojs/starlight';
import { docsKit } from '@branes-ai/docs-kit/astro';
import config from './docs-kit.config.mjs';

export default docsKit(config, import.meta.url, starlight);
