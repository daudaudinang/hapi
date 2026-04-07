# V\u00ed d\u1ee5 End-to-End: Review Plan Tier L \u2014 Blocker (C\u1ea6N XEM L\u1ea0I)

V\u00ed d\u1ee5 n\u00e0y minh h\u1ecda workflow deep review Tier L v\u1edbi Blocker findings.

---

## Input

```
/review-plan .agents/plans/PLAN_PAYMENT_GATEWAY.md
```

---

## B\u01b0\u1edbc 0: Kh\u1edfi t\u1ea1o

- **Tier**: L (cross-cutting, 12+ files, payment \u2014 high risk)
- **Format**: \u2705 Template v3 chu\u1ea9n
- **References**: `docs/payment-spec.md`, `docs/security-requirements.md`

## B\u01b0\u1edbc 1: \u0110\u1ecdc plan

**Sections checklist:**
- \u2705 M\u1ee5c ti\u00eau, Non-goals, B\u1ed1i c\u1ea3nh
- \u2705 Acceptance Criteria (5 ACs)
- \u2705 Execution Boundary
- \u274c Implementation Order \u2014 thi\u1ebfu
- \u274c Pre-flight Check \u2014 thi\u1ebfu
- \u2705 Thi\u1ebft k\u1ebf k\u1ef9 thu\u1eadt
- \u26a0\ufe0f Risks \u2014 d\u00f9ng flat list thay v\u00ec Risk Matrix
- \u26a0\ufe0f Test plan \u2014 c\u00f3 nh\u01b0ng thi\u1ebfu edge cases

## B\u01b0\u1edbc 1.5: Structural Validation

| Section | Format | Check |
|---------|--------|-------|
| AC | B\u1ea3ng nh\u01b0ng thi\u1ebfu Verify Command c\u1ed9t | \u274c |
| Execution Boundary | C\u00f3 Allowed, thi\u1ebfu Do NOT Modify | \u274c |
| Risk | Flat list (kh\u00f4ng ph\u1ea3i matrix) | \u26a0\ufe0f |
| Implementation Order | Kh\u00f4ng c\u00f3 | \u274c |
| Pre-flight Check | Kh\u00f4ng c\u00f3 | \u274c |

## B\u01b0\u1edbc 2: \u0110\u1ed1i chi\u1ebfu (deep)

| File | T\u1ed3n t\u1ea1i? | M\u00f4 t\u1ea3 kh\u1edbp? |
|------|----------|-------------|
| `services/payment.ts` | \u2705 | \u274c Plan n\u00f3i `processPayment()` nh\u01b0ng th\u1ef1c t\u1ebf l\u00e0 `handlePayment()` |
| `api/routes/payment.ts` | \u2705 | \u2705 |
| `models/transaction.ts` | \u274c | File kh\u00f4ng t\u1ed3n t\u1ea1i \u2014 th\u1ef1c t\u1ebf l\u00e0 `models/order-transaction.ts` |

**Thi\u1ebfu s\u00f3t qua grep:**
- `grep_search "payment"` \u2192 `middleware/payment-validator.ts` ch\u01b0a nh\u1eafc \u2014 middleware validate input
- `grep_search "webhook"` \u2192 `api/webhooks/stripe.ts` ch\u01b0a nh\u1eafc \u2014 webhook handler

**Cross-reference:**
- `docs/security-requirements.md` y\u00eau c\u1ea7u PCI-DSS compliance \u2014 plan kh\u00f4ng nh\u1eafc
- `docs/payment-spec.md` quy \u0111\u1ecbnh retry 3 l\u1ea7n cho failed \u2014 plan kh\u00f4ng cover

## B\u01b0\u1edbc 3: \u0110\u00e1nh gi\u00e1

| # | Ti\u00eau ch\u00ed | \u0110i\u1ec3m | H\u1ec7 s\u1ed1 | Weighted |
|---|----------|------|-------|---------|
| 1 | \u0110\u1ed9 ch\u00ednh x\u00e1c | 4/10 | \u00d73 | 12 |
| 2 | \u0110\u1ed9 \u0111\u1ea7y \u0111\u1ee7 | 5/10 | \u00d73 | 15 |
| 3 | AC | 6/10 | \u00d73 | 18 |
| 4 | Execution Boundary | 5/10 | \u00d73 | 15 |
| 5 | Risks (Risk Matrix) | 4/10 | \u00d73 | 12 |
| 6 | Backward compat. | 7/10 | \u00d73 | 21 |
| 7 | Thi\u1ebft k\u1ebf | 6/10 | \u00d72 | 12 |
| 8 | Test plan | 5/10 | \u00d72 | 10 |
| 9 | Dependencies | 6/10 | \u00d72 | 12 |
| 10 | M\u1edf r\u1ed9ng | 7/10 | \u00d71 | 7 |
| 11 | Impl. Order | 0/10 | \u00d71 | 0 |
| 12 | Pre-flight | 0/10 | \u00d71 | 0 |
| | **Total** | | | **134/270 (49.6%)** |

**Override:** Ti\u00eau ch\u00ed Cao #1 (4/10) v\u00e0 #5 (4/10) \u2264 5 \u2192 **auto-downgrade**

## B\u01b0\u1edbc 4: Output

