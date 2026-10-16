import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import manifest from "./model-manifest.json";
import type { ModelStatus } from "../shared/types";

export class ModelManager {
  status: ModelStatus = { state: "missing", progress: 0 };
  private controller?: AbortController;
  private downloadTask?: Promise<void>;
  constructor(
    readonly directory: string,
    private emit: (status: ModelStatus) => void,
  ) {}
  private update(status: ModelStatus) {
    this.status = status;
    this.emit(status);
  }
  private async valid(
    file: (typeof manifest.files)[number],
    filename: string,
  ): Promise<boolean> {
    try {
      if ((await stat(filename)).size !== file.size) return false;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(filename)) hash.update(chunk);
      return hash.digest("hex") === file.sha256;
    } catch {
      return false;
    }
  }
  async check() {
    for (const file of manifest.files)
      if (!(await this.valid(file, path.join(this.directory, file.name)))) {
        this.update({ state: "missing", progress: 0 });
        return;
      }
    this.update({ state: "ready", progress: 100 });
  }
  cancel() {
    this.controller?.abort();
  }
  download(): Promise<void> {
    if (this.downloadTask) return this.downloadTask;
    this.downloadTask = this.performDownload().finally(() => {
      this.downloadTask = undefined;
    });
    return this.downloadTask;
  }
  private async performDownload() {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.update({ state: "downloading", progress: 0 });
    const total = manifest.files.reduce((sum, f) => sum + f.size, 0);
    let completed = 0,
      lastEmit = 0;
    try {
      await mkdir(this.directory, { recursive: true });
      for (const file of manifest.files) {
        signal.throwIfAborted();
        const target = path.join(this.directory, file.name);
        if (await this.valid(file, target)) {
          completed += file.size;
          continue;
        }
        const temporary = target + ".part";
        try {
          const response = await fetch(
            `https://huggingface.co/${manifest.repo}/resolve/${manifest.revision}/${file.name}`,
            { signal: AbortSignal.any([signal, AbortSignal.timeout(300000)]) },
          );
          if (!response.ok || !response.body)
            throw new Error(`Download returned HTTP ${response.status}.`);
          let bytes = 0;
          const progress = new Transform({
            transform: (chunk, _encoding, callback) => {
              bytes += chunk.length;
              if (bytes > file.size) {
                callback(new Error("Model file exceeded its expected size."));
                return;
              }
              if (Date.now() - lastEmit > 100) {
                this.update({
                  state: "downloading",
                  progress: Math.round(((completed + bytes) / total) * 100),
                });
                lastEmit = Date.now();
              }
              callback(null, chunk);
            },
          });
          await pipeline(
            Readable.fromWeb(response.body as any),
            progress,
            createWriteStream(temporary),
            { signal },
          );
          if (!(await this.valid(file, temporary)))
            throw new Error(
              "Model integrity verification failed. Please retry.",
            );
          await rm(target, { force: true });
          await rename(temporary, target);
          completed += file.size;
        } finally {
          await rm(temporary, { force: true }).catch(() => {});
        }
      }
      this.update({ state: "ready", progress: 100 });
    } catch (error) {
      if (signal.aborted) {
        this.update({
          state: "missing",
          progress: 0,
          message: "Download cancelled. You can retry anytime.",
        });
        return;
      }
      this.update({
        state: "error",
        progress: 0,
        message: `Could not download the voice model. Check your connection and retry. ${error instanceof Error ? error.message : ""}`,
      });
      throw error;
    } finally {
      this.controller = undefined;
    }
  }
}
