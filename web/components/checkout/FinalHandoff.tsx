import styles from "./checkout.module.css";

// The final button is deliberately unwired: no handler, no href.
export function FinalHandoff() {
  return (
    <section className={styles.handoff} aria-label="Hand-off">
      <button type="button" className="btn btnOwn" aria-disabled="true" aria-describedby="own-step"
        title="Second Opinion can't place orders. This step is yours.">
        Place this order yourself in Robinhood
      </button>
      <p id="own-step" className="small muted">Second Opinion can&apos;t place orders. This step is yours.</p>
      <p className={styles.noOrder}>No order was placed. The decision stays with you.</p>
    </section>
  );
}
