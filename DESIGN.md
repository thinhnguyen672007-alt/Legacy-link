---
name: "Legacy-link"
description: "A light, precise workspace for inspecting legacy machine data."
colors:
  blue: "#2456d5"
  blue-soft: "#edf2ff"
  blue-hover: "#1743b5"
  paper: "#fff"
  ground: "#f7f8fa"
  ink: "#263144"
  muted: "#627084"
  line: "#e3e7ee"
  green: "#187753"
  amber: "#925619"
  red: "#b23737"
  focus: "#7596ef"
  button-border: "#d6dce6"
  button-hover: "#f1f4f9"
  field: "#fcfcfd"
  field-border: "#cfd7e4"
  table-head: "#f8f9fb"
  table-rule: "#edf0f5"
  selected-row: "#f5f8ff"
  badge-neutral-bg: "#eef1f5"
  badge-neutral-text: "#5e6b7e"
  badge-online-bg: "#eaf6ef"
  badge-online-text: "#176c4b"
  badge-caution-bg: "#fff5e5"
  badge-caution-text: "#8a5214"
  inactive-value: "#738096"
  notice-bg: "#eef3ff"
  notice-text: "#38547f"
  danger-bg: "#fff3f0"
  danger-text: "#8d3b2a"
  sample-bg: "#fff8e9"
  sample-text: "#775719"
typography:
  display:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "2.65rem"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "2rem"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 750
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Manrope Variable, sans-serif"
    fontSize: "0.83rem"
    fontWeight: 650
  numeric:
    fontFamily: "IBM Plex Mono, monospace"
    fontSize: "0.86rem"
    fontWeight: 400
rounded:
  tag: "4px"
  badge: "5px"
  field: "6px"
  control: "7px"
  notice: "8px"
  panel: "12px"
spacing:
  "6": "6px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "28": "28px"
  "30": "30px"
  "38": "38px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.button-hover}"
  button-text:
    textColor: "{colors.blue}"
    padding: "6px 0"
  button-icon:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.field}"
    width: "36px"
    height: "36px"
  input-address:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px"
  nav-active:
    backgroundColor: "{colors.blue-soft}"
    textColor: "{colors.blue}"
    rounded: "{rounded.control}"
    height: "45px"
    padding: "0 13px"
  badge-online:
    backgroundColor: "{colors.badge-online-bg}"
    textColor: "{colors.badge-online-text}"
    rounded: "{rounded.badge}"
    padding: "5px 9px"
  badge-caution:
    backgroundColor: "{colors.badge-caution-bg}"
    textColor: "{colors.badge-caution-text}"
    rounded: "{rounded.badge}"
    padding: "5px 9px"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
  reading:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "22px 24px"
  register-table:
    textColor: "{colors.ink}"
---

# Design System: Legacy-link

## Overview

**Creative North Star: "Maintenance Reference Sheet"**

Legacy-link uses a light, concise, readable operations workspace. Cool gray surrounds white working surfaces; restrained cobalt identifies navigation and actions. Fine table rules, readable measurements, and monospaced identifiers connect an overview to its underlying register data.

The implemented world is code-first: no image composition or decorative imagery is required. Manrope supplies the interface voice, while IBM Plex Mono separates addresses, types, and machine identifiers. The interface and repository artifacts use English.

**Key Characteristics:**
- Flat white surfaces on a cool gray workspace.
- Cobalt actions and explicit semantic status labels.
- Compact tables with inspectable identifiers and numeric columns.
- Responsive navigation and stacked mobile measurements.

This record is extracted from `frontend/src/styles.css` and `frontend/src/App.tsx`, with durable constraints from `PRODUCT.md` and the confirmed direction in `.impeccable/surfaces/dashboard.md`. Frontmatter tokens are normative. Existing review captures illustrate sample data and do not prove hardware or backend acceptance.

## Colors

Cool neutrals carry most of the interface. Cobalt supplies emphasis; green, amber, and red communicate specific states.

### Primary

- **Cobalt** (`blue`): primary actions, links, selected controls, and the brand mark.
- **Cobalt wash** (`blue-soft`): active navigation and subtle icon-button feedback.
- **Deep cobalt** (`blue-hover`): primary-button hover state.

### Neutral

- **Working paper** (`paper`) and **cool workspace** (`ground`): working panels and the surrounding canvas.
- **Slate ink** (`ink`) and **secondary slate** (`muted`): main content and supporting context.
- **Fine rule** (`line`): panel edges, navigation dividers, and major table boundaries.
- `field`, `field-border`, `button-border`, and `button-hover` distinguish editable controls and button interaction.
- `table-head`, `table-rule`, and `selected-row` provide table hierarchy without shadows.

