import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class OpenSesApi implements ICredentialType {
	name = 'openSesApi';

	displayName = 'OpenSES API';

	documentationUrl = 'https://github.com/openses-email/n8n-nodes-openses#credentials';

	icon: Icon = { light: 'file:openses.svg', dark: 'file:openses.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in the OpenSES dashboard under API & MCP. Use a Full access key for webhooks, suppressions and deletes, a Send key to send and update, or a Read key for lookups only.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.openses.email',
			required: true,
			placeholder: 'https://api.openses.email',
			description:
				'Root URL of the OpenSES API without /v1. Change it only if you self-host OpenSES, for example https://mail.example.com/api.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.trim().replace(/\\/+$/, "").replace(/\\/v1$/, "")}}',
			url: '/v1/domains',
			method: 'GET',
		},
	};
}
