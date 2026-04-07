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

# ⚠️ PHẢI là direct_send (không được dùng /facsimiles)
NEXLINK_API_PATH=/api/v1/facsimiles/direct_send

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
