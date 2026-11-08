/** One bounded star, adapted from andrew-manzyk's Uiverse flow animation. */
export function SubscriptionStar() {
  return <span className="subscription-star-loader" aria-hidden="true">
    <svg viewBox="0 0 100 100" className="subscription-star-flow" focusable="false">
      <path d="M50 5 62 37 95 50 62 63 50 95 38 63 5 50 38 37Z" fill="currentColor" />
      <path d="m50 5 12 32 33 13H50Z" className="subscription-star-facet" />
    </svg>
  </span>;
}