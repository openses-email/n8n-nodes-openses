import type { INodeProperties } from 'n8n-workflow';
import { domainOption, paginationFields } from './shared';

/**
 * Read-only resources: Domain, Inbox, Template and Topic.
 * Their list endpoints return the complete set in one response.
 */

const operationSelector = (
	resource: string,
	options: Array<{ name: string; value: string; description: string; action: string }>,
	defaultOperation = 'getAll',
): INodeProperties => ({
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: [resource] } },
	options,
	default: defaultOperation,
});

const domainFilter = (resource: string, what: string): INodeProperties => ({
	displayName: 'Filters',
	name: 'filters',
	type: 'collection',
	placeholder: 'Add Filter',
	default: {},
	displayOptions: { show: { resource: [resource], operation: ['getAll'] } },
	options: [
		{
			...domainOption,
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			hint: `Only ${what} of this domain.`,
		},
	],
});

export const domainOperations: INodeProperties[] = [
	operationSelector('domain', [
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List the sending domains and aliases the API key can use',
			action: 'Get many domains',
		},
	]),
];

export const domainFields: INodeProperties[] = [...paginationFields('domain', 'getAll')];

export const inboxOperations: INodeProperties[] = [
	operationSelector('inbox', [
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List shared inboxes with their unread counts',
			action: 'Get many inboxes',
		},
	]),
];

export const inboxFields: INodeProperties[] = [
	...paginationFields('inbox', 'getAll'),
	domainFilter('inbox', 'inboxes'),
];

export const templateOperations: INodeProperties[] = [
	operationSelector('template', [
		{
			name: 'Get',
			value: 'get',
			description: 'Get a template with its HTML and text',
			action: 'Get a template',
		},
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List saved email templates',
			action: 'Get many templates',
		},
	]),
];

export const templateFields: INodeProperties[] = [
	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: { resource: ['template'], operation: ['get'] } },
	},
	...paginationFields('template', 'getAll'),
	domainFilter('template', 'templates'),
];

export const topicOperations: INodeProperties[] = [
	operationSelector('topic', [
		{
			name: 'Get Many',
			value: 'getAll',
			description: 'List subscription topics with subscriber counts',
			action: 'Get many topics',
		},
	]),
];

export const topicFields: INodeProperties[] = [
	...paginationFields('topic', 'getAll'),
	domainFilter('topic', 'topics'),
];
