begin;

-- Emergency rollback: preserve every reconciled column and audit record, but
-- disable new administrative mutations until the forward migration is fixed.
revoke execute on function public.admin_set_user_plan(text, text, text, text)
  from service_role;
revoke execute on function public.admin_set_global_role(text, text, text, text)
  from service_role;

notify pgrst, 'reload schema';

commit;
