import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'openSesApi';
export const DEFAULT_BASE_URL = 'https://api.openses.email';

export type OpenSesContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

export interface RequestOptions {
	qs?: IDataObject;
	body?: IDataObject;
	headers?: Record<string, string>;
}

/**
 * Turns the credential's base URL into an API root without a trailing slash or `/v1`.
 * Returns undefined when the value is not an http(s) URL.
 */
export function normalizeBaseUrl(value: unknown): string | undefined {
	const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_BASE_URL;
	const base = raw.replace(/\/+$/, '').replace(/\/v1$/, '');
	if (!/^https?:\/\/[^/?#\s]+(\/[^?#\s]*)?$/i.test(base)) return undefined;
	return base;
}

/** Encodes one path segment (an ID or an email address). */
export function segment(value: unknown, label: string): string {
	const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
	if (!text) throw new Error(`${label} is required`);
	return encodeURIComponent(text);
}

function compact(values: IDataObject | undefined): IDataObject | undefined {
	if (!values) return undefined;
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined || value === '') continue;
		result[key] = value;
	}
	return Object.keys(result).length ? result : undefined;
}

interface ApiErrorBody {
	error?: { code?: string; message?: string } | string;
	message?: string;
}

function describeFailure(status: number, body: unknown): { code: string; message: string } {
	let code = '';
	let message = '';
	if (body && typeof body === 'object') {
		const { error, message: topMessage } = body as ApiErrorBody;
		if (error && typeof error === 'object') {
			code = typeof error.code === 'string' ? error.code : '';
			message = typeof error.message === 'string' ? error.message : '';
		} else if (typeof error === 'string') {
			message = error;
		}
		if (!message && typeof topMessage === 'string') message = topMessage;
	}
	if (!message) {
		const defaults: Record<number, string> = {
			400: 'The request was rejected as invalid',
			401: 'The API key is invalid or has been revoked',
			403: 'The API key does not have access to this action',
			404: 'The requested item was not found',
			409: 'The request conflicts with the current state of the item',
			429: 'Too many requests. Slow down and try again',
		};
		message = defaults[status] ?? `The OpenSES API answered with HTTP ${status}`;
	}
	return { code, message };
}

const HINTS: Record<string, string> = {
	domain_limited_key:
		'This API key is limited to one domain. Use an account-wide key for suppressions and webhooks.',
	domain_required:
		'The API key can use several domains. Set the Domain field to choose one of them.',
	domain_not_allowed: 'The From address must be on a domain this API key can use.',
};

