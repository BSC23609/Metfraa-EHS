// ============================================================================
// METFRAA EHS — Form Configuration (Single Source of Truth)
// ----------------------------------------------------------------------------
// Every form in the app is defined here. The frontend renders forms from this
// config, and the backend validates submissions against it. To add/edit a
// form, edit ONLY this file — no other code changes needed.
// ============================================================================

// Approver options shared across all forms
const APPROVERS = ['Varadharaj', 'Nirmal Kumar'];

// Pre-defined inspectors for the dropdown (free text always allowed too)
// EDIT THIS LIST as your team changes
const INSPECTORS = [
  'Varadharaj',
  'Nirmal Kumar',
  // Add more names here
];

// ----------------------------------------------------------------------------
// CATEGORY A — General EHS Records (5 forms with unique field sets)
// ----------------------------------------------------------------------------

const TOOLBOX = {
  id: 'toolbox',
  code: 'TBT',
  title: 'Toolbox Talk',
  category: 'general',
  folder: '01-Toolbox-Talks',
  icon: '🛠️',
  fields: [
    { key: 'project_name',     label: 'Project Name',                       type: 'text',     required: true },
    { key: 'participants',     label: 'No. of Persons Participated',        type: 'number',   required: true, min: 1 },
    { key: 'date',             label: 'Date',                               type: 'date',     required: true, autofill: 'today' },
    { key: 'time',             label: 'Time',                               type: 'time',     required: true, autofill: 'now' },
    { key: 'location',         label: 'Location',                           type: 'text',     required: true },
    { key: 'topics_covered',   label: 'Topics Covered',                     type: 'textarea', required: true },
    { key: 'conducted_by',     label: 'Conducted By',                       type: 'inspector',required: true },
    { key: 'approved_by',      label: 'Approved By',                        type: 'radio',    required: true, options: APPROVERS },
    { key: 'tbt_photo',        label: 'TBT Conducted Photo',                type: 'photo',    required: true },
    { key: 'attendance_sheet', label: 'TBT Attendance Sheet',               type: 'photo',    required: true },
  ],
};

const INDUCTION = {
  id: 'induction',
  code: 'IND',
  title: 'Induction',
  category: 'general',
  folder: '02-Induction',
  icon: '👷',
  fields: [
    { key: 'project_name',         label: 'Project Name',                   type: 'text',     required: true },
    { key: 'project_location',     label: 'Project Location',               type: 'text',     required: true },
    { key: 'induction_date',       label: 'Date of Induction',              type: 'date',     required: true, autofill: 'today' },
    { key: 'employee_name',        label: 'Employee / Worker Name',         type: 'text',     required: true },
    { key: 'contractor_name',      label: 'MSB / Sub-Contractor Name',      type: 'text',     required: true },
    { key: 'emergency_contact',    label: 'Emergency Contact Number',       type: 'tel',      required: true, pattern: '[0-9+\\- ]{7,15}' },
    { key: 'father_name',          label: 'Father Name',                    type: 'text',     required: true },
    { key: 'dob',                  label: 'Date of Birth',                  type: 'date',     required: true },
    { key: 'aadhaar_photo',        label: 'Aadhaar Card Pic (Front & Back)',type: 'photo',    required: true, multiple: true },
    { key: 'induction_document',   label: 'Induction Document',             type: 'photo',    required: true },
    { key: 'conducted_by',         label: 'Conducted By',                   type: 'inspector',required: true },
    { key: 'approved_by',          label: 'Approved By',                    type: 'radio',    required: true, options: APPROVERS },
  ],
};

