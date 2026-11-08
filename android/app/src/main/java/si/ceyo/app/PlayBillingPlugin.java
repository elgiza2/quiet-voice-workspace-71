package si.ceyo.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.android.billingclient.api.*;
import java.util.Collections;

/** Only the trusted Capacitor origin can invoke this bridge. Server verification grants access. */
@CapacitorPlugin(name = "CeyoPlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall pending;

    @Override public void load() {
        client = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }

    @PluginMethod public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String accountId = call.getString("accountId");
        if (productId == null || !productId.matches("ceyo_(plus_monthly|plus_yearly|pro_monthly|ultra_monthly)") || accountId == null || !accountId.matches("[0-9a-f-]{36}")) {
            call.reject("Invalid subscription request"); return;
        }
        if (pending != null) { call.reject("A purchase is already open"); return; }
        pending = call;
        Runnable launch = () -> {
            QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId).setProductType(BillingClient.ProductType.SUBS).build();
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build(), (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || details.getProductDetailsList().isEmpty()) { fail("Subscription is not available in Google Play yet"); return; }
                ProductDetails detail = details.getProductDetailsList().get(0);
                if (detail.getSubscriptionOfferDetails() == null || detail.getSubscriptionOfferDetails().isEmpty()) { fail("No subscription base plan is available"); return; }
                boolean yearly = productId.endsWith("_yearly");
                ProductDetails.SubscriptionOfferDetails selected = null;
                ProductDetails.SubscriptionOfferDetails base = null;
                for (ProductDetails.SubscriptionOfferDetails offer : detail.getSubscriptionOfferDetails()) {
                    if (IntroOfferPolicy.isBase(offer.getBasePlanId(), offer.getOfferId(), yearly)) base = offer;
                    java.util.List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                    if (!yearly && phases.size() == 2) {
                        ProductDetails.PricingPhase first = phases.get(0);
                        ProductDetails.PricingPhase recurring = phases.get(1);
                        if (recurring.getRecurrenceMode() == ProductDetails.RecurrenceMode.INFINITE_RECURRING
                            && IntroOfferPolicy.isIntro(offer.getBasePlanId(), offer.getOfferId(), first.getBillingPeriod(),
                                first.getBillingCycleCount(), first.getPriceAmountMicros(), recurring.getPriceAmountMicros())) selected = offer;
                    }
                }
                // Play only returns eligible offers. Returning customers get the regular base plan.
                if (selected == null) selected = base;
                if (selected == null) { fail("The configured subscription plan is unavailable"); return; }
                BillingFlowParams.ProductDetailsParams selection = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(detail).setOfferToken(selected.getOfferToken()).build();
                getActivity().runOnUiThread(() -> {
                    BillingResult started = client.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder()
                        .setObfuscatedAccountId(accountId).setProductDetailsParamsList(Collections.singletonList(selection)).build());
                    if (started.getResponseCode() != BillingClient.BillingResponseCode.OK) fail("Google Play checkout could not open");
                });
            });
        };
        if (client.isReady()) launch.run();
        else client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) launch.run(); else fail("Google Play billing is unavailable");
            }
            @Override public void onBillingServiceDisconnected() { fail("Google Play disconnected. Try again"); }
        });
    }

    @Override public void onPurchasesUpdated(BillingResult result, java.util.List<Purchase> purchases) {
        if (pending == null) return;
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) { fail("Purchase cancelled or unsuccessful"); return; }
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                JSObject value = new JSObject(); value.put("purchaseToken", purchase.getPurchaseToken());
                pending.resolve(value); pending = null; return;
            }
        }
        fail("Payment is pending. Your plan activates only after confirmation");
    }

    private void fail(String message) { if (pending != null) { pending.reject(message); pending = null; } }
    @Override protected void handleOnDestroy() { fail("Purchase interrupted"); if (client != null) client.endConnection(); }
}