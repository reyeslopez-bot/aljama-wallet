# Compliance governance register

The admin-only register at `/{locale}/compliance/governance` stores manual GDPR, SOC 2, and ISO 27001 work records for data inventories, DPIAs, risks, privileged access reviews, change evidence, incident exercises, vendor assessments, ISMS controls, internal audits, and management reviews. Records are status-transitioned with an application-level actor/status/summary event history; the UI shows up to the latest 100 status events per record.

## Deployment

1. Apply the PostgreSQL migrations with `pnpm prisma:migrate:deploy:pg`.
2. Set `AUTH_ADMIN_EMAILS` to a comma-separated list of authorized staff email addresses. This environment allowlist is the source of admin authorization.
3. Sign in with an account whose email is on that allowlist and open the governance register from the compliance roadmap.
4. Link evidence using an HTTPS URL that authorized reviewers can access. Do not store secrets, private keys, recovery phrases, or sensitive customer details in the register.
5. Review the access register output and perform any permission changes in the deployment configuration separately. Record the actual resulting change as evidence.

Access-review records snapshot each configured admin principal and require an individual disposition and rationale. This captures a reviewer assertion; it does not itself remove or change anyone's permissions. Records can only be marked implemented when an HTTPS evidence link is present, and every status change requires a rationale.

The register is a tracking and evidence aid, not an automated policy engine, evidence attestation system, or certification. Reviewers must ensure entries are accurate, links are retained and accessible, evidence meets policy, risk acceptance is authorized, and reviews and exercises actually occur. Organizational scope, control applicability, legal basis, data inventory, vendor due diligence, independent audit, and management approval still require responsible human owners.
