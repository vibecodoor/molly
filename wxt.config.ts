import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Molly',
    // Public key only: pins the extension ID to eigfjpjpdfndnibmbmfnpljnnkmodhdc whatever folder it loads from,
    // so chrome.storage data survives reinstalls. No private key is kept (not needed unpacked).
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoyY7PUR9wcgMIrURt+rQWR5RmcBvOA0dSecHvcm99WJIPRn1dKpoHug9HZdYcl7AQpfOGAXjhcCETMN2XQzgdA4erGAbdMg+jsjdoIVESRKAioLkRB8ABZk7J5Ha6sBwj8XoCjV9bE4tOar8iLvHnP/zTnhq0mvNr5dMtr4Qj6gp10ifA3obT6fQaS3q7Qfg1vLzOaYJhj+SLG5aodjCn0ZG7AYiYTO/KDKpTVEHcT9N3x0EzIRvdnP3iBCo9SioaLUD8ba1EpUNp1bJ3gguEb1Z8A7LlDRL87mEPrXkqX3VWPQ6GjfR+NJPrbSadPHQ5UYy86vgDaucrK1pmgwczwIDAQAB',
    description: 'Active-tab time per site with daily hard-block limits.',
    permissions: ['storage', 'alarms', 'tabs', 'idle', 'declarativeNetRequest', 'favicon'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [{ resources: ['blocked.html'], matches: ['<all_urls>'] }],
  },
});
