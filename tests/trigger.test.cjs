const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { OpenSesTrigger } = require('../dist/nodes/OpenSes/OpenSesTrigger.node.js');
const { verifySignature } = require('../dist/nodes/OpenSes/signature.js');

const trigger = new OpenSesTrigger();
const SECRET = 'whsec_test_secret';
const HOOK_URL = 'https://n8n.example.com/webhook/abc/openses';

function sign(body, t = Math.floor(Date.now() / 1000), secret = SECRET) {
	const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
	return `t=${t},v1=${v1}`;
}

function hookContext({ state = {}, events = ['email.received'], url = HOOK_URL, respond } = {}) {
	const calls = [];
	const warnings = [];
	const ctx = {
		getNode: () => ({
			name: 'OpenSES Trigger',
			type: 'n8n-nodes-openses.openSesTrigger',
			typeVersion: 1,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (name) => (name === 'events' ? events : undefined),
		getNodeWebhookUrl: () => url,
		getWorkflow: () => ({ id: 'wf1', name: 'Inbound mail', active: true }),
		getWorkflowStaticData: () => state,
		getCredentials: async () => ({ apiKey: 'et_test_key', baseUrl: 'https://api.openses.email' }),
		logger: { warn: (message) => warnings.push(message) },
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, ...options });
				return respond(options, calls.length - 1);
			},
		},
	};
	return { ctx, calls, state, warnings };
}

function webhookContext({
	body,
	headers = {},
	state = { webhookId: 'wh_1', webhookSecret: SECRET },
	events = ['email.received'],
}) {
	const response = { status: undefined, body: undefined };
	const raw = Buffer.from(body, 'utf8');
	const req = {
		headers,
		rawBody: undefined,
		readRawBody: async () => {
			req.rawBody = raw;
		},
	};
	const res = {
		status(code) {
			response.status = code;
			return res;
		},
		json(value) {
			response.body = value;
			return res;
		},
	};
	const ctx = {
		getRequestObject: () => req,
		getResponseObject: () => res,
		getWorkflowStaticData: () => state,
		getNodeParameter: (name, fallback) => (name === 'events' ? events : fallback),
		helpers: { returnJsonArray: (value) => [].concat(value).map((json) => ({ json })) },
	};
	return { ctx, response };
}

const payload = JSON.stringify({
	type: 'email.received',
	created_at: '2026-11-12T10:00:00Z',
	data: { message_id: 'm1', thread_id: 'th_1', from: 'ada@x.test', subject: 'Hello', text: 'Hi' },
});

test('activation registers a webhook with the n8n URL and stores id + secret', async () => {
	const c = hookContext({
		events: ['email.received', 'email.bounced'],
		respond: () => ({
			statusCode: 201,
			body: {
				id: 'wh_1',
				url: HOOK_URL,
				events: ['email.received', 'email.bounced'],
				secret: SECRET,
			},
		}),
	});
	assert.equal(await trigger.webhookMethods.default.create.call(c.ctx), true);
	assert.equal(c.calls[0].method, 'POST');
	assert.equal(c.calls[0].url, 'https://api.openses.email/v1/webhooks');
	assert.deepEqual(c.calls[0].body, {
		url: HOOK_URL,
		events: ['email.received', 'email.bounced'],
		description: 'n8n: Inbound mail',
	});
	assert.equal(c.state.webhookId, 'wh_1');
	assert.equal(c.state.webhookSecret, SECRET);
});

test('activation refuses a non-HTTPS n8n webhook URL before calling the API', async () => {
	const c = hookContext({
		url: 'http://localhost:5678/webhook/x',
		respond: () => assert.fail('no request expected'),
	});
	await assert.rejects(trigger.webhookMethods.default.create.call(c.ctx), /HTTPS/);
	assert.equal(c.calls.length, 0);
});

test('activation fails clearly when the API does not return a secret', async () => {
	const c = hookContext({ respond: () => ({ statusCode: 201, body: { id: 'wh_1' } }) });
	await assert.rejects(trigger.webhookMethods.default.create.call(c.ctx), /signing secret/);
});

