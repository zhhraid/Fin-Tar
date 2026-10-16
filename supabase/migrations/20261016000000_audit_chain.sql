-- =============================================================================
-- FinTar: log aktivitas berantai hash (tamper-evident)
--
-- Jalankan sekali di Supabase SQL Editor setelah 20261009000000_fintar.sql.
-- Aman dijalankan ulang.
--
-- Cara kerjanya:
--   - Setiap baris log menyimpan hash SHA-256 dari isinya sendiri ditambah hash baris
--     sebelumnya milik pengguna yang sama (prev_hash). Baris pertama menyambung ke 'GENESIS'.
--   - Hash, posisi rantai, dan waktu diisi oleh database, bukan oleh aplikasi, jadi
--     pengguna tidak bisa memundurkan waktu atau menyisipkan baris di tengah rantai.
--   - Baris log tidak bisa diubah atau dihapus, termasuk lewat kunci service_role,
--     kecuali oleh delete_my_data() dan penghapusan akun (cascade).
--   - verify_my_activity_log() menghitung ulang seluruh rantai. Bila ada baris yang
--     diubah, dihapus dari tengah, atau disisipkan, rantainya putus dan ketahuan.
--
-- Batasan: pemilik database yang mematikan trigger lalu menghitung ulang semua hash tetap
-- bisa menulis ulang riwayat. Hash terakhir yang ikut di file ekspor log menjadi patokan
-- untuk membuktikan hal itu.
-- =============================================================================

alter table public.agent_actions add column if not exists chain_pos bigint;
alter table public.agent_actions add column if not exists prev_hash text;
alter table public.agent_actions add column if not exists hash      text;

-- Isi yang di-hash. jsonb::text selalu berurutan kunci yang sama, jadi hasilnya stabil.
create or replace function public.agent_action_hash(r public.agent_actions)
returns text
language sql
immutable
set search_path = public
as $$
    select encode(sha256(convert_to(concat_ws('|',
        r.prev_hash,
        r.chain_pos::text,
        r.id::text,
        r.user_id::text,
        r.tool,
        r.tier,
        r.status,
        r.input::text,
        r.output::text,
        to_char(r.timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ), 'UTF8')), 'hex');
$$;

-- -----------------------------------------------------------------------------
-- Isi rantai untuk baris yang sudah ada (urut waktu per pengguna).
-- Harus berjalan sebelum trigger "tidak bisa diubah" dipasang.
-- -----------------------------------------------------------------------------
drop trigger if exists agent_actions_immutable on public.agent_actions;

do $$
declare
    r    public.agent_actions%rowtype;
    who  uuid;
    prev text;
    pos  bigint;
begin
    for r in select * from public.agent_actions where hash is null order by user_id, timestamp, id loop
        if who is distinct from r.user_id then
            who := r.user_id;
            select a.hash, a.chain_pos into prev, pos
              from public.agent_actions a
             where a.user_id = r.user_id and a.hash is not null
             order by a.chain_pos desc limit 1;
            prev := coalesce(prev, 'GENESIS');
            pos := coalesce(pos, 0);
        end if;
        pos := pos + 1;
        r.chain_pos := pos;
        r.prev_hash := prev;
        r.hash := public.agent_action_hash(r);
        update public.agent_actions set chain_pos = r.chain_pos, prev_hash = r.prev_hash, hash = r.hash where id = r.id;
        prev := r.hash;
    end loop;
end;
$$;

alter table public.agent_actions alter column chain_pos set not null;
alter table public.agent_actions alter column prev_hash set not null;
alter table public.agent_actions alter column hash      set not null;
create unique index if not exists idx_agent_actions_chain on public.agent_actions (user_id, chain_pos);

-- -----------------------------------------------------------------------------
-- Setiap baris baru disambungkan ke ujung rantai pemiliknya.
-- Kunci advisory per pengguna mencegah dua baris yang masuk bersamaan menyambung
-- ke baris yang sama.
-- -----------------------------------------------------------------------------
create or replace function public.chain_agent_action()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    last_hash text;
    last_pos  bigint;
begin
    perform pg_advisory_xact_lock(hashtextextended('agent_actions:' || new.user_id::text, 0));
    select hash, chain_pos into last_hash, last_pos
      from public.agent_actions
     where user_id = new.user_id
     order by chain_pos desc limit 1;
    new.timestamp := now();                       -- waktu server, bukan waktu dari aplikasi
    new.chain_pos := coalesce(last_pos, 0) + 1;
    new.prev_hash := coalesce(last_hash, 'GENESIS');
    new.hash      := public.agent_action_hash(new);
    return new;
end;
$$;

drop trigger if exists agent_actions_chain on public.agent_actions;
create trigger agent_actions_chain
    before insert on public.agent_actions
    for each row execute function public.chain_agent_action();

-- Tidak bisa diubah; hanya bisa dihapus oleh delete_my_data() atau saat akunnya dihapus.
create or replace function public.agent_actions_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'DELETE' and (current_setting('fintar.erasing', true) = 'on' or pg_trigger_depth() > 1) then
        return old;
    end if;
    raise exception 'Log aktivitas tidak bisa diubah atau dihapus';
end;
$$;

create trigger agent_actions_immutable
    before update or delete on public.agent_actions
    for each row execute function public.agent_actions_immutable();

-- -----------------------------------------------------------------------------
-- Pemeriksaan rantai untuk pengguna yang sedang login.
-- Mengembalikan jumlah baris, apakah rantainya utuh, posisi pertama yang rusak,
-- dan hash terakhir (patokan yang bisa dicatat pengguna).
-- -----------------------------------------------------------------------------
create or replace function public.verify_my_activity_log()
returns table (total bigint, valid boolean, broken_at bigint, last_hash text)
language plpgsql
stable
set search_path = public
as $$
declare
    r    public.agent_actions%rowtype;
    prev text := 'GENESIS';
    n    bigint := 0;
begin
    if auth.uid() is null then
        raise exception 'Harus login untuk memeriksa log';
    end if;
    for r in select * from public.agent_actions where user_id = auth.uid() order by chain_pos loop
        n := n + 1;
        if r.chain_pos <> n or r.prev_hash <> prev or r.hash <> public.agent_action_hash(r) then
            return query select n, false, n, prev;
            return;
        end if;
        prev := r.hash;
    end loop;
    return query select n, true, null::bigint, prev;
end;
$$;

revoke all on function public.verify_my_activity_log() from public, anon;
grant execute on function public.verify_my_activity_log() to authenticated;

-- -----------------------------------------------------------------------------
-- delete_my_data() tetap boleh menghapus log milik pemanggil.
-- -----------------------------------------------------------------------------
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
    perform set_config('fintar.erasing', 'on', true);
    delete from public.businesses    where owner_id = auth.uid(); -- transaksi, utang, belanja, proposal ikut terhapus
    delete from public.consents      where user_id = auth.uid();
    delete from public.agent_actions where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;
