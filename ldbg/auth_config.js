// Public browser configuration for LDBG's own SpacetimeAuth client.
// The client ID is intentionally public. Never put a client secret in this file.
window.LDBGAuthConfig = {
  clientId: "client_034BDNAzqoyUa3M46PiCwU",
  authorizationEndpoint: "https://auth.spacetimedb.com/oidc/auth",
  tokenEndpoint: "https://auth.spacetimedb.com/oidc/token",
  endSessionEndpoint: "https://auth.spacetimedb.com/oidc/session/end",
  issuer: "https://auth.spacetimedb.com/oidc",
  scopes: "openid profile email",

  // Leave blank to use the exact page URL (without query parameters or hash).
  // If set, this value must exactly match an allowed redirect URI in SpacetimeAuth.
  redirectUri: "",

  // Leave blank to return to the current game page after logout.
  // The resulting URI must be listed as an allowed post-logout redirect URI.
  postLogoutRedirectUri: "",
};

// Public web-export backend target. Native/editor development can continue to
// use the local project settings without changing project.godot.
window.LDBGBackendConfig = {
  uri: "https://maincloud.spacetimedb.com",
  database: "ldbg-dev",
};
