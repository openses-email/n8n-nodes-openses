import type { INodeProperties } from 'n8n-workflow';
import { paginationFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['suppression'], operation } });

export const suppressionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['suppression'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description: 'Block an address so OpenSES never sends to it',
				action: 'Add an address to the suppression list',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List suppressed addresses across the account',
				action: 'Get many suppressions',
			},
			{
				name: 'Remove',
				value: 'remove',
				description: 'Allow sending to a suppressed address again',
				action: 'Remove an address from the suppression list',
			},
		],
		default: 'add',
	},
];

export const suppressionFields: INodeProperties[] = [
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		displayOptions: show(['add', 'remove']),
	},
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		default: '',
		description: 'Why the address was suppressed, shown in the dashboard',
		displayOptions: show(['add']),
	},
	...paginationFields('suppression', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Reason',
				name: 'reason',
				type: 'options',
				default: 'bounce',
				options: [
					{ name: 'Bounce', value: 'bounce' },
					{ name: 'Complaint', value: 'complaint' },
					{ name: 'Manual', value: 'manual' },
				],
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search in suppressed addresses',
			},
		],
	},
];
