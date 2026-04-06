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
NEXILINK_FAX_ENDPOINT=https://api.nexilink.example/v1/faxes
NEXILINK_API_KEY=your_nexilink_api_key
NEXILINK_SENDER_ID=optional_sender_id
```

`NEXILINK_SENDER_ID` is optional and depends on your NexiLink contract.
