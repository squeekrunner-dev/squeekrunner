/** Local smoke check. Start Vite on 5173 and a disposable Chrome with CDP on 19360 first.
 * Run: node src/game/fx/browser-check.mjs
 * Uses only Node built-ins; synthetic verdicts stay inside the local demo browser.
 */
import assert from 'node:assert/strict';

const tabs = await (await fetch('http://127.0.0.1:19360/json/list')).json();
const ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
let nextId = 0;
const deadline = setTimeout(() => { console.error('Browser check timed out'); process.exit(1); }, 30000);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(fn) {
  const response = await send('Runtime.evaluate', {
    expression: `(${fn.toString()})()`, awaitPromise: true, returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/play/?demo=1' });
  // Wait for the new document, then for boot textures and the Run scene.
  await new Promise(resolve => setTimeout(resolve, 700));
  await evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if (window.__squeekGame?.scene.isActive('Run')) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Run did not boot');
  });
  const normal = await evaluate(() => {
    const game = window.__squeekGame, run = game.scene.getScene('Run'), fx = run.fx;
    run.intro.setVisible(false);
    const before = JSON.stringify(run.driver.sim);
    for (let i = 0; i < 120; i++) fx.update(1 / 60, 0, 290, run.player, true, true);
    const slowDust = fx.dustPool.filter(p => p.life > 0).length;
    for (let i = 0; i < 120; i++) fx.update(1 / 60, 1, 783, run.player, true, true);
    const peakDust = fx.dustPool.filter(p => p.life > 0).length;
    const lines = fx.lines.filter(p => p.visible).length;
    const vignette = fx.vignette.alpha;
    run.onTick(['nut']); // Covers the demo event path as well as the direct FX method.
    fx.update(0.1, 1, 783, run.player, false, true);
    const flash = fx.flash.alpha, hub = run.wheelGlow.scaleX;
    run.onTick(['coin', 'collect', 'airJump']);
    fx.update(0.05, 1, 783, run.player, false, true);
    const sparks = fx.sparks.filter(p => p.life > 0).map(p => p.image.texture.key);
    const ghosts = fx.ghosts.filter(p => p.life > 0).length;
    fx.observeScore(24999); fx.observeScore(25000); fx.observeScore(25000);
    fx.update(0.1, 1, 783, run.player, false, true);
    const milestone = fx.milestone.text;
    fx.observeScore(100001);
    const queued = [...fx.pendingMilestones];
    const nut = run.add.sprite(500, 362, 'golden-nut'), coin = run.add.image(680, 216, 'whitelist-coin');
    fx.collectibles(nut, coin);
    const glow = [fx.nutGlow.texture.key, fx.coinGlow.texture.key];
    const glowPositions = [fx.nutGlow.x === nut.x, fx.coinGlow.x === coin.x];
    nut.destroy(); coin.destroy(); fx.collectibles(null, null);
    return { slowDust, peakDust, lines, vignette, flash, hub, sparks, ghosts, milestone, queued, glow, glowPositions,
      glowsHidden: !fx.nutGlow.visible && !fx.coinGlow.visible, unchanged: before === JSON.stringify(run.driver.sim) };
  });
  assert(normal.peakDust > normal.slowDust * 5);
  assert.equal(normal.lines, 18);
  assert(normal.vignette > 0 && normal.vignette < 0.3);
  assert(normal.flash > 0 && normal.hub > 1);
  assert(normal.sparks.includes('fx-spark-blue') && normal.sparks.includes('fx-spark-gold'));
  assert(normal.ghosts > 0);
  assert.equal(normal.milestone, '25,000!');
  assert.deepEqual(normal.queued, [50000, 100000]);
  assert.deepEqual(normal.glow, ['fx-glow-blue', 'fx-glow-gold']);
  assert(normal.glowPositions.every(Boolean) && normal.glowsHidden && normal.unchanged);
  console.log('Normal effects:', JSON.stringify({ ...normal, sparks: normal.sparks.length }));

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await evaluate(() => {
    const run = window.__squeekGame.scene.getScene('Run'), fx = run.fx;
    fx.airJump();
    for (let i = 0; i < 30; i++) fx.update(1 / 60, 1, 783, run.player, false, true);
    return { reduced: fx.reduced, shaking: run.cameras.main.shakeEffect.isRunning,
      lines: fx.lines.filter(p => p.visible).length, ghosts: fx.ghosts.filter(p => p.life > 0).length };
  });
  assert(reduced.reduced && !reduced.shaking && reduced.lines < normal.lines && reduced.ghosts === 0);
  console.log('Reduced motion:', JSON.stringify(reduced));

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const verdicts = await evaluate(async () => {
    const game = window.__squeekGame, run = game.scene.getScene('Run');
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const result = { score: 100000, distance: 10000, best: 100000, blockBest: 0,
      runBlock: null, newBest: false, demo: false, ranked: true, coins: 10 };
    const count = () => game.scene.getScene('GameOver').children.list.filter(child => child.depth === 14 &&
      ['fx-spark-blue', 'fx-spark-gold'].includes(child.texture?.key)).length;
    let resolveVerdict;
    run.context.submission = new Promise(resolve => { resolveVerdict = resolve; });
    run.scene.start('GameOver', result);
    await frame(); await frame();
    const pending = count();
    resolveVerdict({ status: 'verified', eligible: true, score: 100000, coins: 10 });
    await frame();
    const eligible = count();
    game.scene.getScene('GameOver').scene.start('Run');
    await frame(); await frame();
    const freshRun = game.scene.getScene('Run');
    const fresh = { dust: freshRun.fx.dustPool.filter(p => p.life > 0).length,
      queued: freshRun.fx.pendingMilestones.length, lines: freshRun.fx.lines.filter(p => p.visible).length,
      score: freshRun.fx.score };
    freshRun.context.submission = Promise.resolve({ status: 'verified', eligible: false, score: 90000, coins: 10 });
    freshRun.scene.start('GameOver', result);
    await frame(); await frame();
    const ineligible = count();
    game.scene.getScene('GameOver').scene.start('Run');
    await frame(); await frame();
    freshRun.context.submission = new Promise(resolve => { resolveVerdict = resolve; });
    freshRun.scene.start('GameOver', result);
    await frame(); await frame();
    game.scene.getScene('GameOver').scene.start('Run');
    await frame(); await frame();
    resolveVerdict({ status: 'verified', eligible: true, score: 100000, coins: 10 });
    await frame();
    return { pending, eligible, ineligible, fresh, lateVerdictSafe: game.scene.isActive('Run') && count() === 0 };
  });
  assert.equal(verdicts.pending, 0);
  assert.equal(verdicts.eligible, 72);
  assert.equal(verdicts.ineligible, 0);
  assert.deepEqual(verdicts.fresh, { dust: 0, queued: 0, lines: 0, score: 0 });
  assert(verdicts.lateVerdictSafe);
  console.log('Qualification and restart:', JSON.stringify(verdicts));
  assert.deepEqual(errors, []);
  console.log('PASS: Canvas effects, unchanged simulation, reduced motion, verdict gating, restart lifecycle; no browser exceptions.');
} finally {
  clearTimeout(deadline);
  ws.close();
}
