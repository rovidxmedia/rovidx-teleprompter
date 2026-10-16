import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ModelManager } from "../electron/model";

afterEach(() => vi.unstubAllGlobals());
describe("verified model downloads", () => {
  it("rejects corrupt downloads and removes partial files", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "rovidx-model-integrity-"),
    );
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3])));
    const model = new ModelManager(directory, () => {});
    await expect(model.download()).rejects.toThrow("integrity");
    expect(model.status.state).toBe("error");
    expect(await readdir(directory)).toEqual([]);
  });
  it("cancels a pending download, cleans up, and allows retry", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "rovidx-model-cancel-"),
    );
    let requested: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    vi.stubGlobal(
      "fetch",
      async (_url: string, { signal }: { signal: AbortSignal }) => {
        requested();
        return new Promise<Response>((_resolve, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    );
    const model = new ModelManager(directory, () => {}),
      download = model.download();
    await requestStarted;
    model.cancel();
    await download;
    expect(model.status.state).toBe("missing");
    expect(await readdir(directory)).toEqual([]);
    vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3])));
    await expect(model.download()).rejects.toThrow("integrity");
    expect(model.status.state).toBe("error");
  });
});
