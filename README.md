# =========================
# Supabase
# =========================
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx

# =========================
# Admin login (tuỳ bạn)
# =========================
ADMIN_USER=admin
ADMIN_PASS=admin123

# =========================
# Gmail (Resend)
# =========================
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev

# =========================
# NexiLink (QUAN TRỌNG)
# =========================

# Base URL (sandbox hoặc production)
NEXLINK_API_BASE_URL=https://sandbox-hea.nexlink2.jp

# Có thể khai báo nhiều API path (thử lần lượt)
NEXLINK_API_PATHS=/api/v1/facsimiles/direct_send,/api/v1/facsimile/direct_send,/api/v1/direct_send

# Hoặc khai báo tách riêng từng key (optional)
NEXLINK_API_PATH_DIRECT_SEND=/api/v1/facsimiles/direct_send
NEXLINK_API_PATH_FACSIMILE_DIRECT_SEND=/api/v1/facsimile/direct_send
NEXLINK_API_PATH_FACSIMILES_DIRECT_SEND=/api/v1/facsimiles/direct_send

# API TOKEN (không phải password login)
NEXLINK_API_TOKEN=xxxxxxxxxxxxxxxx

# Optional (nếu hợp đồng có)
NEXILINK_SENDER_ID=

# =========================
# Auth type (QUAN TRỌNG để hết lỗi 401)
# =========================
# NexiLink yêu cầu:
# Authorization: token YOUR_API_TOKEN
NEXLINK_AUTH_SCHEME=token
# =========================
# Microsoft Entra ID Login
# =========================
AUTH_SECRET=replace-with-random-secret
AUTH_MICROSOFT_ENTRA_ID_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AUTH_MICROSOFT_ENTRA_ID_SECRET=xxxxxxxxxxxxxxxxxxxx
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# Optional: only allow email in this domain (without @)
AUTH_ALLOWED_EMAIL_DOMAIN=yourcompany.co.j
