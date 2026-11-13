import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	openSesFullList,
	openSesOffsetList,
	openSesPagedList,
	openSesRequest,
	pairsToObject,
	segment,
	splitAddresses,
	type RequestOptions,
} from './GenericFunctions';
import { contactFields, contactOperations } from './descriptions/ContactDescription';
import { emailFields, emailOperations } from './descriptions/EmailDescription';
import {
	domainFields,
	domainOperations,
	inboxFields,
	inboxOperations,
	templateFields,
	templateOperations,
	topicFields,
	topicOperations,
} from './descriptions/ListDescriptions';
import { sequenceFields, sequenceOperations } from './descriptions/SequenceDescription';
import { suppressionFields, suppressionOperations } from './descriptions/SuppressionDescription';
import { threadFields, threadOperations } from './descriptions/ThreadDescription';

type Result = IDataObject | IDataObject[];

/** Handles one input item for the selected resource and operation. */
async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<Result> {
	const param = <T>(name: string, fallback?: T) => this.getNodeParameter(name, i, fallback) as T;
	const request = (
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
		path: string,
		options: RequestOptions = {},
	) => openSesRequest.call(this, method, path, options, i);
	const listArgs = () => {
		const returnAll = param<boolean>('returnAll', false);
		const limit = param<number>('limit', 50);
		return { returnAll, limit };
	};
	const filters = () => param<IDataObject>('filters', {});

	if (resource === 'email') {
		if (operation === 'send') {
			const extra = param<IDataObject>('additionalFields', {});
			const body: IDataObject = {
				from: param<string>('from').trim(),
				to: splitAddresses(param<string>('to')),
			};
			if (!(body.to as string[]).length)
				throw new NodeOperationError(this.getNode(), 'Add at least one recipient in To', {
					itemIndex: i,
				});
			if (param<string>('content', 'custom') === 'template') {
				body.template = param<string>('template');
				const variables = pairsToObject(param<IDataObject>('variables', {}));
				if (variables) body.variables = variables;
			} else {
				body.subject = param<string>('subject', '');
				const html = param<string>('html', '');
				const text = param<string>('text', '');
				if (!html && !text)
					throw new NodeOperationError(this.getNode(), 'Add HTML or Text content to the email', {
						itemIndex: i,
					});
				if (html) body.html = html;
				if (text) body.text = text;
			}
			for (const [field, key] of [
				['cc', 'cc'],
				['bcc', 'bcc'],
				['replyTo', 'reply_to'],
			]) {
				const list = splitAddresses(extra[field]);
				if (list.length) body[key] = list;
			}
			if (extra.tag) body.tag = String(extra.tag);
			const tags = pairsToObject(extra.tags);
			if (tags) body.tags = tags;
			const headers = pairsToObject(extra.headers);
			if (headers) body.headers = headers;
			if (extra.scheduledAt) {
				const when = new Date(String(extra.scheduledAt));
				if (Number.isNaN(when.getTime()))
					throw new NodeOperationError(this.getNode(), 'Scheduled At is not a valid date', {
						itemIndex: i,
					});
				body.scheduled_at = when.toISOString();
			}
			const binaryNames = String(extra.attachments ?? '')
				.split(',')
				.map((name) => name.trim())
				.filter(Boolean);
			if (binaryNames.length) {
				const attachments: IDataObject[] = [];
				for (const name of binaryNames) {
					const binary = this.helpers.assertBinaryData(i, name);
					const buffer = await this.helpers.getBinaryDataBuffer(i, name);
					attachments.push({
						filename: binary.fileName ?? name,
						content: buffer.toString('base64'),
						content_type: binary.mimeType || 'application/octet-stream',
					});
				}
				body.attachments = attachments;
			}
			const headersOut: Record<string, string> = {};
			if (extra.idempotencyKey) headersOut['Idempotency-Key'] = String(extra.idempotencyKey);
			return (await request('POST', '/emails', { body, headers: headersOut })) ?? {};
		}
		if (operation === 'get')
			return (await request('GET', `/emails/${segment(param('emailId'), 'Email ID')}`)) ?? {};
		if (operation === 'cancel')
			return (
				(await request('POST', `/emails/${segment(param('emailId'), 'Email ID')}/cancel`)) ?? {}
			);
		if (operation === 'getAll') {
			const { returnAll, limit } = listArgs();
			return openSesPagedList.call(this, '/emails', filters(), returnAll, limit, 100, i);
		}
	}

	if (resource === 'contact') {
		if (operation === 'upsert') {
			const extra = param<IDataObject>('additionalFields', {});
			const body: IDataObject = { email: param<string>('email').trim() };
			if (extra.domain) body.domain = extra.domain;
			if (extra.name) body.name = extra.name;
			if (extra.company) body.company = extra.company;
			const properties = pairsToObject(extra.properties);
			if (properties) body.properties = properties;
			if (Array.isArray(extra.topics) && extra.topics.length) body.topics = extra.topics;
			const response = (await request('POST', '/contacts', { body })) ?? {};
			const contact = response.contact;
			return contact && typeof contact === 'object'
				? { ...(contact as IDataObject), created: response.created === true }
				: response;
		}
		const contactPath = () => `/contacts/${segment(param('contactId'), 'Contact ID')}`;
		if (operation === 'get') return (await request('GET', contactPath())) ?? {};
		if (operation === 'unsubscribe')
			return (await request('POST', `${contactPath()}/unsubscribe`)) ?? {};
		if (operation === 'delete') {
			await request('DELETE', contactPath());
			return { deleted: true, id: param<string>('contactId') };
		}
		if (operation === 'getAll') {
			const { returnAll, limit } = listArgs();
			return openSesPagedList.call(this, '/contacts', filters(), returnAll, limit, 100, i);
		}
	}

	if (resource === 'sequence') {
		if (operation === 'getAll') {
			const { returnAll, limit } = listArgs();
			return openSesFullList.call(this, '/sequences', filters(), returnAll, limit, i);
		}
		const path = `/sequences/${segment(param('sequenceId'), 'Sequence')}/${operation === 'enroll' ? 'enroll' : 'stop'}`;
		const body: IDataObject = {};
		if (param<string>('identifyBy', 'email') === 'contactId') {
			body.contact_id = param<string>('contactId').trim();
		} else {
			body.email = param<string>('email').trim();
			if (operation === 'enroll') {
				const extra = param<IDataObject>('additionalFields', {});
				if (extra.name) body.name = extra.name;
				const properties = pairsToObject(extra.properties);
				if (properties) body.properties = properties;
			}
		}
		if (!body.contact_id && !body.email)
			throw new NodeOperationError(this.getNode(), 'Set the contact email or contact ID', {
				itemIndex: i,
			});
		if (operation === 'enroll' || operation === 'stop')
			return (await request('POST', path, { body })) ?? {};
	}

	if (resource === 'suppression') {
		if (operation === 'getAll') {
			const { returnAll, limit } = listArgs();
			return openSesPagedList.call(this, '/suppressions', filters(), returnAll, limit, 500, i);
		}
		if (operation === 'add') {
			const body: IDataObject = { email: param<string>('email').trim() };
			const note = param<string>('note', '');
			if (note) body.note = note;
			return (await request('POST', '/suppressions', { body })) ?? {};
		}
		if (operation === 'remove') {
			const email = param<string>('email').trim();
			await request('DELETE', `/suppressions/${segment(email, 'Email')}`);
			return { removed: true, email };
		}
	}

	if (resource === 'thread') {
		if (operation === 'getAll') {
			const { returnAll, limit } = listArgs();
			return openSesOffsetList.call(this, '/threads', filters(), returnAll, limit, 100, i);
		}
		const threadPath = `/threads/${segment(param('threadId'), 'Thread ID')}`;
		if (operation === 'get') return (await request('GET', threadPath)) ?? {};
		if (operation === 'reply') {
			const body: IDataObject = { text: param<string>('text') };
			const html = param<IDataObject>('additionalFields', {}).html;
			if (html) body.html = html;
			return (await request('POST', `${threadPath}/reply`, { body })) ?? {};
		}
		if (operation === 'update') {
			const fields = param<IDataObject>('updateFields', {});
			const body: IDataObject = {};
			if (typeof fields.unread === 'boolean') body.unread = fields.unread;
			if (typeof fields.archived === 'boolean') body.archived = fields.archived;
			if ('label' in fields) body.label = fields.label ? String(fields.label) : null;
			if (!Object.keys(body).length)
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			return (await request('PATCH', threadPath, { body })) ?? { success: true };
		}
	}

	const completeLists: Record<string, string> = {
		domain: '/domains',
		inbox: '/inboxes',
		template: '/templates',
		topic: '/topics',
	};
	if (operation === 'getAll' && completeLists[resource]) {
		const { returnAll, limit } = listArgs();
		const qs = resource === 'domain' ? {} : filters();
		return openSesFullList.call(this, completeLists[resource], qs, returnAll, limit, i);
	}
	if (resource === 'template' && operation === 'get')
		return (await request('GET', `/templates/${segment(param('templateId'), 'Template')}`)) ?? {};

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for ${resource}`,
		{ itemIndex: i },
	);
}

async function loadList(
	ctx: ILoadOptionsFunctions,
	path: string,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const body = await openSesRequest.call(ctx, 'GET', path, { qs });
	return Array.isArray(body?.data) ? (body.data as IDataObject[]) : [];
}

function currentDomain(ctx: ILoadOptionsFunctions): string {
	for (const path of ['additionalFields.domain', 'filters.domain']) {
		try {
			const value = ctx.getCurrentNodeParameter(path);
			if (typeof value === 'string' && value) return value;
		} catch {
			// The parameter is not shown for this operation.
		}
	}
	return '';
}

const byName = (a: INodePropertyOptions, b: INodePropertyOptions) => a.name.localeCompare(b.name);

export class OpenSes implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenSES',
		name: 'openSes',
		icon: { light: 'file:openses.svg', dark: 'file:openses.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Send email, manage contacts, sequences, suppressions and shared inboxes with OpenSES',
		defaults: { name: 'OpenSES' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'openSesApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Contact', value: 'contact' },
					{ name: 'Domain', value: 'domain' },
					{ name: 'Email', value: 'email' },
					{ name: 'Inbox', value: 'inbox' },
					{ name: 'Sequence', value: 'sequence' },
					{ name: 'Suppression', value: 'suppression' },
					{ name: 'Template', value: 'template' },
					{ name: 'Thread', value: 'thread' },
					{ name: 'Topic', value: 'topic' },
				],
				default: 'email',
			},
			...emailOperations,
			...emailFields,
			...contactOperations,
			...contactFields,
			...topicOperations,
			...topicFields,
			...templateOperations,
			...templateFields,
			...sequenceOperations,
			...sequenceFields,
			...suppressionOperations,
			...suppressionFields,
			...inboxOperations,
			...inboxFields,
			...threadOperations,
			...threadFields,
			...domainOperations,
			...domainFields,
		],
	};

	methods = {
		loadOptions: {
			async getDomains(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const domains = await loadList(this, '/domains');
				return domains
					.map((domain) => ({
						name: domain.alias_of
							? `${String(domain.name)} (alias)`
							: `${String(domain.name)}${domain.status && domain.status !== 'verified' ? ` (${String(domain.status)})` : ''}`,
						value: String(domain.name),
					}))
					.sort(byName);
			},
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const templates = await loadList(this, '/templates');
				return templates
					.map((template) => ({
						name: template.domain
							? `${String(template.name)} (${String(template.domain)})`
							: String(template.name),
						value: String(template.id),
						description: template.subject ? String(template.subject) : undefined,
					}))
					.sort(byName);
			},
			async getSequences(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const sequences = await loadList(this, '/sequences');
				return sequences
					.map((sequence) => ({
						name: sequence.status
							? `${String(sequence.name)} (${String(sequence.status)})`
							: String(sequence.name),
						value: String(sequence.id),
					}))
					.sort(byName);
			},
			async getInboxes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const inboxes = await loadList(this, '/inboxes');
				return inboxes
					.map((inbox) => ({
						name: inbox.name
							? `${String(inbox.name)} <${String(inbox.address)}>`
							: String(inbox.address),
						value: String(inbox.id),
					}))
					.sort(byName);
			},
			async getTopics(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const domain = currentDomain(this);
				const topics = await loadList(this, '/topics', domain ? { domain } : {});
				return topics
					.map((topic) => ({
						name: String(topic.name),
						value: String(topic.slug ?? topic.name),
						description: topic.description ? String(topic.description) : undefined,
					}))
					.sort(byName);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;
			try {
				const result = await runOperation.call(this, resource, operation, i);
				const rows = Array.isArray(result) ? result : [result];
				for (const row of rows) output.push({ json: row, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					const failure = error as { message?: string; description?: string; httpCode?: string };
					output.push({
						json: {
							error: failure.message ?? 'The OpenSES request failed',
							...(failure.description ? { details: failure.description } : {}),
							...(failure.httpCode ? { status: Number(failure.httpCode) } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError)
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [output];
	}
}
