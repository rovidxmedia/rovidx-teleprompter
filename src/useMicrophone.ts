import { useEffect, useState } from "react";

export function useMicrophone(
  active: boolean,
  deviceId: string,
  onError: (message: string) => void,
) {
  const [level, setLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!active) {
      setLevel(0);
      setStarting(false);
      return;
    }
    let cancelled = false,
      stream: MediaStream | undefined,
      context: AudioContext | undefined,
      worklet: AudioWorkletNode | undefined;
    const session = crypto.randomUUID();
    setStarting(true);
    const cleanup = () => {
      if (worklet) {
        worklet.port.onmessage = null;
        worklet.disconnect();
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close();
      void window.desktop.speechStop(session);
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: true,
            autoGainControl: false,
          },
          video: false,
        });
        if (cancelled) {
          cleanup();
          return;
        }
        stream.getAudioTracks()[0].addEventListener("ended", () => {
          if (!cancelled)
            onError(
              "The microphone disconnected. Choose an available microphone in Voice settings.",
            );
        });
        const started = await window.desktop.speechStart(session);
        if (cancelled) {
          cleanup();
          return;
        }
        if (!started.ok) throw new Error(started.error);
        context = new AudioContext();
        await context.audioWorklet.addModule(
          new URL("capture-worklet.js", document.baseURI).href,
        );
        if (cancelled) {
          cleanup();
          return;
        }
        worklet = new AudioWorkletNode(context, "rovidx-capture");
        worklet.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (cancelled) return;
          let sum = 0;
          for (const sample of data) sum += sample * sample;
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
          window.desktop.speechAudio(session, data);
        };
        const source = context.createMediaStreamSource(stream);
        const mute = context.createGain();
        mute.gain.value = 0;
        source.connect(worklet);
        worklet.connect(mute);
        mute.connect(context.destination);
        await context.resume();
        if (!cancelled) setStarting(false);
      } catch (error) {
        cleanup();
        if (!cancelled)
          onError(
            error instanceof Error
              ? error.message
              : "Could not access the microphone. Check Windows microphone permissions and try again.",
          );
      }
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [active, deviceId, onError]);
  return { level, starting };
}
