// Runs in an Electron utility process so native recognition cannot block the UI.
import path from "node:path";
const parent = (process as any).parentPort;
let recognizer: any, stream: any;
let lastText = "";
parent.on("message", ({ data }: any) => {
  try {
    if (data.type === "init") {
      const sherpa = require("sherpa-onnx-node");
      const file = (name: string) => path.join(data.directory, name);
      recognizer = new sherpa.OnlineRecognizer({
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
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 1.2,
        rule3MinUtteranceLength: 20,
      });
      stream = recognizer.createStream();
      parent.postMessage({ ready: true });
    } else if (data.type === "audio" && recognizer) {
      const samples =
        data.samples instanceof Float32Array
          ? data.samples
          : new Float32Array(data.samples);
      stream.acceptWaveform({ sampleRate: 16000, samples });
      while (recognizer.isReady(stream)) recognizer.decode(stream);
      const text = recognizer.getResult(stream).text;
      const final = recognizer.isEndpoint(stream);
      if (text && (text !== lastText || final)) {
        parent.postMessage({ text, final });
        lastText = text;
      }
      if (final) {
        recognizer.reset(stream);
        lastText = "";
      }
    }
  } catch (error) {
    parent.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
