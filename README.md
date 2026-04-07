# Fax Mail System

## Supabase setup for production

1. Create a Supabase project.
2. Run SQL in `supabase/schema.sql` in Supabase SQL editor.
3. Add environment variables from `.env.example`.
4. Start app:

```bash
npm run dev
```

## Admin flow test checklist

1. Login as admin (`admin` / `admin123`).
2. Open `/admin`.
3. Create a new account.
4. Update account name/id/password.
5. Delete account.
6. Login with updated account credentials to verify password hashing works.
 
## Gmail sending with Resend

Set these environment variables before running the app:

```bash
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev
```

`RESEND_FROM_EMAIL` must be a verified sender in your Resend account.

## Fax sending with NexiLink

Set these environment variables before running the app:

```bash

NEXLINK_API_BASE_URL=https://sandbox-hea.nexlink2.jp
NEXLINK_API_PATH=/api/v1/facsimiles/direct_send
NEXLINK_API_TOKEN=
```

`NEXILINK_SENDER_ID` is optional and depends on your NexiLink contract.

For backward compatibility, `NEXILINK_FAX_ENDPOINT` and `NEXILINK_API_KEY` are also accepted.
`NEXLINK_API_PATH` に `/api/v1/facsimiles`（配信リスト用）を指定すると `contact_list_id` エラーになるため、直接送信用エンドポイントを指定してください。

### サンプルコード

```bash
curl "https://sandbox-hea.nexlink2.jp/api/v1/facsimiles/direct_send" \
  -d '{"to":"0312345678","subject":"FAX Mail System からの送信テスト","text":"FAX Mail System からの送信テストです。","html":"<p>FAX Mail System からの送信テストです。</p>"}' \
  -X POST \
  -H "Accept: application/json" \
  -H "Authorization: token YOUR_API_TOKEN" \
  -H "Content-Type: application/json"
```

### ヘッダ

```text
Authorization: token YOUR_API_TOKEN
Content-Type: application/json
Host: sandbox-hea.nexlink2.jp
```

### ボディ

```json
{
  "to": "0312345678",
  "subject": "FAX Mail System からの送信テスト",
  "text": "FAX Mail System からの送信テストです。",
  "html": "<p>FAX Mail System からの送信テストです。</p>"
}
