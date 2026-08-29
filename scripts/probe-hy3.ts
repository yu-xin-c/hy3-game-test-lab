import { Hy3Client, loadHy3Config } from "../src/llm/hy3-client";

const config = loadHy3Config();
const client = new Hy3Client(config);

console.log(
  `Probing Hy3 model ${config.model} at ${config.baseUrl} (API key is not printed)...`
);

const response = await client.complete(
  "You are a connectivity probe. Reply with exactly GAMETESTLAB_HY3_OK.",
  "Confirm that the chat-completions endpoint is reachable."
);

if (!response.includes("GAMETESTLAB_HY3_OK")) {
  throw new Error(`Hy3 endpoint responded, but probe token was absent: ${response}`);
}

console.log("Hy3 connectivity probe passed.");
