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
