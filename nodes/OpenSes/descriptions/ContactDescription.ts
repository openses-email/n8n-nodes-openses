import type { INodeProperties } from 'n8n-workflow';
import { domainOption, nameValueCollection, paginationFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['contact'], operation } });

export const contactOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['contact'] } },
		options: [
			{
				name: 'Create or Update',
				value: 'upsert',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				action: 'Create or update a contact',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete a contact',
				action: 'Delete a contact',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a contact with its topics and sequences',
				action: 'Get a contact',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the contacts of a domain',
				action: 'Get many contacts',
			},
			{
				name: 'Unsubscribe',
				value: 'unsubscribe',
				description: 'Unsubscribe a contact from all topics',
				action: 'Unsubscribe a contact',
			},
		],
		default: 'upsert',
	},
];

export const contactFields: INodeProperties[] = [
	// ----- upsert -----
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		description: 'Email address of the contact. An existing contact with this address is updated.',
		displayOptions: show(['upsert']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['upsert']),
		options: [
			{
				displayName: 'Company',
				name: 'company',
				type: 'string',
				default: '',
			},
			{
				...domainOption,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Domain whose audience the contact belongs to. Required when the API key can use more than one domain.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'Full name of the contact',
			},
			{
				...nameValueCollection(
					'Properties',
					'properties',
					'Custom properties stored on the contact, usable as template variables',
				),
			},
			{
				displayName: 'Topic Names or IDs',
				name: 'topics',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getTopics' },
				default: [],
				description:
					'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Topics to subscribe the contact to.',
			},
		],
	},

	// ----- get / unsubscribe / delete -----
	{
		displayName: 'Contact ID',
		name: 'contactId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the contact, as returned by Create or Update or Get Many',
		displayOptions: show(['get', 'unsubscribe', 'delete']),
	},

	// ----- getAll -----
	...paginationFields('contact', 'getAll'),
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
				hint: 'Domain whose contacts to list. Required when the API key can use more than one domain.',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search in email addresses, names and companies',
			},
			{
				displayName: 'Subscribed',
				name: 'subscribed',
				type: 'boolean',
				default: true,
				description:
					'Whether to return only subscribed contacts (on) or only unsubscribed contacts (off)',
			},
			{
				displayName: 'Topic Name or ID',
				name: 'topic',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTopics' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only contacts subscribed to this topic.',
			},
		],
	},
];
