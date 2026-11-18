-- Presenter.ai: Shree's Library (documents, links and notes Shree can look up live).
create table if not exists presenter_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'file',      -- file | url | note | deck
  source text,                             -- file name or URL
  status text not null default 'ready',    -- ready | failed
  chars integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create table if not exists presenter_library_chunks (
  id bigserial primary key,
  doc_id uuid not null references presenter_library(id) on delete cascade,
  idx integer not null,
  content text not null,
  embedding extensions.vector(1536)
);
create index if not exists presenter_library_chunks_doc on presenter_library_chunks(doc_id);
alter table presenter_library enable row level security;
alter table presenter_library_chunks enable row level security;

create or replace function presenter_library_match(query_embedding extensions.vector(1536), match_count int default 6)
returns table (doc_id uuid, title text, idx int, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.doc_id, d.title, c.idx, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from presenter_library_chunks c
  join presenter_library d on d.id = c.doc_id
  where c.embedding is not null and d.status = 'ready'
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function presenter_library_match(extensions.vector, int) from anon, authenticated;
