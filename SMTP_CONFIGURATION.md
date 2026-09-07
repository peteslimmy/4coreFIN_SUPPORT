# SMTP Configuration Update

## Update Details
- **Timestamp:** 2026-08-26 07:35:22
- **Updated by:** System automation via Supabase direct database update

## SMTP Server Configuration
- **Host:** smtp.mailersend.net
- **Port:** 587 (alternative: 2525)
- **Security Protocol:** TLS

## Credentials
- **Username:** MS_Cs8jxG@test-2p0347z19oylzdrn.mlsender.net
- **Password:** [REDACTED — was committed in plaintext here; credential must be rotated. Live value lives encrypted in the `config` table.]

## Email Settings (Updated for Domain Verification)
- **From Email:** MS_Cs8jxG@test-2p0347z19oylzdrn.mlsender.net
- **From Name:** 4core Support

## Important Notes
1. **Domain Verification Fix:** The from_email has been updated to match the SMTP username domain (test-2p0347z19oylzdrn.mlsender.net) to satisfy MailerSend's domain verification requirement.
2. **Original from_email (peter@4coretech.com)** would require domain verification in your MailerSend account.
3. **Encryption:** The SMTP password is stored in encrypted form in the database using the application's encryption service.
4. **MailerSend Service:** This configuration uses MailerSend SMTP service with standard submission port 587 and TLS encryption.

## Verification
The settings have been verified to be correctly stored in the database as of the timestamp above.

---
*This file was generated automatically as part of the SMTP configuration update process to resolve domain verification issues.