### Semantic states

- `green` marks successful connection feedback; the dedicated `badge-online-*` pair marks an online gateway.
- `amber` marks data cautions. The `badge-caution-*` pair covers no recent contact, awaiting data, clock mismatch, and unverified snapshots.
- The `badge-neutral-*` pair represents offline state. Offline is not styled as a confirmed active alarm.
- `red` marks field validation errors. `danger-bg` and `danger-text` carry request-failure messages; `notice-bg` and `notice-text` carry informational notices.
- `sample-bg` and `sample-text` visibly distinguish the opt-in sample workspace.
- `inactive-value` softens stored or unverified values while accompanying text explains the limitation.
- `focus` supplies the shared keyboard outline; it is an interaction token, not a status color.

**The State Has Words Rule.** Pair semantic color with a visible state label or explanatory message. A colored dot alone does not establish gateway health or measurement freshness.

## Typography

**Display and Body Font:** Manrope Variable, with sans-serif fallback.
**Label/Mono Font:** IBM Plex Mono, with monospace fallback, for technical data.

The UI uses compact, moderately heavy headings and open paragraph leading. The root size is (14px); component labels deliberately vary with density rather than following a mathematical type scale. Font assets are self-hosted by the frontend.

### Hierarchy

- **Display:** large measurement values use the frontmatter display role; summaries use (2.2rem), weight (650), leading (1.1).
- **Headline:** page titles use the headline role; mobile titles reduce to (1.75rem).
- **Title:** panel headings use the title role. Supporting section headings use (1rem), weight (750).
- **Body:** paragraph leading is (1.65), with a maximum measure of (72ch). Most supporting component prose uses (0.77–0.91rem).
- **Label:** the frontmatter label role records ordinary buttons. Navigation uses (0.92rem), weight (650); badges use (0.72rem), weight (650).
- **Numeric:** identifiers and numeric table columns use the mono role and tabular numerals. Component-specific identifier sizes may be smaller.

**The Numeric Trace Rule.** Use monospaced, tabular numerals for technical identifiers and table values; keep large measurement values in the interface family with tabular numerals.

## Layout

The desktop shell has a fixed left navigation rail (230px), a top bar (76px), and a main region offset by the rail. Main content has a maximum width of (1700px) and default padding of (34px 38px 0). Panels group related data; summaries sit between horizontal rules rather than within four separate cards.

The fleet summary has four columns. Measurements use an adaptive grid with a minimum column width of (205px) and gaps of (18px). Supporting context and connection content use two columns. Panel headings and measurement surfaces commonly use (22px 24px) padding. Use the observed spacing tokens as a vocabulary, not a claim that every gap is a multiple of one base unit.

- At widths up to (1200px), the rail becomes (204px); main horizontal padding becomes (24px), measurement columns can shrink to (165px), and measurement gaps become (12px).
- At widths up to (900px), the rail becomes an icon rail (75px). Supporting context and connection sections stack. Configuration facts use two columns.
- At widths up to (600px), navigation becomes a labeled horizontal row above the content. The rail no longer occupies viewport width, the top bar becomes (55px), and main horizontal padding becomes (18px). Summaries use two columns; measurements stack into compact rows with the value on the right. Panel horizontal padding generally becomes (16px).
- On mobile, the fleet table keeps machine identity and gateway state visible, folds contact time into the identity cell, and hides the other desktop columns. State labels wrap rather than being clipped.
- The register table retains its technical columns and minimum width of (820px) inside a focusable horizontal scroll region. Fleet tables use a desktop minimum width of (660px), removed at the mobile breakpoint.
- At widths from (1650px), main top padding grows to (42px) and measurement values grow to (3rem). Their sizes are (2.3rem) at the compact desktop breakpoint and (2.2rem) on mobile.

These are extracted composition rules, not a claim of new viewport testing in this documentation pass.

## Elevation & Depth

The system is flat. White surfaces, light tonal changes, and fine borders distinguish content groups; neither resting nor hover states use box shadows. Selection is conveyed through cobalt washes and text, not simulated lift.

**The Flat Surface Rule.** Separate working regions with tone, fine borders, and spacing. The implemented system has no box shadows.

## Shapes

Panels and measurements share the panel radius. Controls use the control radius, text fields and icon buttons the field radius, and status badges the badge radius. Smaller type tags use the tag radius. Notices are gently rounded with the notice radius. Circular status dots, compact step markers, and the small workspace avatar provide functional exceptions to the otherwise rectangular language. Icons are stroke SVGs, normally (16–24px), with the shared stroke width (1.7).

## Components

### Buttons

