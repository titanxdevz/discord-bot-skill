# 09 — Quality & Testing

Quality here means: the bot cannot send a malformed payload, cannot double-respond, and cannot
lose data under a race. Tests exist to prove those three things, not to raise a coverage number.

## 1. Gates (run in this order)

| Gate | Purpose | If absent |
|---|---|---|
| Formatter | No diff noise | Add the ecosystem default (`prettier`/`biome`, `black`/`ruff format`, `gofmt`, `cargo fmt`, `dotnet format`) |
| Linter | Catches unused code, unsafe patterns | `eslint`/`biome`, `ruff`, `clippy`, `checkstyle`/`detekt`, analyzers |
| Types | Payload shapes, null handling | `tsc --noEmit`, `mypy`/`pyright`, Rust compiler, Java/C# compilers |
| Tests | Behaviour | `vitest`/`jest`, `pytest`, `cargo test`, JUnit, xUnit |
| Dependency audit | Known CVEs | `npm audit`, `pip-audit`, `cargo audit`, `dotnet list package --vulnerable` |

Wire them into one command (`npm run check`, `make check`, `just check`) and into CI. A fix is not
done until that command passes, or until you state exactly which gate could not run and why.

## 2. What to test (priority order)

1. **Pure domain logic** — validators, parsers, name formatting, permission decisions, state
   transitions. Fast, no mocks, highest bug yield.
2. **Interaction envelope handling** — given a payload, the handler acknowledges once and returns
   the expected response shape.
3. **`custom_id` routing** — every namespace resolves; malformed/unknown IDs are rejected safely.
4. **Authorization** — a non-owner click on an owner-only action is refused, not just hidden.
5. **Repository/DB** — constraints, idempotent migrations, transactional invariants.
6. **Queue jobs** — idempotency (running twice changes nothing), retry classification.
7. **Payload contracts** — snapshots of panel/embed/CV2 payloads so a refactor cannot silently
   drop a component or exceed limits.

Do not unit test the Discord library itself. Test your mapping onto it.

## 3. Test doubles

- **REST**: intercept at the HTTP layer (msw/undici MockAgent, responses, respx) and assert the
  exact JSON body, not just that "something was called".
- **Gateway**: feed synthetic event objects into your handler function directly; do not open a
  socket in unit tests. One optional integration test may use a real test guild.
- **Time**: inject a clock for cooldowns, giveaways, and token expiry. Never `sleep` in tests.
- **Randomness**: inject RNG for giveaway draws so winners are reproducible.
- **DB**: temp file or in-memory SQLite per test; a disposable Postgres schema/container for
  integration tests. Never point tests at production.

## 4. Interaction lifecycle tests

The three failures worth a dedicated test each:

```text
1. slow handler defers before the first await  → exactly one ack, then edit
2. handler throws before ack                   → error reply, still exactly one ack
3. handler throws after ack                    → follow-up or edit, never a second reply
```

Assert on a call log (`reply`, `deferReply`, `editReply`, `followUp`) — the count matters more than
the text. A test that passes with two replies is a broken test.

Also test:

- component click by a user who lacks permission → refusal message
- click on a stale resource (row deleted) → specific message + cleanup
- unknown `custom_id` → logged, no crash
- autocomplete responds within the window with ≤25 choices

## 5. Contract & limit tests

Write assertions that fail loudly when a limit is crossed:

- message content length, embed count and total embed characters
- classic: ≤5 action rows, ≤5 buttons per row, one select per row
- CV2: component count ≤40, no `content`/`embeds` in the payload, flag present
- `custom_id` length 1–100 and uniqueness per message
- button label ≤80, select options ≤25, option label/value ≤100
- command payloads: name regex, description length, option count, no duplicate names

Snapshot the built payload (stable serialization: sort keys, no timestamps) and review the diff
when it changes. Never auto-accept snapshots in CI.

## 6. Migration tests

- Apply all migrations to an empty DB → succeeds.
- Apply twice → no error (idempotency).
- Apply on a seeded old-schema copy → data preserved, backfill correct.
- Assert indexes/constraints exist where you rely on them.

## 7. Regression discipline

- Every bug fix gets a failing test first, then the fix.
- Bug reports about interactions usually need a lifecycle test, not a unit test of the command.
- Keep a short list of production incidents mapped to tests; revisit when touching that area.

## 8. CI shape

```yaml
check:      install → format --check → lint → typecheck → test → build
integration: (optional) service containers + migrations + mocked REST suite
```

- Cache dependencies; pin the runtime version.
- Fail on warnings for types where feasible.
- Never let CI run against production tokens or guilds.
- Upload logs/artifacts on failure; keep the run reproducible locally.

## 9. Review checklist

- [ ] One `check` command exists and passes locally
- [ ] CI runs format/lint/types/tests on every change
- [ ] Domain logic is tested without Discord mocks
- [ ] Interaction ack lifecycle has a test (single-ack assertion)
- [ ] Authorization refusal has a test
- [ ] Payload snapshots enforce API limits
- [ ] Migrations tested for idempotency on a seeded DB
- [ ] Every bug fix shipped with a regression test
- [ ] Tests never use production credentials or data
