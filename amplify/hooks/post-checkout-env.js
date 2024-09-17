import { BuildUIEnv } from './build-ui-env.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const getParameters = async () => {
  const fs = require("fs");
  return JSON.parse(fs.readFileSync(0, { encoding: "utf8" }));
};

getParameters()
  .then((event) => BuildUIEnv("post-env-checkout hook", event.data, event.error))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
