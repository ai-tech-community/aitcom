// Isolated visual fixture: no application server, database, Payload, or credentials.
import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = "/private/tmp/aitcom-payments-preview";
await mkdir(output, { recursive: true });
await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {NextIntlClientProvider} from 'next-intl'; import messages from './messages/en.json'; import {PaymentsPreview} from './src/components/communities/payments/payments-preview'; createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><PaymentsPreview /></NextIntlClientProvider>);`,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  outfile: `${output}/app.js`,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
});
const css = await postcss([tailwindcss()]).process(
  await readFile(`${root}/src/styles/globals.css`, "utf8"),
  { from: `${root}/src/styles/globals.css` },
);
await writeFile(`${output}/style.css`, css.css);
const html =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Community Payments Preview</title><link rel="stylesheet" href="/style.css"></head><body><main id="root"></main><script src="/app.js"></script></body></html>';
const server = createServer(async (request, response) => {
  const path = request.url?.split("?")[0];
  const file =
    path === "/app.js" ? "app.js" : path === "/style.css" ? "style.css" : null;
  response.setHeader(
    "Content-Type",
    file === "app.js"
      ? "text/javascript"
      : file === "style.css"
        ? "text/css"
        : "text/html",
  );
  response.end(file ? await readFile(`${output}/${file}`) : html);
});
server.listen(4179, "127.0.0.1", () =>
  console.log("Payments preview: http://127.0.0.1:4179"),
);
