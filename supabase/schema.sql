-- Morse Messenger — Supabase Postgres schema (PRD Section 9 + Phase 2/5 additions)
--
-- TWO WAYS TO CREATE THE TABLES:
--   A) Recommended: let Prisma create them  ->  bunx prisma db push  (after switching provider)
--   B) Manual: paste this file into the Supabase SQL Editor and run it.
--      Then run scripts/migrate-to-supabase.ts to copy the sandbox SQLite data over.

-- ============ users ============
create table if not exists "User" (
  "id"           text primary key,
  "email"        text not null unique,
  "passwordHash" text not null,
  "displayName"  text not null,
  "avatarColor"  text not null default '#22D3EE',
  "tokenVersion" integer not null default 0,
  "publicKey"    text,
  "createdAt"    timestamptz(3) not null default now(),
  "updatedAt"    timestamptz(3) not null default now()
);

-- ============ user settings ============
create table if not exists "UserSettings" (
  "id"               text primary key,
  "userId"           text not null unique references "User"("id") on delete cascade,
  "language"         text not null default 'en',
  "readReceipts"     boolean not null default true,
  "soundEnabled"     boolean not null default true,
  "vibrationEnabled" boolean not null default true,
  "wpm"              integer not null default 12,
  "frequency"        integer not null default 600,
  "volume"           integer not null default 70,
  "updatedAt"        timestamptz(3) not null default now()
);

-- ============ conversations ============
create table if not exists "Conversation" (
  "id"          text primary key,
  "isGroup"     boolean not null default false,
  "name"        text,
  "createdBy"   text,
  "e2eeEnabled" boolean not null default false,
  "createdAt"   timestamptz(3) not null default now(),
  "updatedAt"   timestamptz(3) not null default now()
);

create table if not exists "ConversationMember" (
  "id"             text primary key,
  "conversationId" text not null references "Conversation"("id") on delete cascade,
  "userId"         text not null references "User"("id") on delete cascade,
  "role"           text not null default 'member',
  "pinned"         boolean not null default false,
  "muted"          boolean not null default false,
  "lastReadAt"     timestamptz(3),
  "createdAt"      timestamptz(3) not null default now(),
  unique ("conversationId", "userId")
);
create index if not exists "ConversationMember_userId_idx" on "ConversationMember"("userId");

-- ============ messages ============
create table if not exists "Message" (
  "id"             text primary key,
  "conversationId" text not null references "Conversation"("id") on delete cascade,
  "senderId"       text not null references "User"("id") on delete cascade,
  "kind"           text not null default 'text',
  "text"           text not null,
  "morse"          text,
  "encrypted"      boolean not null default false,
  "sendMode"       text,
  "playMode"       text,
  "replyToId"      text references "Message"("id") on delete set null,
  "createdAt"      timestamptz(3) not null default now(),
  "editedAt"       timestamptz(3)
);
create index if not exists "Message_conversationId_createdAt_idx" on "Message"("conversationId", "createdAt");

create table if not exists "MessageReceipt" (
  "id"          text primary key,
  "messageId"   text not null references "Message"("id") on delete cascade,
  "userId"      text not null references "User"("id") on delete cascade,
  "deliveredAt" timestamptz(3),
  "readAt"      timestamptz(3),
  "hidden"      boolean not null default false,
  unique ("messageId", "userId")
);
create index if not exists "MessageReceipt_userId_idx" on "MessageReceipt"("userId");

-- ============ invitations ============
create table if not exists "Invitation" (
  "id"          text primary key,
  "code"        text not null unique,
  "createdById" text not null references "User"("id") on delete cascade,
  "acceptedById" text,
  "status"      text not null default 'pending',
  "createdAt"   timestamptz(3) not null default now(),
  "expiresAt"   timestamptz(3) not null
);

-- ============ moderation ============
create table if not exists "Block" (
  "id"        text primary key,
  "blockerId" text not null references "User"("id") on delete cascade,
  "blockedId" text not null references "User"("id") on delete cascade,
  "createdAt" timestamptz(3) not null default now(),
  unique ("blockerId", "blockedId")
);

create table if not exists "Report" (
  "id"         text primary key,
  "reporterId" text not null references "User"("id") on delete cascade,
  "reportedId" text not null references "User"("id") on delete cascade,
  "reason"     text not null,
  "createdAt"  timestamptz(3) not null default now()
);

-- ============ learning ============
create table if not exists "LearningProgress" (
  "id"              text primary key,
  "userId"          text not null references "User"("id") on delete cascade,
  "character"       text not null,
  "correct"         integer not null default 0,
  "wrong"           integer not null default 0,
  "lastPracticedAt" timestamptz(3),
  unique ("userId", "character")
);

create table if not exists "DailyPractice" (
  "id"     text primary key,
  "userId" text not null references "User"("id") on delete cascade,
  "date"   text not null,
  "count"  integer not null default 0,
  unique ("userId", "date")
);
