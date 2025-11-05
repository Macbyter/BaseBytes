# BaseBytes Mini-App Connector — Security

This document outlines security measures and best practices for the BaseBytes Mini-App Connector.

---

## Security Measures

### 1. Path Traversal Protection ✅

**Issue:** Idempotency keys and receipt UIDs could contain path traversal sequences (`../`, `../../etc/passwd`, etc.)

**Mitigation:**
- All file path components are sanitized using `sanitizeKey()` function
- Only alphanumeric characters, hyphens, and underscores are allowed (`[a-zA-Z0-9_-]`)
- Maximum length: 64 characters
- Invalid characters are replaced with underscores
- Requests with unsafe idempotency keys are rejected with HTTP 400

**Example:**
```js
// Input: "../../../../etc/passwd"
// Sanitized: "____________etc_passwd"
// Result: Rejected (doesn't match original)
```

---

### 2. API Key Authentication ✅

**Configuration:**
```env
MINI_API_KEY=your-secret-key
```

**Enforcement:**
- All endpoints check `x-api-key` header
- Missing or invalid keys return HTTP 401
- Optional: Can be disabled for testing (not recommended for production)

**Best Practices:**
- Use strong, random API keys (32+ characters)
- Rotate keys regularly
- Never commit keys to version control
- Use environment variables or secrets management

---

### 3. Rate Limiting ✅

**Configuration:**
```env
MINI_RPS=20  # requests per minute
```

**Protection:**
- Default: 20 requests per minute per IP
- Prevents abuse and DoS attacks
- Returns HTTP 429 when limit exceeded

**Tuning:**
- Increase for high-traffic partners
- Decrease for stricter protection
- Consider per-API-key limits for production

---

### 4. Address Validation ✅

**Payout Endpoint:**
- Validates Ethereum addresses using regex: `^0x[a-fA-F0-9]{40}$`
- Rejects invalid addresses with HTTP 400
- Prevents sending funds to invalid destinations

**Example:**
```js
// Valid: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
// Invalid: "0xinvalid", "not-an-address"
```

---

### 5. Balance Checks ✅

**Live Payout Mode:**
- Checks USDC balance before transfer
- Returns `insufficient_funds` status if balance too low
- Prevents failed transactions

---

### 6. Idempotency ✅

**Protection Against:**
- Duplicate payouts
- Race conditions
- Network retries

**Implementation:**
- Idempotency keys stored in `diagnostics/payout_*.json`
- Repeat requests return cached result
- No double-spending

---

### 7. Input Validation ✅

**Decision Endpoint:**
- Requires: `sku`, `appId`, `subject`, `features`
- Validates all required fields
- Returns HTTP 400 for invalid payloads

**Payout Endpoint:**
- Requires: `appId`, `to`, `amountUsd` OR `amountUSDC`
- Validates address format
- Validates amount is positive
- Returns HTTP 400 for invalid payloads

---

### 8. CORS Configuration ✅

**Current:**
```js
app.register(cors, { origin: true });
```

**Production Recommendation:**
```js
app.register(cors, { 
  origin: ['https://your-app.com', 'https://partner-app.com'],
  credentials: true 
});
```

---

### 9. Database Security ✅

**Connection:**
- Supports SSL/TLS via `sslmode=require` in `DATABASE_URL`
- Parameterized queries prevent SQL injection
- Uses `pg` library with prepared statements

**Example:**
```env
DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require
```

---

### 10. Private Key Protection ✅

**Configuration:**
```env
PAYOUT_SIGNER_PK=0x...
```

**Best Practices:**
- Never commit private keys to version control
- Use environment variables or secrets management (AWS Secrets Manager, HashiCorp Vault)
- Rotate keys regularly
- Use separate keys for testnet and mainnet
- Limit key permissions (only USDC transfer, not full wallet control)

---

## Security Checklist

### Before Production

- [ ] Set strong `MINI_API_KEY` (32+ characters)
- [ ] Enable SSL/TLS for database connections
- [ ] Configure CORS with specific origins
- [ ] Use secrets management for `PAYOUT_SIGNER_PK`
- [ ] Enable HTTPS (use reverse proxy like nginx)
- [ ] Set appropriate rate limits (`MINI_RPS`)
- [ ] Monitor metrics for anomalies
- [ ] Test with `PAYOUTS_MODE=simulate` first
- [ ] Verify address validation works
- [ ] Test idempotency with duplicate requests
- [ ] Review logs for security events
- [ ] Set up alerting for failed authentication attempts

---

## Threat Model

### Mitigated Threats

1. **Path Traversal** ✅
   - Sanitized file paths
   - Rejected unsafe keys

2. **Unauthorized Access** ✅
   - API key authentication
   - Rate limiting

3. **Invalid Addresses** ✅
   - Address validation
   - Balance checks

4. **Duplicate Payouts** ✅
   - Idempotency support

5. **SQL Injection** ✅
   - Parameterized queries

6. **DoS Attacks** ✅
   - Rate limiting

---

### Remaining Considerations

1. **DDoS Protection**
   - Consider using a CDN or DDoS protection service (Cloudflare, AWS Shield)

2. **API Key Rotation**
   - Implement key rotation mechanism
   - Support multiple active keys during transition

3. **Audit Logging**
   - Log all payout requests
   - Log authentication failures
   - Retain logs for compliance

4. **Monitoring**
   - Set up alerts for:
     - Failed authentication attempts
     - Unusual payout patterns
     - High error rates
     - Balance depletion

5. **Compliance**
   - KYC/AML requirements for payouts
   - Data privacy (GDPR, CCPA)
   - Financial regulations

---

## Incident Response

### If Compromised

1. **Immediate Actions:**
   - Rotate `MINI_API_KEY`
   - Rotate `PAYOUT_SIGNER_PK`
   - Review recent payout transactions
   - Check for unauthorized file writes

2. **Investigation:**
   - Review logs for suspicious activity
   - Check diagnostics/*.json for anomalies
   - Verify database integrity
   - Check USDC balance

3. **Recovery:**
   - Restore from backup if needed
   - Notify affected partners
   - Document incident
   - Update security measures

---

## Reporting Security Issues

If you discover a security vulnerability, please report it to:

**Email:** security@basebytes.io (or your security contact)

**Do NOT:**
- Open public GitHub issues for security vulnerabilities
- Disclose vulnerabilities publicly before patch is available

**We will:**
- Acknowledge receipt within 24 hours
- Provide status updates every 48 hours
- Credit researchers (if desired)
- Patch critical issues within 7 days

---

## Security Updates

### v1.0.1 (2025-11-04)

**Fixed:**
- P1: Path traversal vulnerability in idempotency key handling
- Added `sanitizeKey()` function to sanitize file paths
- Reject idempotency keys with unsafe characters

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Fastify Security](https://www.fastify.io/docs/latest/Guides/Security/)
- [Ethereum Security](https://ethereum.org/en/developers/docs/security/)

---

**Last Updated:** November 4, 2025  
**Version:** 1.0.1
