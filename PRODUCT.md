# KhoGuard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, explicitly selected by the user; Vite for local development and static builds.

## Users

Warehouse supervisors monitoring several zones and doors. This role is derived from the supplied project documents, rather than a separate user interview.

## Product Purpose

An academic smart-warehouse simulation with whole-warehouse oversight and a detailed cold-storage safety subsystem. The user explicitly prioritizes several doors and several zones over a single-room demo.

## Operating Context

Vietnamese interface. Firmware is simulated with PlatformIO in VS Code; the user will not build physical hardware. The latest user request explicitly changes the workflow to building a basic interface with a white background directly.

## Capabilities and Constraints

- Whole-warehouse zone map and door monitoring.
- Environmental temperature and humidity monitoring with alerts.
- RFID access events, occupancy and work-shift context.
- Cold-storage presence detection, door interlock and panic scenarios.
- Storage utilization, compatible slots and admission rejection at 95% utilization.
- Local safety remains independent of the dashboard in the document's architecture. The frontend simulation must not claim to be a certified safety controller.
- All displayed measurements, people, zones, names and timestamps in mockups are synthetic demonstration data.
- MQTT, database and WMS integration are future implementation decisions; none is connected yet.
- Warehouse layout and exact counts are not supplied; mockups may use an explicitly illustrative layout.

## Brand Commitments

Working name: KhoGuard, inferred from the workspace name. The user explicitly requests a basic white-background interface. No supplied logo.

## Evidence on Hand

- `D:/huit/iot/doc/Nhóm_17_42_Phần_1_updated.docx`: overall warehouse architecture, several doors, environmental monitoring, RFID and access control.
- `D:/huit/iot/doc/Nhóm_17_42_Phần_2.docx`: cold-storage safety, local interlocks, emergency response, capacity controls and four demo scenarios.
- User confirmed whole-warehouse UI, React and simulation only, then explicitly requested a direct basic build with a white background.

## Product Principles

- Show zone and door state before secondary analytics.
- Explain an alert's location and required response.
- Preserve cold-storage safety and occupancy visibility.
- Label simulation data and disconnected integrations honestly.
