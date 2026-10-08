# Legacy-link product context

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React and TypeScript, confirmed by the project owner. Implementation details are
delegated. Use Vite for a small independently runnable frontend.

## Users

The hackathon team demonstrates legacy machine connectivity to DENSO evaluators.
The dashboard supports inspecting connected machines and their latest readings.
Factory operators are the intended future audience; field acceptance is pending.

## Product Purpose

Make measurements from legacy Modbus equipment visible through an ESP32 gateway,
MQTT, a Node.js backend, and PostgreSQL. DENSO D1 prioritizes low cost and quick
deployment. The frontend is the team's demo interface.

## Operating Context

The current bench uses OpenModSim, CH340, a physical ESP32, and a phone hotspot.
The backend may run on another laptop. Its HTTP address must be configurable.
The interface and repository artifacts remain in English.

## Capabilities and Constraints

- GET /machines returns deviceId, name, machineType, online, lastSeenAt, metrics.
- GET /catalog?deviceId=... returns a merged, firmware-shaped registerMap.
- GET /health confirms HTTP process liveness only.
- lastSeenAt is shared by status and telemetry; lastTelemetryAt and per-register
  diagnostics provide independent measurement freshness.
- HTTP control routes support gateway discovery, test reads, applying a tested
  configuration and correlated acknowledgements. Devices/catalogs are registered
  after ESP32 confirms application. Alarm and measurement history are not exposed.
- New applied catalogs preserve the tested register map and high alarm settings.
  Existing template catalogs may omit alarm fields.
- Frontend reads HTTP only; broker credentials never belong in the browser.
- Live mode is the default. An explicitly selected, clearly labeled sample mode
  can support interface review while the backend is unavailable.

## Brand Commitments

Name: Legacy-link. The owner selected a light, concise, readable dashboard and
direct implementation rather than image-first design.

## Evidence on Hand

See firmware/legacy-link-core/docs/hardware-validation-2026-10-08.md for physical
Modbus/MQTT alarm tests. Database/API/frontend acceptance and industrial CNC tests
are not yet established by that report.

## Product Principles

- Expose real integration boundaries instead of pretend working controls.
- Distinguish gateway state, server contact time, and browser connection health.
- Keep stale or unavailable data visibly different from fresh observations.
- Make device identity, register addresses, types, and scaling inspectable.