```markdown
## \ud83d\udccb K\u1ebft qu\u1ea3 Review Plan: Payment Gateway

> **Tier**: L | **Review depth**: Deep

### \u2705 Nh\u1eefng \u0111i\u1ec3m Plan l\u00e0m t\u1ed1t

| H\u1ea1ng m\u1ee5c | \u0110\u00e1nh gi\u00e1 |
|----------|----------|
| Non-goals | \u2705 R\u00f5 r\u00e0ng \u2014 lo\u1ea1i tr\u1eeb refund flow, subscription billing |
| API design | \u2705 RESTful endpoints \u0111\u00fang convention: POST /payments, GET /payments/:id |

---

### \u26a0\ufe0f Nh\u1eefng \u0111i\u1ec3m c\u1ea7n b\u1ed5 sung/\u0111i\u1ec1u ch\u1ec9nh

#### \ud83d\udd34 Blocker

##### 1. **Function name sai: `processPayment()` vs `handlePayment()`**
**V\u1ea5n \u0111\u1ec1:** Plan reference `processPayment()` nh\u01b0ng t\u1ea1i `services/payment.ts:45` function t\u00ean l\u00e0 `handlePayment()`.
**\u0110\u1ec1 xu\u1ea5t:** S\u1eeda to\u00e0n b\u1ed9 references trong plan.

##### 2. **File path sai: `models/transaction.ts`**
**V\u1ea5n \u0111\u1ec1:** File n\u00e0y kh\u00f4ng t\u1ed3n t\u1ea1i. Th\u1ef1c t\u1ebf: `models/order-transaction.ts`.
**\u0110\u1ec1 xu\u1ea5t:** S\u1eeda path + ki\u1ec3m tra l\u1ea1i field names.

##### 3. **Thi\u1ebfu PCI-DSS compliance (t\u1eeb security-requirements.md)**
**V\u1ea5n \u0111\u1ec1:** `docs/security-requirements.md:23` y\u00eau c\u1ea7u PCI-DSS nhưng plan kh\u00f4ng nh\u1eafc.
**\u0110\u1ec1 xu\u1ea5t:** Th\u00eam section Security/Compliance v\u00e0o plan.

#### \ud83d\udfe0 Major

##### 1. **Thi\u1ebfu middleware + webhook handler**
**V\u1ea5n \u0111\u1ec1:** `payment-validator.ts` v\u00e0 `stripe.ts` ch\u01b0a trong Execution Boundary.
**\u0110\u1ec1 xu\u1ea5t:** B\u1ed5 sung 2 files v\u00e0o Allowed Files + th\u00eam m\u00f4 t\u1ea3 thay \u0111\u1ed5i.

##### 2. **Thi\u1ebfu retry logic (t\u1eeb payment-spec.md)**
**V\u1ea5n \u0111\u1ec1:** `docs/payment-spec.md:67` quy \u0111\u1ecbnh retry 3 l\u1ea7n. Plan kh\u00f4ng cover.
**\u0110\u1ec1 xu\u1ea5t:** Th\u00eam retry mechanism v\u00e0o thi\u1ebft k\u1ebf k\u1ef9 thu\u1eadt.

##### 3. **Risks d\u00f9ng flat list, thi\u1ebfu Risk Matrix**
**\u0110\u1ec1 xu\u1ea5t:** Chuy\u1ec3n sang b\u1ea3ng Likelihood \u00d7 Impact \u00d7 Mitigation.

#### \ud83d\udfe1 Minor

##### 1. **Thi\u1ebfu Implementation Order v\u00e0 Pre-flight Check**
**\u0110\u1ec1 xu\u1ea5t:** B\u1ed5 sung theo template v3.

---

### \ud83d\udcca T\u1ed5ng k\u1ebft

| Ti\u00eau ch\u00ed | \u0110i\u1ec3m | Nh\u1eadn x\u00e9t |
|----------|------|----------|
| \u0110\u1ed9 ch\u00ednh x\u00e1c | 4/10 | 2 ch\u1ed7 sai (function name, file path) |
| \u0110\u1ed9 \u0111\u1ea7y \u0111\u1ee7 | 5/10 | Thi\u1ebfu middleware, webhook, PCI-DSS |
| AC | 6/10 | C\u00f3 nh\u01b0ng thi\u1ebfu Verify Command |
| Execution Boundary | 5/10 | Thi\u1ebfu Do NOT Modify + 2 files |
| Risks (Risk Matrix) | 4/10 | Flat list, thi\u1ebfu severity + mitigation |
| Backward compat. | 7/10 | API endpoints gi\u1eef nguy\u00ean |
| Thi\u1ebft k\u1ebf | 6/10 | C\u01a1 b\u1ea3n r\u00f5 nh\u01b0ng thi\u1ebfu retry + security |
| Test plan | 5/10 | Ch\u1ec9 happy paths, thi\u1ebfu edge cases |
| Dependencies | 6/10 | C\u00f3 nh\u01b0ng thi\u1ebfu Stripe SDK version |
| M\u1edf r\u1ed9ng | 7/10 | Modular structure |
| Impl. Order | 0/10 | Thi\u1ebfu section |
| Pre-flight | 0/10 | Thi\u1ebfu section |

**Weighted Score:** 134/270 pts (49.6%)

**K\u1ebft lu\u1eadn:** \u274c **C\u1ea6N XEM L\u1ea0I** \u2014 C\u00f3 3 Blocker c\u1ea7n s\u1eeda tr\u01b0\u1edbc khi implement.

---

### \ud83d\udcac C\u00e2u h\u1ecfi cho User

1. PCI-DSS compliance c\u1ea7n \u1edf m\u1ee9c n\u00e0o? (Level 1 / Level 2 / SAQ-A?)
2. Retry logic: dùng exponential backoff hay fixed interval?
```
