import { createApp } from './app.mjs';

const pages = new Set(['/archive','/virus','/attacks','/settings','/help','/feedback','/privacy']);
export default {
  async fetch(request, env) {
    const db = {
      get: (sql,...args) => env.DB.prepare(sql).bind(...args).first(),
      all: async (sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results,
      run: async (sql,...args) => (await env.DB.prepare(sql).bind(...args).run()).meta,
    };
    return createApp(db, {
      origin: env.PUBLIC_ORIGIN,
      rateLimit: env.API_LIMIT,
      recoveryLimit: env.RECOVERY_LIMIT,
      assets: request => {
        const url = new URL(request.url);
        if(pages.has(url.pathname))url.pathname='/';
        return env.ASSETS.fetch(new Request(url,request));
      },
    })(request, {ip: request.headers.get('CF-Connecting-IP') || 'unknown'});
  },
};
