CREATE OR REPLACE FUNCTION public.agent_usage_status() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); b public.agent_usage_balances; p text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT plan INTO p FROM public.subscriptions WHERE user_id=u AND current_period_end>now();
 SELECT * INTO b FROM public.agent_usage_balances WHERE user_id=u;
 RETURN jsonb_build_object('plan',coalesce(p,'free'),'isPaid',coalesce(p IN ('plus','pro','ultra'),false),'allowanceUsd',coalesce(b.allowance_usd,0.05),'spentUsd',coalesce(b.spent_usd,0),'remainingUsd',greatest(0,coalesce(b.allowance_usd,0.05)-coalesce(b.spent_usd,0)),'stepUsd',0.01);
END $$;
REVOKE ALL ON FUNCTION public.agent_usage_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_usage_status() TO authenticated,service_role;