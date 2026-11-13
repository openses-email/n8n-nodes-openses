const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../package.json');

const { OpenSes } = require('../dist/nodes/OpenSes/OpenSes.node.js');
const { OpenSesApi } = require('../dist/credentials/OpenSesApi.credentials.js');
const { normalizeBaseUrl, splitAddresses } = require('../dist/nodes/OpenSes/GenericFunctions.js');

const node = new OpenSes();
const API = 'https://api.openses.email/v1';

/**
 * Builds a fake IExecuteFunctions. `respond(options, callIndex)` returns `{ statusCode, body }`
 * or throws; every request is recorded in `calls`.
 */
function context(params, { items = [{ json: {} }], respond, continueOnFail = false, binary } = {}) {
	const calls = [];
	const values = { ...params };
	const ctx = {
		getInputData: () => items,
		getNode: () => ({
			name: 'OpenSES',
			type: 'n8n-nodes-openses.openSes',
			typeVersion: 1,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (name, _i, fallback) => (name in values ? values[name] : fallback),
		getCredentials: async () => ({
			apiKey: 'et_test_secret',
			baseUrl: values.__baseUrl ?? 'https://api.openses.email',
		}),
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, ...options });
				return respond
					? respond(options, calls.length - 1)
					: { statusCode: 200, body: { id: 'x' } };
			},
			assertBinaryData: (_i, name) => {
				if (!binary?.[name]) throw new Error(`No binary data property "${name}"`);
				return binary[name].meta;
			},
			getBinaryDataBuffer: async (_i, name) => binary[name].buffer,
		},
	};
	return { ctx, calls };
}

async function run(params, options) {
	const { ctx, calls } = context(params, options);
	const result = await node.execute.call(ctx);
	return { result: result[0], calls };
}

