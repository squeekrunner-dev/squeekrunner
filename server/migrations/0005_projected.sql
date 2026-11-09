-- squeek-6: golden nuts follow projected (pending) Squeek blocks, so the projected height is part of the
-- authoritative timeline the verifier replays. Older rows keep NULL (no nut is derived from them).
ALTER TABLE telemetry ADD COLUMN projected TEXT;
