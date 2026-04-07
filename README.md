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
NEXLINK_API_PATH=/api/v1/facsimiles
NEXLINK_API_TOKEN=
```

`NEXILINK_SENDER_ID` is optional and depends on your NexiLink contract.

For backward compatibility, `NEXILINK_FAX_ENDPOINT` and `NEXILINK_API_KEY` are also accepted.
### サンプルコード

```bash
curl "https://sandbox-hea.nexlink2.jp/api/v1/facsimiles" \
  -d '{"delivery_name":"年末年始のご挨拶","contact_list_id":67,"notice_mail_addresses":["company@example.com","user2@example.com"],"exclusion_contact_list_ids":[34],"use_print_header":true,"print_headers":["1行目: {{会社名}}","2行目: {{FAX}}","3行目: {{部署}}","4行目: {{姓}}{{名}}"],"honorific":2,"print_line_page":1,"print_line_type":1,"fax_quality":0,"fax_speed":1,"allow_excess_print_contact":false,"allow_international_fax":true,"allow_duplicate_fax_numbers":false,"bill_split_code":"A_000000-a"}' \
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
  "delivery_name": "年末年始のご挨拶",
  "contact_list_id": 67,
  "notice_mail_addresses": [
    "company@example.com",
    "user2@example.com"
  ],
  "exclusion_contact_list_ids": [
    34
  ],
  "use_print_header": true,
  "print_headers": [
    "1行目: {{会社名}}",
    "2行目: {{FAX}}",
    "3行目: {{部署}}",
    "4行目: {{姓}}{{名}}"
  ],
  "honorific": 2,
  "print_line_page": 1,
  "print_line_type": 1,
  "fax_quality": 0,
  "fax_speed": 1,
  "allow_excess_print_contact": false,
  "allow_international_fax": true,
  "allow_duplicate_fax_numbers": false,
  "bill_split_code": "A_000000-a"
}
