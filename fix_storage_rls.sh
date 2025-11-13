#!/bin/bash

# Supabase Storage Policy Fix Script
# This script fixes the RLS policies for the avatars bucket

SERVICE_ROLE_KEY=""
PROJECT_URL="https://xtertgftujnebubxgqit.supabase.co"

echo "🔧 Fixing Supabase Storage RLS Policies..."

# Execute SQL to drop old policies and create new ones
curl -X POST "${PROJECT_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "DROP POLICY IF EXISTS \"Public avatar access\" ON storage.objects; DROP POLICY IF EXISTS \"Authenticated users can upload avatars\" ON storage.objects; DROP POLICY IF EXISTS \"Authenticated users can update avatars\" ON storage.objects; DROP POLICY IF EXISTS \"Authenticated users can delete avatars\" ON storage.objects; DROP POLICY IF EXISTS \"Users can upload own avatar\" ON storage.objects; DROP POLICY IF EXISTS \"Users can update own avatar\" ON storage.objects; DROP POLICY IF EXISTS \"Users can delete own avatar\" ON storage.objects; CREATE POLICY \"Public can view avatars\" ON storage.objects FOR SELECT TO public USING (bucket_id = '\''avatars'\''); CREATE POLICY \"Authenticated can upload avatars\" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = '\''avatars'\''); CREATE POLICY \"Authenticated can update avatars\" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = '\''avatars'\''); CREATE POLICY \"Authenticated can delete avatars\" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = '\''avatars'\'');"
  }'

echo ""
echo "✅ Done! Policies should be updated."
echo "🧪 Try uploading your club logo again at http://localhost:5173/dashboard/profile"
