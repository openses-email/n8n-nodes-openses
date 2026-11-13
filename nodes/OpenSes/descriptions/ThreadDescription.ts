import type { INodeProperties } from 'n8n-workflow';
import { domainOption, paginationFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['thread'], operation } });

export const threadOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['thread'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a conversation with all its messages. Does not mark it as read.',
				action: 'Get a thread',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List inbox conversations, newest first',
				action: 'Get many threads',
			},
			{
				name: 'Reply',
				value: 'reply',
				description: 'Send a reply in a conversation. This sends a real email.',
				action: 'Reply to a thread',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Mark a conversation read or unread, archive it, or set its label',
				action: 'Update a thread',
			},
		],
		default: 'getAll',
	},
];

export const threadFields: INodeProperties[] = [
	{
		displayName: 'Thread ID',
		name: 'threadId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the conversation, for example thread_id from the Email Received trigger',
		displayOptions: show(['get', 'reply', 'update']),
	},

	// ----- reply -----
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'Plain-text reply. It is sent from the inbox address to the other participants.',
		displayOptions: show(['reply']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['reply']),
		options: [
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'HTML version of the reply',
			},
		],
	},

	// ----- update -----
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{
				displayName: 'Archived',
				name: 'archived',
				type: 'boolean',
				default: true,
				description: 'Whether the conversation is archived',
			},
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				description: 'Label to set on the conversation. Leave empty to remove the label.',
			},
			{
				displayName: 'Unread',
				name: 'unread',
				type: 'boolean',
				default: false,
				description: 'Whether the conversation is marked as unread',
			},
		],
	},

	// ----- getAll -----
	...paginationFields('thread', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Archived',
				name: 'archived',
				type: 'boolean',
				default: true,
				description: 'Whether to return archived conversations (on) or only active ones (off)',
			},
			{
				...domainOption,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only conversations of this domain.',
			},
			{
				displayName: 'Inbox Name or ID',
				name: 'inbox',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getInboxes' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only conversations of this inbox.',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search in subjects, senders and messages',
			},
			{
				displayName: 'Unread',
				name: 'unread',
				type: 'boolean',
				default: true,
				description: 'Whether to return only unread (on) or only read (off) conversations',
			},
		],
	},
];
