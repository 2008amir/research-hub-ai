-- Single shared sequence across all research types for the serial number
CREATE SEQUENCE IF NOT EXISTS public.research_serial_seq START 1;

-- Function: generate ESR-{Di|Dr|Dv}-00001 based on research_type
CREATE OR REPLACE FUNCTION public.set_research_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix text;
  next_n bigint;
BEGIN
  -- Only auto-fill when not provided by the caller
  IF NEW.research_number IS NULL OR NEW.research_number = '' THEN
    prefix := CASE lower(coalesce(NEW.research_type, 'drugs'))
      WHEN 'disease' THEN 'Di'
      WHEN 'drugs' THEN 'Dr'
      WHEN 'drug' THEN 'Dr'
      WHEN 'discovery' THEN 'Dv'
      ELSE 'Dr'
    END;
    next_n := nextval('public.research_serial_seq');
    NEW.research_number := 'ESR-' || prefix || '-' || lpad(next_n::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_research_number ON public.research;
CREATE TRIGGER trg_set_research_number
BEFORE INSERT ON public.research
FOR EACH ROW
EXECUTE FUNCTION public.set_research_number();

-- Sync sequence past any existing numeric serials so we don't collide
SELECT setval(
  'public.research_serial_seq',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(regexp_replace(research_number, '\D', '', 'g'), '')::bigint), 0)
     FROM public.research),
    1
  ),
  true
);