# Dynamic OAuth Setup

A universal OAuth authenticator - Proof of Concept (PoC) project to understand OAuth 2.0 flows across multiple platforms (Google, Jira, Notion, Discord, etc.).

## Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Add your OAuth credentials to `platforms.json`:**
   - For platforms you own (Google, Jira): Fill in client_id + client_secret
   - For other platforms: Add their OAuth endpoints

3. **Run authentication:**
```bash
node auth.js <provider> <service>
```

## Examples

```bash
# Google Gmail
node auth.js google gmail

# Google Drive
node auth.js google drive

# Jira
node auth.js jira jira

# Notion
node auth.js notion notion

# Discord
node auth.js discord discord
```

## Configuration

### platforms.json Structure

The `platforms.json` file defines OAuth configurations for all supported platforms. Use `platforms.json.example` as a template.

**File Structure:**
```
{
  "provider_name": {
    "provider": "provider_name",
    "description": "Platform description",
    "web": {
      "client_id": "YOUR_CLIENT_ID",
      "client_secret": "YOUR_CLIENT_SECRET",
      "auth_uri": "https://...",
      "token_uri": "https://...",
      "redirect_uris": ["http://localhost:3000/oauth2callback"]
    },
    "services": {
      "service_name": {
        "serviceName": "service_name",
        "description": "What this service does",
        "scopes": ["scope1", "scope2"],
        "outputPath": ".service-credentials.json",
        "apiVersion": "v1"
      }
    }
  }
}
```

**Key Fields Explained:**
- `provider` - Unique identifier for the OAuth provider (google, jira, notion, etc.)
- `web.client_id` - OAuth application ID from the provider's console
- `web.client_secret` - OAuth application secret (keep this private!)
- `web.auth_uri` - Platform's authorization endpoint
- `web.token_uri` - Platform's token exchange endpoint
- `web.redirect_uris` - Callback URL (must match registered URI in provider console)
- `services[].scopes` - Permissions requested from the user
- `services[].outputPath` - Where to save the generated credentials file

**Setup Instructions:**

1. Copy `platforms.json.example` to `platforms.json`
2. For each provider you want to use:
   - Get OAuth credentials from the provider's console
   - Replace `YOUR_CLIENT_ID`, `YOUR_CLIENT_SECRET`, and `YOUR_PROJECT_ID` with actual values
   - Keep all other fields (URIs, scopes, paths) unchanged
3. Save and you're ready to authenticate!

**Example - Adding Google Credentials:**
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create OAuth 2.0 credentials (Desktop application)
- Replace `YOUR_CLIENT_ID`, `YOUR_PROJECT_ID`, and `YOUR_CLIENT_SECRET` in platforms.json
- Ensure redirect URI `http://localhost:3000/oauth2callback` is registered

**Note:** Never commit `platforms.json` with real credentials to public repositories. Always use `platforms.json.example` as the template.

## Output

Credentials saved to:
- `.gmail-credentials.json`
- `.drive-credentials.json`
- `.jira-credentials.json`
- `.notion-credentials.json`
- `.discord-credentials.json`

Copy these files to your MCP server projects.

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Google (Gmail, Drive, Calendar, etc) | ✅ Ready | Pre-registered |
| Jira | ✅ Ready | Requires offline_access scope |
| Notion | ⚠️ Partial | Token exchange issues |
| Discord | ⚠️ Partial | Needs form-encoded support |

## Troubleshooting

**Token exchange failed: Unauthorized**
- Verify client_id and client_secret match exactly
- Check redirect_uri is registered in platform console
- Ensure credentials are still active

**No refresh token returned**
- Add appropriate scopes (e.g., `offline_access` for Jira)
- Some platforms don't issue refresh tokens
- Check platform-specific requirements

## License

MIT
