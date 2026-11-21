# ShopLedger

Small Express application for shop orders, GST invoices, inventory, and customer Khata balances. Data is stored in `data/db.json`.

## Run

`npm start`

## Rules

- Keep changes small and avoid new dependencies.
- Reuse shared pricing and inventory logic; do not duplicate business calculations.
- Keep monetary values rounded with the existing `round2` helpers.
- Run the test suite before handing off changes.

## Test

`npm test`
