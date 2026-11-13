import type { INodeProperties } from 'n8n-workflow';

/** Return All + Limit pair for one list operation. */
export function paginationFields(
	resource: string,
	operation: string,
	maxLimitHint?: string,
): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: [operation] } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			default: 50,
			typeOptions: { minValue: 1, numberPrecision: 0 },
			description: 'Max number of results to return',
			hint: maxLimitHint,
			displayOptions: {
				show: { resource: [resource], operation: [operation], returnAll: [false] },
			},
		},
	];
}

/** A domain picker for filters and optional writes. Values are domain names. */
export const domainOption: INodeProperties = {
	displayName: 'Domain Name or ID',
	name: 'domain',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getDomains' },
	default: '',
	description:
		'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	hint: 'Domain to work with. Leave unset when the API key can use only one domain.',
};

export const nameValueCollection = (
	displayName: string,
	name: string,
	description: string,
	nameLabel = 'Name',
): INodeProperties => ({
	displayName,
	name,
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	default: {},
	placeholder: `Add ${displayName.replace(/s$/, '')}`,
	description,
	options: [
		{
			displayName: displayName.replace(/s$/, ''),
			name: 'values',
			values: [
				{
					displayName: nameLabel,
					name: 'name',
					type: 'string',
					default: '',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
				},
			],
		},
	],
});