const cases = [
	{
		name: 'email send (custom content)',
		params: {
			resource: 'email',
			operation: 'send',
			from: 'Acme <hello@acme.test>',
			to: 'a@x.test, "Doe, Jane" <jane@x.test>',
			content: 'custom',
			subject: 'Hi',
			html: '<p>Hi</p>',
			text: 'Hi',
			additionalFields: {
				cc: 'c@x.test',
				bcc: 'b1@x.test; b2@x.test',
				replyTo: 'r@x.test',
				tag: 'welcome',
				tags: { values: [{ name: 'plan', value: 'pro' }] },
				headers: { values: [{ name: 'X-Campaign', value: 'q4' }] },
				scheduledAt: '2030-01-02T03:04:05Z',
				idempotencyKey: 'order-1',
			},
		},
		method: 'POST',
		path: '/emails',
		body: {
			from: 'Acme <hello@acme.test>',
			to: ['a@x.test', '"Doe, Jane" <jane@x.test>'],
			subject: 'Hi',
			html: '<p>Hi</p>',
			text: 'Hi',
			cc: ['c@x.test'],
			bcc: ['b1@x.test', 'b2@x.test'],
			reply_to: ['r@x.test'],
			tag: 'welcome',
			tags: { plan: 'pro' },
			headers: { 'X-Campaign': 'q4' },
			scheduled_at: '2030-01-02T03:04:05.000Z',
		},
		headers: { 'Idempotency-Key': 'order-1' },
	},
	{
		name: 'email send (template)',
		params: {
			resource: 'email',
			operation: 'send',
			from: 'hello@acme.test',
			to: 'a@x.test',
			content: 'template',
			template: 'tpl_1',
			variables: { values: [{ name: 'first_name', value: 'Ada' }] },
		},
		method: 'POST',
		path: '/emails',
		body: {
			from: 'hello@acme.test',
			to: ['a@x.test'],
			template: 'tpl_1',
			variables: { first_name: 'Ada' },
		},
	},
	{
		name: 'email list',
		params: {
			resource: 'email',
			operation: 'getAll',
			returnAll: false,
			limit: 10,
			filters: { domain: 'acme.test', status: 'bounced', tag: 'welcome', q: 'ada', days: 7 },
		},
		method: 'GET',
		path: '/emails',
		qs: {
			domain: 'acme.test',
			status: 'bounced',
			tag: 'welcome',
			q: 'ada',
			days: 7,
			page: 1,
			limit: 10,
		},
		response: { data: [{ id: 'em_1' }], total: 1, page: 1, limit: 10 },
		output: [{ id: 'em_1' }],
	},
	{
		name: 'email get',
		params: { resource: 'email', operation: 'get', emailId: 'em_1' },
		method: 'GET',
		path: '/emails/em_1',
	},
	{
		name: 'email cancel',
		params: { resource: 'email', operation: 'cancel', emailId: 'em_1' },
		method: 'POST',
		path: '/emails/em_1/cancel',
	},
	{
		name: 'contact upsert',
		params: {
			resource: 'contact',
			operation: 'upsert',
			email: ' ada@x.test ',
			additionalFields: {
				domain: 'acme.test',
				name: 'Ada',
				company: 'Engines',
				properties: { values: [{ name: 'plan', value: 'pro' }] },
				topics: ['news'],
			},
		},
		method: 'POST',
		path: '/contacts',
		body: {
			email: 'ada@x.test',
			domain: 'acme.test',
			name: 'Ada',
			company: 'Engines',
			properties: { plan: 'pro' },
			topics: ['news'],
		},
		response: { contact: { id: 'ct_1', email: 'ada@x.test' }, created: true },
		output: [{ id: 'ct_1', email: 'ada@x.test', created: true }],
	},
	{
		name: 'contact get',
		params: { resource: 'contact', operation: 'get', contactId: 'ct_1' },
		method: 'GET',
		path: '/contacts/ct_1',
	},
	{
		name: 'contact unsubscribe',
		params: { resource: 'contact', operation: 'unsubscribe', contactId: 'ct_1' },
		method: 'POST',
		path: '/contacts/ct_1/unsubscribe',
	},
	{
		name: 'contact delete (204)',
		params: { resource: 'contact', operation: 'delete', contactId: 'ct_1' },
		method: 'DELETE',
		path: '/contacts/ct_1',
		status: 204,
		response: '',
		output: [{ deleted: true, id: 'ct_1' }],
	},
	{
		name: 'contact list',
		params: {
			resource: 'contact',
			operation: 'getAll',
			returnAll: false,
			limit: 2,
			filters: { domain: 'acme.test', q: 'ada', topic: 'news', subscribed: false },
		},
		method: 'GET',
		path: '/contacts',
		qs: { domain: 'acme.test', q: 'ada', topic: 'news', subscribed: false, page: 1, limit: 2 },
		response: { data: [{ id: 1 }, { id: 2 }], total: 9, page: 1, limit: 2 },
		output: [{ id: 1 }, { id: 2 }],
	},
	{
		name: 'topic list',
		params: {
			resource: 'topic',
			operation: 'getAll',
			returnAll: true,
			filters: { domain: 'acme.test' },
		},
		method: 'GET',
		path: '/topics',
		qs: { domain: 'acme.test' },
		response: { data: [{ slug: 'news' }] },
		output: [{ slug: 'news' }],
	},
	{
		name: 'template list',
		params: { resource: 'template', operation: 'getAll', returnAll: false, limit: 1, filters: {} },
		method: 'GET',
		path: '/templates',
		response: { data: [{ id: 't1' }, { id: 't2' }] },
		output: [{ id: 't1' }],
	},
	{
		name: 'template get',
		params: { resource: 'template', operation: 'get', templateId: 'tpl_1' },
		method: 'GET',
		path: '/templates/tpl_1',
	},
	{
		name: 'sequence list',
		params: {
			resource: 'sequence',
			operation: 'getAll',
			returnAll: true,
			filters: { domain: 'acme.test' },
		},
		method: 'GET',
		path: '/sequences',
		qs: { domain: 'acme.test' },
		response: { data: [{ id: 's1' }] },
		output: [{ id: 's1' }],
	},
	{
		name: 'sequence enroll by email',
		params: {
			resource: 'sequence',
			operation: 'enroll',
			sequenceId: 'seq_1',
			identifyBy: 'email',
			email: 'ada@x.test',
			additionalFields: { name: 'Ada', properties: { values: [{ name: 'plan', value: 'pro' }] } },
		},
		method: 'POST',
		path: '/sequences/seq_1/enroll',
		body: { email: 'ada@x.test', name: 'Ada', properties: { plan: 'pro' } },
	},
	{
		name: 'sequence stop by contact ID',
		params: {
			resource: 'sequence',
			operation: 'stop',
			sequenceId: 'seq_1',
			identifyBy: 'contactId',
			contactId: 'ct_1',
		},
		method: 'POST',
		path: '/sequences/seq_1/stop',
		body: { contact_id: 'ct_1' },
	},
	{
		name: 'suppression list',
		params: {
			resource: 'suppression',
			operation: 'getAll',
			returnAll: false,
			limit: 50,
			filters: { reason: 'bounce', q: 'x' },
		},
		method: 'GET',
		path: '/suppressions',
		qs: { reason: 'bounce', q: 'x', page: 1, limit: 50 },
		response: { data: [{ email: 'a@x.test' }], total: 1, page: 1, limit: 50, counts: {} },
		output: [{ email: 'a@x.test' }],
	},
	{
		name: 'suppression add',
		params: { resource: 'suppression', operation: 'add', email: 'a@x.test', note: 'asked' },
		method: 'POST',
		path: '/suppressions',
		body: { email: 'a@x.test', note: 'asked' },
	},
	{
		name: 'suppression remove encodes the address',
		params: { resource: 'suppression', operation: 'remove', email: 'a+b@x.test' },
		method: 'DELETE',
		path: '/suppressions/a%2Bb%40x.test',
		status: 204,
		response: '',
		output: [{ removed: true, email: 'a+b@x.test' }],
	},
	{
		name: 'inbox list',
		params: {
			resource: 'inbox',
			operation: 'getAll',
			returnAll: true,
			filters: { domain: 'acme.test' },
		},
		method: 'GET',
		path: '/inboxes',
		qs: { domain: 'acme.test' },
		response: { data: [{ id: 'ib_1' }] },
		output: [{ id: 'ib_1' }],
	},
	{
		name: 'thread list',
		params: {
			resource: 'thread',
			operation: 'getAll',
			returnAll: false,
			limit: 5,
			filters: { inbox: 'ib_1', unread: true, archived: false, q: 'invoice' },
		},
		method: 'GET',
		path: '/threads',
		qs: { inbox: 'ib_1', unread: true, archived: false, q: 'invoice', offset: 0, limit: 5 },
		response: { data: [{ id: 'th_1' }], next_offset: null },
		output: [{ id: 'th_1' }],
	},
	{
		name: 'thread get',
		params: { resource: 'thread', operation: 'get', threadId: 'th_1' },
		method: 'GET',
		path: '/threads/th_1',
	},
	{
		name: 'thread reply',
		params: {
			resource: 'thread',
			operation: 'reply',
			threadId: 'th_1',
			text: 'Thanks!',
			additionalFields: { html: '<p>Thanks!</p>' },
		},
		method: 'POST',
		path: '/threads/th_1/reply',
		body: { text: 'Thanks!', html: '<p>Thanks!</p>' },
	},
	{
		name: 'thread update clears an empty label',
		params: {
			resource: 'thread',
			operation: 'update',
			threadId: 'th_1',
			updateFields: { unread: false, archived: true, label: '' },
		},
		method: 'PATCH',
		path: '/threads/th_1',
		body: { unread: false, archived: true, label: null },
	},
	{
		name: 'domain list',
		params: { resource: 'domain', operation: 'getAll', returnAll: true },
		method: 'GET',
		path: '/domains',
		response: { data: [{ name: 'acme.test' }, { name: 'mail.acme.test', alias_of: 'd1' }] },
		output: [{ name: 'acme.test' }, { name: 'mail.acme.test', alias_of: 'd1' }],
	},
];

