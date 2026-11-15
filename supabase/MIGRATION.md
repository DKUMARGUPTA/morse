# Supabase Migration Guide — Morse Messenger

Sandbox demo SQLite se Supabase Postgres par jaane ke liye ready-made kit.
Jab aapke paas Supabase project credentials aa jayein, sirf ye steps follow karein (~5 min).

## Aapko kya chahiye (Supabase dashboard se)

| Item | Kahan milega | Kab zaroori |
| --- | --- | --- |
| **Database connection string** | Project Settings → Database → Connection string → URI (port 6543, pooled) | **Zaroori** — yehi `SUPABASE_DATABASE_URL` / `DATABASE_URL` hai |
| Project URL (`https://xyz.supabase.co`) | Project Settings → API | Optional (client SDK features ke liye) |
| `anon` / `service_role` keys | Project Settings → API | Optional (abhi Prisma inhe use nahi karta) |
| DB password | Aapne project banate waqt set kiya tha (Reset kar sakte hain) | Connection string me `YOUR_PASSWORD` replace karne ke liye |

> Connection string me `postgres://postgres:YOUR_PASSWORD@db.xyz.supabase.co:5432/postgres`
> jaisa hoga. Long-running Next.js server ke liye **pooled** (port `6543`) string
> `?pgbouncer=true&connection_limit=10` ke saath recommended hai.

## Step 1 — Env set karein

`.env` me (placeholder apni string se badlein):

```bash
# migration scripts ke liye
SUPABASE_DATABASE_URL="postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres"

# app ka active database (abhi SQLite; Step 4 me isse Supabase karenge)
DATABASE_URL="file:/home/z/my-project/db/custom.db"
```

## Step 2 — Supabase me tables banayein

**Option A (recommended):** Prisma se banwana:

```bash
SUPABASE_DATABASE_URL="postgresql://..." bunx prisma db push --schema prisma/schema.postgres.prisma
```

**Option B (manual):** `supabase/schema.sql` file ko Supabase Dashboard → SQL Editor me paste karke Run karein.

## Step 3 — Demo data copy karein (optional)

Sandbox SQLite ka saara data (users, chats, progress) Postgres me chala jayega:

```bash
bun scripts/migrate-to-supabase.ts
```

Script idempotent hai — purane rows skip hote hain, fail hone par dobara chala sakte hain.

## Step 4 — App ko Supabase par switch karein

1. `.env`: `DATABASE_URL` ko Supabase connection string par point karein.
2. `prisma/schema.prisma`: `provider = "sqlite"` → `provider = "postgresql"`.
   (Sab fields `prisma/schema.postgres.prisma` me pehle se hain — copy karein.)
3. `bunx prisma generate && restart dev server`.

## Notes

- **Realtime**: App ka realtime socket.io mini-service (port 3003) khud chalta hai —
  Supabase Realtime enable karne ki zaroorat NAHI hai. Chahein to baad me usse replace kiya ja sakta hai.
- **E2EE (beta)**: encrypted messages ciphertext ke roop me store hote hain; migration me
  wohi ciphertext copy hota hai — kuch decrypt nahi hota.
- **RLS**: Prisma server-side direct connection use karta hai, is liye RLS policies optional hain.
  Agar Supabase client SDKs (anon key) ko tables expose karna ho, tab RLS enable karke policies likhein.
- **Backups**: Supabase free tier me daily backups milte hain; SQLite file (`db/custom.db`)
  bhi archive karke rakh lein.
