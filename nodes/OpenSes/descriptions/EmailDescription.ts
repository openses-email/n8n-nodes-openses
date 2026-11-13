import type { INodeProperties } from 'n8n-workflow';
import { domainOption, nameValueCollection, paginationFields } from './shared';

const show = (operation: string[]) => ({ show: { resource: ['email'], operation } });

export const emailOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['email'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel a scheduled email before it is sent',
				action: 'Cancel a scheduled email',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get an email with its delivery events',
				action: 'Get an email',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List sent and scheduled emails, newest first',
				action: 'Get many emails',
			},
			{
				name: 'Send',
				value: 'send',
				description: 'Send an email now or schedule it for later',
				action: 'Send an email',
			},
		],
		default: 'send',
	},
];

export const emailFields: INodeProperties[] = [
	// ----- send -----
	{
		displayName: 'From',
		name: 'from',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Acme <hello@example.com>',
		description: 'Sender address. It must be on a verified domain that the API key can use.',
		displayOptions: show(['send']),
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		description: 'Recipient address. Separate several addresses with commas.',
		displayOptions: show(['send']),
	},
	{
		displayName: 'Content',
		name: 'content',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Write Subject and Body',
				value: 'custom',
				description: 'Provide the subject, HTML and/or plain text yourself',
			},
			{
				name: 'Use a Template',
				value: 'template',
				description: 'Render a saved OpenSES template with variables',
			},
		],
		default: 'custom',
		displayOptions: show(['send']),
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['email'], operation: ['send'], content: ['custom'] } },
	},
	{
		displayName: 'HTML',
		name: 'html',
		type: 'string',
		typeOptions: { rows: 6 },
		default: '',
		placeholder: '<p>Hello!</p>',
		description: 'HTML body. Provide HTML, plain text, or both.',
		displayOptions: { show: { resource: ['email'], operation: ['send'], content: ['custom'] } },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description: 'Plain-text body. Provide HTML, plain text, or both.',
		displayOptions: { show: { resource: ['email'], operation: ['send'], content: ['custom'] } },
	},
	{
		displayName: 'Template Name or ID',
		name: 'template',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplates' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		hint: 'Template to render. Its subject and body are used.',
		displayOptions: { show: { resource: ['email'], operation: ['send'], content: ['template'] } },
	},
	{
		...nameValueCollection(
			'Variables',
			'variables',
			'Values for the {{placeholders}} in the template',
			'Variable',
		),
		displayOptions: { show: { resource: ['email'], operation: ['send'], content: ['template'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['send']),
		options: [
			{
				displayName: 'Attachments (Binary Properties)',
				name: 'attachments',
				type: 'string',
				default: '',
				placeholder: 'data, invoice',
				description:
					'Names of the binary properties of the input item to attach, separated by commas. Up to 20 files.',
			},
			{
				displayName: 'BCC',
				name: 'bcc',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: 'Blind copy recipients, separated by commas',
			},
			{
				displayName: 'CC',
				name: 'cc',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: 'Copy recipients, separated by commas',
			},
			{
				...nameValueCollection(
					'Headers',
					'headers',
					'Custom email headers, for example List-Unsubscribe',
				),
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'order-1234-receipt',
				description:
					'Unique key for this send. Retrying with the same key returns the original email instead of sending twice.',
			},
			{
				displayName: 'Reply To',
				name: 'replyTo',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: 'Address replies should go to, separated by commas when there are several',
			},
			{
				displayName: 'Scheduled At',
				name: 'scheduledAt',
				type: 'dateTime',
				default: '',
				description:
					'Send the email at this time instead of now. Scheduled emails can be cancelled until they are sent.',
			},
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				default: '',
				placeholder: 'welcome',
				description: 'Label to group and filter emails, for example welcome or invoice',
			},
			{
				...nameValueCollection(
					'Tags',
					'tags',
					'Extra key/value tags stored with the email and sent with its webhook events',
					'Key',
				),
			},
		],
	},

	// ----- get / cancel -----
	{
		displayName: 'Email ID',
		name: 'emailId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the email, as returned by Send or Get Many',
		displayOptions: show(['get', 'cancel']),
	},

	// ----- getAll -----
	...paginationFields('email', 'getAll'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Days',
				name: 'days',
				type: 'number',
				default: 30,
				typeOptions: { minValue: 1, numberPrecision: 0 },
				description: 'Only emails from the last number of days',
			},
			{
				...domainOption,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				hint: 'Only emails from this domain.',
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Text to search in recipients and subjects',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'delivered',
				options: [
					{ name: 'Bounced', value: 'bounced' },
					{ name: 'Canceled', value: 'canceled' },
					{ name: 'Clicked', value: 'clicked' },
					{ name: 'Complained', value: 'complained' },
					{ name: 'Delayed', value: 'delayed' },
					{ name: 'Delivered', value: 'delivered' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Opened', value: 'opened' },
					{ name: 'Rejected', value: 'rejected' },
					{ name: 'Scheduled', value: 'scheduled' },
					{ name: 'Sent', value: 'sent' },
				],
			},
			{
				displayName: 'Tag',
				name: 'tag',
				type: 'string',
				default: '',
				description: 'Only emails sent with this tag',
			},
		],
	},
];