for (const c of cases) {
	test(`${c.name}: ${c.method} ${c.path}`, async () => {
		const { result, calls } = await run(c.params, {
			respond: () => ({ statusCode: c.status ?? 200, body: c.response ?? { id: 'ok' } }),
		});
		assert.equal(calls.length, 1);
		const call = calls[0];
		assert.equal(call.credential, 'openSesApi');
		assert.equal(call.method, c.method);
		assert.equal(call.url, API + c.path);
		assert.equal(call.headers.Accept, 'application/json');
		assert.equal(call.disableFollowRedirect, true);
		assert.equal(call.ignoreHttpStatusErrors, true);
		assert.deepEqual(call.qs, c.qs);
		assert.deepEqual(call.body, c.body);
		for (const [key, value] of Object.entries(c.headers ?? {}))
			assert.equal(call.headers[key], value);
		if (!c.headers) assert.equal(call.headers['Idempotency-Key'], undefined);
		assert.deepEqual(
			result.map((entry) => entry.json),
			c.output ?? [c.response ?? { id: 'ok' }],
		);
		assert(result.every((entry) => entry.pairedItem.item === 0));
	});
}

test('every resource/operation in the UI has a runtime test', () => {
	const tested = new Set(cases.map((c) => `${c.params.resource}:${c.params.operation}`));
	const props = node.description.properties;
	for (const resource of props.find((p) => p.name === 'resource').options) {
		const selector = props.find(
			(p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource.value),
		);
		assert(selector, resource.value);
		for (const operation of selector.options)
			assert(
				tested.has(`${resource.value}:${operation.value}`),
				`${resource.value}:${operation.value}`,
			);
	}
});

