-- Memory Capsule: restrict photo uploads to JPG and PNG (videos stay MP4 and MOV).
-- Safe to run on an existing project; it only updates the storage bucket rules.
-- Photos already uploaded in other formats keep working; only new uploads are restricted.

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','video/mp4','video/quicktime']
where id = 'relationship-media';

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png']
where id in ('relationship-covers', 'relationship-letters', 'relationship-avatars');
