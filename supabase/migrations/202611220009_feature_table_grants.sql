-- Grant the authenticated app role table privileges for the feature-suite tables.
-- Row-level security remains enabled and continues to restrict each operation
-- to the signed-in user and conversations they belong to.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.gitmessage_message_revisions,
  public.gitmessage_message_bookmarks,
  public.gitmessage_pinned_messages,
  public.gitmessage_scheduled_messages,
  public.gitmessage_conversation_preferences,
  public.gitmessage_drafts,
  public.gitmessage_user_status,
  public.gitmessage_notification_preferences,
  public.gitmessage_polls,
  public.gitmessage_poll_options,
  public.gitmessage_poll_votes,
  public.gitmessage_events,
  public.gitmessage_event_rsvps,
  public.gitmessage_message_read_receipts
to authenticated;

-- Read receipts are written by the viewing user and visible to members
-- through the row-level security policies installed by migration 007.
