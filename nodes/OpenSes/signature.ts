import { createHmac, timingSafeEqual } from 'crypto';

/** Deliveries older or newer than this are refused to stop replays. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureResult = 'valid' | 'missing' | 'malformed' | 'stale' | 'mismatch';

/**
 * Verifies an `x-openses-signature` header of the form `t=<unix seconds>,v1=<hex>`, where the
 * hex value is the HMAC-SHA256 of `<t>.<raw body>` keyed with the webhook secret. Several `v1`
 * values are accepted so a secret can be rotated.
 */
export function verifySignature(
	header: unknown,
	rawBody: Buffer | string,
	secret: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
	toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): SignatureResult {
	const value = Array.isArray(header) ? header[0] : header;
	if (typeof value !== 'string' || !value.trim() || !secret) return 'missing';
	let timestamp = '';
	const signatures: string[] = [];
	for (const part of value.split(',')) {
		const index = part.indexOf('=');
		if (index < 1) continue;
		const key = part.slice(0, index).trim();
		const entry = part.slice(index + 1).trim();
		if (key === 't') timestamp = entry;
		else if (key === 'v1' && /^[a-f0-9]{64}$/i.test(entry)) signatures.push(entry.toLowerCase());
	}
	if (!/^\d{1,12}$/.test(timestamp) || !signatures.length) return 'malformed';
	if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return 'stale';
	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const expected = createHmac('sha256', secret)
		.update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]))
		.digest();
	const matches = signatures.some((signature) =>
		timingSafeEqual(expected, Buffer.from(signature, 'hex')),
	);
	return matches ? 'valid' : 'mismatch';
}