/** Makes one authenticated request to the OpenSES REST API and returns the parsed JSON body. */
export async function openSesRequest(
	this: OpenSesContext,
	method: IHttpRequestMethods,
	path: string,
	options: RequestOptions = {},
	itemIndex?: number,
): Promise<IDataObject | undefined> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const base = normalizeBaseUrl(credentials.baseUrl);
	if (!base)
		throw new NodeOperationError(
			this.getNode(),
			'The Base URL in the OpenSES credential must be an https:// URL, for example https://api.openses.email',
			{ itemIndex },
		);
	const request: IHttpRequestOptions = {
		method,
		url: `${base}/v1${path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		disableFollowRedirect: true,
		timeout: 60000,
		headers: { Accept: 'application/json', ...(options.headers ?? {}) },
	};
	const qs = compact(options.qs);
	if (qs) request.qs = qs;
	if (options.body !== undefined) request.body = options.body;

	let response: { statusCode?: number; body?: unknown };
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_NAME,
			request,
		)) as { statusCode?: number; body?: unknown };
	} catch (error) {
		const failure = error as { message?: string; code?: string };
		throw new NodeApiError(
			this.getNode(),
			{ message: failure.message ?? 'Request failed', code: failure.code ?? '' } as JsonObject,
			{
				message: 'Could not reach the OpenSES API',
				description:
					`Check the Base URL in the OpenSES credential (${base}). ${failure.message ?? ''}`.trim(),
				itemIndex,
			},
		);
	}

	const status = Number(response?.statusCode ?? 200);
	let body: unknown = response?.body;
	if (typeof body === 'string' && body.trim()) {
		try {
			body = JSON.parse(body);
		} catch {
			if (status < 400)
				throw new NodeOperationError(this.getNode(), 'The OpenSES API returned invalid JSON', {
					itemIndex,
				});
		}
	}

	if (status >= 400) {
		const { code, message } = describeFailure(status, body);
		const hint = HINTS[code];
		throw new NodeApiError(this.getNode(), { error: { code, message } } as JsonObject, {
			message,
			description: [`HTTP ${status}${code ? ` (${code})` : ''}`, hint].filter(Boolean).join('. '),
			httpCode: String(status),
			itemIndex,
		});
	}
	if (status === 204 || body === undefined || body === null || body === '') return undefined;
	if (typeof body !== 'object')
		throw new NodeOperationError(
			this.getNode(),
			'The OpenSES API returned an unexpected response',
			{
				itemIndex,
			},
		);
	return body as IDataObject;
}

function listFrom(this: OpenSesContext, body: IDataObject | undefined, itemIndex?: number) {
	const data = body?.data;
	if (!Array.isArray(data))
		throw new NodeOperationError(this.getNode(), 'The OpenSES API returned an invalid list', {
			itemIndex,
		});
	return data as IDataObject[];
}

const MAX_PAGES = 10000;

/** Lists that return everything in one response. Limit is applied locally. */
export async function openSesFullList(
	this: OpenSesContext,
	path: string,
	qs: IDataObject,
	returnAll: boolean,
	limit: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const items = listFrom.call(
		this,
		await openSesRequest.call(this, 'GET', path, { qs }, itemIndex),
		itemIndex,
	);
	return returnAll ? items : items.slice(0, limit);
}

/** Lists paged with `page` and `limit`, answering `{ data, total, page, limit }`. */
export async function openSesPagedList(
	this: OpenSesContext,
	path: string,
	qs: IDataObject,
	returnAll: boolean,
	limit: number,
	maxPageSize: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const pageSize = returnAll ? maxPageSize : Math.min(Math.max(1, limit), maxPageSize);
	const collected: IDataObject[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const body = await openSesRequest.call(
			this,
			'GET',
			path,
			{ qs: { ...qs, page, limit: pageSize } },
			itemIndex,
		);
		const items = listFrom.call(this, body, itemIndex);
		collected.push(...items);
		if (!returnAll && collected.length >= limit) return collected.slice(0, limit);
		const served = Number(body?.limit) > 0 ? Number(body?.limit) : pageSize;
		const total = Number(body?.total);
		if (items.length === 0 || items.length < served) break;
		if (Number.isFinite(total) && page * served >= total) break;
	}
	return collected;
}

/** Lists paged with `offset` and `limit`, answering `{ data, next_offset }`. */
export async function openSesOffsetList(
	this: OpenSesContext,
	path: string,
	qs: IDataObject,
	returnAll: boolean,
	limit: number,
	maxPageSize: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const pageSize = returnAll ? maxPageSize : Math.min(Math.max(1, limit), maxPageSize);
	const collected: IDataObject[] = [];
	let offset = 0;
	for (let round = 0; round < MAX_PAGES; round++) {
		const body = await openSesRequest.call(
			this,
			'GET',
			path,
			{ qs: { ...qs, offset, limit: pageSize } },
			itemIndex,
		);
		collected.push(...listFrom.call(this, body, itemIndex));
		if (!returnAll && collected.length >= limit) return collected.slice(0, limit);
		const next = body?.next_offset;
		if (next === undefined || next === null || next === '') break;
		const nextOffset = Number(next);
		if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset)
			throw new NodeOperationError(
				this.getNode(),
				'The OpenSES API returned an invalid next_offset',
				{
					itemIndex,
				},
			);
		offset = nextOffset;
	}
	return collected;
}

/** Splits a comma or semicolon separated address list, keeping quoted display names intact. */
export function splitAddresses(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
	if (typeof value !== 'string') return [];
	const result: string[] = [];
	let current = '';
	let quoted = false;
	let angle = false;
	for (const char of value) {
		if (char === '"') quoted = !quoted;
		else if (char === '<' && !quoted) angle = true;
		else if (char === '>' && !quoted) angle = false;
		if ((char === ',' || char === ';') && !quoted && !angle) {
			if (current.trim()) result.push(current.trim());
			current = '';
		} else current += char;
	}
	if (current.trim()) result.push(current.trim());
	return result;
}

/** Converts an n8n fixed collection of name/value pairs into a plain object. */
export function pairsToObject(collection: unknown, key = 'values'): IDataObject | undefined {
	const entries = (collection as IDataObject | undefined)?.[key];
	if (!Array.isArray(entries)) return undefined;
	const result: IDataObject = {};
	for (const entry of entries as IDataObject[]) {
		const name = String(entry.name ?? '').trim();
		if (name) result[name] = String(entry.value ?? '');
	}
	return Object.keys(result).length ? result : undefined;
}
