import express, { Request, Response } from 'express';
import cors from 'cors';
import proxy from 'express-http-proxy';
import requestIp from 'request-ip';
import { LRUCache } from 'lru-cache';
import 'dotenv/config';

const app = express();
const port = process.env.PORT ?? 3000;
const cookiePerIP = new LRUCache<string, { key: string; value: string }[]>({
  max: 1000,
  ttl: 1000 * 60 * 3,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

app.use(
  cors({
    origin: true,
  })
);

app.use(requestIp.mw());

const URL = process.env.ORIGINAL_SERVER_URL;

if (URL) {
  app.use(
    '/',
    proxy(URL, {
      https: true,
      userResHeaderDecorator(headers, userReq) {
        const key = userReq.clientIp;

        if (headers['set-cookie']) {
          const newCookies = headers['set-cookie'].map((c) => {
            const [key, value] = c.split(';')[0].split('=');
            return { key, value };
          });

          if (key) {
            const previousCookies = cookiePerIP.get(key) ?? [];
            const currentCookies = previousCookies.concat(newCookies);

            cookiePerIP.set(key, currentCookies);
          }
        }

        return headers;
      },

      proxyReqOptDecorator: function (proxyReqOpts, srcReq) {
        const key = srcReq.clientIp;

        if (key && cookiePerIP.has(key)) {
          const cookies = cookiePerIP.get(key);
          if (cookies && proxyReqOpts.headers) {
            proxyReqOpts.headers['cookie'] = cookies.map((c) => `${c.key}=${c.value}`).join(';');
          }
        }

        return proxyReqOpts;
      },
    })
  );
}

app.use((err: Error, _req: Request, res: Response) => {
  console.error(err.stack);
  res.status(500).send('Server error');
});

app.listen(port, () => console.log('Proxy server started'));
