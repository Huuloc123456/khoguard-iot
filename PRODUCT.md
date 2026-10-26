# KhoGuard

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React, explicitly selected by the user; Vite for local development and static builds.

## Users

Warehouse supervisors monitoring one cold-storage zone C and two interlocked doors D07–D08. This role is derived from the supplied project documents, rather than a separate user interview.

## Product Purpose

An academic smart-warehouse simulation with whole-warehouse oversight and a detailed cold-storage safety subsystem. The user changed the active scope to a single cold-storage zone on 24 October 2026.

## Operating Context

Vietnamese interface. Firmware is simulated with PlatformIO in VS Code; the user will not build physical hardware. The latest user request explicitly changes the workflow to building a basic interface with a white background directly.

## Capabilities and Constraints

- One-zone C map and D07–D08 door monitoring.
- Environmental temperature and humidity monitoring with alerts.
- RFID access events, occupancy and work-shift context.
- Cold-storage presence detection, door interlock and panic scenarios.
- Storage utilization, compatible slots and admission rejection at 95% utilization.
- Local safety remains independent of the dashboard in the document's architecture. The frontend simulation must not claim to be a certified safety controller.
- Browser demo data is synthetic. Live mode reads simulated ESP-C01 telemetry persisted in MySQL, with explicit freshness.
- MQTT/TLS, MySQL, authenticated React and an additional ThingsBoard Cloud dashboard are integrated. WMS remains outside scope.
- Registry defines one ESP-C01, one zone C and two doors. Slot capacity is 78 usable positions after excluding two defrost slots.

## Brand Commitments

Working name: KhoGuard, inferred from the workspace name. The user explicitly requests a basic white-background interface. No supplied logo.

## Evidence on Hand

- `D:/huit/iot/doc/Nhóm_17_42_Phần_1_updated.docx`: overall warehouse architecture, several doors, environmental monitoring, RFID and access control.
- `D:/huit/iot/doc/Nhóm_17_42_Phần_2.docx`: cold-storage safety, local interlocks, emergency response, capacity controls and four demo scenarios.
- User selected React, simulation only and a basic white interface, then requested one zone, a wiring diagram and updated Office documents.

## Product Principles

- Show zone and door state before secondary analytics.
- Explain an alert's location and required response.
- Preserve cold-storage safety and occupancy visibility.
- Label simulation data and disconnected integrations honestly.
