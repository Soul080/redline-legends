# Community Tracks

Players can publish a circuit (name, author, theme, thumbnail, and the same `RL1.` share code the editor already uses) and browse **Newest**, **Top rated**, and **Most played**. They can search, play, like, rate from 1 to 5, save a copy on their own device, and report a listing. Three reports hide it.

The game stays a static page. It does not need a process you host. If `js/community-config.js` is blank, or Supabase does not answer, the Community Tracks screen says so and editor share codes keep working.

## Why Supabase

Supabase’s free project is a hosted Postgres database with a REST API (PostgREST). This game is plain HTML, CSS, and JS with no build step, so the browser can `fetch` that API from a static host, itch.io, or Electron. The anon key is meant to ship inside the game. Row Level Security, grants, and `security definer` functions are what stop visitors from editing counters, reading other players’ client ids, or skipping the size limits.

Firebase was the other option. Its client SDK is a large extra script, and Firestore security rules cannot do the hourly publish cap or the rating average without a Cloud Function, which is a server you would be operating. Supabase keeps those rules in the SQL below.

What the database enforces:

- Theme is `city`, `desert`, `snow`, or `neon`.
- Track name and author are 1–24 characters, with the word filter in `community_name_blocked`.
- Share code is at most 4000 characters and matches `RL1.` plus base64url.
- Thumbnail is empty or a PNG/JPEG data URL of at most 28000 characters.
- 5 publishes per client id per hour.
- 30 community actions per client id per 10 minutes.
- One like (it toggles), one rating (it can be changed), one report, and one play credit per client id per track.
- The third report sets `hidden`. Hidden rows are not in the public view.

The client id is a random id stored in the player’s `localStorage`, not an account. Someone who clears site data gets a new id. That is a basic limit, not account-grade moderation. Supabase also rate-limits the API by IP (Project Settings → API). Reports are how you take a listing down. The game runs `RL.Tracks.validate` on every listing before it can be raced, so a code that is the right shape but not a closed loop is dropped on load. That check stays in the game so it cannot drift from the editor.

## What you do, in order

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a free account (email or GitHub).
2. Click **New project**. Pick your organization (a free personal org is fine).
3. Set the project name (for example `redline-legends`), a database password, and a region close to your players. Leave the plan on **Free**. Click **Create new project**.
4. Wait until the project status is healthy. This takes a minute or two.
5. Open **Project Settings** (the gear) → **API** (also labeled **Data API** on newer dashboards).
6. Copy the **Project URL**. It looks like `https://abcdefghijklmnop.supabase.co`. Do not add `/rest/v1`.
7. Copy the **anon** / **public** key. Do not copy the **service_role** key. The service role bypasses every policy. It must never go in the game, a screenshot, or a public itch.io build.
8. Open **SQL Editor** → **New query**. Paste the whole script in the next section. Click **Run**. You want a success result with no error. The script drops its own tables first, so running it again resets Community Tracks.
9. Open `js/community-config.js` in the game folder and set the two fields:

```javascript
window.RL_COMMUNITY = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabaseAnonKey: 'YOUR-ANON-KEY'
};
```

10. Reload the game. In the Race Office **Free Play** tab, open **Community Tracks**. The offline message should be gone. In the Track Editor, **Publish** asks for an author name. Publish a test circuit, then find it under **Newest**, play it, like it, and rate it.
11. For itch.io or Electron, ship the same files, including the filled-in config. Players’ browsers call Supabase directly. You do not run a game server. The Data API allows browser calls from any origin by default, which covers itch.io and Electron (`Origin: null`). If a browser console shows a CORS error, open **Project Settings → API** and allow that origin (or all origins, if the dashboard offers that).

Leave both config fields empty to disable the feature. Local save, share codes, and JSON import do not use the network.

## SQL

Paste this into the Supabase SQL Editor and run it once.

