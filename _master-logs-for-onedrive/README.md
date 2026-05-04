# Master log files

These are pre-built Excel master log files for each form. You can OPTIONALLY
upload them to your OneDrive `Metfraa-EHS/` folder to pre-create the structure.

If you skip this, the app will auto-create each `_MasterLog.xlsx` on the first
submission to that form — same end result.

## Contents

- `_ALL-MASTER-LOGS.xlsx` — single workbook with one sheet per form (for review)
- Folder per form (matching the OneDrive structure):
  - `01-Toolbox-Talks/_MasterLog.xlsx`
  - `02-Induction/_MasterLog.xlsx`
  - ... etc.

## To upload

1. Open OneDrive (logged in as `info@metfraa.com`)
2. Create the folder `Metfraa-EHS` at the root if it doesn't exist
3. Drag the contents of THIS folder (the per-form folders) into `Metfraa-EHS/`

DO NOT drag the `_ALL-MASTER-LOGS.xlsx` workbook — that's just for your reference.

## Important

These files should NOT be in your git repo or deployment. They're for OneDrive
seeding only. The `_master-logs-for-onedrive/` folder name starts with an
underscore so it's clearly a "side artifact" that doesn't belong in the app.
