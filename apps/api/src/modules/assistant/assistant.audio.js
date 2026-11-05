import { ApiError } from '../../lib/ApiError.js';
import { ASSISTANT_RECORD_SECONDS } from '@tm/shared/src/domain/assistant.js';

/** Our recorder emits canonical mono PCM16 WAV. Validate actual sample count, not client duration. */
export function readQuestionAudio(buffer) {
  const invalid = () => {
    throw new ApiError('INVALID', 'Record a clear voice question of up to 30 seconds.');
  };
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > 44 + 16000 * 2 * ASSISTANT_RECORD_SECONDS)
    invalid();
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 ||
    buffer.readUInt16LE(22) !== 1 ||
    buffer.readUInt32LE(24) !== 16000 ||
    buffer.readUInt32LE(28) !== 32000 ||
    buffer.readUInt16LE(32) !== 2 ||
    buffer.readUInt16LE(34) !== 16 ||
    buffer.toString('ascii', 36, 40) !== 'data' ||
    buffer.readUInt32LE(40) !== buffer.length - 44 ||
    (buffer.length - 44) % 2
  )
    invalid();
  const seconds = (buffer.length - 44) / 32000;
  if (seconds < 0.25 || seconds > ASSISTANT_RECORD_SECONDS) invalid();
  return { seconds, buffer };
}

export function pcmWave(pcm, rate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF');
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
