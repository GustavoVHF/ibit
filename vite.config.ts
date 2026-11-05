import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

const DEV_API_MAX_BODY = 10 * 1024;

// Dev-only: serve POST /api/shopee-product under `npm run dev` (Vercel runs it in production).
// Only this route is handled, so other api functions (e.g. the cron mailer) never run locally.
function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const k of ['SHOPEE_APP_ID', 'SHOPEE_APP_SECRET', 'FIREBASE_SERVICE_ACCOUNT']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k];
      }
      server.middlewares.use(async (req: any, res: any, next) => {
        const u = new URL(req.url || '/', 'http://localhost');
        if (u.pathname !== '/api/shopee-product') return next();

        const sendJson = (code: number, obj: unknown) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(obj));
        };

        let raw: string | null;
        try {
          raw = await new Promise<string | null>((resolve, reject) => {
            let size = 0;
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => {
              size += c.length;
              if (size <= DEV_API_MAX_BODY) chunks.push(c);
            });
            req.on('end', () => resolve(size > DEV_API_MAX_BODY ? null : Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
          });
        } catch {
          return sendJson(400, {error: 'Requisição inválida'});
        }
        if (raw === null) return sendJson(413, {error: 'Requisição muito grande'});

        let body: unknown = undefined;
        if (raw.trim()) {
          try {
            body = JSON.parse(raw);
          } catch {
            return sendJson(400, {error: 'JSON inválido'});
          }
        }

        req.query = Object.fromEntries(u.searchParams);
        req.body = body;
        res.status = (c: number) => {
          res.statusCode = c;
          return res;
        };
        res.json = (o: unknown) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(o));
          return res;
        };

        try {
          const mod = await server.ssrLoadModule('/api/shopee-product.ts');
          await mod.default(req, res);
        } catch {
          if (!res.headersSent) sendJson(500, {error: 'Erro interno'});
          else res.end();
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'global': 'window',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
