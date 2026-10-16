// Opt-in integration setup. Downloads the exact production model and a public test recording.
const fs = require("node:fs/promises");
const path = require("node:path");
// Dynamic-library search paths must be present when the native host starts.
if (process.platform !== "win32" && !process.env.ROVIDX_NATIVE_TEST_HOST) {
  const { spawnSync } = require("node:child_process");
  const variable =
    process.platform === "darwin" ? "DYLD_LIBRARY_PATH" : "LD_LIBRARY_PATH";
  const directory = path.resolve(
    "node_modules",
    `sherpa-onnx-${process.platform}-${process.arch}`,
  );
  const result = spawnSync(process.execPath, [__filename], {
    stdio: "inherit",
    env: {
      ...process.env,
      ROVIDX_NATIVE_TEST_HOST: "1",
      [variable]: [directory, process.env[variable]]
        .filter(Boolean)
        .join(path.delimiter),
    },
  });
  process.exit(result.status ?? 1);
}
const { ModelManager } = require("../dist-electron/electron/model.js");
const sherpa = require("sherpa-onnx-node");
async function main() {
  const directory = path.resolve(
    ".runtime/voice-test/models/zipformer-en-2023-06-26",
  );
  const model = new ModelManager(directory, (s) => {
    if (s.progress % 20 === 0) console.log(`Model: ${s.state} ${s.progress}%`);
  });
  await model.check();
  if (model.status.state !== "ready") await model.download();
  const manifest = require("../electron/model-manifest.json");
  const wav = path.resolve(".runtime/voice-test/sample.wav");
  try {
    await fs.stat(wav);
  } catch {
    const response = await fetch(
      `https://huggingface.co/${manifest.repo}/resolve/${manifest.revision}/test_wavs/0.wav`,
    );
    if (!response.ok)
      throw new Error(
        `Could not download public speech fixture: ${response.status}`,
      );
    await fs.writeFile(wav, Buffer.from(await response.arrayBuffer()));
  }
  const file = (name) => path.join(directory, name);
  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: file("encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
        decoder: file("decoder-epoch-99-avg-1-chunk-16-left-128.onnx"),
        joiner: file("joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx"),
      },
      tokens: file("tokens.txt"),
      numThreads: 2,
      provider: "cpu",
      debug: false,
    },
    decodingMethod: "greedy_search",
    enableEndpoint: true,
  });
  const stream = recognizer.createStream(),
    wave = sherpa.readWave(wav);
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
  stream.acceptWaveform({
    sampleRate: 16000,
    samples: new Float32Array(16000),
  });
  stream.inputFinished();
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const transcript = recognizer.getResult(stream).text;
  if (!/early nightfall/i.test(transcript))
    throw new Error(`Unexpected recognition result: ${transcript}`);
  await fs.writeFile(
    path.resolve(".runtime/voice-test/transcript.txt"),
    transcript,
  );
  console.log("Offline native recognition passed:", transcript);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
