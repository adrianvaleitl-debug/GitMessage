-- Fix MP4 and other attachment uploads at the storage bucket level.
-- The application enforces the 25 MB limit before upload; keep the bucket limit aligned.
update storage.buckets
set
  allowed_mime_types = null,
  file_size_limit = 26214400
where id = 'gitmessage-attachments';
