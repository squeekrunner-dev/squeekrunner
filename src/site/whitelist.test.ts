import { describe, expect, it, vi } from 'vitest';
import { addressProblem, ApplicationController, checksumAddress, intentUrl, normalizeHandle, postProblem, postText, type Port } from './whitelist';
import { NetworkError, type StoredRun, type WhitelistStatusReply } from '../net/api';

const OPEN: WhitelistStatusReply = { threshold: 100000, requiredCoins: 10, applicationsOpen: true, applications: 3, approved: 0, deadline: null };
const RUN: StoredRun = { runToken: 'a'.repeat(64), runId: 'r', score: 123456, savedAt: 0 };
const GOOD = '0x52908400098527886E0F7030069857D2E4169EE7';
function port(patch: Partial<Port> = {}): Port {
  return {
    status: async () => OPEN,
    code: async () => ({ code: 'SQR-ABCD-1234', score: 123456, coins: 10, applied: false, status: null }),
    apply: async form => ({ code: 'SQR-ABCD-1234', status: 'pending', xStatus: 'verified', address: form.address.toLowerCase(), xHandle: form.xHandle.toLowerCase() }),
    lookup: async code => ({ code, status: 'approved', xStatus: 'verified', createdAt: 0 }),
    ...patch,
  };
}

describe('field checks', () => {
  it('validates addresses including the EIP-55 checksum', () => {
    expect(checksumAddress(GOOD.toLowerCase())).toBe(GOOD);
    expect(addressProblem(GOOD)).toBeNull();
    expect(addressProblem(GOOD.toLowerCase())).toBeNull();
    expect(addressProblem('0x52908400098527886E0F7030069857D2E4169Ee7')).toMatch(/Checksum/);
    expect(addressProblem('0x' + '0'.repeat(40))).toMatch(/zero/);
    expect(addressProblem('0x1234')).toMatch(/40 hex/);
  });
  it('normalizes X handles and checks the post link belongs to them', () => {
    expect(normalizeHandle(' @Runner_1 ')).toBe('Runner_1');
    expect(normalizeHandle('bad name')).toBeNull();
    expect(postProblem('https://x.com/Runner_1/status/123?s=20', 'runner_1')).toBeNull();
    expect(postProblem('https://twitter.com/runner_1/status/123', 'Runner_1')).toBeNull();
    expect(postProblem('https://x.com/other/status/123', 'Runner_1')).toMatch(/@Runner_1/);
    expect(postProblem('https://evil.example/x', null)).toMatch(/Paste/);
  });
  it('builds an X intent with the code and score, without the word raffle', () => {
    const text = postText('SQR-ABCD-1234', 123456);
    expect(text).toContain('SQR-ABCD-1234');
    expect(text).toContain('123,456');
    expect(text.toLowerCase()).not.toContain('raffle');
    expect(intentUrl('SQR-ABCD-1234', 1)).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/);
  });
});

describe('ApplicationController', () => {
  it('shows offline, closed and no-run states', async () => {
    const offline = new ApplicationController(null); await offline.init();
    expect(offline.view.kind).toBe('offline');
    const closed = new ApplicationController(port({ status: async () => ({ ...OPEN, applicationsOpen: false }) }), () => RUN); await closed.init();
    expect(closed.view.kind).toBe('closed');
    const noRun = new ApplicationController(port(), () => null); await noRun.init();
    expect(noRun.view.kind).toBe('no-run');
  });
  it('treats an expired or non-qualifying run token as no run', async () => {
    const c = new ApplicationController(port({ code: async () => { throw new NetworkError('gone', 403); } }), () => RUN);
    await c.init();
    expect(c.view.kind).toBe('no-run');
  });
  it('shows an existing application instead of the form', async () => {
    const c = new ApplicationController(port({ code: async () => ({ code: 'SQR-ABCD-1234', score: 1, coins: 10, applied: true, status: 'approved' }) }), () => RUN);
    await c.init();
    expect(c.view).toMatchObject({ kind: 'applied', code: 'SQR-ABCD-1234', status: 'approved' });
  });
  it('validates before sending, then submits once', async () => {
    const apply = vi.fn(port().apply);
    const c = new ApplicationController(port({ apply }), () => RUN);
    await c.init();
    expect(c.view.kind).toBe('form');
    await c.submit({ address: '0x12', xHandle: 'runner', postUrl: 'https://x.com/runner/status/1' });
    expect(c.view).toMatchObject({ kind: 'form', error: expect.stringMatching(/40 hex/) });
    await c.submit({ address: GOOD, xHandle: 'runner', postUrl: 'https://x.com/someone/status/1' });
    expect(c.view).toMatchObject({ kind: 'form', error: expect.stringMatching(/@runner/) });
    expect(apply).not.toHaveBeenCalled();
    await c.submit({ address: GOOD, xHandle: '@Runner', postUrl: 'https://x.com/Runner/status/1' });
    expect(apply).toHaveBeenCalledWith({ runToken: RUN.runToken, address: GOOD, xHandle: 'Runner', postUrl: 'https://x.com/Runner/status/1' });
    expect(c.view).toMatchObject({ kind: 'applied', code: 'SQR-ABCD-1234', status: 'pending' });
  });
  it('keeps the form and shows the server message on rejection', async () => {
    const c = new ApplicationController(port({ apply: async () => { throw new NetworkError('This X account has already applied', 409); } }), () => RUN);
    await c.init();
    await c.submit({ address: GOOD, xHandle: 'runner', postUrl: 'https://x.com/runner/status/1' });
    expect(c.view).toMatchObject({ kind: 'form', busy: false, error: 'This X account has already applied' });
  });
  it('looks up an application by code', async () => {
    const c = new ApplicationController(port(), () => RUN);
    expect(await c.lookup('nope')).toMatch(/SQR-/);
    expect(await c.lookup('sqr-abcd-1234')).toMatch(/Approved/);
  });
});
