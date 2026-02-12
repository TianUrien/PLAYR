-- Force PostgREST to reload its schema cache after repair migration
NOTIFY pgrst, 'reload schema';
