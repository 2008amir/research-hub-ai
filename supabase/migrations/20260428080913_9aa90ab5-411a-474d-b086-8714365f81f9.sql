CREATE OR REPLACE FUNCTION public.record_my_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.active_days (user_id, day)
  VALUES (auth.uid(), (now() AT TIME ZONE 'UTC')::date)
  ON CONFLICT (user_id, day) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_my_activity() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  today date := (now() AT TIME ZONE 'UTC')::date;
  week_ago date := today - INTERVAL '6 days';
  month_ago date := today - INTERVAL '29 days';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'research', (SELECT count(*) FROM public.research),
    'likes', (SELECT count(*) FROM public.likes),
    'comments', (SELECT count(*) FROM public.comments),
    'dailyActive', (SELECT count(DISTINCT user_id) FROM public.active_days WHERE day = today),
    'weeklyActive', (SELECT count(DISTINCT user_id) FROM public.active_days WHERE day >= week_ago),
    'monthlyActive', (SELECT count(DISTINCT user_id) FROM public.active_days WHERE day >= month_ago),
    'last7', (
      SELECT jsonb_agg(jsonb_build_object('day', d::text, 'count', coalesce(c.cnt, 0)) ORDER BY d)
      FROM generate_series(today - INTERVAL '6 days', today, INTERVAL '1 day') AS d
      LEFT JOIN (
        SELECT day, count(DISTINCT user_id) AS cnt
        FROM public.active_days
        WHERE day >= week_ago
        GROUP BY day
      ) c ON c.day = d::date
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;