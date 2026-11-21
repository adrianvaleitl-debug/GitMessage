-- Expand allowed attachment formats so browser-reported MP4/audio MIME types upload correctly.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/gif','image/webp',
  'video/mp4','video/quicktime','video/webm','video/3gpp',
  'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-wav',
  'application/pdf','text/plain'
]
where id='gitmessage-attachments';
