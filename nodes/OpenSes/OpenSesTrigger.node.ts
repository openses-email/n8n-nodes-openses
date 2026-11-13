import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { openSesRequest } from './GenericFunctions';
import { verifySignature } from './signature';

const MAX_BODY_BYTES = 10 * 1024 * 1024;

interface WebhookRecord {
	id?: string;
	url?: string;
	events?: string[];
	active?: boolean;
	secret?: string;
}

function sameEvents(a: unknown, b: string[]): boolean {
	if (!Array.isArray(a) || a.length !== b.length) return false;
	const left = [...a].map(String).sort();
	const right = [...b].sort();
	return left.every((value, index) => value === right[index]);
}

function clearState(state: IDataObject) {
	delete state.webhookId;
	delete state.webhookSecret;
	delete state.webhookEvents;
}

export class OpenSesTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenSES Trigger',
		name: 'openSesTrigger',
		icon: { light: 'file:openses.svg', dark: 'file:openses.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts the workflow when OpenSES receives an email or a sent email changes status',
		defaults: { name: 'OpenSES Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openSesApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'openses',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['email.received'],
				description: 'Events that start the workflow',
				options: [
					{
						name: 'Email Bounced',
						value: 'email.bounced',
						description: 'The receiving server permanently rejected the email',
					},
					{
						name: 'Email Clicked',
						value: 'email.clicked',
						description: 'A recipient clicked a tracked link',
					},
					{
						name: 'Email Complained',
						value: 'email.complained',
						description: 'A recipient marked the email as spam',
					},
					{
						name: 'Email Delayed',
						value: 'email.delayed',
						description: 'Delivery is temporarily delayed and will be retried',
					},
					{
						name: 'Email Delivered',
						value: 'email.delivered',
						description: 'The receiving server accepted the email',
					},
					{
						name: 'Email Failed',
						value: 'email.failed',
						description: 'OpenSES could not send the email',
					},
					{
						name: 'Email Opened',
						value: 'email.opened',
						description: 'A recipient opened the email',
					},
					{
						name: 'Email Received (Inbound Mail)',
						value: 'email.received',
						description:
							'A message arrived in one of your inboxes. Includes sender, subject, text, HTML and attachment links.',
					},
					{
						name: 'Email Rejected',
						value: 'email.rejected',
						description: 'Amazon SES refused to send the email',
					},
					{
						name: 'Email Sent',
						value: 'email.sent',
						description: 'The email was handed to Amazon SES',
					},
					{
						name: 'Subscription Changed',
						value: 'email.subscription',
						description: 'A recipient unsubscribed or changed topic preferences',
					},
				],
			},
			{
				displayName:
					'Activating this workflow creates an OpenSES webhook for the selected events. Deactivating it deletes that webhook.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node');
				if (!state.webhookId || !state.webhookSecret) return false;
				const url = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events') as string[];
				const body = await openSesRequest.call(this, 'GET', '/webhooks');
				const hooks = (Array.isArray(body?.data) ? body.data : []) as WebhookRecord[];
				const hook = hooks.find((entry) => entry.id === state.webhookId);
				if (!hook) {
					clearState(state);
					return false;
				}
				if (hook.url === url && hook.active !== false && sameEvents(hook.events, events))
					return true;
				// The registration is outdated: remove it so create() can register the current settings.
				await openSesRequest.call(
					this,
					'DELETE',
					`/webhooks/${encodeURIComponent(String(state.webhookId))}`,
				);
				clearState(state);
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				if (!url?.startsWith('https://'))
					throw new NodeOperationError(
						this.getNode(),
						'OpenSES only delivers webhooks to HTTPS URLs. Set WEBHOOK_URL in n8n to a public https:// address.',
					);
				const events = this.getNodeParameter('events') as string[];
				if (!events.length)
					throw new NodeOperationError(this.getNode(), 'Select at least one event');
				const workflowName = this.getWorkflow().name;
				const response = await openSesRequest.call(this, 'POST', '/webhooks', {
					body: {
						url,
						events,
						description: `n8n${workflowName ? `: ${workflowName}` : ''}`.slice(0, 200),
					},
				});
				const hook = ((response?.data && typeof response.data === 'object'
					? response.data
					: response) ?? {}) as WebhookRecord;
				if (!hook.id || !hook.secret)
					throw new NodeOperationError(
						this.getNode(),
						'OpenSES did not return the webhook ID and signing secret',
					);
				const state = this.getWorkflowStaticData('node');
				state.webhookId = hook.id;
				state.webhookSecret = hook.secret;
				state.webhookEvents = events;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const state = this.getWorkflowStaticData('node');
				if (!state.webhookId) return true;
				try {
					await openSesRequest.call(
						this,
						'DELETE',
						`/webhooks/${encodeURIComponent(String(state.webhookId))}`,
					);
				} catch (error) {
					// A webhook already removed in the dashboard is fine; anything else must surface.
					if (!(error instanceof NodeApiError))
						throw new NodeOperationError(this.getNode(), error as Error);
					if (error.httpCode !== '404')
						throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
					this.logger.warn('OpenSES webhook was already deleted', {
						webhookId: String(state.webhookId),
					});
				}
				clearState(state);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const state = this.getWorkflowStaticData('node');
		const reject = (status: number, message: string): IWebhookResponseData => {
			res.status(status).json({ error: message });
			return { noWebhookResponse: true };
		};

		const secret = typeof state.webhookSecret === 'string' ? state.webhookSecret : '';
		if (!secret) return reject(401, 'webhook is not registered');

		if (!Buffer.isBuffer(req.rawBody)) await req.readRawBody();
		const raw = req.rawBody;
		if (!Buffer.isBuffer(raw) || raw.length === 0) return reject(400, 'empty body');
		if (raw.length > MAX_BODY_BYTES) return reject(413, 'body too large');

		const verdict = verifySignature(req.headers['x-openses-signature'], raw, secret);
		if (verdict === 'stale') return reject(401, 'signature timestamp outside tolerance');
		if (verdict !== 'valid') return reject(401, 'invalid signature');

		let payload: IDataObject;
		try {
			payload = JSON.parse(raw.toString('utf8')) as IDataObject;
		} catch {
			return reject(400, 'invalid JSON');
		}
		if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string')
			return reject(400, 'invalid payload');

		res.status(200).json({ received: true });
		const events = this.getNodeParameter('events', []) as string[];
		if (events.length && !events.includes(payload.type)) return { noWebhookResponse: true };
		return {
			noWebhookResponse: true,
			workflowData: [this.helpers.returnJsonArray(payload)],
		};
	}
}
