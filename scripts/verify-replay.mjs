import './register-sim.mjs';
import { open } from 'node:fs/promises';

const { MAX_REPLAY_BYTES, parseReplayJSON, verifyReplay } = await import('../src/sim/replay.ts');
try {
  if (process.argv.length !== 3) throw new Error('Usage: npm run verify-replay -- <file.json>');
  const file = await open(process.argv[2], 'r');
  let text;
  try {
    if (!(await file.stat()).isFile()) throw new Error('Replay must be a regular file');
    // Bounded read also protects against a file growing after stat().
    const buffer = Buffer.alloc(MAX_REPLAY_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_REPLAY_BYTES) throw new Error('Replay exceeds byte limit');
    text = buffer.subarray(0, total).toString('utf8');
  } finally { await file.close(); }
  const parsed = parseReplayJSON(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  const result = verifyReplay(parsed.replay);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, reason: error.message }));
  process.exitCode = 1;
}
