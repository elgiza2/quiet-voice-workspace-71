CREATE TABLE public.free_video_call_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, call_day)
);

ALTER TABLE public.free_video_call_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_video_call_daily_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.free_video_call_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_free_video_call_minute()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  active_plan text;
  inserted_rows integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT plan INTO active_plan
  FROM public.subscriptions
  WHERE user_id = caller AND current_period_end > now();

  IF active_plan IN ('plus', 'pro', 'ultra') THEN
    RETURN jsonb_build_object('allowed', true, 'isPaid', true);
  END IF;

  INSERT INTO public.free_video_call_daily_usage (user_id)
  VALUES (caller)
  ON CONFLICT (user_id, call_day) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN jsonb_build_object(
    'allowed', inserted_rows = 1,
    'isPaid', false,
    'seconds', 60,
    'resetsAt', ((now() AT TIME ZONE 'Africa/Cairo')::date + 1)::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_free_video_call_minute() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_free_video_call_minute() TO authenticated;
