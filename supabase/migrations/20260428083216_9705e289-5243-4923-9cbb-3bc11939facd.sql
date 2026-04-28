
CREATE OR REPLACE FUNCTION public.get_active_history(period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF period = 'daily' THEN
    SELECT jsonb_agg(jsonb_build_object('bucket', day::text, 'count', cnt) ORDER BY day DESC)
    INTO result
    FROM (
      SELECT day, count(DISTINCT user_id) AS cnt
      FROM public.active_days
      GROUP BY day
    ) s;
  ELSIF period = 'weekly' THEN
    SELECT jsonb_agg(jsonb_build_object('bucket', to_char(wk, 'IYYY-"W"IW'), 'start', wk::text, 'count', cnt) ORDER BY wk DESC)
    INTO result
    FROM (
      SELECT date_trunc('week', day)::date AS wk, count(DISTINCT user_id) AS cnt
      FROM public.active_days
      GROUP BY date_trunc('week', day)
    ) s;
  ELSIF period = 'monthly' THEN
    SELECT jsonb_agg(jsonb_build_object('bucket', to_char(mo, 'YYYY-MM'), 'start', mo::text, 'count', cnt) ORDER BY mo DESC)
    INTO result
    FROM (
      SELECT date_trunc('month', day)::date AS mo, count(DISTINCT user_id) AS cnt
      FROM public.active_days
      GROUP BY date_trunc('month', day)
    ) s;
  ELSE
    RAISE EXCEPTION 'Invalid period';
  END IF;

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_detail(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'totalLikes', (SELECT count(*) FROM public.likes WHERE user_id = _user_id),
    'totalComments', (SELECT count(*) FROM public.comments WHERE user_id = _user_id),
    'comments', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'content', c.content,
        'created_at', c.created_at,
        'research_id', c.research_id,
        'research_title', r.title
      ) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM public.comments c
      LEFT JOIN public.research r ON r.id = c.research_id
      WHERE c.user_id = _user_id
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_history(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_detail(uuid) TO authenticated;