const EHS_AUDIT = {
  id: 'ehs-audit',
  code: 'AUD',
  title: 'EHS Audit',
  category: 'general',
  folder: '03-EHS-Audit',
  icon: '🔍',
  fields: [
    { key: 'audit_date',           label: 'Audit Conducted Date',           type: 'date',     required: true, autofill: 'today' },
    { key: 'auditee',              label: 'Auditee',                        type: 'inspector',required: true },
    { key: 'site_name',            label: 'Site Name',                      type: 'text',     required: true },
    { key: 'exact_location',       label: 'Exact Location',                 type: 'text',     required: true },
    { key: 'observation',          label: 'Observation',                    type: 'textarea', required: true },
    { key: 'photo_evidence',       label: 'Photographic Evidence',          type: 'photo',    required: true, multiple: true },
    { key: 'category',             label: 'Category',                       type: 'select',   required: true,
      options: ['Unsafe Acts', 'Unsafe Conditions', 'Dangerous Occurrences'] },
    { key: 'corrective_action',    label: 'Corrective Action',              type: 'textarea', required: true },
    { key: 'preventive_action',    label: 'Preventive Action',              type: 'textarea', required: true },
    { key: 'responsible_person',   label: 'Responsible Person',             type: 'text',     required: true },
    { key: 'target_date',          label: 'Target Date',                    type: 'date',     required: true },
  ],
};

const INCIDENT = {
  id: 'incident',
  code: 'INC',
  title: 'Incident / Accident Report',
  category: 'general',
  folder: '04-Incident-Reports',
  icon: '⚠️',
  fields: [
    { key: 'site_name',            label: 'Site Name',                      type: 'text',     required: true },
    { key: 'incident_date',        label: 'Date of Incident',               type: 'date',     required: true },
    { key: 'incident_time',        label: 'Time of Incident',               type: 'time',     required: true },
    { key: 'area_location',        label: 'Area / Location',                type: 'text',     required: true },
    { key: 'subcontractor_name',   label: 'Name of Subcontractor',          type: 'text',     required: true },
    { key: 'injured_person_name',  label: 'Injured Person Name',            type: 'text',     required: true },
    { key: 'designation',          label: 'Designation',                    type: 'text',     required: true },
    { key: 'incident_type',        label: 'Incident Type',                  type: 'select',   required: true,
      options: ['First Aid', 'Medical', 'Fatal', 'Near Miss', 'Dangerous Occurrence', 'Property Damage', 'Environmental'] },
    { key: 'injury_details',       label: 'Injury Details',                 type: 'textarea', required: true },
    { key: 'equipment_name',       label: 'Name / Identity of P&M / Equipment', type: 'text', required: false },
    { key: 'equipment_owned_by',   label: 'Equipment Owned By',             type: 'select',   required: false,
      options: ['MSBPL', 'Sub-contractor', 'N/A'] },
    { key: 'return_to_work_date',  label: 'Return-to-Work Date (if known)', type: 'date',     required: false },
    { key: 'incident_description', label: 'What Happened — Brief Description', type: 'textarea', required: true },
    { key: 'root_cause',           label: 'Root Cause',                     type: 'textarea', required: true },
    { key: 'preventive_actions',   label: 'Preventive Actions Taken',       type: 'textarea', required: true },
    { key: 'corrective_actions',   label: 'Immediate Corrective Actions Taken', type: 'textarea', required: true },
    { key: 'incident_photo',       label: 'Incident Photo',                 type: 'photo',    required: true, multiple: true },
    { key: 'investigation_team',   label: 'Names & Designation of Investigation Team', type: 'textarea', required: true },
    { key: 'prepared_by',          label: 'Prepared By',                    type: 'inspector',required: true },
    { key: 'reviewed_by',          label: 'Reviewed By',                    type: 'radio',    required: true, options: APPROVERS },
  ],
};

const HSE_MEETING = {
  id: 'hse-meeting',
  code: 'HSE',
  title: 'HSE Meeting',
  category: 'general',
  folder: '05-HSE-Meetings',
  icon: '👥',
  fields: [
    { key: 'project_name',         label: 'Project Name',                   type: 'text',     required: true },
    { key: 'project_location',     label: 'Project Location',               type: 'text',     required: true },
    { key: 'no_of_persons',        label: 'No. of Persons',                 type: 'number',   required: true, min: 1 },
    { key: 'meeting_no',           label: 'Meeting No.',                    type: 'text',     required: true },
    { key: 'date',                 label: 'Date',                           type: 'date',     required: true, autofill: 'today' },
    { key: 'time',                 label: 'Time',                           type: 'time',     required: true, autofill: 'now' },
    { key: 'attendance_sheet',     label: 'Attendance Sheet',               type: 'photo',    required: true },
    { key: 'meeting_photo',        label: 'Meeting Photo',                  type: 'photo',    required: true },
    { key: 'no_of_points',         label: 'No. of Points Discussed',        type: 'number',   required: true, min: 1 },
    { key: 'mom_points',           label: 'Minutes of Meeting (MoM) Points',type: 'photo',    required: true, multiple: true },
    { key: 'prepared_by',          label: 'Prepared By',                    type: 'inspector',required: true },
    { key: 'reviewed_by',          label: 'Reviewed By',                    type: 'radio',    required: true, options: APPROVERS },
  ],
};

