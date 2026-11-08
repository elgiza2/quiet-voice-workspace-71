CREATE TABLE public.agent_usage_balances (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 allowance_usd numeric(12,6) NOT NULL DEFAULT 0.05,
 spent_usd numeric(12,6) NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_usage_balances TO authenticated;
GRANT ALL ON public.agent_usage_balances TO service_role;
ALTER TABLE public.agent_usage_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own usage balance" ON public.agent_usage_balances FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE TRIGGER agent_usage_balances_updated BEFORE UPDATE ON public.agent_usage_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.agent_usage_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 operation_key text NOT NULL, amount_usd numeric(12,6) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,operation_key)
);
GRANT SELECT ON public.agent_usage_operations TO authenticated;
GRANT ALL ON public.agent_usage_operations TO service_role;
ALTER TABLE public.agent_usage_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own usage operations" ON public.agent_usage_operations FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE TRIGGER agent_usage_operations_updated BEFORE UPDATE ON public.agent_usage_operations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.agent_usage_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); b public.agent_usage_balances; p text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT plan INTO p FROM public.subscriptions WHERE user_id=u AND current_period_end>now();
 INSERT INTO public.agent_usage_balances(user_id) VALUES(u) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.agent_usage_balances WHERE user_id=u;
 RETURN jsonb_build_object('plan',coalesce(p,'free'),'isPaid',p IS NOT NULL AND p IN ('plus','pro','ultra'),'allowanceUsd',b.allowance_usd,'spentUsd',b.spent_usd,'remainingUsd',greatest(0,b.allowance_usd-b.spent_usd),'stepUsd',0.01);
END $$;
REVOKE ALL ON FUNCTION public.agent_usage_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agent_usage_status() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.charge_agent_usage(p_user_id uuid,p_operation_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.agent_usage_balances; p text; amount numeric:=0.01;
BEGIN
 IF p_operation_key IS NULL OR length(p_operation_key)<1 OR length(p_operation_key)>200 THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 SELECT plan INTO p FROM public.subscriptions WHERE user_id=p_user_id AND current_period_end>now();
 IF p IN ('plus','pro','ultra') THEN RETURN jsonb_build_object('ok',true,'paid',true,'chargedUsd',0); END IF;
 INSERT INTO public.agent_usage_balances(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM public.agent_usage_balances WHERE user_id=p_user_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.agent_usage_operations WHERE user_id=p_user_id AND operation_key=p_operation_key) THEN RETURN jsonb_build_object('ok',true,'alreadyCharged',true,'remainingUsd',greatest(0,b.allowance_usd-b.spent_usd)); END IF;
 IF b.spent_usd+amount>b.allowance_usd THEN RETURN jsonb_build_object('ok',false,'code','balance_exhausted','remainingUsd',greatest(0,b.allowance_usd-b.spent_usd)); END IF;
 UPDATE public.agent_usage_balances SET spent_usd=spent_usd+amount WHERE user_id=p_user_id;
 INSERT INTO public.agent_usage_operations(user_id,operation_key,amount_usd) VALUES(p_user_id,p_operation_key,amount);
 RETURN jsonb_build_object('ok',true,'chargedUsd',amount,'remainingUsd',greatest(0,b.allowance_usd-b.spent_usd-amount));
END $$;
REVOKE ALL ON FUNCTION public.charge_agent_usage(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.charge_agent_usage(uuid,text) TO service_role;