Compact text-first controls use the frontmatter primary and secondary variants. Both have a desktop minimum height of (40px), rising to (42px) on mobile. Primary hover deepens cobalt; secondary hover changes the neutral background. Text buttons underline on hover. Icon buttons use a subtle cobalt wash and cobalt foreground on hover. Disabled buttons show reduced opacity (0.55) and a not-allowed cursor.

Shared interaction transitions animate background, foreground, and border color over (0.16s ease). Keyboard focus uses a (3px) outline with a (3px) offset. Loading rotation uses (1s linear infinite); skeleton opacity alternates over (1.6s ease-in-out). Reduced-motion preference disables animations and transitions.

### Chips and status badges

Status badges combine a dot and visible text. Online is green; quiet, waiting, clock mismatch, and unverified are amber; offline is neutral. Live/sample choice is a separate segmented button group with a white selected segment inside a neutral track. Sample mode also carries a full-width amber banner; it is never implied by a badge alone.

### Cards / Containers

Working panels use white, a fine neutral border, and the panel radius. Headers provide spacing and hierarchy, and data tables extend to the panel edges. Measurement cards use the same geometry, with a large value, a quieter unit, and a register/type source line. Stored or unverifiable values receive the inactive treatment and an explicit caution.

### Inputs / Fields

The backend address field is full-width, monospaced, and labeled above the input. Validation errors appear below it in red with alert semantics. The search control places its icon within a neutral field wrapper; its focus outline sits on that wrapper with a (2px) offset. Native select controls use the field radius. Avoid relying on placeholder text as the only label.

### Navigation

Desktop navigation is vertically stacked with a muted resting state, neutral hover background, and cobalt selected state. Links have a fixed desktop height of (45px). At the middle breakpoint, icons retain accessible names; on mobile, the three routes return to visible labels in a horizontal row with height (42px). A skip link exposes the main content target on keyboard focus.

### Register reference table

The signature reference pattern places metric identity, raw address, conventional Modicon reference, function, data type, scale, and reported value side by side. Numeric columns use the mono role. Data-type chips provide gentle emphasis; row rules and a pale header support scanning. Values are already scaled by the gateway and must not be multiplied again. The catalog remains read-only; export and reload act on the available catalog data.

### Data truth and feedback

The interface keeps browser HTTP connection, gateway state, and backend contact time separate. `lastSeenAt` includes status and diagnostics messages and is not a timestamp for each measurement. Per-reading diagnostics and the last telemetry timestamp determine measurement freshness; Modbus failures are visible even while the gateway remains online. Paused polling or a feed error labels existing snapshots unverified. Empty, loading, error, awaiting-data, and stale states remain explicit; error messages offer the corresponding retry or connection action.

The signal path is an architecture diagram, not an independently verified link-health display. Catalog thresholds are configuration values, not active alarm events. HTTP health alone proves only process liveness. Alarm history and historical chart data have no current HTTP API here. The connection form saves the backend address locally; it does not configure the gateway or publish broker credentials.

### Machine setup and test read

Register maps contains an expandable setup form using the existing panel, field, and type roles. Operators select a gateway and starting profile, edit machine and register settings, then test the draft before applying it. The results table shows raw words, decoded raw values, converted values, and register errors. A successful test is valid for 60 seconds; edits invalidate it, failed reads block apply, and range warnings require acknowledgment.

Apply feedback distinguishes received, applied, saved to flash, and restored after restart. A successful HTTP request alone does not confirm these steps. Restart confirmation requires evidence from a different boot with the same saved configuration request. The machine catalog is updated after the applied acknowledgment. Sample mode disables hardware actions. Setup duration and manually entered hardware costs support the demo without claiming measured hardware results from sample data.

## Do's and Don'ts

### Do:
- Do reuse cobalt for actions and selected navigation, and pair status colors with text.
- Do retain source, stale-data, and sample-mode context wherever readings appear.
- Do preserve visible keyboard focus, native button semantics, labeled fields, and reduced-motion support.
- Do keep register columns within a keyboard-focusable horizontal scroll region on small screens.
- Do display gateway-reported values without applying the catalog scale again.

### Don't:
- Don't present backend contact time as an individual measurement timestamp.
- Don't present a catalog, signal-path diagram, or successful HTTP response as proof of hardware state.
- Don't imply alarm history or historical charts are available, or treat pending configuration commands as confirmed device state.
- Don't infer active alarms from configured thresholds or silently replace live data with sample data.

The tiny uppercase brand descriptor and the smallest incidental caption sizes are not promoted to reusable typography roles. They remain implementation details pending any separate legibility review; this record does not canonize them as a heading or eyebrow pattern.