// ----------------------------------------------------------------------------
// CATEGORY B — Equipment Inspection Forms (15 forms, shared header structure)
// ----------------------------------------------------------------------------

// Helper that builds an equipment-inspection form definition
function makeEquipmentForm({ id, code, title, folder, icon, checklist }) {
  return {
    id,
    code,
    title,
    category: 'equipment',
    folder,
    icon,
    fields: [
      { key: 'project_name',     label: 'Project Name',                     type: 'text',     required: true },
      { key: 'inspection_date',  label: 'Date of Inspection',               type: 'date',     required: true, autofill: 'today' },
      { key: 'inspection_time',  label: 'Time',                             type: 'time',     required: true, autofill: 'now' },
      { key: 'equipment_no',     label: 'Equipment No.',                    type: 'text',     required: true },
      { key: 'equipment_photo',  label: 'Inspected Equipment Photo',        type: 'photo',    required: true },
      { key: 'inspected_by',     label: 'Inspected By',                     type: 'inspector',required: true },
      { key: 'approved_by',      label: 'Approved By',                      type: 'radio',    required: true, options: APPROVERS },
    ],
    checklist, // array of strings (parameter descriptions)
  };
}

const EQUIPMENT_FORMS = [
  makeEquipmentForm({
    id: 'portable-grinding-machine', code: 'PGM',
    title: 'Portable Grinding Machine',
    folder: '06-Equipment-Inspections/Portable-Grinding-Machine',
    icon: '⚙️',
    checklist: [
      'Fore handle without damage',
      'Grinding wheel without any crack',
      'Wheel guard',
      'Rear handle without any damage',
      'Presence of cord strain reliever (glands)',
      'Trigger switch without damage',
      'Presence of switch lock',
      'Electric wire without cuts and joints',
    ],
  }),

  makeEquipmentForm({
    id: 'gas-welding-set', code: 'GWS',
    title: 'Gas Welding Set',
    folder: '06-Equipment-Inspections/Gas-Welding-Set',
    icon: '🔥',
    checklist: [
      'Protective valve cap firmly fixed for both cylinders (check for damage/crack in the valve cap)',
      'Flash back arrestor (FBAs) provided for acetylene & oxygen cylinders',
      'Pressure gauges (two for each cylinder, inlet & outlet) in working condition (both Oxygen & Acetylene gas)',
      'Non-return valves (NRVs) provided for both acetylene & oxygen cylinders',
      'Tight crimping of hoses with jubilee clamps',
      'Hose free from damage (cuts and cracks)',
      'Cylinder secured by chain to the trolley',
      'Trolley tyres free from damages',
      'Availability of industrial-type lighter (no match-box / commercial lighters)',
    ],
  }),

  makeEquipmentForm({
    id: 'aerial-boomlift', code: 'ABL',
    title: 'Aerial Boomlift',
    folder: '06-Equipment-Inspections/Aerial-Boomlift',
    icon: '🏗️',
    checklist: [
      'Wheels, Tyres & Axles — Condition / Inflation',
      'Hydraulic Components — Condition / Leaks',
      'Data Plate — Accurate / Legible',
      'Annual Inspection Verified',
      'Battery Tray — Opens / Closes easily, Latches Shut',
      'Turret turntable — Gears / Lockpin / Stops',
      'Counter Weight',
      'Cover Panels — Open / Close easily, Latch / Lock Shut',
      'Engine — Fluids / Filters / Belts / Hoses',
      'Batteries — Clean / Dry / Secure / Cap-Cables / Level',
      'Fuel Tank — Level',
      'Hydraulic Oil Level',
      'Lights & Strobes',
      'Placards / Labels / Decals — Legible',
      'Boom Valley — Leaks / Debris',
      'Accessory Plugs & Cables',
      'Boom — General condition / Wear',
      'Hydraulic Cylinders & Pin Locks',
      'Articulated Joints — Wear / Cracks',
      'Power Track — Lines & Hoses',
      'Platform — Guardrails / Toeboards / Anchorages',
      'Weather-Resistant Storage Compartment — Appropriate Manuals',
      'All Controls — Clearly Marked / Hold-to-Run',
      'Engine — Starts / Oil Pressure',
      'Battery — Charge Level',
      'Gauges & Instruments — Hour Meter / Warning Lights',
      'Boom — Raise / Lower / Extend / Retract',
      'Turret Rotate',
      'Drive — Forward / Reverse',
      'Steer — Right / Left',
      'Platform — Tilt / Rotate',
      'Horn',
      'Outriggers / Stabilizers / Pothole Protection',
      'Extendable Axles',
      'Function-Enable (Deadman) Devices',
      'Manual / Auxiliary Controls',
      'Safety Interlocks',
    ],
  }),

  makeEquipmentForm({
    id: 'air-compressor', code: 'AC',
    title: 'Air Compressor',
    folder: '06-Equipment-Inspections/Air-Compressor',
    icon: '💨',
    checklist: [
      'Condition of overall structure',
      'All bottom control switches in good shape and usable condition',
      'Condition of distribution valve',
      'Engine cover / Rotating shaft has good support',
      'Tow connection in good condition',
      'Battery is covered',
      'Air storage tank in good condition with approved & certified',
      'Any crack or leakage in engine',
      'Safety valve in air system',
      'Base and wheel condition',
      'Pressure gauge condition',
      'Safety valve has test certificate',
      'Condition of pressure relief valve',
      'Earthing on equipment',
      'Condition of starter',
      'Separate earthing on motor',
      'Availability of guard for rotating parts (both sides)',
      'Oil spillage / leakage',
      'Condition of electrical cables',
      'Appropriate cable size is used',
    ],
  }),

  makeEquipmentForm({
    id: 'arc-welding-machine', code: 'AWM',
    title: 'Arc Welding Machine',
    folder: '06-Equipment-Inspections/Arc-Welding-Machine',
    icon: '⚡',
    checklist: [
      'ON / OFF knob is provided (check for damage and uninsulated knob)',
      'Regulator with indicator is provided',
      'Welding cables connected to the welding machine with lugs at the joints',
      'No damage in the insulation of welding cables',
      'Electrode rod holder and earthing holder are without damage',
      'Industrial-type plug for power tapping cable of welding machine',
      'No internal live electrical parts of welding machine are exposed',
      'Trolley without damaged wheels',
      'Fire extinguisher and fire bucket with sand availability',
      'Mandatory signages with inspection tag',
    ],
  }),

  makeEquipmentForm({
    id: 'cutting-machine', code: 'CM',
    title: 'Cutting Machine',
    folder: '06-Equipment-Inspections/Cutting-Machine',
    icon: '✂️',
    checklist: [
      'Crack & damage of the cutting plate',
      'Presence of cutting plate guard',
      'Presence of locking system for the plate & guard',
      'Presence of job clamp and its condition',
      'Presence of handle and its condition',
      'Cable condition (any cut, wear etc.) and presence of wire-top plug',
      'Presence of cutting dust guard',
    ],
  }),

  makeEquipmentForm({
    id: 'first-aid-box', code: 'FAB',
    title: 'First Aid Box',
    folder: '06-Equipment-Inspections/First-Aid-Box',
    icon: '🏥',
    checklist: [
      'Roller bandage 10 cm',
      'Roller bandage 6 cm',
      'Anti-bacterial liquid (Hyd. Peroxide / Dettol / Savlon) 500 ml',
      'Micropore tape (white plaster) 6 cm',
      'Cotton roll big ½ kg',
      'Betadine solution 100 ml',
      'Band-aid (fabric / plastic)',
      'Ointment Soframycin',
      'Ointment Betadine',
      'Scissors (stainless steel) 12 cm',
      'NS bottle (saline)',
      'Ointment Burnovate',
      'Pain-relieving spray / solution (big)',
      'Eye & ear drops (10 ml bottles)',
      'ORS packet',
    ],
  }),

  makeEquipmentForm({
    id: 'generator', code: 'GEN',
    title: 'Generator',
    folder: '06-Equipment-Inspections/Generator',
    icon: '🔋',
    checklist: [
      'Guard provided for any rotating parts',
      'Hot surface is provided with guard',
      'Rubber mat is provided in operator standing area (around the DG)',
      'No oil leakage from the oil tank & other parts of the machine',
      'Wheel stopper in case of vehicle-mounted DG',
      'Proper access to the DG control panel',
      'Exhaust smoke pipe faced upwards & outside of DG shelter',
      'Dip tray for any oil leakage',
      'Drive belt is in good condition (any cut, dent or damage)',
      'Adequate ventilation in case of indoor generator',
      'Presence of fire extinguisher (ABC type)',
      'Damage-free operating switch, voltage and temperature meter, circuit breaker, oil-level indicator, emergency switch',
      'Earthing is provided with standard earthing pit',
      'In case of mobile gen-set, confirmation of inbuilt acoustic system (if sound is more than 85 dB)',
    ],
  }),

  makeEquipmentForm({
    id: 'ladder', code: 'LAD',
    title: 'Ladder',
    folder: '06-Equipment-Inspections/Ladder',
    icon: '🪜',
    checklist: [
      'All the rungs, cleats, or steps are in good condition (broken, missing, bent rungs)',
      'Side rails are intact without any cracks, bends, or breaks',
      'The rungs, cleats, or steps fit into the side rails without damage',
      'Ladder is free from corrosion',
      'Side rails and steps are free of oil or grease',
      'Rungs are placed at regular intervals (30 cm gap between two rungs)',
      'No projection of loose nails, screws, bolts, or other metal parts',
      'At the time of using, the ladder is placed at 65–75° angle (1:4 ratio)',
      'Ladder extends at least 1 m above the landing platform (3 rungs)',
      'Ladder is secured either at top or bottom',
      'Ladder rungs are not painted',
      'Reinforcement rod is not used as ladder rungs',
      'Surface of the rungs is not smooth',
      'Rubber feet for firm grip (in case of aluminium ladder)',
    ],
  }),

  makeEquipmentForm({
    id: 'mdb-panel', code: 'MDB',
    title: 'Main Distribution Board / Panel',
    folder: '06-Equipment-Inspections/Main-Distribution-Board',
    icon: '🔌',
    checklist: [
      'Firm base with grouting & easily accessible panel (height of the leg ≥ 1 m)',
      'Housing & connections of DB are weather-proof (minimum IP 44 type)',
      'Authorised operator name, photo, contact no. on DB panel (confirmation)',
      'Visualisation of voltage, current and type of tools to be used in the socket & panel',
      'Identification of input and output cables',
      'Confirmation of LOTO availability',
      'Separate MCB for every socket',
      'Safety sign / isolate flammable fire-hazard',
      'Double earthing system of MDB / DB panel with standard earthing pit',
      'Separate ELCB with tripping current of 30 mA & in working condition',
      'Hylem sheet provided over live bus bars',
      'Presence & condition of bus bar / terminal',
      'Condition of cable, power socket and plug without damage',
      'Colour coding (RYB) followed for all cables / wires',
      'Presence of rubber mat in front of the DB (operator standing location)',
      'Plug-socket is industrial type (IP 44 type)',
    ],
  }),

  makeEquipmentForm({
    id: 'mobile-scaffolding', code: 'MSF',
    title: 'Mobile Scaffolding',
    folder: '06-Equipment-Inspections/Mobile-Scaffolding',
    icon: '🪟',
    checklist: [
      'Inspect structure of scaffolding daily before use',
      'Worker must be trained for working at height before using scaffolding',
      'Use full body harness with shock-absorbing lanyard',
      'No unauthorised modification in scaffolding',
      'Do not store equipment or material on platform of scaffolding',
      'Do not allow worker to stay on scaffolding when moving scaffolding',
      'Do not allow worker to stay in front of scaffolding when moving scaffolding',
      'Tools and equipment used on scaffolding must be tied with rope',
      'Lock all wheels before working on scaffolding',
      'Barricade working area',
      'Do not carry heavy weight when walking on ladder of scaffolding',
      'Do not stand on handrail or climb out of scaffolding',
      'Housekeeping of working area after finishing work daily',
      'Scaffolding load test certificate available',
    ],
  }),

  makeEquipmentForm({
    id: 'scaffolding-cuplock', code: 'SCL',
    title: 'Scaffolding (Cuplock)',
    folder: '06-Equipment-Inspections/Scaffolding-Cuplock',
    icon: '🏗️',
    checklist: [
      'Display board stating the status of the scaffold (OK / Not for use / Under erection)',
      'Scaffold erected on a firm base ground',
      'Sole plate provided in the base of the scaffold as per standard (full-length wooden planks / channels)',
      'Base plate / foot plate of scaffold verticals are over the wooden planks (sole plate)',
      'Cup lock locking is not in loose condition',
      'Access ladder from the ground & each lift, secured with clamps',
      'Ladder kept in channels over the jallies in the first lift and above',
      'Each lift provided with platform (jallies) tied with horizontal pipes',
      'All four-side support pipes (struts) properly clamped',
      'Interlocking between the columns & scaffold in case of more than 6 m height scaffolds',
      'All lifts in the scaffold provided with mid-rails (hand-rails)',
    ],
  }),

  makeEquipmentForm({
    id: 'truck', code: 'TRK',
    title: 'Truck',
    folder: '06-Equipment-Inspections/Truck',
    icon: '🚚',
    checklist: [
      'Number plate in front and back side',
      'No damage in tyre (crack, cut, air pressure etc.)',
      'No air leak in the air tank',
      'Front and reverse horn',
      'No oil leak from the diesel tank',
      'Fire extinguisher in driver cabin',
      'Head and tail lamps (for night working)',
      'Brake, clutch and accelerator are in working condition',
      'Truck is not overloaded',
      'Rear-view mirror',
      'Wind shield with wiper',
      'Vehicle valid insurance',
      'Operator licence (heavy duty)',
      'Road tax',
    ],
  }),

  makeEquipmentForm({
    id: 'labour-camp', code: 'LC',
    title: 'Labour Camp',
    folder: '06-Equipment-Inspections/Labour-Camp',
    icon: '🏠',
    checklist: [
      'Toilets condition',
      'Dressing of electrical cables',
      'Labour cooking area (safe / not)',
      'Housekeeping',
      'Availability of first-aid box with safe custody',
      'Availability of fire extinguisher',
      'Availability of security',
      'Condition of drainage system',
      'Availability of drinking water',
      'Any unauthorised persons staying at camp?',
    ],
  }),

  makeEquipmentForm({
    id: 'mobile-crane', code: 'MC',
    title: 'Mobile Crane',
    folder: '06-Equipment-Inspections/Mobile-Crane',
    icon: '🏗️',
    checklist: [
      'Safety latch in hook',
      'Hoist limit switch (or presence of plate)',
      'SWL marked on crane',
      'Wire rope and slings free from tolerable damage (no kinks; broken wires more than 10% is N.G.)',
      'No oil leak in hydraulic parts (piston drums)',
      'No damage in tyre (crack, cut, air pressure etc.)',
      'Head and tail lamps (for night working)',
      'Front and reverse horn',
      'Boom structure condition while full expansion (damage, crack and jamming while extending)',
      'Fire extinguisher in operator cabin',
      'Operator licence (heavy duty)',
      'Third-party certificate (Form 32)',
      'Vehicle valid insurance',
    ],
  }),
];

// ----------------------------------------------------------------------------
// EXPORT — combined registry
// ----------------------------------------------------------------------------

const ALL_FORMS = [
  TOOLBOX,
  INDUCTION,
  EHS_AUDIT,
  INCIDENT,
  HSE_MEETING,
  ...EQUIPMENT_FORMS,
];

const FORMS_BY_ID = Object.fromEntries(ALL_FORMS.map(f => [f.id, f]));

module.exports = {
  ALL_FORMS,
  FORMS_BY_ID,
  APPROVERS,
  INSPECTORS,
};
