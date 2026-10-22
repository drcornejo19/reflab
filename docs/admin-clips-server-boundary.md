# Admin Clips server boundary

Admin Clips reads and mutations go through `/api/admin/clips`. The browser does
not receive a Supabase secret and cannot insert, update, or delete `public.clips`.
Normal removal is a logical deactivation (`is_active=false`, `status=archived`)
so historical attempts and exam snapshots remain intact.

The existing `platform_audit_logs` table records the canonical actor and a
minimal clip state. Without a dedicated database RPC, the clip mutation and its
audit insert are not one atomic database statement; an audit failure is logged
server-side without exposing database details to the browser.

Video upload is intentionally outside this patch. A future uploader server-side
must validate MIME/content, choose the approved bucket and path itself, and keep
Storage write credentials outside the browser. Until then, the form accepts only
a validated HTTP(S) `video_url` reference.
