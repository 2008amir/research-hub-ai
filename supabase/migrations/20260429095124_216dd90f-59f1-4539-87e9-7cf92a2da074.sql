-- Add research_number and research_type, and convert category to free-text so admins can define their own
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS research_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.research ADD COLUMN IF NOT EXISTS research_type TEXT NOT NULL DEFAULT 'drugs';

-- Convert category from enum to text so admins can write custom categories
ALTER TABLE public.research ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.research ALTER COLUMN category TYPE TEXT USING category::text;
ALTER TABLE public.research ALTER COLUMN category SET DEFAULT '';