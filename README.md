# n8n-nodes-openses

n8n community nodes for [OpenSES](https://openses.email), the open-source email platform that runs on your own Amazon SES account. Send transactional email, manage contacts, sequences, suppressions and shared inboxes, and start workflows when mail arrives or a sent email bounces, is opened or clicked.

The package contains:

- **OpenSES**: an action node for the OpenSES REST API. It can also be used as a tool by AI Agent nodes.
- **OpenSES Trigger**: a webhook trigger that registers itself with OpenSES, verifies every delivery's signature and starts the workflow.

Both call the native REST API (`https://api.openses.email/v1`) with an API key. Nothing goes through MCP.

## Installation

In n8n, open **Settings → Community Nodes → Install**, enter `n8n-nodes-openses` and confirm. Self-hosted instances can also run `npm install n8n-nodes-openses` in `~/.n8n/nodes` and restart n8n. See the [n8n community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/) for details.

## Credentials

1. In the [OpenSES dashboard](https://app.openses.email), open **API & MCP** and create an API key. Copy it right away; it is shown only once.
2. In n8n, create an **OpenSES API** credential and paste the key into **API Key**.
3. Leave **Base URL** as `https://api.openses.email` unless you self-host OpenSES. For a self-hosted install, enter the root of your API without `/v1`, for example `https://mail.example.com/api`. A trailing `/v1` is removed automatically.

Saving the credential calls `GET /v1/domains` to check the key.

### Access levels

Each key has one access level. Pick the narrowest one that covers your workflow.

| Access   | Allows                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Read** | Every Get and Get Many operation                                                                                                   |
| **Send** | Read, plus Send and Cancel email, Create or Update and Unsubscribe contact, Enroll and Stop sequence, Reply to and Update thread   |
| **Full** | Everything, including Delete contact, Add and Remove suppression, and the **OpenSES Trigger** (creating webhooks needs a Full key) |

### Domain-limited keys

A key can be limited to one domain and its aliases. Such a key only sees and changes that domain's emails, contacts, templates, sequences and inboxes; anything else answers "not found". Suppressions and webhooks are account-wide, so the **Suppression** resource and the **OpenSES Trigger** need a key that is not domain-limited.

When a key can use several domains, operations that write to one domain (for example Contact → Create or Update) need the **Domain** field. If you leave it empty the API answers `domain_required` and lists the choices.

## Operations

Choose a **Resource**, then an **Operation**. List operations ("Get Many") have **Return All**, or a **Limit** (default 50); the node follows the API's pages for you and returns one n8n item per record.

| Resource        | Operation        | What it does                                                                                                                                                                                                      |
| --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Email**       | Send             | Send now or at **Scheduled At**. From, To, CC, BCC, Reply To, subject with HTML and/or text, or a saved **template** with variables. Tag and key/value tags, custom headers, idempotency key, binary attachments. |
|                 | Get              | One email with its delivery events                                                                                                                                                                                |
|                 | Get Many         | Filter by domain, status, tag, search text and number of days                                                                                                                                                     |
|                 | Cancel           | Cancel a scheduled email (the API answers 409 for an email that is not scheduled)                                                                                                                                 |
| **Contact**     | Create or Update | Upsert by email address with name, company, custom properties and topics. The output is the contact plus `created: true/false`                                                                                    |
|                 | Get              | One contact with topics and sequences                                                                                                                                                                             |
|                 | Get Many         | Filter by domain, search text, topic and subscription state                                                                                                                                                       |
|                 | Unsubscribe      | Unsubscribe from all topics                                                                                                                                                                                       |
|                 | Delete           | Permanently delete the contact                                                                                                                                                                                    |
| **Topic**       | Get Many         | Subscription topics with subscriber counts                                                                                                                                                                        |
| **Template**    | Get Many / Get   | Saved templates; Get adds the HTML and text                                                                                                                                                                       |
| **Sequence**    | Get Many         | Sequences with status and enrollment counts                                                                                                                                                                       |
|                 | Enroll Contact   | By email (creates the contact if needed, with optional name and properties) or by contact ID                                                                                                                      |
|                 | Stop for Contact | By email or contact ID                                                                                                                                                                                            |
| **Suppression** | Get Many         | Filter by reason (bounce, complaint, manual) and search text                                                                                                                                                      |
|                 | Add / Remove     | Block an address, or allow it again                                                                                                                                                                               |
| **Inbox**       | Get Many         | Shared inboxes with unread counts                                                                                                                                                                                 |
| **Thread**      | Get Many         | Conversations, filtered by domain, inbox, search text, unread and archived                                                                                                                                        |
|                 | Get              | A conversation with every message and attachment link (does not mark it read)                                                                                                                                     |
|                 | Reply            | Send a text (and optional HTML) reply from the inbox. This sends a real email                                                                                                                                     |
|                 | Update           | Mark read or unread, archive or unarchive, set a label (an empty label removes it)                                                                                                                                |
| **Domain**      | Get Many         | Sending domains and aliases the key can use, with status and region                                                                                                                                               |

Dropdowns for domains, templates, sequences, inboxes and topics are loaded from your account. Every dropdown also accepts an ID through an expression.

### Sending tips

- Separate several recipients with commas. Display names are fine: `"Doe, Jane" <jane@example.com>`.
- **Attachments (Binary Properties)** takes the names of binary properties on the incoming item, for example `data` from a Read Binary File or HTTP Request node. Up to 20 files.
- Set an **Idempotency Key** (for example an order ID) when a workflow may retry. A repeated key returns the original email instead of sending a second one.
- Give **Scheduled At** a timezone offset (for example `2026-12-01T09:00:00+01:00`) so the time does not depend on the n8n server's timezone.

### Errors

When the API rejects a request, the node fails with the API's own `error.message`, and the details show the HTTP status and error code, for example `HTTP 403 (domain_limited_key)`. With **Settings → On Error → Continue** the node instead outputs `{ "error", "details", "status" }` for that item and carries on with the next one.

## OpenSES Trigger

1. Add **OpenSES Trigger** and select a credential with a **Full** access key that is not domain-limited.
2. Choose the **Events**. Use **Email Received (Inbound Mail)** (`email.received`) to react to mail arriving in your OpenSES inboxes. The other events follow emails you sent: `email.sent`, `email.delivered`, `email.delayed`, `email.bounced`, `email.complained`, `email.rejected`, `email.failed`, `email.opened`, `email.clicked` and `email.subscription`.
3. Activate the workflow (or click **Listen for test event**).

On activation the node creates a webhook in OpenSES pointing at the n8n webhook URL and keeps its ID and signing secret in the workflow's static data. It checks the webhook still exists on later activations and replaces it if the URL or events changed. Deactivating the workflow deletes that webhook. Webhooks created by other tools are never touched.

OpenSES delivers webhooks only to **HTTPS** URLs, so n8n must be reachable from the internet over HTTPS (set `WEBHOOK_URL` on self-hosted n8n). A `localhost` instance needs a tunnel.

### Signature verification

Every delivery carries `x-openses-signature: t=<unix seconds>,v1=<hex>`. The trigger computes HMAC-SHA256 of `<t>.<raw body>` with the stored secret, compares it in constant time and refuses (HTTP 401) deliveries with a missing or wrong signature, or a timestamp more than 5 minutes from the n8n server's clock. Rejected deliveries never start the workflow. Keep the n8n server clock in sync (NTP).

### Output

The workflow receives the delivery as one item:

```json
{
	"type": "email.received",
	"created_at": "2026-11-12T10:00:00.000Z",
	"data": {
		"message_id": "…",
		"thread_id": "…",
		"inbox_id": "…",
		"from": "ada@example.com",
		"from_name": "Ada",
		"to": ["support@yourdomain.com"],
		"subject": "Question about my order",
		"text": "…",
		"html": "…",
		"attachments": [
			{ "filename": "photo.jpg", "size": 48213, "content_type": "image/jpeg", "url": "…" }
		],
		"raw_url": "…",
		"received_at": "…"
	}
}
```

Attachment and raw message URLs expire after 10 minutes; download them in the same workflow if you need them. Events about sent emails carry `email_id, domain_id, region, from, to, cc, subject, tags, message_id, source, source_ref, sent_at, detail`.

## Example workflows

Import any of these from [`examples/`](examples) with **Workflows → Import from File**, then select your OpenSES credential on each OpenSES node.

| File                                                                                          | What it does                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`auto-acknowledge-inbound-mail.json`](examples/auto-acknowledge-inbound-mail.json)           | OpenSES Trigger on `email.received` → IF (skip no-reply senders) → Thread Reply with a short acknowledgement in the same conversation                |
| [`add-contact-and-enroll-in-sequence.json`](examples/add-contact-and-enroll-in-sequence.json) | Webhook (signup form) → Contact Create or Update with a `plan` property → Sequence Enroll Contact by contact ID. Pick your sequence in the last node |
| [`slack-alert-on-bounce.json`](examples/slack-alert-on-bounce.json)                           | OpenSES Trigger on `email.bounced` and `email.complained` → HTTP Request to a Slack incoming webhook. Replace the placeholder URL with your own      |

## Compatibility

- Built with `@n8n/node-cli` 0.51 in strict mode and tested against `n8n-workflow` 2.42. Uses n8n nodes API version 1.
- No runtime dependencies; works on n8n Cloud and self-hosted n8n with community nodes enabled.
- Works with OpenSES Cloud and self-hosted OpenSES (set the Base URL).

## Development

```bash
npm install
npm run build      # compile to dist/
npm run lint       # n8n node linter + ESLint, zero warnings
npm test           # build, then runtime tests with a mocked HTTP helper
npm run review     # Prettier check, lint and the n8n community package scanner
```

## Links

- [OpenSES](https://openses.email) · [Dashboard](https://app.openses.email) · API `https://api.openses.email`
- [Source and issues](https://github.com/openses-email/n8n-nodes-openses)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)
