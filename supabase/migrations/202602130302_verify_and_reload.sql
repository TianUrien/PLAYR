-- Verify search_content exists and force PostgREST reload
-- Also grant to anon role so PostgREST can discover it in schema cache
GRANT EXECUTE ON FUNCTION public.search_content(TEXT, TEXT, INT, INT) TO anon;
NOTIFY pgrst, 'reload schema';
