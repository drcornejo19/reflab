# Supabase: usuarios, perfil y avatars

La migracion `202606070001_user_profile_admin_avatar_fix.sql` asegura:

- `public.user_roles.created_at`, `updated_at` y `subscription_plan`.
- `public.user_profiles` con campos persistentes de perfil RefLab.
- Trigger `public.set_updated_at()` para `user_roles` y `user_profiles`.
- Bucket publico `avatars` con limite de 5 MB y tipos PNG/JPG/WebP.
- Recarga de schema cache con `notify pgrst, 'reload schema';`.

Si el bucket debe crearse manualmente en Supabase, usar:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

Para bootstrap de la cuenta principal, configurar en el entorno del servidor:

```env
REFLAB_SUPER_ADMIN_EMAILS=tu-email@example.com
```

Al entrar con ese email de Clerk, la app sincroniza `user_roles.role = 'super_admin'`.
