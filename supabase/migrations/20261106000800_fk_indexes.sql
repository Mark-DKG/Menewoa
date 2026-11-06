-- Menewoa — migration 8: cover the four foreign keys the performance advisor flagged.
-- Without these, deleting a profile (account deletion) scans the child tables.
create index if not exists blocked_users_blocked_id        on public.blocked_users (blocked_id);
create index if not exists partner_invitations_accepted_by on public.partner_invitations (accepted_by) where accepted_by is not null;
create index if not exists reports_reported_user_id        on public.reports (reported_user_id) where reported_user_id is not null;
create index if not exists symptom_logs_symptom_id         on public.symptom_logs (symptom_id);
