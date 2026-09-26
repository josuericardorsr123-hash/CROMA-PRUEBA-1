// Empaqueta la API y la CLI en un solo archivo cada una (dist/api.mjs, dist/em.mjs).
import { build } from "esbuild";

const comun = {
  bundle: true, platform: "node", format: "esm", target: "node22", external: ["pg-native"], logLevel: "info",
  // Dependencias CommonJS empaquetadas en ESM necesitan require.
  banner: { js: "import { createRequire as __crearRequire } from 'node:module'; const require = __crearRequire(import.meta.url);" },
};
const destino = process.argv[2];
const entradas = { api: "apps/api/src/main.ts", cli: "apps/cli/src/main.ts" };
for (const [nombre, entrada] of Object.entries(entradas)) {
  if (destino && destino !== nombre) continue;
  await build({ ...comun, entryPoints: [entrada], outfile: `dist/${nombre === "cli" ? "em" : nombre}.mjs` });
}