test('attachments are read from binary properties and sent as base64', async () => {
	const { calls } = await run(
		{
			resource: 'email',
			operation: 'send',
			from: 'hello@acme.test',
			to: 'a@x.test',
			content: 'custom',
			subject: 'Invoice',
			text: 'Attached',
			additionalFields: { attachments: 'data, logo' },
		},
		{
			binary: {
				data: {
					meta: { fileName: 'invoice.pdf', mimeType: 'application/pdf' },
					buffer: Buffer.from('PDF'),
				},
				logo: { meta: { mimeType: 'image/png' }, buffer: Buffer.from([1, 2, 3]) },
			},
		},
	);
	assert.deepEqual(calls[0].body.attachments, [
		{
			filename: 'invoice.pdf',
			content: Buffer.from('PDF').toString('base64'),
			content_type: 'application/pdf',
		},
		{ filename: 'logo', content: 'AQID', content_type: 'image/png' },
	]);
});

test('send refuses to go out without a body or recipients', async () => {
	const base = {
		resource: 'email',
		operation: 'send',
		from: 'a@acme.test',
		to: 'b@x.test',
		content: 'custom',
		subject: 'S',
	};
	let c = context(base);
	await assert.rejects(node.execute.call(c.ctx), /HTML or Text/);
	assert.equal(c.calls.length, 0);
	c = context({ ...base, to: ' , ', text: 'x' });
	await assert.rejects(node.execute.call(c.ctx), /recipient/);
	assert.equal(c.calls.length, 0);
});

test('thread update needs at least one field', async () => {
	const c = context({
		resource: 'thread',
		operation: 'update',
		threadId: 'th_1',
		updateFields: {},
	});
	await assert.rejects(node.execute.call(c.ctx), /at least one field/);
});

test('page/limit lists follow pages until total and honour Return All', async () => {
	const pages = [
		{ data: [1, 2].map((id) => ({ id })), total: 5, page: 1, limit: 2 },
		{ data: [3, 4].map((id) => ({ id })), total: 5, page: 2, limit: 2 },
		{ data: [5].map((id) => ({ id })), total: 5, page: 3, limit: 2 },
	];
	// Return All requests the maximum page size; the server here caps it at 2.
	const { result, calls } = await run(
		{ resource: 'email', operation: 'getAll', returnAll: true, filters: { status: 'bounced' } },
		{ respond: (_o, n) => ({ statusCode: 200, body: pages[n] }) },
	);
	assert.deepEqual(
		result.map((r) => r.json.id),
		[1, 2, 3, 4, 5],
	);
	assert.deepEqual(
		calls.map((c) => c.qs),
		[1, 2, 3].map((page) => ({ status: 'bounced', page, limit: 100 })),
	);
});

