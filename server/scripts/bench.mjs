// Worst-case CPU for one authoritative verification: a 30-minute run (MAX_TICKS) on a busy timeline.
import { createSim, step, MAX_TICKS } from '../../src/sim/core.ts';
import { TimelineCursor } from '../../src/net/timeline.ts';

const startedAt = 1_800_000_000_000;
const points = [];
for (let at = startedAt - 30000; at < startedAt + 31 * 60000; at += 10000) {
  points.push({ at, validUntil: at + 120000, rpmMilli: (at / 10000) % 2 ? 98316 : 40000, installationId: 'i', height: String(Math.floor((at - startedAt) / 600000) + 100) });
}
function run() {
  // Total work equivalent to one MAX_TICKS run: restart the sim whenever it ends (obstacles are random).
  let total = 0, seed = 1;
  while (total < MAX_TICKS) {
    const cursor = new TimelineCursor(points, startedAt), s = createSim(seed++);
    while (!s.gameOver && total < MAX_TICKS) { const input = cursor.input(s.tick); if (s.tick % 40 === 0) input.jump = true; step(s, input); total++; }
  }
  return total;
}
run(); // warm-up JIT
const t0 = performance.now(); let ticks = 0; const N = 5;
for (let i = 0; i < N; i++) ticks = run();
console.log(JSON.stringify({ ticksPerRun: ticks, msPerRun: +((performance.now() - t0) / N).toFixed(2) }));
