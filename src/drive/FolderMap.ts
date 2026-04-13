/**
 * Maps logical category keys to known Google Drive folder IDs.
 * IDs sourced from 2392 Tannerville Rd drive structure, April 2026.
 */
export const DRIVE_FOLDER_MAP: Record<string, string> = {
  root:           '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt',
  projects:       '1f31FjL-3eGa-Xr_rxMMIWHwqaVCViu4i',
  hvac:           '1f7Fbetgic7wMubOKVZr4GZbbzPMJK255',
  kitchen:        '1G83sNSxGb43ZcNU1AA6kuVcCKeMkzfLY',
  waterTreatment: '1b_dq5qNSF8AxrN2tXszgy98IaxHuruFh',
  propane:        '1iNccKytMpi4qrgteaxbmB4VYm3iTPMbA',
  roof:           '1CzArWstlwApmlZcKW87PYK81167Aq0Rn',
  dormers:        '1egqQpspUYTF7UVAqtfOiAhkIqMuc4Qjw',
  basement:       '1XnCnKnVsEe9DxCpxzYtcjo3gL6Vyl6lT',
  sunroom:        '1YuGyat--XsqJ9I-5RJfqGfchJfBDY0dJ',
  generator:      '1f6ceFGDaMRwQO_7OcxGHywuFolFJ5Hpg',
  surveillance:   '1beJLvmhjU0vm3yBa7dnVnJ2qEwtk-nv8',
  cauv:           '1jlkefvZg8gkmVDkBU-gsJUYwA5mmNooU',
  purchase:       '1ft5ut6b66wWm_7rBcXYYhJg7QZ8ri1Jh',
  invoices:       '1KhSADp7RI45t24CuircQIrRBQaiNZIjw',
}

/**
 * Category keys that have no pre-existing Drive folder.
 * DriveClient will auto-create them under root on first use and cache the result.
 */
export const AUTO_CREATE_FOLDERS = ['septic', 'barn', 'well', 'electrical', 'laundry', 'sump', 'radon']

/** Human-readable display names for auto-created folders. */
export const AUTO_CREATE_FOLDER_NAMES: Record<string, string> = {
  septic:     'Septic',
  barn:       'Barn',
  well:       'Well System',
  electrical: 'Electrical',
  laundry:    'Laundry',
  sump:       'Sump Pump',
  radon:      'Radon Mitigation',
}