```sql
-- Community Tracks for Redline Legends. Safe to re-run: it drops its own objects first.

drop view if exists public.community_tracks_live;
drop function if exists public.community_publish(text, text, text, text, text, text);
drop function if exists public.community_like(uuid, text);
drop function if exists public.community_rate(uuid, text, integer);
drop function if exists public.community_play(uuid, text);
drop function if exists public.community_report(uuid, text, text);
drop function if exists public.community_rate_limit(text);
drop function if exists public.community_name_blocked(text);
drop table if exists public.community_actions;
drop table if exists public.community_votes;
drop table if exists public.community_tracks;

-- Keep this word list identical to BLOCKED in js/community.js.
create function public.community_name_blocked(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  s text;
  w text;
  words text[] := array['fuck','shit','bitch','asshole','cunt','nigger','nigga','faggot','retard','slut','whore','porn'];
begin
  if p is null then return true; end if;
  if char_length(btrim(p)) < 1 or char_length(btrim(p)) > 24 then return true; end if;
  if p ~* '(https?://|www\.)' then return true; end if;
  s := regexp_replace(translate(lower(p), '013457', 'oieast'), '[^a-z]', '', 'g');
  foreach w in array words loop
    if position(w in s) > 0 then return true; end if;
  end loop;
  return false;
end;
$$;

create table public.community_tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  author text not null,
  theme text not null,
  share_code text not null,
  thumbnail text not null default '',
  client_id text not null,
  plays integer not null default 0,
  likes integer not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  rating_avg numeric(3,2) not null default 0,
  reports integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint community_tracks_name_len check (char_length(name) between 1 and 24),
  constraint community_tracks_author_len check (char_length(author) between 1 and 24),
  constraint community_tracks_theme check (theme in ('city', 'desert', 'snow', 'neon')),
  constraint community_tracks_code check (char_length(share_code) between 8 and 4000 and share_code ~ '^RL1\.[A-Za-z0-9_-]+$'),
  constraint community_tracks_thumb check (
    char_length(thumbnail) <= 28000
    and (thumbnail = '' or thumbnail ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')
  ),
  constraint community_tracks_client check (client_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint community_tracks_counts check (
    plays >= 0 and likes >= 0 and rating_sum >= 0 and rating_count >= 0 and reports >= 0 and rating_avg >= 0
  )
);

create index community_tracks_new_idx on public.community_tracks (created_at desc);
create index community_tracks_played_idx on public.community_tracks (plays desc);
create index community_tracks_rated_idx on public.community_tracks (rating_avg desc, rating_count desc);
create index community_tracks_client_idx on public.community_tracks (client_id, created_at desc);

create table public.community_votes (
  track_id uuid not null references public.community_tracks (id) on delete cascade,
  client_id text not null,
  kind text not null,
  stars smallint,
  reason text,
  created_at timestamptz not null default now(),
  primary key (track_id, client_id, kind),
  constraint community_votes_kind check (kind in ('like', 'rate', 'report', 'play')),
  constraint community_votes_stars check (stars is null or stars between 1 and 5),
  constraint community_votes_reason check (reason is null or reason in ('offensive', 'broken', 'spam')),
  constraint community_votes_client check (client_id ~ '^[A-Za-z0-9_-]{8,64}$')
);

create table public.community_actions (
  id bigserial primary key,
  client_id text not null,
  kind text not null default 'tick',
  created_at timestamptz not null default now(),
  constraint community_actions_client check (client_id ~ '^[A-Za-z0-9_-]{8,64}$')
);

create index community_actions_client_idx on public.community_actions (client_id, created_at desc);

alter table public.community_tracks enable row level security;
alter table public.community_tracks force row level security;
alter table public.community_votes enable row level security;
alter table public.community_votes force row level security;
alter table public.community_actions enable row level security;
alter table public.community_actions force row level security;

-- No policies. Visitors have no direct table rights. Writes go through the functions below.
revoke all on public.community_tracks from public, anon, authenticated;
revoke all on public.community_votes from public, anon, authenticated;
revoke all on public.community_actions from public, anon, authenticated;

-- security_invoker false: the view owner reads the table and exposes only public columns.
-- Do not grant SELECT on community_tracks, or client ids leak.
create view public.community_tracks_live
with (security_invoker = false) as
select id, name, author, theme, share_code, thumbnail, plays, likes, rating_avg, rating_count, created_at
from public.community_tracks
where hidden = false and reports < 3;

grant select on public.community_tracks_live to anon, authenticated;

create function public.community_rate_limit(p_client text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'Client id is not valid';
  end if;
  select count(*) into n from public.community_actions
    where client_id = p_client and created_at > now() - interval '10 minutes';
  if n >= 30 then
    raise exception 'Too many requests. Wait a few minutes.';
  end if;
  insert into public.community_actions (client_id, kind) values (p_client, 'tick');
end;
$$;

create function public.community_publish(
  p_name text, p_author text, p_theme text, p_code text, p_thumb text, p_client text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  recent integer;
  row public.community_tracks%rowtype;
begin
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'Client id is not valid';
  end if;
  if public.community_name_blocked(p_name) or public.community_name_blocked(p_author) then
    raise exception 'Name is not allowed';
  end if;
  if p_theme is null or p_theme not in ('city', 'desert', 'snow', 'neon') then
    raise exception 'Theme is not valid';
  end if;
  if p_code is null or char_length(p_code) > 4000 or p_code !~ '^RL1\.[A-Za-z0-9_-]+$' then
    raise exception 'Track is too large';
  end if;
  if p_thumb is null then p_thumb := ''; end if;
  if char_length(p_thumb) > 28000
     or (p_thumb <> '' and p_thumb !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Thumbnail is too large or not an image';
  end if;
  perform public.community_rate_limit(p_client);
  select count(*) into recent from public.community_tracks
    where client_id = p_client and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'Too many publishes. Try again in an hour.';
  end if;
  insert into public.community_tracks (name, author, theme, share_code, thumbnail, client_id)
  values (btrim(p_name), btrim(p_author), p_theme, p_code, p_thumb, p_client)
  returning * into row;
  return jsonb_build_object(
    'id', row.id, 'name', row.name, 'author', row.author, 'theme', row.theme,
    'share_code', row.share_code, 'thumbnail', row.thumbnail, 'plays', row.plays,
    'likes', row.likes, 'rating_avg', row.rating_avg, 'rating_count', row.rating_count,
    'created_at', row.created_at
  );
end;
$$;

create function public.community_like(p_track uuid, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  removed integer;
begin
  perform public.community_rate_limit(p_client);
  if not exists (
    select 1 from public.community_tracks where id = p_track and hidden = false and reports < 3
  ) then
    raise exception 'Track was not found';
  end if;
  delete from public.community_votes
    where track_id = p_track and client_id = p_client and kind = 'like';
  get diagnostics removed = row_count;
  if removed > 0 then
    update public.community_tracks set likes = greatest(0, likes - 1) where id = p_track returning likes into n;
    return jsonb_build_object('ok', true, 'likes', n, 'liked', false);
  end if;
  insert into public.community_votes (track_id, client_id, kind) values (p_track, p_client, 'like');
  update public.community_tracks set likes = likes + 1 where id = p_track returning likes into n;
  return jsonb_build_object('ok', true, 'likes', n, 'liked', true);
end;
$$;

create function public.community_rate(p_track uuid, p_client text, p_stars integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prev smallint;
  avg numeric(3,2);
  cnt integer;
begin
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Rating must be from 1 to 5';
  end if;
  perform public.community_rate_limit(p_client);
  if not exists (
    select 1 from public.community_tracks where id = p_track and hidden = false and reports < 3
  ) then
    raise exception 'Track was not found';
  end if;
  select stars into prev from public.community_votes
    where track_id = p_track and client_id = p_client and kind = 'rate';
  if prev is null then
    insert into public.community_votes (track_id, client_id, kind, stars)
      values (p_track, p_client, 'rate', p_stars);
    update public.community_tracks
      set rating_sum = rating_sum + p_stars,
          rating_count = rating_count + 1,
          rating_avg = round((rating_sum + p_stars)::numeric / (rating_count + 1), 2)
      where id = p_track
      returning rating_avg, rating_count into avg, cnt;
  else
    update public.community_votes set stars = p_stars
      where track_id = p_track and client_id = p_client and kind = 'rate';
    update public.community_tracks
      set rating_sum = rating_sum - prev + p_stars,
          rating_avg = case when rating_count = 0 then 0
            else round((rating_sum - prev + p_stars)::numeric / rating_count, 2) end
      where id = p_track
      returning rating_avg, rating_count into avg, cnt;
  end if;
  return jsonb_build_object('ok', true, 'rating_avg', avg, 'rating_count', cnt);
end;
$$;

create function public.community_play(p_track uuid, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  inserted integer;
begin
  perform public.community_rate_limit(p_client);
  if not exists (
    select 1 from public.community_tracks where id = p_track and hidden = false and reports < 3
  ) then
    raise exception 'Track was not found';
  end if;
  insert into public.community_votes (track_id, client_id, kind)
    values (p_track, p_client, 'play')
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.community_tracks set plays = plays + 1 where id = p_track returning plays into n;
  else
    select plays into n from public.community_tracks where id = p_track;
  end if;
  return jsonb_build_object('ok', true, 'plays', n);
end;
$$;

create function public.community_report(p_track uuid, p_client text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  inserted integer;
begin
  if p_reason is null or p_reason not in ('offensive', 'broken', 'spam') then
    raise exception 'Report reason is not valid';
  end if;
  perform public.community_rate_limit(p_client);
  if not exists (
    select 1 from public.community_tracks where id = p_track and hidden = false and reports < 3
  ) then
    raise exception 'Track was not found';
  end if;
  insert into public.community_votes (track_id, client_id, kind, reason)
    values (p_track, p_client, 'report', p_reason)
    on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted > 0 then
    update public.community_tracks
      set reports = reports + 1,
          hidden = (reports + 1) >= 3
      where id = p_track
      returning reports into n;
  else
    select reports into n from public.community_tracks where id = p_track;
  end if;
  return jsonb_build_object('ok', true, 'reports', n);
end;
$$;

revoke all on function public.community_name_blocked(text) from public, anon, authenticated;
revoke all on function public.community_rate_limit(text) from public, anon, authenticated;
revoke all on function public.community_publish(text, text, text, text, text, text) from public;
revoke all on function public.community_like(uuid, text) from public;
revoke all on function public.community_rate(uuid, text, integer) from public;
revoke all on function public.community_play(uuid, text) from public;
revoke all on function public.community_report(uuid, text, text) from public;

grant execute on function public.community_publish(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.community_like(uuid, text) to anon, authenticated;
grant execute on function public.community_rate(uuid, text, integer) to anon, authenticated;
grant execute on function public.community_play(uuid, text) to anon, authenticated;
grant execute on function public.community_report(uuid, text, text) to anon, authenticated;
```

## Moderation

The SQL Editor runs as the database owner, so you can see reports and hide a track even though players cannot.

```sql
select v.created_at, v.reason, v.client_id, t.name, t.author, t.reports, t.hidden
from public.community_votes v
join public.community_tracks t on t.id = v.track_id
where v.kind = 'report'
order by v.created_at desc;

-- hide one track
update public.community_tracks set hidden = true where id = 'TRACK-UUID';

-- put one back
update public.community_tracks set hidden = false, reports = 0 where id = 'TRACK-UUID';
```

## Check that it worked

In the SQL Editor:

```sql
select id, name, author, theme, plays, likes, rating_avg, hidden
from public.community_tracks
order by created_at desc;
```

In the game, publish a track and confirm a row appears. Then blank out `js/community-config.js` and reload: Community Tracks shows the not-connected message, and **Share** in the editor still copies a code.
