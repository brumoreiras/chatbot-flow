export function trackEvent(eventName, parameters = {}) {
  window.dataLayer = window.dataLayer || [];

  const payload = {
    event: eventName,
    ...parameters,
  };

  window.dataLayer.push(payload);

  if (import.meta.env.DEV) {
    console.log("[Analytics]", payload);
  }
}
