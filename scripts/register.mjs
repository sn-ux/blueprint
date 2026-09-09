/** Entry hook: `node --import ./scripts/register.mjs scripts/<script>.mjs` */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve.mjs", import.meta.url);
