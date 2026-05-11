const isLocal =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost";

window.WEDDING_CONFIG = {
  rsvpApiUrl: isLocal ? "http://127.0.0.1:8787" : "https://rsvp.aidan-stickan.workers.dev",
  turnstileSiteKey: isLocal ? "1x00000000000000000000AA" : "0x4AAAAAADMx5LJ1a6cCfF_s",
};
