#!/usr/bin/env node

const fs = require("node:fs/promises");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const ENDPOINT = process.env.MIMO_TTS_ENDPOINT || "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions";
const OUTPUT_PATH = "/tmp/mimo-tts-test.wav";
const AUTH_MODE = process.env.MIMO_AUTH_MODE || "api-key";

async function readHidden(prompt) {
  if (!input.isTTY) return "";

  const rl = readline.createInterface({ input, output, terminal: true });
  const originalWrite = rl._writeToOutput;

  rl._writeToOutput = function writeHidden(str) {
    if (rl.stdoutMuted) return;
    originalWrite.call(rl, str);
  };

  rl.stdoutMuted = true;
  output.write(prompt);
  const value = await rl.question("");
  output.write("\n");
  rl.close();

  return value;
}

async function main() {
  const key = (process.env.MIMO_API_KEY || await readHidden("MiMo API Key: ")).trim();
  if (!key) {
    console.error("MIMO_API_KEY is empty.");
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (AUTH_MODE === "bearer") {
    headers.Authorization = `Bearer ${key}`;
  } else {
    headers["api-key"] = key;
  }

  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Auth mode: ${AUTH_MODE === "bearer" ? "Authorization: Bearer" : "api-key"}`);

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [
        {
          role: "assistant",
          content: "你好，这是 MiMo TTS 本地接口测试。",
        },
      ],
      audio: {
        format: "wav",
        voice: "冰糖",
      },
    }),
  });

  const text = await response.text();
  console.log("HTTP", response.status, response.statusText);

  if (!response.ok) {
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const json = JSON.parse(text);
  const audioBase64 = json?.choices?.[0]?.message?.audio?.data;
  if (!audioBase64) {
    console.error("No audio data in response:");
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  await fs.writeFile(OUTPUT_PATH, Buffer.from(audioBase64, "base64"));
  console.log(`OK: saved ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
