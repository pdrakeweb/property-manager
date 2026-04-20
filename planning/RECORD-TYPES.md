# Record Types

*Auto-generated from `src/records/registry.ts` by `scripts/generate-record-docs.mjs`. Do not edit by hand.*

19 record types currently managed by the DSL registry. Equipment is a polymorphic record — its per-subsystem field sets plug in via `src/records/equipmentProfiles.ts` (see the variants table under *Equipment* below).

## Equipment (`equipment`)

**Folder:** `Equipment/`   **Version:** 1   **Allow multiple:** yes   **Value path:** `values`

**AI tool:** Installed equipment (HVAC, generator, well, etc.) with nameplate details.

**Base fields** (shared by every variant):

| Field | Kind | Required | Notes |
|---|---|---|---|
| brand | text |  |  |
| model | text |  |  |
| serial_number | text |  |  |
| install_date | date |  |  |
| notes | textarea |  |  |

**Variants** (discriminator: `categoryId`) — one subsystem plugin per row:

| Key | Label | Folder | Extra fields |
|---|---|---|---|
| generator | Generator | `Generator/` | model_number, kw_rating, fuel_type, transfer_switch_brand, transfer_switch_amps, oil_type, oil_capacity_qt, air_filter_part, last_service_date |
| hvac | HVAC | `HVAC/` | unit_type, unit_label, tonnage, seer, refrigerant_type, filter_size |
| water_heater | Water Heater | `Water Heater/` | fuel_type, tank_gallons, btu_input |
| water_treatment | Water Treatment | `Water Treatment/` | system_type, location |
| appliance | Appliance | `Appliances/` | appliance_type, location |
| propane | Propane | `Propane/` | supplier, tank_gallons, ownership, tank_age_year, location, account_number |
| well | Well System | `Well System/` | pump_brand, pump_model, pump_hp, well_depth_ft, tank_brand, tank_gallons |
| septic | Septic System | `Septic System/` | tank_gallons, tank_material, last_pumped, pump_company, drainfield_info |
| electrical | Electrical Panel | `Electrical Panel/` | panel_type, amps, circuits, location |
| roof | Roof | `Roof/` | section, material, contractor, warranty_years, color |
| sump_pump | Sump Pump | `Sump Pump/` | pump_type, hp, location |
| radon | Radon Mitigation | `Radon Mitigation/` | contractor, fan_brand, last_test_level, last_test_date |
| barn | Barn | `Barn/` | structure_year, size_sqft, electrical, roof_material, condition |
| surveillance | Surveillance | `Surveillance/` | camera_brand, camera_model, location, resolution, nvr_brand, ip_address |
| forestry_cauv | Forestry CAUV | `Forestry CAUV/` | record_type, date, acres, contractor |
| service_record | Service Record | `Service Records/` | system, date, contractor, work_done, cost, invoice_ref |

## Vendor (`vendor`)

**Folder:** `Vendors/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Look up saved service vendors/contractors by name or type.

| Field | Kind | Required | Notes |
|---|---|---|---|
| name | text | ✓ |  |
| type | text |  |  |
| phone | text |  |  |
| email | text |  |  |
| license | text |  |  |
| rating | number |  | unit: stars |
| lastUsed | date |  |  |
| notes | textarea |  |  |

## Well Test (`well_test`)

**Folder:** `Well Tests/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Look up well water test results — pass/fail status, lab, parameters.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| lab | text |  |  |
| technician | text |  |  |
| overallResult | select | ✓ | options: pass, fail, advisory |
| nextTestDate | date |  |  |
| notes | textarea |  |  |
| parameters | array |  | of: [name, value, unit, passFail] |

## Maintenance Task (`task`)

**Folder:** `Maintenance Tasks/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Look up maintenance tasks for the current property (by status, category, or keyword).

| Field | Kind | Required | Notes |
|---|---|---|---|
| title | text | ✓ |  |
| systemLabel | text |  |  |
| categoryId | text |  |  |
| dueDate | date | ✓ |  |
| priority | select | ✓ | options: critical, high, medium, low |
| status | select | ✓ | options: overdue, due, upcoming, completed |
| recurrence | text |  |  |
| estimatedCost | currency |  |  |
| contractor | text |  |  |
| source | select |  | options: manual, ai-suggested, manufacturer, ha-trigger |
| notes | textarea |  |  |

## Service Event (`completed_event`)

**Folder:** `Service History/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Completed service events with cost, contractor, invoice, and labor warranty.

| Field | Kind | Required | Notes |
|---|---|---|---|
| taskTitle | text |  |  |
| completionDate | date | ✓ |  |
| categoryId | text |  |  |
| cost | currency |  |  |
| paymentMethod | select |  | options: cash, check, card, ach |
| invoiceRef | text |  |  |
| contractor | text |  |  |
| laborWarrantyExpiry | date |  |  |
| notes | textarea |  |  |

## Capital Transaction (`capital_transaction`)

**Folder:** `Capital/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Expenditures logged against capital replacement items.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| amount | currency | ✓ |  |
| capitalItemId | text |  |  |
| invoiceRef | text |  |  |
| notes | textarea |  |  |

## Capital Item Override (`capital_override`)

**Folder:** `Capital/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** —

| Field | Kind | Required | Notes |
|---|---|---|---|
| status | select | ✓ | options: planned, in-progress, complete |
| percentComplete | number |  | unit: % |

## Fuel Delivery (`fuel_delivery`)

