-- Add optional file attachment to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

-- Realtime for messages
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;

-- Storage bucket for chat attachments (public read for simplicity)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Chat files public read" ON storage.objects;
CREATE POLICY "Chat files public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-files');

DROP POLICY IF EXISTS "Authenticated upload chat files" ON storage.objects;
CREATE POLICY "Authenticated upload chat files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-files');