test('page/limit lists stop exactly at Limit across pages', async () => {
	const { result, calls } = await run(
		{ resource: 'suppression', operation: 'getAll', returnAll: false, limit: 3, filters: {} },
		{
			respond: (o) => ({
				statusCode: 200,
				body: {
					data: [
						{ p: o.qs.page, n: 1 },
						{ p: o.qs.page, n: 2 },
					],
					total: 10,
					page: o.qs.page,
					limit: 2,
				},
			}),
		},
	);
	assert.equal(result.length, 3);
	assert.equal(calls.length, 2);
	assert.deepEqual(
		calls.map((c) => c.qs.limit),
		[3, 3],
	);
});

test('page/limit lists stop on a short or empty page', async () => {
	const { calls } = await run(
		{ resource: 'contact', operation: 'getAll', returnAll: true, filters: {} },
		{ respond: () => ({ statusCode: 200, body: { data: [{ id: 1 }], page: 1, limit: 100 } }) },
	);
	assert.equal(calls.length, 1);
});

test('offset lists follow next_offset until it is null', async () => {
	const pages = [
		{ data: [{ id: 'a' }, { id: 'b' }], next_offset: 2 },
		{ data: [], next_offset: 4 },
		{ data: [{ id: 'c' }], next_offset: null },
	];
	const { result, calls } = await run(
		{ resource: 'thread', operation: 'getAll', returnAll: true, filters: { domain: 'acme.test' } },
		{ respond: (_o, n) => ({ statusCode: 200, body: pages[n] }) },
	);
	assert.deepEqual(
		result.map((r) => r.json.id),
		['a', 'b', 'c'],
	);
	assert.deepEqual(
		calls.map((c) => c.qs.offset),
		[0, 2, 4],
	);
	assert(calls.every((c) => c.qs.domain === 'acme.test' && c.qs.limit === 100));
});

test('offset lists stop at Limit and reject a next_offset that does not advance', async () => {
	let { result, calls } = await run(
		{ resource: 'thread', operation: 'getAll', returnAll: false, limit: 3, filters: {} },
		{
			respond: (o) => ({
				statusCode: 200,
				body: { data: [{ o: o.qs.offset }, { o: o.qs.offset }], next_offset: o.qs.offset + 2 },
			}),
		},
	);
	assert.equal(result.length, 3);
	assert.equal(calls.length, 2);
	const c = context(
		{ resource: 'thread', operation: 'getAll', returnAll: true, filters: {} },
		{ respond: () => ({ statusCode: 200, body: { data: [{ id: 1 }], next_offset: 0 } }) },
	);
	await assert.rejects(node.execute.call(c.ctx), /next_offset/);
});

test('API errors surface error.message, the code and a hint', async () => {
	const c = context(
		{ resource: 'suppression', operation: 'add', email: 'a@x.test' },
		{
			respond: () => ({
				statusCode: 403,
				body: {
					error: { code: 'domain_limited_key', message: 'This key is limited to acme.test' },
				},
			}),
		},
	);
	await assert.rejects(node.execute.call(c.ctx), (error) => {
		assert.equal(error.message, 'This key is limited to acme.test');
		assert.match(error.description, /HTTP 403 \(domain_limited_key\)/);
		assert.match(error.description, /account-wide key/);
		assert.equal(error.httpCode, '403');
		return true;
	});
});

