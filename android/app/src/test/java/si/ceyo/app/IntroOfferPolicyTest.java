package si.ceyo.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class IntroOfferPolicyTest {
    @Test public void firstMonthIsHalfPriceOnlyOnce() {
        assertTrue(IntroOfferPolicy.isIntro("monthly", "first-month-half", "P1M", 1, 10000000, 20000000));
        assertFalse(IntroOfferPolicy.isIntro("monthly", "first-month-half", "P1M", 2, 10000000, 20000000));
        assertFalse(IntroOfferPolicy.isIntro("monthly", "first-month-half", "P1M", 1, 15000000, 20000000));
    }
    @Test public void neverSelectsOtherPromotionsOrAnnualDiscounts() {
        assertFalse(IntroOfferPolicy.isIntro("yearly", "first-month-half", "P1M", 1, 10000000, 20000000));
        assertFalse(IntroOfferPolicy.isIntro("monthly", "other-offer", "P1M", 1, 10000000, 20000000));
        assertTrue(IntroOfferPolicy.isBase("yearly", null, true));
        assertFalse(IntroOfferPolicy.isBase("yearly", "first-month-half", true));
    }
}