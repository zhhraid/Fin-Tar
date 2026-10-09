-- =============================================================================
-- FinTar database (Supabase / PostgreSQL)
--
-- Jalankan sekali di Supabase Dashboard > SQL Editor > New query > Run.
-- Aman dijalankan ulang.
--
-- Aturan keamanan: setiap tabel memakai Row Level Security (RLS), jadi pengguna
-- hanya bisa membaca dan mengubah baris miliknya sendiri. Identitas selalu diambil
-- dari sesi login (auth.uid()), tidak pernah dari nilai yang dikirim aplikasi.
-- =============================================================================

-- 1. Usaha: satu baris per akun
create table if not exists public.businesses (
    id            uuid primary key default gen_random_uuid(),
    owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name          text not null check (char_length(name) between 1 and 80),
    category      text not null default 'Lainnya' check (char_length(category) <= 80),
    opening_cash  numeric(15, 0) not null default 0 check (opening_cash >= 0),
    inventory     numeric(15, 0) not null default 0 check (inventory >= 0),
    equipment     numeric(15, 0) not null default 0 check (equipment >= 0),
    target_pct    numeric(6, 2) check (target_pct > 0),
    target_amount numeric(15, 0) check (target_amount > 0),
    created_at    timestamptz not null default now(),
    unique (owner_id)
);

-- 2. Transaksi pemasukan dan pengeluaran
create table if not exists public.transactions (
    id          uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    type        text not null check (type in ('income', 'expense')),
    amount      numeric(15, 0) not null check (amount > 0),
    category    text not null check (char_length(category) <= 80),
    description text not null check (char_length(description) <= 200),
    date        timestamptz not null default now(),
    source      text not null default 'manual' check (source in ('manual', 'scan', 'csv')),
    created_at  timestamptz not null default now()
);
create index if not exists idx_transactions_business_date on public.transactions (business_id, date desc);

-- 3. Utang ke pemasok
create table if not exists public.debts (
    id          uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    supplier    text not null check (char_length(supplier) <= 200),
    amount      numeric(15, 0) not null check (amount > 0),
    due_date    date not null,
    status      text not null default 'unpaid' check (status in ('unpaid', 'paid')),
    created_at  timestamptz not null default now()
);
create index if not exists idx_debts_business on public.debts (business_id);

-- 4. Belanja terjadwal
create table if not exists public.scheduled_expenses (
    id          uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses (id) on delete cascade,
    label       text not null check (char_length(label) <= 200),
    amount      numeric(15, 0) not null check (amount > 0),
    date        date not null,
    done        boolean not null default false,
    created_at  timestamptz not null default now()
);
create index if not exists idx_scheduled_expenses_business on public.scheduled_expenses (business_id);

-- 5. Proposal modal (simulasi: tidak dikirim ke lembaga sungguhan)
create table if not exists public.proposals (
    id           uuid primary key default gen_random_uuid(),
    business_id  uuid not null references public.businesses (id) on delete cascade,
    lender       text not null check (char_length(lender) <= 200),
    amount       numeric(15, 0) not null check (amount > 0),
    purpose      text not null check (char_length(purpose) <= 200),
    tenor        int not null check (tenor > 0),
    installment  numeric(15, 0) not null check (installment > 0),
    status       text not null default 'submitted_sandbox' check (status in ('draft', 'submitted_sandbox')),
    submitted_at timestamptz not null default now()
);
create index if not exists idx_proposals_business on public.proposals (business_id);

-- 6. Izin pemrosesan AI: hanya bisa ditambah. Mencabut izin = baris baru dengan granted = false.
create table if not exists public.consents (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
    type      text not null check (type in ('ai_processing')),
    granted   boolean not null,
    timestamp timestamptz not null default now()
);
create index if not exists idx_consents_user on public.consents (user_id, type, timestamp desc);

-- 7. Log aktivitas: hanya bisa ditambah, tidak bisa diubah atau dihapus oleh pengguna.
create table if not exists public.agent_actions (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
    tool      text not null check (char_length(tool) <= 100),
    input     jsonb not null default '{}'::jsonb,
    output    jsonb not null default '{}'::jsonb,
    tier      text not null check (tier in ('T0', 'T1', 'T2', 'T3')),
    status    text not null default 'completed' check (status in ('completed', 'approved', 'rejected', 'blocked')),
    timestamp timestamptz not null default now()
);
create index if not exists idx_agent_actions_user on public.agent_actions (user_id, timestamp desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.businesses         enable row level security;
alter table public.transactions       enable row level security;
alter table public.debts              enable row level security;
alter table public.scheduled_expenses enable row level security;
alter table public.proposals          enable row level security;
alter table public.consents           enable row level security;
alter table public.agent_actions      enable row level security;

-- Hanya pengguna yang sudah login yang punya akses; pengunjung anonim tidak.
revoke all on public.businesses, public.transactions, public.debts, public.scheduled_expenses,
              public.proposals, public.consents, public.agent_actions from anon;
grant select, insert, update, delete on public.businesses, public.transactions, public.debts,
              public.scheduled_expenses, public.proposals to authenticated;
grant select, insert on public.consents, public.agent_actions to authenticated;

drop policy if exists "pemilik mengelola usahanya" on public.businesses;
create policy "pemilik mengelola usahanya" on public.businesses
    for all to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

-- Tabel di bawah ini milik sebuah usaha; aksesnya mengikuti kepemilikan usaha itu.
drop policy if exists "pemilik mengelola transaksinya" on public.transactions;
create policy "pemilik mengelola transaksinya" on public.transactions
    for all to authenticated
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "pemilik mengelola utangnya" on public.debts;
create policy "pemilik mengelola utangnya" on public.debts
    for all to authenticated
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "pemilik mengelola belanja terjadwalnya" on public.scheduled_expenses;
create policy "pemilik mengelola belanja terjadwalnya" on public.scheduled_expenses
    for all to authenticated
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "pemilik mengelola proposalnya" on public.proposals;
create policy "pemilik mengelola proposalnya" on public.proposals
    for all to authenticated
    using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
    with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "pengguna melihat izinnya" on public.consents;
create policy "pengguna melihat izinnya" on public.consents
    for select to authenticated using (user_id = auth.uid());
drop policy if exists "pengguna mencatat izinnya" on public.consents;
create policy "pengguna mencatat izinnya" on public.consents
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "pengguna melihat log aktivitasnya" on public.agent_actions;
create policy "pengguna melihat log aktivitasnya" on public.agent_actions
    for select to authenticated using (user_id = auth.uid());
drop policy if exists "pengguna menambah log aktivitasnya" on public.agent_actions;
create policy "pengguna menambah log aktivitasnya" on public.agent_actions
    for insert to authenticated with check (user_id = auth.uid());

-- =============================================================================
-- Hak hapus data (UU PDP No. 27/2022)
-- Menghapus semua baris milik pemanggil. Tidak menerima parameter: yang dihapus
-- selalu data akun yang sedang login, jadi tidak bisa dipakai untuk menghapus
-- data orang lain. Berjalan sebagai pemilik fungsi karena izin dan log aktivitas
-- tidak punya aturan hapus untuk pengguna biasa.
-- =============================================================================
create or replace function public.delete_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Harus login untuk menghapus data';
    end if;
    delete from public.businesses    where owner_id = auth.uid(); -- transaksi, utang, belanja, proposal ikut terhapus
    delete from public.consents      where user_id = auth.uid();
    delete from public.agent_actions where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
