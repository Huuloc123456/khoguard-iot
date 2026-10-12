---
name: KhoGuard
description: Basic white warehouse monitoring interface for a Vietnamese simulation.
colors:
  white: "#ffffff"
  text: "#28353c"
  muted: "#65717a"
  line: "#e7ebed"
  subtle: "#f8fafb"
  primary: "#176d60"
  primary-deep: "#12594f"
  primary-soft: "#edf6f2"
  warning: "#925719"
  warning-soft: "#fff6e9"
  danger: "#b23e3e"
  danger-soft: "#fff1f1"
  info: "#386080"
  info-soft: "#edf3f8"
  control-line: "#dce3e6"
  pill-neutral: "#f1f4f5"
typography:
  title:
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontSize: "12px"
    fontWeight: 500
  reading:
    fontSize: "24px"
    fontWeight: 600
rounded:
  compact: "4px"
  sm: "6px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "9px 13px"
    typography: "{typography.label}"
  button-text:
    textColor: "{colors.primary}"
    padding: "5px 2px"
    typography: "{typography.label}"
  search:
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  nav-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "12px"
  pill-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    rounded: "{rounded.compact}"
    padding: "4px 8px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.md}"
  zone:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.compact}"
    padding: "13px 12px 10px"
---

# Design System: KhoGuard

## Overview

**Creative North Star: "A basic warehouse operating plan"**

The implemented world follows the user's basic white-background direction: white surfaces, fine cool-gray borders, charcoal text and restrained teal selection. It favors compact operational information over decorative imagery.

The four-zone plan is drawn with CSS geometry and small outline SVG icons. Environmental readings, door states and alerts remain textual as well as colored; the interface explicitly identifies demonstration data.

**Key Characteristics:**

- White surfaces with fine dividing rules.
- Teal selection with amber and red semantic states.
- Compact controls and a selectable schematic.
- Flat depth with no decorative shadows.

## Colors

### Primary

Teal marks primary actions, selected navigation, positive states and focus. The deeper teal is the primary button's hover and pressed state; the soft teal provides a quiet selected or positive background.

Amber and red are semantic warning and danger colors, each paired with a pale background. Muted blue identifies information and open-door states. These are operational meanings, not extra brand accents.

### Neutral

White is the page, sidebar and panel surface. Charcoal carries primary text; muted slate carries labels and supporting information. Cool-gray lines divide panels, tables and readings. Subtle gray is used for hover and disabled treatments.

### Named Rules

**The State Has Words Rule.** Pair state color with explicit text so warnings, selection and door state remain readable without interpreting hue alone.

## Typography

**Body Font:** Segoe UI, with Apple system, BlinkMacSystemFont and sans-serif fallbacks.

The interface uses a compact system sans for operational text. There is no separate display family. Numeric summaries, tables and readings use tabular numerals where the source declares them.

### Hierarchy

- **Title:** section headings use the title token; tertiary headings are smaller (13px, weight 650).
- **Body:** the body token is the inherited baseline; descriptions and table cells usually reduce to 12–13px.
- **Label:** buttons and text actions use the label token; table headings and status pills reduce to 11px.
- **Reading:** selected-zone readings use the reading token, with smaller units (12px).

The build also carries system-font page headings (27px, weight 650, line-height 1.3), summary numerals (27px) and compact schematic labels as small as 7–10px. These are observed exceptions, not recommended display or small-text tokens for new surfaces.

## Layout

The desktop shell reserves a sticky sidebar (208px) beside a fluid workspace. Main content is centered with a maximum width (1540px) and inset (30px 32px). A continuous four-column status strip precedes the plan and a fixed-width detail column (300px), separated by a gap (20px). Panels follow a vertical spacing rhythm based on the spacing tokens.

At 1200px the sidebar and detail column narrow; at 1023px the detail panel moves below the map and arranges its internals in two columns. At 767px the sidebar becomes a top region with horizontally scrolling navigation, summary metrics become two columns, filters stack and tables scroll within their own container. At 399px detail internals stack. At 1500px map geometry and labels expand. The map retains two zone columns and a central aisle across these widths.

## Elevation & Depth

There are no box shadows. Fine borders, pale state backgrounds and internal dividers establish grouping and selected state.

**The Flat Surface Rule.** Use border and tonal changes for emphasis, as the shipped panels and controls do.

## Shapes

Panels and the brand mark use the medium radius; controls use the small radius. Pills and map zones use compact corners rather than fully rounded capsules. Status dots and the profile avatar are circular. Icons are outline SVG paths with round caps and joins (stroke width 1.65); no text glyphs serve as icons.

## Components

### Buttons

Compact bordered controls use the primary or secondary tokens, a minimum height (38px) and an icon/text gap (8px). Secondary hover uses a pale gray background and stronger border; primary hover and pressed use deeper teal. Small acknowledgement controls reduce their height (32px). Text actions have no surface and underline on hover. Disabled acknowledgement buttons use muted text and subtle gray.

Focus is a teal outline (2px) with an offset (3px). Background and border transitions are brief (160ms ease-out); reduced-motion preference disables transitions.

### Chips

Status pills pair a small dot with text. Warning, danger, success, information and neutral variants use their corresponding foreground/background pairs. Pills report state and are not buttons.

### Cards / Containers

White panels use a fine line border, medium corners and no shadow. Heading insets are normally (19px 20px); inner content is commonly inset (20px). The summary is one bordered strip with internal dividers, not separate metric cards.

### Inputs / Fields

Search and selects use white surfaces, control borders and small corners. The search wrapper adds a teal focus-within outline (2px, offset 2px). Inputs have visible labels through accessible names and retain teal caret color.

### Navigation

Muted icon/text buttons become charcoal over subtle gray on hover. The active item has soft teal fill, teal text and semibold type. Mobile uses the same items in an overflow row and hides the auxiliary sidebar profile.

### Warehouse plan

Zone buttons sit in a two-by-two schematic separated by an aisle. Each contains a letter, name, temperature, CSS shelf geometry, capacity/occupancy and door labels. Selection strengthens the teal border and uses a pale green fill; selected shelf geometry also changes tone. Zone buttons expose pressed state. Selecting a zone updates the adjacent or following detail panel.

## Do's and Don'ts

### Do:

- **Do** preserve the user's white-background direction and fine panel divisions.
- **Do** pair operational state colors with explicit text.
- **Do** retain visible keyboard focus and reduced-motion behavior.
- **Do** identify simulated data and disconnected integrations explicitly.

### Don't:

- **Don't** replace the basic operating interface with decorative imagery or ornamental depth.
- **Don't** imply that accepting an alert changes sensor conditions or door interlocks.
- **Don't** copy the existing tiny schematic labels or system-font page display treatment into new surfaces as a house standard.
