create table if not exists public.ifab_library_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  language text not null default 'es',
  source_official text,
  effective_date date,
  status text not null default 'vigente',
  summary text,
  file_url text,
  storage_path text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ifab_library_documents_category_check check (
    category in (
      'reglas',
      'circular',
      'resumen',
      'protocolo_var',
      'cambios_reglamentarios',
      'mundial',
      'material_consulta'
    )
  ),
  constraint ifab_library_documents_status_check check (
    status in ('vigente', 'proxima_actualizacion', 'archivado')
  )
);

create index if not exists ifab_library_documents_status_idx
  on public.ifab_library_documents (status);

create index if not exists ifab_library_documents_category_idx
  on public.ifab_library_documents (category);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_ifab_library_documents_updated_at
  on public.ifab_library_documents;

create trigger set_ifab_library_documents_updated_at
before update on public.ifab_library_documents
for each row
execute function public.set_updated_at();

alter table public.ifab_library_documents enable row level security;

drop policy if exists "ifab_library_documents_authenticated_read"
  on public.ifab_library_documents;

create policy "ifab_library_documents_authenticated_read"
on public.ifab_library_documents
for select
to authenticated
using (true);