test('continueOnFail returns an error item per failed input and keeps going', async () => {
	const { result, calls } = await run(
		{ resource: 'email', operation: 'get', emailId: 'em_1' },
		{
			items: [{ json: {} }, { json: {} }],
			continueOnFail: true,
			respond: (_o, n) =>
				n === 0
					? { statusCode: 404, body: { error: { code: 'not_found', message: 'email not found' } } }
					: { statusCode: 200, body: { id: 'em_1' } },
		},
	);
	assert.equal(calls.length, 2);
	assert.deepEqual(result[0].json, {
		error: 'email not found',
		details: 'HTTP 404 (not_found)',
		status: 404,
	});
	assert.deepEqual(result[0].pairedItem, { item: 0 });
	assert.deepEqual(result[1].json, { id: 'em_1' });
	assert.deepEqual(result[1].pairedItem, { item: 1 });
	assert(!JSON.stringify(result).includes('et_test_secret'));
});

test('network failures do not leak the API key', async () => {
	const c = context(
		{ resource: 'domain', operation: 'getAll', returnAll: true },
		{
			respond: () => {
				throw Object.assign(new Error('getaddrinfo ENOTFOUND api.openses.email'), {
					code: 'ENOTFOUND',
					config: { headers: { Authorization: 'Bearer et_test_secret' } },
				});
			},
		},
	);
	await assert.rejects(node.execute.call(c.ctx), (error) => {
		assert.match(error.message, /OpenSES API|connection cannot be established/i);
		assert.match(error.description, /Base URL/);
		assert(!JSON.stringify({ m: error.message, d: error.description }).includes('et_test_secret'));
		return true;
	});
});

test('error bodies without the API envelope still produce a readable message', async () => {
	const c = context(
		{ resource: 'email', operation: 'get', emailId: 'em_1' },
		{ respond: () => ({ statusCode: 401, body: '<html>nope</html>' }) },
	);
	await assert.rejects(node.execute.call(c.ctx), /invalid or has been revoked/);
});

test('identifiers are URL-encoded into a single path segment', async () => {
	const { calls } = await run({ resource: 'contact', operation: 'get', contactId: '../x?y#z' });
	assert.equal(calls[0].url, API + '/contacts/..%2Fx%3Fy%23z');
});

test('a self-hosted Base URL is normalised and used for every request', async () => {
	const { calls } = await run({
		resource: 'email',
		operation: 'get',
		emailId: 'em_1',
		__baseUrl: 'https://mail.example.com/api/v1/',
	});
	assert.equal(calls[0].url, 'https://mail.example.com/api/v1/emails/em_1');
	assert.equal(normalizeBaseUrl(''), 'https://api.openses.email');
	assert.equal(normalizeBaseUrl('ftp://x'), undefined);
});

test('address splitting keeps quoted display names', () => {
	assert.deepEqual(splitAddresses('a@x.test,"Doe, J" <j@x.test>; c@x.test'), [
		'a@x.test',
		'"Doe, J" <j@x.test>',
		'c@x.test',
	]);
	assert.deepEqual(splitAddresses(''), []);
});

test('loadOptions read domains, templates, sequences, inboxes and topics', async () => {
	const bodies = {
		'/domains': {
			data: [
				{ name: 'b.test', status: 'verified' },
				{ name: 'a.test', alias_of: 'd1' },
			],
		},
		'/templates': { data: [{ id: 't1', name: 'Welcome', domain: 'a.test', subject: 'Hi' }] },
		'/sequences': { data: [{ id: 's1', name: 'Onboarding', status: 'active' }] },
		'/inboxes': { data: [{ id: 'i1', address: 'support@a.test', name: 'Support' }] },
		'/topics': { data: [{ name: 'News', slug: 'news' }] },
	};
	const calls = [];
	const ctx = {
		getNode: () => ({ name: 'OpenSES' }),
		getCredentials: async () => ({ baseUrl: 'https://api.openses.email' }),
		getCurrentNodeParameter: (path) => (path === 'filters.domain' ? 'a.test' : undefined),
		helpers: {
			httpRequestWithAuthentication: async (_c, o) => {
				calls.push(o);
				return { statusCode: 200, body: bodies[new URL(o.url).pathname.replace('/v1', '')] };
			},
		},
	};
	const m = node.methods.loadOptions;
	assert.deepEqual(await m.getDomains.call(ctx), [
		{ name: 'a.test (alias)', value: 'a.test' },
		{ name: 'b.test', value: 'b.test' },
	]);
	assert.deepEqual(await m.getTemplates.call(ctx), [
		{ name: 'Welcome (a.test)', value: 't1', description: 'Hi' },
	]);
	assert.deepEqual(await m.getSequences.call(ctx), [{ name: 'Onboarding (active)', value: 's1' }]);
	assert.deepEqual(await m.getInboxes.call(ctx), [
		{ name: 'Support <support@a.test>', value: 'i1' },
	]);
	assert.deepEqual(await m.getTopics.call(ctx), [
		{ name: 'News', value: 'news', description: undefined },
	]);
	assert.deepEqual(calls.at(-1).qs, { domain: 'a.test' });
});