**Folder:** `Fuel Deliveries/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Propane/heating-oil/fuel deliveries with gallons and price history.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| fuelType | select | ✓ | options: propane, heating_oil, diesel, gasoline, other |
| gallons | number | ✓ | unit: gal |
| pricePerGallon | currency | ✓ |  |
| totalCost | currency | ✓ |  |
| notes | textarea |  |  |

## Septic Event (`septic_event`)

**Folder:** `Septic System/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Septic pumping + inspection history.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| gallonsPumped | number |  | unit: gal |
| cost | currency |  |  |
| technician | text |  |  |
| conditionNotes | textarea |  |  |
| techNotes | textarea |  |  |
| nextRecommendedDate | date |  |  |

## Tax Assessment (`tax_assessment`)

**Folder:** `Tax Records/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** County property-tax assessed values by year.

| Field | Kind | Required | Notes |
|---|---|---|---|
| year | number | ✓ |  |
| assessedLand | currency | ✓ |  |
| assessedImprovement | currency | ✓ |  |
| totalAssessed | currency | ✓ |  |
| marketValue | currency |  |  |
| notes | textarea |  |  |

## Tax Payment (`tax_payment`)

**Folder:** `Tax Records/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Property-tax installment payments with due dates and amounts.

| Field | Kind | Required | Notes |
|---|---|---|---|
| year | number | ✓ |  |
| installment | select | ✓ | options: 1, 2 |
| dueDate | date | ✓ |  |
| paidDate | date |  |  |
| amount | currency | ✓ |  |
| penalty | currency |  |  |
| notes | textarea |  |  |

## Mortgage (`mortgage`)

**Folder:** `Mortgage/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Mortgage and HELOC accounts attached to the property.

| Field | Kind | Required | Notes |
|---|---|---|---|
| label | text | ✓ |  |
| lender | text | ✓ |  |
| accountNumber | text |  |  |
| originalBalance | currency | ✓ |  |
| currentBalance | currency | ✓ |  |
| interestRate | number |  | unit: % |
| termMonths | number |  | unit: months |
| startDate | date | ✓ |  |
| monthlyPayment | currency | ✓ |  |
| escrowAmount | currency |  |  |
| notes | textarea |  |  |

## Mortgage Payment (`mortgage_payment`)

**Folder:** `Mortgage/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Individual mortgage payment history with principal/interest split.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| amount | currency | ✓ |  |
| principal | currency | ✓ |  |
| interest | currency | ✓ |  |
| escrow | currency |  |  |
| extraPrincipal | currency |  |  |
| notes | textarea |  |  |

## Utility Account (`utility_account`)

**Folder:** `Utilities/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Utility providers linked to the property (electric, gas, water, internet, etc.).

| Field | Kind | Required | Notes |
|---|---|---|---|
| type | select | ✓ | options: electric, gas, water, sewer, trash, internet, phone, other |
| provider | text | ✓ |  |
| accountNumber | text |  |  |
| notes | textarea |  |  |

## Utility Bill (`utility_bill`)

**Folder:** `Utilities/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Monthly utility bills with consumption and cost.

| Field | Kind | Required | Notes |
|---|---|---|---|
| periodStart | date | ✓ |  |
| periodEnd | date | ✓ |  |
| consumption | number |  |  |
| unit | text |  |  |
| totalCost | currency | ✓ |  |
| ratePerUnit | currency |  |  |
| notes | textarea |  |  |

## Insurance Policy (`insurance`)

**Folder:** `Insurance/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Insurance policies covering the property — coverage, renewal, agent.

| Field | Kind | Required | Notes |
|---|---|---|---|
| type | select | ✓ | options: homeowners, farm, umbrella, flood, auto, equipment, other |
| insurer | text | ✓ |  |
| policyNumber | text | ✓ |  |
| status | select | ✓ | options: active, expired, cancelled, pending |
| effectiveDate | date | ✓ |  |
| renewalDate | date | ✓ |  |
| annualPremium | currency |  | unit: /yr |
| notes | textarea |  |  |

## Permit (`permit`)

**Folder:** `Permits/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Building/electrical/plumbing/zoning permits with status and expiry.

| Field | Kind | Required | Notes |
|---|---|---|---|
| type | select | ✓ | options: building, electrical, plumbing, septic, well, zoning, inspection, certificate, other |
| status | select | ✓ | options: open, approved, expired, rejected, pending_inspection |
| permitNumber | text | ✓ |  |
| description | textarea | ✓ |  |
| issuer | text | ✓ |  |
| issuedDate | date |  |  |
| expiryDate | date |  |  |
| inspectionDate | date |  |  |
| contractor | text |  |  |
| cost | currency |  |  |
| notes | textarea |  |  |

## Road Event (`road`)

**Folder:** `Road Maintenance/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Road / driveway maintenance history — gravel, plowing, culverts, washouts.

| Field | Kind | Required | Notes |
|---|---|---|---|
| date | date | ✓ |  |
| maintenanceTypeId | select | ✓ | options: gravel_delivery, culvert_cleaning, plowing_service, washout_repair, vegetation_control, gate_maintenance, other |
| vendor | text | ✓ |  |
| quantity | number |  |  |
| unit | text |  |  |
| areaDescription | textarea |  |  |
| cost | currency |  |  |
| notes | textarea |  |  |

## Generator (`generator_log`)

**Folder:** `Generator/`   **Version:** 1   **Allow multiple:** yes

**AI tool:** Generator equipment with cumulative runtime hours and service history.

| Field | Kind | Required | Notes |
|---|---|---|---|
| name | text | ✓ |  |
| model | text |  |  |
| installedYear | number |  |  |
| cumulativeHours | number |  | unit: hrs |
| lastServiceHours | number |  | unit: hrs |
| notes | textarea |  |  |
| entries | array |  | of: [date, hours, reason, source] |
