ALTER TABLE public.agent_usage_balances ADD COLUMN IF NOT EXISTS usage_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Cairo')::date);
ALTER TABLE public.agent_usage_balances ALTER COLUMN allowance_usd SET DEFAULT 0.10;
UPDATE public.agent_usage_balances SET allowance_usd = 0.10;

CREATE OR REPLACE FUNCTION public.agent_usage_status() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); b public.agent_usage_balances; p text; today date:=(now() AT TIME ZONE 'Africa/Cairo')::date; spent numeric;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT plan INTO p FROM public.subscriptions WHERE user_id=u AND current_period_end>now();
 SELECT * INTO b FROM public.agent_usage_balances WHERE user_id=u;
 spent := CASE WHEN b.usage_day IS NULL OR b.usage_day < today THEN 0 ELSE b.spent_usd END;
 RETURN jsonb_build_object('plan',coalesce(p,'free'),'isPaid',coalesce(p IN ('plus','pro','ultra'),false),'allowanceUsd',coalesce(b.allowance_usd,0.10),'spentUsd',spent,'remainingUsd',greatest(0,coalesce(b.allowance_usd,0.10)-spent),'stepUsd',0.01,'resetsDaily',true);
END $$;
REVOKE ALL ON FUNCTION public.agent_usage_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_usage_status() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.charge_agent_usage(p_user_id uuid,p_operation_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.agent_usage_balances; p text; amount numeric:=0.01; today date:=(now() AT TIME ZONE 'Africa/Cairo')::date;
BEGIN
 IF p_operation_key IS NULL OR length(p_operation_key)<1 OR length(p_operation_key)>200 THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 SELECT plan INTO p FROM public.subscriptions WHERE user_id=p_user_id AND current_period_end>now();
 IF p IN ('plus','pro','ultra') THEN RETURN jsonb_build_object('ok',true,'paid',true,'chargedUsd',0); END IF;
 INSERT INTO public.agent_usage_balances(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.agent_usage_balances WHERE user_id=p_user_id FOR UPDATE;
 IF b.usage_day < today THEN
   UPDATE public.agent_usage_balances SET spent_usd=0, usage_day=today WHERE user_id=p_user_id;
   b.spent_usd := 0; b.usage_day := today;
 END IF;
 IF EXISTS(SELECT 1 FROM public.agent_usage_operations WHERE user_id=p_user_id AND operation_key=p_operation_key) THEN RETURN jsonb_build_object('ok',true,'alreadyCharged',true,'remainingUsd',greatest(0,b.allowance_usd-b.spent_usd)); END IF;
 IF b.spent_usd+amount>b.allowance_usd THEN RETURN jsonb_build_object('ok',false,'code','balance_exhausted','remainingUsd',greatest(0,b.allowance_usd-b.spent_usd)); END IF;
 UPDATE public.agent_usage_balances SET spent_usd=spent_usd+amount WHERE user_id=p_user_id;
 INSERT INTO public.agent_usage_operations(user_id,operation_key,amount_usd) VALUES(p_user_id,p_operation_key,amount);
 RETURN jsonb_build_object('ok',true,'chargedUsd',amount,'remainingUsd',greatest(0,b.allowance_usd-b.spent_usd-amount));
END $$;
REVOKE ALL ON FUNCTION public.charge_agent_usage(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.charge_agent_usage(uuid,text) TO service_role;