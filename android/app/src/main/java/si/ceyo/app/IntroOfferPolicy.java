package si.ceyo.app;

/** Match only the configured one-month half-price offer, never an arbitrary offer. */
public final class IntroOfferPolicy {
    public static boolean isIntro(String basePlan, String offerId, String duration, int cycles, long firstPrice, long recurringPrice) {
        return "monthly".equals(basePlan) && "first-month-half".equals(offerId)
            && "P1M".equals(duration) && cycles == 1 && recurringPrice > 0
            && Math.abs(firstPrice - recurringPrice / 2) <= 10000;
    }
    public static boolean isBase(String basePlan, String offerId, boolean yearly) {
        return (yearly ? "yearly" : "monthly").equals(basePlan) && offerId == null;
    }
}