test('checkExists matches the stored webhook by id, URL and events', async () => {
	const list = { data: [{ id: 'wh_1', url: HOOK_URL, events: ['email.received'], active: true }] };
	const c = hookContext({
		state: { webhookId: 'wh_1', webhookSecret: SECRET },
		respond: () => ({ statusCode: 200, body: list }),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(c.ctx), true);
	assert.equal(c.calls[0].method, 'GET');
	assert.equal(c.calls[0].url, 'https://api.openses.email/v1/webhooks');
});

test('checkExists returns false without state and when the webhook is gone', async () => {
	let c = hookContext({ respond: () => assert.fail('no request expected') });
	assert.equal(await trigger.webhookMethods.default.checkExists.call(c.ctx), false);
	c = hookContext({
		state: { webhookId: 'wh_1', webhookSecret: SECRET },
		respond: () => ({ statusCode: 200, body: { data: [] } }),
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(c.ctx), false);
	assert.equal(c.state.webhookId, undefined);
});

test('checkExists deletes an outdated registration so it can be recreated', async () => {
	const c = hookContext({
		events: ['email.received', 'email.bounced'],
		state: { webhookId: 'wh_1', webhookSecret: SECRET },
		respond: (o) =>
			o.method === 'GET'
				? {
						statusCode: 200,
						body: {
							data: [{ id: 'wh_1', url: HOOK_URL, events: ['email.received'], active: true }],
						},
					}
				: { statusCode: 204, body: '' },
	});
	assert.equal(await trigger.webhookMethods.default.checkExists.call(c.ctx), false);
	assert.deepEqual(
		c.calls.map((x) => `${x.method} ${x.url}`),
		[
			'GET https://api.openses.email/v1/webhooks',
			'DELETE https://api.openses.email/v1/webhooks/wh_1',
		],
	);
	assert.equal(c.state.webhookSecret, undefined);
});

test('deactivation deletes its own webhook and clears static data', async () => {
	const c = hookContext({
		state: { webhookId: 'wh_1', webhookSecret: SECRET, webhookEvents: ['email.received'] },
		respond: () => ({ statusCode: 204, body: '' }),
	});
	assert.equal(await trigger.webhookMethods.default.delete.call(c.ctx), true);
	assert.equal(c.calls[0].method, 'DELETE');
	assert.equal(c.calls[0].url, 'https://api.openses.email/v1/webhooks/wh_1');
	assert.deepEqual(c.state, {});
});

test('deactivation tolerates a webhook already deleted (404) but surfaces other errors', async () => {
	let c = hookContext({
		state: { webhookId: 'wh_1', webhookSecret: SECRET },
		respond: () => ({
			statusCode: 404,
			body: { error: { code: 'not_found', message: 'webhook not found' } },
		}),
	});
	assert.equal(await trigger.webhookMethods.default.delete.call(c.ctx), true);
	assert.equal(c.warnings.length, 1);
	assert.deepEqual(c.state, {});
	c = hookContext({
		state: { webhookId: 'wh_1', webhookSecret: SECRET },
		respond: () => ({
			statusCode: 403,
			body: { error: { code: 'forbidden', message: 'Full access key required' } },
		}),
	});
	await assert.rejects(
		trigger.webhookMethods.default.delete.call(c.ctx),
		/Full access key required/,
	);
	assert.equal(c.state.webhookId, 'wh_1');
});

test('a correctly signed delivery starts the workflow with the payload', async () => {
	const { ctx, response } = webhookContext({
		body: payload,
		headers: { 'x-openses-signature': sign(payload) },
	});
	const result = await trigger.webhook.call(ctx);
	assert.equal(response.status, 200);
	assert.deepEqual(result.workflowData[0][0].json, JSON.parse(payload));
	assert(!JSON.stringify(result).includes(SECRET));
});

test('a bad signature is rejected with 401 and does not start the workflow', async () => {
	for (const header of [
		sign(payload, undefined, 'wrong-secret'),
		sign(payload + ' '),
		't=abc,v1=00',
		'garbage',
		undefined,
	]) {
		const { ctx, response } = webhookContext({
			body: payload,
			headers: header ? { 'x-openses-signature': header } : {},
		});
		const result = await trigger.webhook.call(ctx);
		assert.equal(response.status, 401, String(header));
		assert.equal(result.workflowData, undefined);
	}
});

test('a stale or future timestamp is rejected even with a valid HMAC', async () => {
	const now = Math.floor(Date.now() / 1000);
	for (const t of [now - 301, now + 301]) {
		const { ctx, response } = webhookContext({
			body: payload,
			headers: { 'x-openses-signature': sign(payload, t) },
		});
		const result = await trigger.webhook.call(ctx);
		assert.equal(response.status, 401);
		assert.match(response.body.error, /timestamp/);
		assert.equal(result.workflowData, undefined);
	}
});

test('deliveries are rejected when the trigger has no stored secret', async () => {
	const { ctx, response } = webhookContext({
		body: payload,
		headers: { 'x-openses-signature': sign(payload) },
		state: {},
	});
	const result = await trigger.webhook.call(ctx);
	assert.equal(response.status, 401);
	assert.equal(result.workflowData, undefined);
});

test('signed events that were not selected are acknowledged but ignored', async () => {
	const body = JSON.stringify({ type: 'email.opened', created_at: 'x', data: {} });
	const { ctx, response } = webhookContext({
		body,
		headers: { 'x-openses-signature': sign(body) },
	});
	const result = await trigger.webhook.call(ctx);
	assert.equal(response.status, 200);
	assert.equal(result.workflowData, undefined);
});

test('verifySignature: valid, rotated secrets, mismatch, stale and malformed', () => {
	const t = 1_800_000_000;
	const body = '{"type":"email.sent"}';
	const good = createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
	assert.equal(verifySignature(`t=${t},v1=${good}`, body, SECRET, t), 'valid');
	assert.equal(
		verifySignature(`t=${t},v1=${'0'.repeat(64)},v1=${good}`, Buffer.from(body), SECRET, t + 299),
		'valid',
	);
	assert.equal(verifySignature(`t=${t},v1=${good}`, body + 'x', SECRET, t), 'mismatch');
	assert.equal(verifySignature(`t=${t},v1=${good}`, body, SECRET, t + 301), 'stale');
	assert.equal(verifySignature(`v1=${good}`, body, SECRET, t), 'malformed');
	assert.equal(verifySignature(undefined, body, SECRET, t), 'missing');
});

test('trigger lists every public event name from the contract', () => {
	const events = trigger.description.properties.find((p) => p.name === 'events');
	assert.deepEqual(events.options.map((o) => o.value).sort(), [
		'email.bounced',
		'email.clicked',
		'email.complained',
		'email.delayed',
		'email.delivered',
		'email.failed',
		'email.opened',
		'email.received',
		'email.rejected',
		'email.sent',
		'email.subscription',
	]);
	assert.deepEqual(events.default, ['email.received']);
	assert.equal(trigger.description.usableAsTool, undefined);
});
