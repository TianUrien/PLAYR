-- Journey storage bucket
-- Adds a public bucket so journey logos/images can reuse the same upload flow as other media

SET search_path = storage;

INSERT INTO storage.buckets (id, name, public)
VALUES ('journey', 'journey', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Ensure journey entries can be rendered publicly while uploads remain scoped to the owner
DROP POLICY IF EXISTS "Public journey access" ON storage.objects;
CREATE POLICY "Public journey access"
ON storage.objects FOR SELECT
USING (bucket_id = 'journey');

DROP POLICY IF EXISTS "Users upload journey media" ON storage.objects;
CREATE POLICY "Users upload journey media"
ON storage.objects FOR INSERT
WITH CHECK (
	bucket_id = 'journey'
	AND auth.role() = 'authenticated'
	AND split_part(name, '/', 1) = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Users update journey media" ON storage.objects;
CREATE POLICY "Users update journey media"
ON storage.objects FOR UPDATE
USING (
	bucket_id = 'journey'
	AND auth.role() = 'authenticated'
	AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Users delete journey media" ON storage.objects;
CREATE POLICY "Users delete journey media"
ON storage.objects FOR DELETE
USING (
	bucket_id = 'journey'
	AND auth.role() = 'authenticated'
	AND owner = auth.uid()
);