test('credential uses Bearer auth, a password field and tests GET /v1/domains', () => {
	const credential = new OpenSesApi();
	assert.equal(credential.name, 'openSesApi');
	const apiKey = credential.properties.find((p) => p.name === 'apiKey');
	assert.equal(apiKey.typeOptions.password, true);
	assert.equal(
		credential.properties.find((p) => p.name === 'baseUrl').default,
		'https://api.openses.email',
	);
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}',
	);
	assert.equal(credential.test.request.url, '/v1/domains');
	assert.equal(credential.test.request.method, 'GET');
});

test('n8n resolves list controls: Limit only shows when Return All is off', () => {
	const { NodeHelpers } = require('n8n-workflow');
	const props = node.description.properties;
	for (const resource of [
		'email',
		'contact',
		'topic',
		'template',
		'sequence',
		'suppression',
		'inbox',
		'thread',
		'domain',
	]) {
		const all = NodeHelpers.getNodeParameters(
			props,
			{ resource, operation: 'getAll', returnAll: true },
			true,
			false,
			{ typeVersion: 1 },
			node.description,
		);
		assert.equal(all.returnAll, true, resource);
		assert(!Object.hasOwn(all, 'limit'), resource);
		const some = NodeHelpers.getNodeParameters(
			props,
			{ resource, operation: 'getAll', returnAll: false },
			true,
			false,
			{ typeVersion: 1 },
			node.description,
		);
		assert.equal(some.limit, 50, resource);
		assert(!props.some((p) => ['offset', 'page', 'cursor'].includes(p.name)));
	}
});

test('package metadata is clean and points at the public repository', () => {
	assert.equal(pkg.license, 'MIT');
	assert.equal(pkg.author.name, 'OpenSES');
	assert.equal(pkg.author.url, 'https://openses.email');
	assert.equal(pkg.repository.url, 'git+https://github.com/openses-email/n8n-nodes-openses.git');
	assert(pkg.keywords.includes('n8n-community-node-package'));
	assert.equal(node.description.usableAsTool, true);
});

test('example workflows only use existing OpenSES resources, operations and events', () => {
	const fs = require('node:fs');
	const path = require('node:path');
	const { OpenSesTrigger } = require('../dist/nodes/OpenSes/OpenSesTrigger.node.js');
	const props = node.description.properties;
	const events = new OpenSesTrigger().description.properties
		.find((p) => p.name === 'events')
		.options.map((o) => o.value);
	const folder = path.join(__dirname, '..', 'examples');
	const files = fs.readdirSync(folder).filter((f) => f.endsWith('.json'));
	assert(files.length >= 3);
	for (const file of files) {
		const workflow = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
		for (const entry of workflow.nodes) {
			if (entry.type === 'n8n-nodes-openses.openSesTrigger')
				for (const event of entry.parameters.events) assert(events.includes(event), file);
			if (entry.type !== 'n8n-nodes-openses.openSes') continue;
			const { resource, operation } = entry.parameters;
			const selector = props.find(
				(p) => p.name === 'operation' && p.displayOptions.show.resource.includes(resource),
			);
			assert(selector, `${file}: ${resource}`);
			assert(
				selector.options.some((o) => o.value === operation),
				`${file}: ${operation}`,
			);
		}
		for (const target of Object.keys(workflow.connections))
			assert(
				workflow.nodes.some((n) => n.name === target),
				`${file}: ${target}`,
			);
	}
});
