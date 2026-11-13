import type { INodeProperties } from 'n8n-workflow';
import { domainOption, nameValueCollection, paginationFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['sequence'], operation } });

export const sequenceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['sequence'] } },
		options: [
			{
				name: 'Enroll Contact',
				value: 'enroll',
				description: 'Start a sequence for a contact, creating the contact if needed',
				action: 'Enroll a contact in a sequence',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List sequences with their enrollment counts',
				action: 'Get many sequences',
			},
			{
				name: 'Stop for Contact',
				value: 'stop',
				description: 'Stop a sequence for a contact so no further steps are sent',
				action: 'Stop a sequence for a contact',
			},
		],
		default: 'enroll',
	},
];

export const sequenceFields: INodeProperties[] = [
	{
		displayName: 'Sequence Name or ID',
		name: 'sequenceId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getSequences' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: show(['enroll', 'stop']),
	},
	{
		displayName: 'Identify Contact By',
		name: 'identifyBy',
		type: 'options',
		options: [
			{ name: 'Email', value: 'email' },
			{ name: 'Contact ID', value: 'contactId' },
		],
		default: 'email',
		displayOptions: show(['enroll', 'stop']),
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		description: 'Email address of the contact',
		displayOptions: {
			show: { resource: ['sequence'], operation: ['enroll', 'stop'], identifyBy: ['email'] },
		},
	},
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		displayOptions: {
			show: { resource: ['sequence'], operation: ['enroll', 'stop'], identifyBy: ['contactId'] },
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: { resource: ['sequence'], operation: ['enroll'], identifyBy: ['email'] },
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Name stored on the contact when it is created',
			},
			{
				...nameValueCollection(
					'Properties',
					'properties',
					'Custom properties stored on the contact, usable in sequence emails',
				),
			},
		],
	},
	...paginationFields('sequence', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				...domainOption,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only sequences of this domain.',
			},
		],
	},
];
