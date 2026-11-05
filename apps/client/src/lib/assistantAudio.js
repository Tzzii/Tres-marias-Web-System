import { ASSISTANT_RECORD_SECONDS } from '../../../../packages/shared/src/domain/assistant.js';

export function encodeQuestionWav(samples, sampleRate) {
  const rate = 16000;
  const length = Math.min(Math.floor((samples.length * rate) / sampleRate), rate * ASSISTANT_RECORD_SECONDS);
  const output = new ArrayBuffer(44 + length * 2);
  const view = new DataView(output);
  const word = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  word(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  word(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const first = Math.floor((i * sampleRate) / rate),
      end = Math.min(samples.length, Math.max(first + 1, Math.floor(((i + 1) * sampleRate) / rate)));
    let sum = 0;
    for (let j = first; j < end; j++) sum += samples[j];
    const value = Math.max(-1, Math.min(1, sum / (end - first)));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([output], { type: 'audio/wav' });
}

/** Capture only while explicitly recording. Close every microphone track and audio node on every exit. */
export async function startQuestionRecording(onComplete) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Voice recording is unavailable here. You can type your question.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
  });
  let context, source, processor, silent;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
    await context.resume();
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    silent = context.createGain();
    silent.gain.value = 0;
    const chunks = [];
    let count = 0,
      closed = false,
      timer;
    processor.onaudioprocess = (event) => {
      if (closed) return;
      const remaining = context.sampleRate * ASSISTANT_RECORD_SECONDS - count;
      if (remaining <= 0) return;
      const chunk = event.inputBuffer.getChannelData(0).slice(0, remaining);
      chunks.push(chunk);
      count += chunk.length;
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    const finish = async (cancel = false) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silent.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      const sampleRate = context.sampleRate;
      await context.close();
      if (!cancel) {
        const all = new Float32Array(count);
        let offset = 0;
        chunks.forEach((chunk) => {
          all.set(chunk, offset);
          offset += chunk.length;
        });
        onComplete(encodeQuestionWav(all, sampleRate));
      }
    };
    timer = setTimeout(() => void finish(), ASSISTANT_RECORD_SECONDS * 1000);
    return { stop: () => finish(), cancel: () => finish(true) };
  } catch (error) {
    source?.disconnect();
    processor?.disconnect();
    silent?.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') await context.close();
    throw error;
  }
}
