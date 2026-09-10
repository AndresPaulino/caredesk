# CareDesk

CareDesk is a demonstration care-home operations dashboard for a fictional elder-care operator, Willowbrook Care. It exists to show natural-language access to resident records over a live, permission-scoped dataset.

## Language

### Organization

**Operator**:
The single organization that runs every facility. In the demo this is Willowbrook Care.
_Avoid_: tenant, company, org, customer

**Facility**:
One care home run by the operator, with its own units, rooms, and staff.
_Avoid_: home, site, location, building, nursing home

**Unit**:
A ward within a facility that residents and nurses are assigned to.
_Avoid_: wing, floor, ward, department

**Room**:
A numbered room within a unit where a resident lives.
_Avoid_: bed

### People

**Resident**:
A person who lives in, or formerly lived in, a facility.
_Avoid_: patient, client, member

**Former resident**:
A resident whose stay has ended through discharge, transfer, or death. Their records are kept.
_Avoid_: inactive patient, archived resident

**Staff**:
A person employed by the operator: a nurse, an admin, or a physician.
_Avoid_: user, employee, provider, clinician

**Nurse**:
A staff member who delivers care and is scoped to one facility and one or more of its units. One of the two login roles.
_Avoid_: caregiver, aide

**Admin**:
A staff member with operator-wide visibility, such as a charge nurse or administrator. The other login role.
_Avoid_: superuser, manager, owner

**Unit assignment**:
The link between a nurse and one unit they cover. A nurse's scope is the residents on their assigned units.
_Avoid_: membership, permission, access grant

**Physician**:
The attending doctor recorded on assessments and medication orders. Not a login role.
_Avoid_: doctor, provider, MD

**Simulated staff**:
Staff accounts whose activity is produced by the simulator rather than a person.
_Avoid_: bot, fake user

**Family contact**:
A relative or guardian recorded for a resident.
_Avoid_: next of kin, emergency contact, responsible party

### Clinical record

**Condition**:
A diagnosis on a resident's record, with an onset date and an optional resolution date.
_Avoid_: diagnosis, problem, disease

**Allergy**:
A recorded allergy or intolerance, with its reaction and severity.
_Avoid_: sensitivity

**Medication order**:
An active or discontinued prescription for a resident.
_Avoid_: prescription, med, script, drug

**Administration**:
One recorded event of giving a medication to a resident. All administrations together form the medication administration record.
_Avoid_: dose, MAR entry, pass

**Vitals**:
A set of readings taken at one moment: blood pressure, pulse, temperature, respiration, oxygen saturation, and weight.
_Avoid_: observations, measurements, obs

**Assessment**:
A dated clinical examination or evaluation of a resident, of one specific kind. This is the record behind "when was the last exam".
_Avoid_: exam, encounter, visit, evaluation, checkup

**Assessment kind**:
The type of an assessment: physician visit, nursing assessment, wound check, podiatry, dental, vision, fall-risk, or lab draw.
_Avoid_: exam type, category

**Lab result**:
A resulted laboratory test with a value, units, and reference range.
_Avoid_: lab, test, panel

**Care plan**:
A resident's set of goals and the interventions meant to reach them.
_Avoid_: treatment plan, plan of care

**Incident**:
An adverse event involving a resident: a fall, a medication error, or a behavioral event.
_Avoid_: event, accident, occurrence

**Progress note**:
A free-text note written by staff about a resident.
_Avoid_: note, comment, chart note, narrative

**Appointment**:
A scheduled future visit outside the facility, such as dialysis, a specialist, or a hospital.
_Avoid_: visit, booking

**Clinical timeline**:
The chronological view of a resident's assessments, results, incidents, and notes.
_Avoid_: history, chart

### Change tracking

**Audit event**:
A record of one change to a tracked record: who made it, when, and the values before and after.
_Avoid_: log entry, history entry, change record

**Audit trail**:
Every audit event for one resident or one record.
_Avoid_: history, changelog

**Activity feed**:
The live stream of recent audit events shown on the dashboard, operator-wide for an admin and unit-scoped for a nurse.
_Avoid_: timeline, notifications, live log

**Actor**:
The staff member, real or simulated, who made a change.
_Avoid_: author, user

### Assistant

**Assistant**:
The natural-language helper embedded in CareDesk that answers questions about residents.
_Avoid_: chatbot, AI, copilot, bot, agent

**Thread**:
One saved conversation between a staff member and the assistant.
_Avoid_: chat, session, conversation

**Tool**:
A typed, permission-scoped query the assistant can run to answer a question.
_Avoid_: function, skill, action

**Source**:
A record the assistant used to answer a question, shown as a chip that links to it.
_Avoid_: citation, reference, evidence

**Scope**:
The set of residents a staff member may see, derived from their role and unit assignments.
_Avoid_: permissions, visibility, access level

**Resident directory**:
The scoped view of residents with their facility, unit, and room names that the list, search, and detail pages read.
_Avoid_: roster, census list, patient list

### Demo data

**Seed**:
The deterministic generated dataset the demo starts from.
_Avoid_: fixtures, mock data, sample data

**Demo account**:
One of the three seeded logins shown on the login page: a nurse at one facility, a nurse at another, and an operator-wide admin.
_Avoid_: test user, seed user

**Hero resident**:
One of ten hand-authored residents with coherent stories that the demo script relies on.
_Avoid_: showcase patient, featured resident

**Clinical vocabulary**:
The catalog of conditions, medications, procedures, allergies, and observation ranges derived from Synthea, from which the seed draws.
_Avoid_: reference data, lookup tables, dictionary

**Simulator**:
The process that has simulated staff write realistic changes while the demo runs.
_Avoid_: bot, cron, background job, generator

**Shift rhythm**:
The time-of-day pattern the simulator follows: an intake burst in the morning, labs at midday, discharges in the afternoon.
_Avoid_: schedule, cadence
